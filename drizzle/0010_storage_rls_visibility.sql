-- Migration 0010: Tighten storage SELECT policy to respect note visibility.
--
-- Bug: the original notes_files_select policy (0009) only checked org
-- membership and soft-delete. It did NOT check note visibility, so any
-- org member could download files attached to a private note by calling
-- the Supabase Storage API directly — bypassing the application-layer
-- getSignedUrl check that routes through the /api/files/[fileId]/download
-- route handler which enforces visibility via RLS on the files table.
--
-- Fix: replace the SELECT policy with one that mirrors the access model
-- used by the notes SELECT RLS (lib/db/schema.ts L283-L302):
--   - author always has access
--   - org-wide notes (visibility = 'org' or 'public_in_org') are readable
--     by any org member
--   - private notes are readable only by the author or an explicit share
--     recipient (note_shares)
--
-- The INSERT and DELETE policies are unchanged.

-- Drop the old permissive SELECT policy.
drop policy if exists "notes_files_select" on storage.objects;

-- Replace with visibility-aware SELECT policy.
--
-- A user can download an object stored at <org_id>/<note_id>/... if:
--   (a) The bucket is notes-files.
--   (b) The note exists and is not soft-deleted.
--   (c) One of:
--       - auth.uid() is the note author
--       - The note visibility is 'org' or 'public_in_org' AND the user
--         is an org member
--       - The user has an explicit note_shares row for the note
create policy "notes_files_select"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'notes-files'
    and exists (
      select 1 from public.notes n
      where n.id       = split_part(name, '/', 2)::uuid
        and n.deleted_at is null
        and (
          -- author always has access
          n.author_id = auth.uid()
          -- org-wide note: any member of the owning org
          or (
            n.visibility in ('org', 'public_in_org')
            and public.is_org_member(n.org_id)
          )
          -- private note: explicit share grant
          or exists (
            select 1 from public.note_shares ns
            where ns.note_id = n.id
              and ns.user_id = auth.uid()
          )
        )
    )
  );
