"use server";

// Notes CRUD Server Actions: create, list, get, soft-delete, restore,
// save (with versioning + optimistic concurrency), change-visibility,
// list-versions, get-version.
//
// Security invariants (AGENTS.md section 2):
// - Every action calls requireOrgAccess before any DB work.
// - Write actions additionally call canEditNote.
// - All actions are wrapped with withContext so logAudit can read
//   requestId/orgId/userId without prop-drilling.
// - No note content is ever written to audit_logs (only version numbers,
//   resource IDs, and non-PII metadata).
//
// Node runtime required (AsyncLocalStorage via withContext).
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";
import { requireUser, getAdminSupabase, getServerSupabase } from "@/lib/auth/server";
import { requireOrgAccess, canEditNote } from "@/lib/security/permissions";
import { withContext, type RequestContext } from "@/lib/logging/request-context";
import { logAudit } from "@/lib/logging/audit";
import { v4 as uuidv4 } from "uuid";

// ── Helpers ───────────────────────────────────────────────────────────────────

async function buildCtx(userId: string): Promise<RequestContext> {
  const h = await headers();
  return {
    requestId: h.get("x-request-id") ?? "unknown",
    orgId: h.get("x-org-id") ?? null,
    userId,
  };
}

const visibilitySchema = z.enum(["private", "org", "public_in_org"]);

// ── createNoteAction ──────────────────────────────────────────────────────────

export async function createNoteAction(
  orgId: string,
): Promise<{ noteId: string } | { error: string }> {
  const user = await requireUser();
  const ctx = await buildCtx(user.id);

  await withContext(ctx, () => requireOrgAccess(orgId, "member"));

  const admin = getAdminSupabase();
  const noteId = uuidv4();
  const versionId = uuidv4();

  // Step 1: insert the note with no current_version_id yet.
  // Slim window: note exists before its first version. The application
  // gate (canEditNote) treats a note as editable by its author regardless.
  const { error: noteError } = await admin.from("notes").insert({
    id: noteId,
    org_id: orgId,
    author_id: user.id,
    visibility: "private",
    title: "",
    current_version_id: null,
  });

  if (noteError) {
    return { error: noteError.message };
  }

  // Step 2: insert the first version (empty content).
  const { error: versionError } = await admin.from("note_versions").insert({
    id: versionId,
    note_id: noteId,
    org_id: orgId,
    author_id: user.id,
    title: "",
    content: "",
    version_number: 1,
  });

  if (versionError) {
    // Best-effort cleanup of the orphaned note.
    await admin.from("notes").delete().eq("id", noteId);
    return { error: versionError.message };
  }

  // Step 3: point the note at its first version.
  const { error: updateError } = await admin
    .from("notes")
    .update({ current_version_id: versionId })
    .eq("id", noteId);

  if (updateError) {
    return { error: updateError.message };
  }

  await withContext(ctx, () =>
    logAudit({
      action: "note.create",
      resourceType: "note",
      resourceId: noteId,
      metadata: { orgId, versionNumber: 1 },
    }),
  );

  return { noteId };
}

// ── listNotesAction ───────────────────────────────────────────────────────────

export interface NoteListItem {
  id: string;
  title: string;
  visibility: "private" | "org" | "public_in_org";
  updatedAt: string;
  authorId: string;
  deletedAt: string | null;
  tags: string[];
}

export async function listNotesAction(
  orgId: string,
  includeDeleted = false,
): Promise<NoteListItem[] | { error: string }> {
  const user = await requireUser();
  const ctx = await buildCtx(user.id);

  await withContext(ctx, () => requireOrgAccess(orgId, "viewer"));

  // Use the user-scoped client so RLS filters what this user can see.
  const supabase = await getServerSupabase();
  if (!supabase) return { error: "Service unavailable" };

  let query = supabase
    .from("notes")
    .select("id, title, visibility, updated_at, author_id, deleted_at, note_tags(tags(name))")
    .eq("org_id", orgId)
    .order("updated_at", { ascending: false });

  if (!includeDeleted) {
    query = query.is("deleted_at", null);
  }

  const { data, error } = await query;

  if (error) return { error: error.message };

  await withContext(ctx, () =>
    logAudit({
      action: "note.list",
      resourceType: "note",
      metadata: { orgId, count: data?.length ?? 0 },
    }),
  );

  return (data ?? []).map((n) => ({
    id: n.id as string,
    title: n.title as string,
    visibility: n.visibility as "private" | "org" | "public_in_org",
    updatedAt: n.updated_at as string,
    authorId: n.author_id as string,
    deletedAt: n.deleted_at as string | null,
    tags: ((n.note_tags as unknown as { tags: { name: string } | null }[] | null) ?? [])
      .map((nt) => nt.tags?.name)
      .filter((name): name is string => typeof name === "string"),
  }));
}

// ── getNoteAction ─────────────────────────────────────────────────────────────

export interface NoteDetail {
  id: string;
  title: string;
  content: string;
  visibility: "private" | "org" | "public_in_org";
  authorId: string;
  authorEmail: string;
  currentVersionId: string;
  currentVersionNumber: number;
  updatedAt: string;
  canEdit: boolean;
}

export async function getNoteAction(
  noteId: string,
  orgId: string,
): Promise<NoteDetail | { error: string }> {
  const user = await requireUser();
  const ctx = await buildCtx(user.id);

  await withContext(ctx, () => requireOrgAccess(orgId, "viewer"));

  // Use user-scoped client — RLS enforces visibility.
  const supabase = await getServerSupabase();
  if (!supabase) return { error: "Service unavailable" };

  const { data: note, error: noteError } = await supabase
    .from("notes")
    .select(
      "id, title, visibility, author_id, current_version_id, updated_at, deleted_at",
    )
    .eq("id", noteId)
    .eq("org_id", orgId)
    .is("deleted_at", null)
    .maybeSingle();

  if (noteError) return { error: noteError.message };
  if (!note) return { error: "Note not found" };

  // Fetch current version content via user-scoped client.
  const { data: version, error: versionError } = await supabase
    .from("note_versions")
    .select("content, version_number")
    .eq("id", note.current_version_id as string)
    .maybeSingle();

  if (versionError) return { error: versionError.message };
  if (!version) return { error: "Note content not found" };

  const editAccess = await canEditNote(noteId, user.id);

  // Fetch author email from the public users mirror (admin client, no PII in logs).
  const admin = getAdminSupabase();
  const { data: authorUser } = await admin
    .from("users")
    .select("email")
    .eq("id", note.author_id as string)
    .maybeSingle();
  const authorEmail = (authorUser?.email as string | null) ?? "";

  await withContext(ctx, () =>
    logAudit({
      action: "note.view",
      resourceType: "note",
      resourceId: noteId,
      metadata: { orgId },
    }),
  );

  return {
    id: note.id as string,
    title: note.title as string,
    content: version.content as string,
    visibility: note.visibility as "private" | "org" | "public_in_org",
    authorId: note.author_id as string,
    authorEmail,
    currentVersionId: note.current_version_id as string,
    currentVersionNumber: version.version_number as number,
    updatedAt: note.updated_at as string,
    canEdit: editAccess,
  };
}

// ── softDeleteNoteAction ──────────────────────────────────────────────────────

export async function softDeleteNoteAction(
  noteId: string,
  orgId: string,
): Promise<null | { error: string }> {
  const user = await requireUser();
  const ctx = await buildCtx(user.id);

  await withContext(ctx, () => requireOrgAccess(orgId, "member"));

  const editable = await canEditNote(noteId, user.id);
  if (!editable) {
    return { error: "Forbidden" };
  }

  const admin = getAdminSupabase();
  const { error } = await admin
    .from("notes")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", noteId)
    .eq("org_id", orgId);

  if (error) return { error: error.message };

  await withContext(ctx, () =>
    logAudit({
      action: "note.delete",
      resourceType: "note",
      resourceId: noteId,
      metadata: { orgId },
    }),
  );

  revalidatePath("/notes");
  return null;
}

// ── restoreNoteAction ─────────────────────────────────────────────────────────

export async function restoreNoteAction(
  noteId: string,
  orgId: string,
): Promise<null | { error: string }> {
  const user = await requireUser();
  const ctx = await buildCtx(user.id);

  // Restore requires admin: only org admins/owners can undelete.
  await withContext(ctx, () => requireOrgAccess(orgId, "admin"));

  const admin = getAdminSupabase();
  const { error } = await admin
    .from("notes")
    .update({ deleted_at: null })
    .eq("id", noteId)
    .eq("org_id", orgId);

  if (error) return { error: error.message };

  await withContext(ctx, () =>
    logAudit({
      action: "note.restore",
      resourceType: "note",
      resourceId: noteId,
      metadata: { orgId },
    }),
  );

  revalidatePath("/notes");
  return null;
}

// ── saveNoteAction (versioning + optimistic concurrency) ──────────────────────

export interface SaveNoteResult {
  versionNumber: number;
}

export interface SaveNoteConflict {
  conflict: true;
  currentVersionNumber: number;
}

export async function saveNoteAction(params: {
  noteId: string;
  orgId: string;
  title: string;
  content: string;
  expectedVersionNumber: number;
}): Promise<SaveNoteResult | SaveNoteConflict | { error: string }> {
  const { noteId, orgId, title, content, expectedVersionNumber } = params;

  const user = await requireUser();
  const ctx = await buildCtx(user.id);

  await withContext(ctx, () => requireOrgAccess(orgId, "member"));

  const editable = await canEditNote(noteId, user.id);
  if (!editable) {
    return { error: "Forbidden" };
  }

  const admin = getAdminSupabase();

  // Fetch the current version number. This is the optimistic concurrency check:
  // if the client's expectedVersionNumber doesn't match, we return a conflict
  // instead of silently overwriting. Never last-write-wins.
  const { data: note, error: fetchError } = await admin
    .from("notes")
    .select("current_version_id, org_id, deleted_at")
    .eq("id", noteId)
    .is("deleted_at", null)
    .maybeSingle();

  if (fetchError) return { error: fetchError.message };
  if (!note) return { error: "Note not found or deleted" };
  if (note.org_id !== orgId) return { error: "Forbidden" };

  const { data: currentVersion, error: versionFetchError } = await admin
    .from("note_versions")
    .select("version_number")
    .eq("id", note.current_version_id as string)
    .maybeSingle();

  if (versionFetchError) return { error: versionFetchError.message };
  if (!currentVersion) return { error: "Current version not found" };

  const fetchedVersionNumber = currentVersion.version_number as number;

  // Optimistic concurrency check: reject if the client's snapshot is stale.
  if (fetchedVersionNumber !== expectedVersionNumber) {
    return { conflict: true, currentVersionNumber: fetchedVersionNumber };
  }

  const newVersionNumber = fetchedVersionNumber + 1;
  const newVersionId = uuidv4();

  // Insert the new full snapshot version.
  const { error: insertError } = await admin.from("note_versions").insert({
    id: newVersionId,
    note_id: noteId,
    org_id: orgId,
    author_id: user.id,
    title,
    content,
    version_number: newVersionNumber,
  });

  if (insertError) return { error: insertError.message };

  // Update the note to point at the new version.
  const { error: updateError } = await admin
    .from("notes")
    .update({
      current_version_id: newVersionId,
      title,
      updated_at: new Date().toISOString(),
    })
    .eq("id", noteId);

  if (updateError) return { error: updateError.message };

  // Log note.save with the version number only — never log content or title.
  await withContext(ctx, () =>
    logAudit({
      action: "note.save",
      resourceType: "note",
      resourceId: noteId,
      metadata: { orgId, versionNumber: newVersionNumber },
    }),
  );

  return { versionNumber: newVersionNumber };
}

// ── changeVisibilityAction ────────────────────────────────────────────────────

export async function changeVisibilityAction(
  noteId: string,
  orgId: string,
  visibility: "private" | "org" | "public_in_org",
): Promise<null | { error: string }> {
  const parsed = visibilitySchema.safeParse(visibility);
  if (!parsed.success) return { error: "Invalid visibility value" };

  const user = await requireUser();
  const ctx = await buildCtx(user.id);

  await withContext(ctx, () => requireOrgAccess(orgId, "member"));

  const editable = await canEditNote(noteId, user.id);
  if (!editable) return { error: "Forbidden" };

  const admin = getAdminSupabase();

  // Fetch current visibility for the audit log.
  const { data: note } = await admin
    .from("notes")
    .select("visibility")
    .eq("id", noteId)
    .is("deleted_at", null)
    .maybeSingle();

  const previousVisibility = note?.visibility ?? "unknown";

  const { error } = await admin
    .from("notes")
    .update({ visibility: parsed.data })
    .eq("id", noteId)
    .eq("org_id", orgId);

  if (error) return { error: error.message };

  await withContext(ctx, () =>
    logAudit({
      action: "note.visibility_changed",
      resourceType: "note",
      resourceId: noteId,
      metadata: { orgId, from: previousVisibility, to: parsed.data },
    }),
  );

  return null;
}

// ── listVersionsAction ────────────────────────────────────────────────────────

export interface VersionListItem {
  id: string;
  versionNumber: number;
  authorId: string;
  authorEmail: string;
  createdAt: string;
}

export async function listVersionsAction(
  noteId: string,
  orgId: string,
): Promise<VersionListItem[] | { error: string }> {
  const user = await requireUser();
  const ctx = await buildCtx(user.id);

  await withContext(ctx, () => requireOrgAccess(orgId, "viewer"));

  // User-scoped client so RLS verifies the note is readable.
  const supabase = await getServerSupabase();
  if (!supabase) return { error: "Service unavailable" };

  // Confirm the note is readable (will return empty if not).
  const { data: note } = await supabase
    .from("notes")
    .select("id")
    .eq("id", noteId)
    .is("deleted_at", null)
    .maybeSingle();

  if (!note) return { error: "Note not found" };

  const { data, error } = await supabase
    .from("note_versions")
    .select("id, version_number, author_id, created_at")
    .eq("note_id", noteId)
    .order("version_number", { ascending: false });

  if (error) return { error: error.message };

  await withContext(ctx, () =>
    logAudit({
      action: "note_versions.list",
      resourceType: "note_version",
      resourceId: noteId,
      metadata: { orgId, count: data?.length ?? 0 },
    }),
  );

  // Batch-fetch author emails for display; never logged.
  const authorIds = [...new Set((data ?? []).map((v) => v.author_id as string))];
  const adminClient = getAdminSupabase();
  const { data: usersData } = await adminClient
    .from("users")
    .select("id, email")
    .in("id", authorIds);
  const emailMap: Record<string, string> = {};
  for (const u of usersData ?? []) {
    emailMap[u.id as string] = u.email as string;
  }

  return (data ?? []).map((v) => ({
    id: v.id as string,
    versionNumber: v.version_number as number,
    authorId: v.author_id as string,
    authorEmail: emailMap[v.author_id as string] ?? "",
    createdAt: v.created_at as string,
  }));
}

// ── getVersionAction ──────────────────────────────────────────────────────────

export interface VersionDetail {
  id: string;
  versionNumber: number;
  title: string;
  content: string;
  authorId: string;
  createdAt: string;
}

export async function getVersionAction(
  noteId: string,
  versionId: string,
  orgId: string,
): Promise<VersionDetail | { error: string }> {
  const user = await requireUser();
  const ctx = await buildCtx(user.id);

  await withContext(ctx, () => requireOrgAccess(orgId, "viewer"));

  // User-scoped client — RLS on note_versions joins to notes visibility.
  const supabase = await getServerSupabase();
  if (!supabase) return { error: "Service unavailable" };

  const { data, error } = await supabase
    .from("note_versions")
    .select("id, version_number, title, content, author_id, created_at")
    .eq("id", versionId)
    .eq("note_id", noteId)
    .maybeSingle();

  if (error) return { error: error.message };
  if (!data) return { error: "Version not found" };

  // Log view without content — only version number and IDs.
  await withContext(ctx, () =>
    logAudit({
      action: "note_version.view",
      resourceType: "note_version",
      resourceId: versionId,
      metadata: { noteId, orgId, versionNumber: data.version_number },
    }),
  );

  return {
    id: data.id as string,
    versionNumber: data.version_number as number,
    title: data.title as string,
    content: data.content as string,
    authorId: data.author_id as string,
    createdAt: data.created_at as string,
  };
}
