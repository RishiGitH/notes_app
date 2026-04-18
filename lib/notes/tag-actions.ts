"use server";

// Tag Server Actions: create, list, add-to-note, remove-from-note.
//
// Tags are org-scoped (unique name per org). note_tags links notes to tags.
// All mutations require requireOrgAccess + canEditNote on the note.
// Node runtime required.
export const runtime = "nodejs";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";
import { requireUser, getAdminSupabase, getServerSupabase } from "@/lib/auth/server";
import { requireOrgAccess, canEditNote } from "@/lib/security/permissions";
import { withContext, type RequestContext } from "@/lib/logging/request-context";
import { logAudit } from "@/lib/logging/audit";

async function buildCtx(userId: string): Promise<RequestContext> {
  const h = await headers();
  return {
    requestId: h.get("x-request-id") ?? "unknown",
    orgId: h.get("x-org-id") ?? null,
    userId,
  };
}

const tagNameSchema = z.string().min(1).max(50).trim();

// ── createTagAction ───────────────────────────────────────────────────────────

export async function createTagAction(
  orgId: string,
  name: string,
): Promise<{ tagId: string } | { error: string }> {
  const parsed = tagNameSchema.safeParse(name);
  if (!parsed.success) return { error: "Invalid tag name" };

  const user = await requireUser();
  const ctx = await buildCtx(user.id);

  await withContext(ctx, () => requireOrgAccess(orgId, "member"));

  const admin = getAdminSupabase();

  // Check uniqueness within the org (also enforced by DB unique index).
  const { data: existing } = await admin
    .from("tags")
    .select("id")
    .eq("org_id", orgId)
    .eq("name", parsed.data)
    .maybeSingle();

  if (existing) return { error: "Tag already exists" };

  const { data, error } = await admin
    .from("tags")
    .insert({ org_id: orgId, name: parsed.data })
    .select("id")
    .single();

  if (error || !data) return { error: error?.message ?? "Failed to create tag" };

  await withContext(ctx, () =>
    logAudit({
      action: "tag.create",
      resourceType: "tag",
      resourceId: data.id as string,
      metadata: { orgId },
    }),
  );

  return { tagId: data.id as string };
}

// ── listTagsAction ────────────────────────────────────────────────────────────

export interface TagItem {
  id: string;
  name: string;
}

export async function listTagsAction(
  orgId: string,
): Promise<TagItem[] | { error: string }> {
  const user = await requireUser();
  const ctx = await buildCtx(user.id);

  await withContext(ctx, () => requireOrgAccess(orgId, "viewer"));

  // User-scoped client: RLS on tags is is_org_member(org_id).
  const supabase = await getServerSupabase();
  if (!supabase) return { error: "Service unavailable" };

  const { data, error } = await supabase
    .from("tags")
    .select("id, name")
    .eq("org_id", orgId)
    .order("name");

  if (error) return { error: error.message };

  return (data ?? []).map((t) => ({
    id: t.id as string,
    name: t.name as string,
  }));
}

// ── addTagToNoteAction ────────────────────────────────────────────────────────

export async function addTagToNoteAction(
  noteId: string,
  tagId: string,
  orgId: string,
): Promise<null | { error: string }> {
  const user = await requireUser();
  const ctx = await buildCtx(user.id);

  await withContext(ctx, () => requireOrgAccess(orgId, "member"));

  const editable = await canEditNote(noteId, user.id);
  if (!editable) return { error: "Forbidden" };

  const admin = getAdminSupabase();

  // Confirm the tag belongs to this org.
  const { data: tag } = await admin
    .from("tags")
    .select("id")
    .eq("id", tagId)
    .eq("org_id", orgId)
    .maybeSingle();

  if (!tag) return { error: "Tag not found in this organization" };

  const { error } = await admin
    .from("note_tags")
    .insert({ note_id: noteId, tag_id: tagId });

  if (error) {
    // 23505 = unique violation means tag already applied; treat as no-op.
    if (error.code === "23505") return null;
    return { error: error.message };
  }

  await withContext(ctx, () =>
    logAudit({
      action: "note_tag.add",
      resourceType: "note_tag",
      resourceId: noteId,
      metadata: { orgId, tagId },
    }),
  );

  revalidatePath(`/notes/${noteId}`);
  return null;
}

// ── removeTagFromNoteAction ───────────────────────────────────────────────────

export async function removeTagFromNoteAction(
  noteId: string,
  tagId: string,
  orgId: string,
): Promise<null | { error: string }> {
  const user = await requireUser();
  const ctx = await buildCtx(user.id);

  await withContext(ctx, () => requireOrgAccess(orgId, "member"));

  const editable = await canEditNote(noteId, user.id);
  if (!editable) return { error: "Forbidden" };

  const admin = getAdminSupabase();

  const { error } = await admin
    .from("note_tags")
    .delete()
    .eq("note_id", noteId)
    .eq("tag_id", tagId);

  if (error) return { error: error.message };

  await withContext(ctx, () =>
    logAudit({
      action: "note_tag.remove",
      resourceType: "note_tag",
      resourceId: noteId,
      metadata: { orgId, tagId },
    }),
  );

  revalidatePath(`/notes/${noteId}`);
  return null;
}
