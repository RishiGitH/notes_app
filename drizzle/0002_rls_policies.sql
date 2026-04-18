ALTER TABLE "ai_summaries" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "audit_logs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "files" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "memberships" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "note_shares" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "note_tags" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "note_versions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "notes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "organizations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "tags" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "ai_summaries_select_via_parent" ON "ai_summaries" AS PERMISSIVE FOR SELECT TO "authenticated" USING (
        exists (
          select 1 from public.notes n
          where n.id = ai_summaries.note_id
            and n.deleted_at is null
            and public.is_org_member(n.org_id)
            and (
              n.visibility in ('org', 'public_in_org')
              or n.author_id = auth.uid()
              or exists (
                select 1 from public.note_shares s
                where s.note_id = n.id and s.user_id = auth.uid()
              )
            )
        )
      );--> statement-breakpoint
CREATE POLICY "ai_summaries_insert_via_parent" ON "ai_summaries" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (
        author_id = auth.uid()
        and exists (
          select 1 from public.notes n
          where n.id = ai_summaries.note_id
            and n.deleted_at is null
            and (
              n.author_id = auth.uid()
              or public.org_role(n.org_id) in ('owner', 'admin')
              or exists (
                select 1 from public.note_shares s
                where s.note_id = n.id
                  and s.user_id = auth.uid()
                  and s.permission in ('edit', 'comment')
              )
            )
        )
      );--> statement-breakpoint
CREATE POLICY "ai_summaries_update_author_or_admin" ON "ai_summaries" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (
        author_id = auth.uid()
        or exists (
          select 1 from public.notes n
          where n.id = ai_summaries.note_id
            and n.deleted_at is null
            and public.org_role(n.org_id) in ('owner', 'admin')
        )
      ) WITH CHECK (
        author_id = auth.uid()
        or exists (
          select 1 from public.notes n
          where n.id = ai_summaries.note_id
            and n.deleted_at is null
            and public.org_role(n.org_id) in ('owner', 'admin')
        )
      );--> statement-breakpoint
CREATE POLICY "audit_logs_insert_self" ON "audit_logs" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (
        actor_id = auth.uid()
        and (
          org_id is null
          or public.is_org_member(org_id)
        )
      );--> statement-breakpoint
CREATE POLICY "files_select_via_parent" ON "files" AS PERMISSIVE FOR SELECT TO "authenticated" USING (
        exists (
          select 1 from public.notes n
          where n.id = files.note_id
            and n.deleted_at is null
            and public.is_org_member(n.org_id)
            and (
              n.visibility in ('org', 'public_in_org')
              or n.author_id = auth.uid()
              or exists (
                select 1 from public.note_shares s
                where s.note_id = n.id and s.user_id = auth.uid()
              )
            )
        )
      );--> statement-breakpoint
CREATE POLICY "files_insert_via_parent" ON "files" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (
        uploader_id = auth.uid()
        and exists (
          select 1 from public.notes n
          where n.id = files.note_id
            and n.deleted_at is null
            and (
              n.author_id = auth.uid()
              or public.org_role(n.org_id) in ('owner', 'admin')
              or exists (
                select 1 from public.note_shares s
                where s.note_id = n.id
                  and s.user_id = auth.uid()
                  and s.permission = 'edit'
              )
            )
        )
      );--> statement-breakpoint
CREATE POLICY "files_delete_via_parent" ON "files" AS PERMISSIVE FOR DELETE TO "authenticated" USING (
        uploader_id = auth.uid()
        or exists (
          select 1 from public.notes n
          where n.id = files.note_id
            and n.deleted_at is null
            and (
              n.author_id = auth.uid()
              or public.org_role(n.org_id) in ('owner', 'admin')
            )
        )
      );--> statement-breakpoint
CREATE POLICY "memberships_select_self_or_admin" ON "memberships" AS PERMISSIVE FOR SELECT TO "authenticated" USING (
        user_id = auth.uid()
        or public.org_role(org_id) in ('owner', 'admin')
      );--> statement-breakpoint
CREATE POLICY "memberships_insert_admin" ON "memberships" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (public.org_role(org_id) in ('owner', 'admin'));--> statement-breakpoint
CREATE POLICY "memberships_update_admin" ON "memberships" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (public.org_role(org_id) in ('owner', 'admin')) WITH CHECK (public.org_role(org_id) in ('owner', 'admin'));--> statement-breakpoint
CREATE POLICY "memberships_delete_admin_or_self" ON "memberships" AS PERMISSIVE FOR DELETE TO "authenticated" USING (
        user_id = auth.uid()
        or public.org_role(org_id) in ('owner', 'admin')
      );--> statement-breakpoint
CREATE POLICY "note_shares_select_via_parent" ON "note_shares" AS PERMISSIVE FOR SELECT TO "authenticated" USING (
        exists (
          select 1 from public.notes n
          where n.id = note_shares.note_id
            and n.deleted_at is null
            and public.is_org_member(n.org_id)
            and (
              n.author_id = auth.uid()
              or public.org_role(n.org_id) in ('owner', 'admin')
              or note_shares.user_id = auth.uid()
            )
        )
      );--> statement-breakpoint
CREATE POLICY "note_shares_insert_author_or_admin" ON "note_shares" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (
        exists (
          select 1 from public.notes n
          where n.id = note_shares.note_id
            and n.deleted_at is null
            and (
              n.author_id = auth.uid()
              or public.org_role(n.org_id) in ('owner', 'admin')
            )
        )
      );--> statement-breakpoint
CREATE POLICY "note_shares_update_author_or_admin" ON "note_shares" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (
        exists (
          select 1 from public.notes n
          where n.id = note_shares.note_id
            and n.deleted_at is null
            and (
              n.author_id = auth.uid()
              or public.org_role(n.org_id) in ('owner', 'admin')
            )
        )
      ) WITH CHECK (
        exists (
          select 1 from public.notes n
          where n.id = note_shares.note_id
            and n.deleted_at is null
            and (
              n.author_id = auth.uid()
              or public.org_role(n.org_id) in ('owner', 'admin')
            )
        )
      );--> statement-breakpoint
CREATE POLICY "note_shares_delete_author_admin_or_self" ON "note_shares" AS PERMISSIVE FOR DELETE TO "authenticated" USING (
        note_shares.user_id = auth.uid()
        or exists (
          select 1 from public.notes n
          where n.id = note_shares.note_id
            and n.deleted_at is null
            and (
              n.author_id = auth.uid()
              or public.org_role(n.org_id) in ('owner', 'admin')
            )
        )
      );--> statement-breakpoint
CREATE POLICY "note_tags_select_via_parent" ON "note_tags" AS PERMISSIVE FOR SELECT TO "authenticated" USING (
        exists (
          select 1 from public.notes n
          where n.id = note_tags.note_id
            and n.deleted_at is null
            and public.is_org_member(n.org_id)
            and (
              n.visibility in ('org', 'public_in_org')
              or n.author_id = auth.uid()
              or exists (
                select 1 from public.note_shares s
                where s.note_id = n.id and s.user_id = auth.uid()
              )
            )
        )
      );--> statement-breakpoint
CREATE POLICY "note_tags_insert_via_parent" ON "note_tags" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (
        exists (
          select 1 from public.notes n
          where n.id = note_tags.note_id
            and n.deleted_at is null
            and (
              n.author_id = auth.uid()
              or public.org_role(n.org_id) in ('owner', 'admin')
              or exists (
                select 1 from public.note_shares s
                where s.note_id = n.id
                  and s.user_id = auth.uid()
                  and s.permission = 'edit'
              )
            )
        )
      );--> statement-breakpoint
CREATE POLICY "note_tags_delete_via_parent" ON "note_tags" AS PERMISSIVE FOR DELETE TO "authenticated" USING (
        exists (
          select 1 from public.notes n
          where n.id = note_tags.note_id
            and n.deleted_at is null
            and (
              n.author_id = auth.uid()
              or public.org_role(n.org_id) in ('owner', 'admin')
              or exists (
                select 1 from public.note_shares s
                where s.note_id = n.id
                  and s.user_id = auth.uid()
                  and s.permission = 'edit'
              )
            )
        )
      );--> statement-breakpoint
CREATE POLICY "note_versions_select_via_parent" ON "note_versions" AS PERMISSIVE FOR SELECT TO "authenticated" USING (
        exists (
          select 1 from public.notes n
          where n.id = note_versions.note_id
            and n.deleted_at is null
            and public.is_org_member(n.org_id)
            and (
              n.visibility in ('org', 'public_in_org')
              or n.author_id = auth.uid()
              or exists (
                select 1 from public.note_shares s
                where s.note_id = n.id and s.user_id = auth.uid()
              )
            )
        )
      );--> statement-breakpoint
CREATE POLICY "note_versions_insert_via_parent" ON "note_versions" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (
        exists (
          select 1 from public.notes n
          where n.id = note_versions.note_id
            and n.deleted_at is null
            and public.is_org_member(n.org_id)
            and (
              n.author_id = auth.uid()
              or public.org_role(n.org_id) in ('owner', 'admin')
              or exists (
                select 1 from public.note_shares s
                where s.note_id = n.id
                  and s.user_id = auth.uid()
                  and s.permission = 'edit'
              )
            )
        )
        and author_id = auth.uid()
      );--> statement-breakpoint
CREATE POLICY "notes_select_member" ON "notes" AS PERMISSIVE FOR SELECT TO "authenticated" USING (
        public.is_org_member(org_id)
        and deleted_at is null
        and (
          visibility in ('org', 'public_in_org')
          or author_id = auth.uid()
          or exists (
            select 1 from public.note_shares s
            where s.note_id = notes.id
              and s.user_id = auth.uid()
          )
        )
      );--> statement-breakpoint
CREATE POLICY "notes_insert_member" ON "notes" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (
        public.is_org_member(org_id)
        and author_id = auth.uid()
        and deleted_at is null
      );--> statement-breakpoint
CREATE POLICY "notes_update_editor" ON "notes" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (
        public.is_org_member(org_id)
        and deleted_at is null
        and (
          author_id = auth.uid()
          or public.org_role(org_id) in ('owner', 'admin')
          or exists (
            select 1 from public.note_shares s
            where s.note_id = notes.id
              and s.user_id = auth.uid()
              and s.permission = 'edit'
          )
        )
      ) WITH CHECK (
        public.is_org_member(org_id)
      );--> statement-breakpoint
CREATE POLICY "notes_delete_admin_or_author" ON "notes" AS PERMISSIVE FOR DELETE TO "authenticated" USING (
        public.is_org_member(org_id)
        and (
          author_id = auth.uid()
          or public.org_role(org_id) in ('owner', 'admin')
        )
      );--> statement-breakpoint
CREATE POLICY "organizations_select_member" ON "organizations" AS PERMISSIVE FOR SELECT TO "authenticated" USING (public.is_org_member(id));--> statement-breakpoint
CREATE POLICY "organizations_insert_authenticated" ON "organizations" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "organizations_update_owner" ON "organizations" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (public.org_role(id) = 'owner') WITH CHECK (public.org_role(id) = 'owner');--> statement-breakpoint
CREATE POLICY "tags_select_member" ON "tags" AS PERMISSIVE FOR SELECT TO "authenticated" USING (public.is_org_member(org_id));--> statement-breakpoint
CREATE POLICY "tags_insert_member" ON "tags" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (public.is_org_member(org_id));--> statement-breakpoint
CREATE POLICY "tags_delete_admin" ON "tags" AS PERMISSIVE FOR DELETE TO "authenticated" USING (public.org_role(org_id) in ('owner', 'admin'));--> statement-breakpoint
CREATE POLICY "users_select_self_or_same_org" ON "users" AS PERMISSIVE FOR SELECT TO "authenticated" USING (
        id = auth.uid()
        or exists (
          select 1
          from public.memberships m1
          join public.memberships m2 on m1.org_id = m2.org_id
          where m1.user_id = auth.uid()
            and m2.user_id = users.id
        )
      );--> statement-breakpoint
CREATE POLICY "users_update_self" ON "users" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (id = auth.uid()) WITH CHECK (id = auth.uid());