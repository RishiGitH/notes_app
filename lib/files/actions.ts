"use server";

// File upload and download Server Actions (Phase 3C, search-ai).
//
// Security invariants enforced here (AGENTS.md section 2):
//   - Item 9: MIME sniffed from bytes (file-type); client Content-Type is
//             NEVER trusted. Size checked before sniff. Path is server-built:
//             <org_id>/<note_id>/<ulid>-<safe_filename>.
//   - Item 8: Access to files resolves via parent notes row (RLS) + explicit
//             requireOrgAccess + canEditNote/canReadNote equivalent check.
//   - Item 12: Soft-deleted parents return 404 — no file access for deleted notes.
//
// Audit events (AGENTS.md section 8):
//   file.upload   — a file was uploaded
//   file.download — a signed URL was issued (via proxy route)
//
// Node runtime: "use server" files always run on Node; export const runtime
// is not valid in 'use server' modules and has been removed.

import { and, eq, isNull } from "drizzle-orm";
import { headers } from "next/headers";
import { ulid } from "ulid";
import { fileTypeFromBuffer } from "file-type";
import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/db/client";
import { files, notes } from "@/lib/db/schema";
import { requireUser } from "@/lib/auth/server";
import { getAdminSupabase } from "@/lib/auth/server";
import { requireOrgAccess, canEditNote } from "@/lib/security/permissions";
import { logAudit } from "@/lib/logging/audit";
import { withContext } from "@/lib/logging/request-context";
import { safeFilename } from "@/lib/files/sanitize";
import { ALLOWED_MIMES, MAX_FILE_BYTES, STORAGE_BUCKET } from "@/lib/files/constants";

async function buildContext(userId: string, orgId?: string) {
  const h = await headers();
  return {
    requestId: h.get("x-request-id") ?? "unknown",
    orgId: orgId ?? h.get("x-org-id") ?? null,
    userId,
  };
}

// uploadNoteFile: accept a FormData with a "file" entry, sniff bytes,
// build a server-side path, upload to Supabase Storage, and insert a files row.
//
// Returns the new files row id.
export async function uploadNoteFile(
  noteId: string,
  formData: FormData,
): Promise<string> {
  const user = await requireUser();
  const db = getDb();

  // Fetch the note so we have the org_id before requireOrgAccess.
  const [note] = await db
    .select({ id: notes.id, orgId: notes.orgId, deletedAt: notes.deletedAt })
    .from(notes)
    .where(and(eq(notes.id, noteId), isNull(notes.deletedAt)))
    .limit(1);

  if (!note) throw new Error("Note not found");

  const ctx = await buildContext(user.id, note.orgId);

  return withContext(ctx, async () => {
    await requireOrgAccess(note.orgId, "member");

    const canEdit = await canEditNote(noteId, user.id);
    if (!canEdit) throw new Error("Forbidden");

    const fileEntry = formData.get("file");
    if (!(fileEntry instanceof File)) throw new Error("No file provided");

    // Enforce size limit before reading into memory.
    if (fileEntry.size > MAX_FILE_BYTES) {
      throw new Error(
        `File too large: max ${MAX_FILE_BYTES / 1024 / 1024} MiB`,
      );
    }

    const buffer = Buffer.from(await fileEntry.arrayBuffer());

    // Sniff bytes — never trust client Content-Type. (AGENTS.md item 9)
    const sniffed = await fileTypeFromBuffer(buffer);
    const mime = sniffed?.mime ?? "application/octet-stream";

    if (!ALLOWED_MIMES.has(mime)) {
      throw new Error(`File type not allowed: ${mime}`);
    }

    // Build server-side path: <org_id>/<note_id>/<ulid>-<safe_filename>.
    const safeName = safeFilename(fileEntry.name);
    const objectKey = `${note.orgId}/${noteId}/${ulid()}-${safeName}`;

    // Upload via service-role (admin) client — bypasses Storage RLS for the
    // upload itself; the DB files row is the authoritative access record.
    const admin = getAdminSupabase();
    const { error: uploadError } = await admin.storage
      .from(STORAGE_BUCKET)
      .upload(objectKey, buffer, {
        contentType: mime,
        upsert: false,
      });

    if (uploadError) {
      // Surface storage error without leaking internal details.
      throw new Error("Storage upload failed");
    }

    // Insert the files row. This is what RLS governs for reads.
    const [inserted] = await db
      .insert(files)
      .values({
        orgId: note.orgId,
        noteId,
        uploaderId: user.id,
        path: objectKey,
        mime,
        sizeBytes: buffer.byteLength,
      })
      .returning({ id: files.id });

    if (!inserted) throw new Error("Failed to insert file record");

    await logAudit({
      action: "file.upload",
      resourceType: "files",
      resourceId: inserted.id,
      metadata: {
        path: objectKey,
        mime,
        sizeBytes: buffer.byteLength,
        noteId,
        // No bytes, no content. (AGENTS.md section 11)
      },
    });

    return inserted.id;
  });
}

// getFileInfo: fetch a files row for the given fileId, visible to the caller.
// Used by the download proxy route to get the storage path.
export async function getFileInfo(fileId: string) {
  const user = await requireUser();

  const admin = getAdminSupabase();
  const { data: file } = await admin
    .from("files")
    .select("id, org_id, note_id, path, mime, size_bytes")
    .eq("id", fileId)
    .maybeSingle();

  if (!file) return null;

  const ctx = await buildContext(user.id, file.org_id);

  return withContext(ctx, async () => {
    await requireOrgAccess(file.org_id, "viewer");

    // Verify parent note is not soft-deleted. (AGENTS.md item 12)
    const db = getDb();
    const [parentNote] = await db
      .select({ id: notes.id, deletedAt: notes.deletedAt })
      .from(notes)
      .where(and(eq(notes.id, file.note_id), isNull(notes.deletedAt)))
      .limit(1);

    if (!parentNote) return null; // soft-deleted parent → treat as not found

    return {
      id: file.id as string,
      orgId: file.org_id as string,
      noteId: file.note_id as string,
      path: file.path as string,
      mime: file.mime as string,
      sizeBytes: file.size_bytes as number,
    };
  });
}

// listNoteFiles: return all files attached to a note the caller can read.
export interface NoteFileItem {
  id: string;
  path: string;
  mime: string;
  sizeBytes: number;
  createdAt: Date;
  originalName: string; // last segment of path after the ulid prefix
}

export async function listNoteFiles(
  noteId: string,
): Promise<NoteFileItem[]> {
  const user = await requireUser();
  const db = getDb();

  const [note] = await db
    .select({ id: notes.id, orgId: notes.orgId, deletedAt: notes.deletedAt })
    .from(notes)
    .where(and(eq(notes.id, noteId), isNull(notes.deletedAt)))
    .limit(1);

  if (!note) throw new Error("Note not found");

  const ctx = await buildContext(user.id, note.orgId);

  return withContext(ctx, async () => {
    await requireOrgAccess(note.orgId, "viewer");

    const rows = await db
      .select({
        id: files.id,
        path: files.path,
        mime: files.mime,
        sizeBytes: files.sizeBytes,
        createdAt: files.createdAt,
      })
      .from(files)
      .where(and(eq(files.noteId, noteId), eq(files.orgId, note.orgId)));

    return rows.map((r) => ({
      id: r.id,
      path: r.path,
      mime: r.mime,
      sizeBytes: r.sizeBytes,
      createdAt: r.createdAt,
      // Extract the human-readable filename: everything after the ulid prefix.
      // Path format: <org_id>/<note_id>/<ulid>-<safe_filename>
      originalName: r.path.split("/").pop()?.replace(/^[0-9A-Z]{26}-/, "") ?? r.path,
    }));
  });
}

// deleteNoteFile: delete a file record and its storage object.
// Requires canEditNote on the parent note.
export async function deleteNoteFile(
  fileId: string,
  noteId: string,
): Promise<void> {
  const user = await requireUser();
  const db = getDb();

  const [note] = await db
    .select({ id: notes.id, orgId: notes.orgId, deletedAt: notes.deletedAt })
    .from(notes)
    .where(and(eq(notes.id, noteId), isNull(notes.deletedAt)))
    .limit(1);

  if (!note) throw new Error("Note not found");

  const ctx = await buildContext(user.id, note.orgId);

  await withContext(ctx, async () => {
    await requireOrgAccess(note.orgId, "member");

    const canEdit = await canEditNote(noteId, user.id);
    if (!canEdit) throw new Error("Forbidden");

    // Fetch the file to get the storage path before deleting.
    const [fileRow] = await db
      .select({ id: files.id, path: files.path })
      .from(files)
      .where(and(eq(files.id, fileId), eq(files.noteId, noteId), eq(files.orgId, note.orgId)))
      .limit(1);

    if (!fileRow) throw new Error("File not found");

    // Delete from storage first; if this fails we leave the DB row intact
    // (orphaned storage object is safer than an orphaned DB row with no object).
    const admin = getAdminSupabase();
    const { error: storageError } = await admin.storage
      .from(STORAGE_BUCKET)
      .remove([fileRow.path]);

    if (storageError) {
      throw new Error("Storage delete failed");
    }

    await db.delete(files).where(eq(files.id, fileId));

    await logAudit({
      action: "file.delete",
      resourceType: "files",
      resourceId: fileId,
      metadata: { noteId, orgId: note.orgId },
    });

    revalidatePath(`/notes/${noteId}`);
  });
}
