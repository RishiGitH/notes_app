-- Migration 0009: Supabase Storage bucket and object-level RLS for notes-files.
--
-- Lead-backend deliverable responding to search-ai Request B (NOTES.md).
-- AGENTS.md section 2 item 9: "File uploads validate MIME by sniffing bytes,
-- not by trusting the client Content-Type. Size limits enforced server-side.
-- Stored paths are <org_id>/<note_id>/<random>."
--
-- Path structure: <org_id>/<note_id>/<ulid>-<safe_filename>
--   split_part(name, '/', 1)::uuid = org_id
--   split_part(name, '/', 2)::uuid = note_id
--
-- Helpers available from 0001_rls_helpers.sql:
--   public.is_org_member(org uuid) -> boolean  (SECURITY DEFINER, STABLE)
--   public.org_role(org uuid)      -> text      (SECURITY DEFINER, STABLE)
--
-- The upload path (lib/files/actions.ts) uses the service-role client and
-- bypasses Storage RLS — the Postgres files-table RLS is the primary gate.
-- This Storage RLS adds defense-in-depth so direct Storage API calls are
-- also protected without depending solely on application-layer checks.

-- Step 1: Create the private bucket (idempotent).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'notes-files',
  'notes-files',
  false,
  10485760,  -- 10 MiB, matching lib/files/constants.ts MAX_FILE_BYTES
  array[
    'application/pdf',
    'image/png',
    'image/jpeg',
    'image/gif',
    'image/webp',
    'text/plain',
    'text/markdown'
  ]
)
on conflict (id) do nothing;

-- Step 2: SELECT policy — authenticated user can download an object if:
--   (a) They are a member of the org encoded in path segment 1.
--   (b) The note encoded in path segment 2 exists and is not soft-deleted.
-- Defense-in-depth: files-table RLS (via parent notes join) is the primary
-- gate; Storage RLS is secondary.
create policy "notes_files_select"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'notes-files'
    and public.is_org_member(split_part(name, '/', 1)::uuid)
    and exists (
      select 1 from public.notes n
      where n.id = split_part(name, '/', 2)::uuid
        and n.deleted_at is null
    )
  );

-- Step 3: INSERT policy — authenticated user can upload if:
--   (a) They are a member of the org encoded in path segment 1.
--   (b) The note exists and is not soft-deleted.
-- The application layer (uploadNoteFile) enforces canEditNote before calling
-- Supabase Storage; this policy is the Postgres-level backstop.
create policy "notes_files_insert"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'notes-files'
    and public.is_org_member(split_part(name, '/', 1)::uuid)
    and exists (
      select 1 from public.notes n
      where n.id = split_part(name, '/', 2)::uuid
        and n.deleted_at is null
    )
  );

-- Step 4: DELETE policy — uploader (owner column) or org admin/owner can delete.
-- storage.objects.owner is the UUID of the uploading user (set by Supabase SDK).
-- No UPDATE policy: objects are immutable; replacement = delete + re-upload.
create policy "notes_files_delete"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'notes-files'
    and (
      owner = auth.uid()
      or public.org_role(split_part(name, '/', 1)::uuid) in ('owner', 'admin')
    )
  );
