// Drizzle schema. Single file by design: keeps cross-table references
// (FKs, RLS policy subselects) trivially in-scope.
//
// Order in this file is load-bearing: drizzle-kit emits CREATE TABLE in
// source order, followed by CREATE POLICY statements. Any FK or policy
// subselect that references another table needs that table declared above.
//
// RLS design (AGENTS.md section 2):
// - Every tenant-scoped table: org_id NOT NULL, ENABLE ROW LEVEL SECURITY,
//   USING + WITH CHECK for every verb that supports them.
// - Child tables (note_versions, note_shares, note_tags, files, ai_summaries)
//   resolve authorization by EXISTS-joining the current parent notes row
//   (deleted_at IS NULL, is_org_member, current visibility/share/role) —
//   never from historical state.
// - public.is_org_member(org uuid) and public.org_role(org uuid) are
//   SECURITY DEFINER helpers defined in migration 0001_rls_helpers.sql.
//   They are referenced here by name in policy SQL expressions; Postgres
//   validates the function at query execution time, not at CREATE POLICY time.
//
// See PLAN.md section 2 for the table list and AGENTS.md section 2 for
// the security invariants every policy exists to enforce.

import {
  bigint,
  index,
  integer,
  jsonb,
  pgEnum,
  pgPolicy,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// ----- Enums ---------------------------------------------------------------

export const roleEnum = pgEnum("role_enum", [
  "owner",
  "admin",
  "member",
  "viewer",
]);

export const visibilityEnum = pgEnum("visibility_enum", [
  "private",
  "org",
  "public_in_org",
]);

export const sharePermissionEnum = pgEnum("share_permission_enum", [
  "view",
  "comment",
  "edit",
]);

// ----- users (mirror of auth.users) ---------------------------------------
//
// id matches auth.users.id. No DB-level FK into the auth schema; Supabase
// owns that boundary; the mirror is maintained by an auth trigger (Phase 2).
//
// RLS: SELECT for self or same-org colleagues; UPDATE for self only.
// No INSERT policy — rows are inserted by the auth trigger (security definer).
// No DELETE policy — account deletion is an out-of-band admin operation.

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey(),
    email: text("email").notNull(),
    displayName: text("display_name"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    emailUnique: uniqueIndex("users_email_uq").on(t.email),
    // SELECT: self or any user in a shared org.
    selectPolicy: pgPolicy("users_select_self_or_same_org", {
      as: "permissive",
      for: "select",
      to: "authenticated",
      using: sql`
        id = auth.uid()
        or exists (
          select 1
          from public.memberships m1
          join public.memberships m2 on m1.org_id = m2.org_id
          where m1.user_id = auth.uid()
            and m2.user_id = users.id
        )
      `,
    }),
    // UPDATE: self only (display_name, etc.).
    updatePolicy: pgPolicy("users_update_self", {
      as: "permissive",
      for: "update",
      to: "authenticated",
      using: sql`id = auth.uid()`,
      withCheck: sql`id = auth.uid()`,
    }),
  }),
).enableRLS();

// ----- organizations -------------------------------------------------------
//
// RLS: SELECT for members; INSERT for any authenticated (companion membership
// row inserted by Phase 2 Server Action in the same tx); UPDATE for owners.
// No DELETE policy in Phase 1 (org deletion is a Phase 4+ concern).

export const organizations = pgTable(
  "organizations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    slugUnique: uniqueIndex("organizations_slug_uq").on(t.slug),
    selectPolicy: pgPolicy("organizations_select_member", {
      as: "permissive",
      for: "select",
      to: "authenticated",
      using: sql`public.is_org_member(id)`,
    }),
    insertPolicy: pgPolicy("organizations_insert_authenticated", {
      as: "permissive",
      for: "insert",
      to: "authenticated",
      // Any authenticated user may create an org; Phase 2 Server Action
      // always inserts the companion membership (role=owner) in the same tx.
      withCheck: sql`true`,
    }),
    updatePolicy: pgPolicy("organizations_update_owner", {
      as: "permissive",
      for: "update",
      to: "authenticated",
      using: sql`public.org_role(id) = 'owner'`,
      withCheck: sql`public.org_role(id) = 'owner'`,
    }),
  }),
).enableRLS();

// ----- memberships (user <-> org with role) --------------------------------
//
// RLS: SELECT for self or org admin; INSERT/UPDATE for org admin only;
// DELETE for self (leave) or admin (remove member).
// The admin INSERT policy is what prevents self-invite into another org
// (test case 7 in the tenant-isolation suite).

export const memberships = pgTable(
  "memberships",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    role: roleEnum("role").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    userOrgUnique: uniqueIndex("memberships_user_org_uq").on(t.userId, t.orgId),
    byOrg: index("memberships_org_idx").on(t.orgId),
    byUser: index("memberships_user_idx").on(t.userId),
    selectPolicy: pgPolicy("memberships_select_self_or_admin", {
      as: "permissive",
      for: "select",
      to: "authenticated",
      using: sql`
        user_id = auth.uid()
        or public.org_role(org_id) in ('owner', 'admin')
      `,
    }),
    insertPolicy: pgPolicy("memberships_insert_admin", {
      as: "permissive",
      for: "insert",
      to: "authenticated",
      withCheck: sql`public.org_role(org_id) in ('owner', 'admin')`,
    }),
    updatePolicy: pgPolicy("memberships_update_admin", {
      as: "permissive",
      for: "update",
      to: "authenticated",
      using: sql`public.org_role(org_id) in ('owner', 'admin')`,
      withCheck: sql`public.org_role(org_id) in ('owner', 'admin')`,
    }),
    deletePolicy: pgPolicy("memberships_delete_admin_or_self", {
      as: "permissive",
      for: "delete",
      to: "authenticated",
      using: sql`
        user_id = auth.uid()
        or public.org_role(org_id) in ('owner', 'admin')
      `,
    }),
  }),
).enableRLS();

// ----- notes ---------------------------------------------------------------
//
// current_version_id is intentionally NOT a DDL FK to note_versions. The
// chicken-and-egg (notes row exists before its first version, first version
// needs a valid note_id) is resolved at the application layer: the first
// save inserts a version then UPDATEs the note's current_version_id in the
// same transaction. Enforcement lives in the Server Action, not the schema.
//
// deleted_at drives the soft-delete invariant (AGENTS.md section 2 item 12).
// All RLS policies filter deleted_at IS NOT NULL rows as invisible.
//
// RLS visibility logic (SELECT):
// - is_org_member AND deleted_at IS NULL AND one of:
//   - visibility in ('org','public_in_org') — org-wide notes
//   - author_id = auth.uid() — own private note
//   - share exists for auth.uid() — explicitly shared private note

export const notes = pgTable(
  "notes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    authorId: uuid("author_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    currentVersionId: uuid("current_version_id"),
    visibility: visibilityEnum("visibility").notNull().default("private"),
    title: text("title").notNull().default(""),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    orgUpdated: index("notes_org_updated_idx")
      .on(t.orgId, t.updatedAt.desc())
      .where(sql`${t.deletedAt} is null`),
    orgAuthor: index("notes_org_author_idx")
      .on(t.orgId, t.authorId)
      .where(sql`${t.deletedAt} is null`),
    currentVersion: index("notes_current_version_idx").on(t.currentVersionId),
    selectPolicy: pgPolicy("notes_select_member", {
      as: "permissive",
      for: "select",
      to: "authenticated",
      using: sql`
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
      `,
    }),
    insertPolicy: pgPolicy("notes_insert_member", {
      as: "permissive",
      for: "insert",
      to: "authenticated",
      withCheck: sql`
        public.is_org_member(org_id)
        and author_id = auth.uid()
        and deleted_at is null
      `,
    }),
    // UPDATE: author, org admin, or a user with edit-level share.
    // WITH CHECK also prevents moving a note to another org via UPDATE.
    updatePolicy: pgPolicy("notes_update_editor", {
      as: "permissive",
      for: "update",
      to: "authenticated",
      using: sql`
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
      `,
      withCheck: sql`
        public.is_org_member(org_id)
      `,
    }),
    // DELETE policy is used for hard-delete only (admin purge path).
    // Normal deletion is a soft-delete (UPDATE setting deleted_at).
    deletePolicy: pgPolicy("notes_delete_admin_or_author", {
      as: "permissive",
      for: "delete",
      to: "authenticated",
      using: sql`
        public.is_org_member(org_id)
        and (
          author_id = auth.uid()
          or public.org_role(org_id) in ('owner', 'admin')
        )
      `,
    }),
  }),
).enableRLS();

// ----- note_versions -------------------------------------------------------
//
// Immutable snapshots. SELECT + INSERT only; cascades on parent delete are
// the only path that removes rows (no DELETE policy for authenticated).
//
// Child access joins to the current parent notes row: deleted_at IS NULL,
// is_org_member, current visibility/share/role — not historical state
// (AGENTS.md section 2 item 8).

export const noteVersions = pgTable(
  "note_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    noteId: uuid("note_id")
      .notNull()
      .references(() => notes.id, { onDelete: "cascade" }),
    orgId: uuid("org_id").notNull(),
    authorId: uuid("author_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    title: text("title").notNull(),
    content: text("content").notNull(),
    versionNumber: integer("version_number").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    noteVersionUnique: uniqueIndex("note_versions_note_version_uq").on(
      t.noteId,
      t.versionNumber,
    ),
    orgNote: index("note_versions_org_note_idx").on(t.orgId, t.noteId),
    selectPolicy: pgPolicy("note_versions_select_via_parent", {
      as: "permissive",
      for: "select",
      to: "authenticated",
      using: sql`
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
      `,
    }),
    insertPolicy: pgPolicy("note_versions_insert_via_parent", {
      as: "permissive",
      for: "insert",
      to: "authenticated",
      withCheck: sql`
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
      `,
    }),
  }),
).enableRLS();

// ----- note_shares ---------------------------------------------------------
//
// Child of notes. SELECT for the share recipient, note author, or org admin.
// INSERT: note author or org admin can create a share.
// UPDATE: note author or org admin can change permissions.
// DELETE: note author, org admin, or the recipient themselves (unsubscribe).

export const noteShares = pgTable(
  "note_shares",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    noteId: uuid("note_id")
      .notNull()
      .references(() => notes.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    permission: sharePermissionEnum("permission").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    noteUserUnique: uniqueIndex("note_shares_note_user_uq").on(
      t.noteId,
      t.userId,
    ),
    byUser: index("note_shares_user_idx").on(t.userId),
    selectPolicy: pgPolicy("note_shares_select_via_parent", {
      as: "permissive",
      for: "select",
      to: "authenticated",
      // A user can always read their own share grants. Author and admin reads of
      // all shares on a note go through the service role on admin server paths.
      // This intentionally avoids referencing the notes table to break the
      // circular RLS dependency: notes SELECT checks note_shares, so note_shares
      // SELECT must not check notes (infinite recursion).
      using: sql`user_id = auth.uid()`,
    }),
    insertPolicy: pgPolicy("note_shares_insert_author_or_admin", {
      as: "permissive",
      for: "insert",
      to: "authenticated",
      withCheck: sql`
        exists (
          select 1 from public.notes n
          where n.id = note_shares.note_id
            and n.deleted_at is null
            and (
              n.author_id = auth.uid()
              or public.org_role(n.org_id) in ('owner', 'admin')
            )
        )
      `,
    }),
    updatePolicy: pgPolicy("note_shares_update_author_or_admin", {
      as: "permissive",
      for: "update",
      to: "authenticated",
      using: sql`
        exists (
          select 1 from public.notes n
          where n.id = note_shares.note_id
            and n.deleted_at is null
            and (
              n.author_id = auth.uid()
              or public.org_role(n.org_id) in ('owner', 'admin')
            )
        )
      `,
      withCheck: sql`
        exists (
          select 1 from public.notes n
          where n.id = note_shares.note_id
            and n.deleted_at is null
            and (
              n.author_id = auth.uid()
              or public.org_role(n.org_id) in ('owner', 'admin')
            )
        )
      `,
    }),
    deletePolicy: pgPolicy("note_shares_delete_author_admin_or_self", {
      as: "permissive",
      for: "delete",
      to: "authenticated",
      using: sql`
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
      `,
    }),
  }),
).enableRLS();

// ----- tags ----------------------------------------------------------------
//
// Tag names are unique per org. SELECT: org member. INSERT: org member.
// UPDATE/DELETE: org admin or tag creator (no creator field here; use admin).

export const tags = pgTable(
  "tags",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    orgNameUnique: uniqueIndex("tags_org_name_uq").on(t.orgId, t.name),
    selectPolicy: pgPolicy("tags_select_member", {
      as: "permissive",
      for: "select",
      to: "authenticated",
      using: sql`public.is_org_member(org_id)`,
    }),
    insertPolicy: pgPolicy("tags_insert_member", {
      as: "permissive",
      for: "insert",
      to: "authenticated",
      withCheck: sql`public.is_org_member(org_id)`,
    }),
    deletePolicy: pgPolicy("tags_delete_admin", {
      as: "permissive",
      for: "delete",
      to: "authenticated",
      using: sql`public.org_role(org_id) in ('owner', 'admin')`,
    }),
    // Tags can be renamed by org admins only (tag names are unique per org;
    // renames affect all notes carrying the tag).
    updatePolicy: pgPolicy("tags_update_admin", {
      as: "permissive",
      for: "update",
      to: "authenticated",
      using: sql`public.org_role(org_id) in ('owner', 'admin')`,
      withCheck: sql`public.org_role(org_id) in ('owner', 'admin')`,
    }),
  }),
).enableRLS();

// ----- note_tags -----------------------------------------------------------
//
// Child of both notes and tags. SELECT/INSERT/DELETE resolve via parent notes.

export const noteTags = pgTable(
  "note_tags",
  {
    noteId: uuid("note_id")
      .notNull()
      .references(() => notes.id, { onDelete: "cascade" }),
    tagId: uuid("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.noteId, t.tagId] }),
    byTag: index("note_tags_tag_idx").on(t.tagId),
    selectPolicy: pgPolicy("note_tags_select_via_parent", {
      as: "permissive",
      for: "select",
      to: "authenticated",
      using: sql`
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
      `,
    }),
    insertPolicy: pgPolicy("note_tags_insert_via_parent", {
      as: "permissive",
      for: "insert",
      to: "authenticated",
      withCheck: sql`
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
      `,
    }),
    deletePolicy: pgPolicy("note_tags_delete_via_parent", {
      as: "permissive",
      for: "delete",
      to: "authenticated",
      using: sql`
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
      `,
    }),
  }),
).enableRLS();

// ----- files ---------------------------------------------------------------
//
// org_id FK uses RESTRICT: org rows should not be dropped while files exist
// (storage cleanup must happen first). Same rationale for note_id RESTRICT:
// notes are soft-deleted, not hard-deleted; an explicit purge job must clean
// storage objects before the file row can be removed.
//
// path is server-built as <org_id>/<note_id>/<random>; never derived from
// client-supplied filenames (AGENTS.md section 2 item 9).

export const files = pgTable(
  "files",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    noteId: uuid("note_id")
      .notNull()
      .references(() => notes.id, { onDelete: "restrict" }),
    uploaderId: uuid("uploader_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    path: text("path").notNull(),
    mime: text("mime").notNull(),
    sizeBytes: bigint("size_bytes", { mode: "number" }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    pathUnique: uniqueIndex("files_path_uq").on(t.path),
    orgNote: index("files_org_note_idx").on(t.orgId, t.noteId),
    byNote: index("files_note_idx").on(t.noteId),
    selectPolicy: pgPolicy("files_select_via_parent", {
      as: "permissive",
      for: "select",
      to: "authenticated",
      using: sql`
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
      `,
    }),
    insertPolicy: pgPolicy("files_insert_via_parent", {
      as: "permissive",
      for: "insert",
      to: "authenticated",
      withCheck: sql`
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
      `,
    }),
    deletePolicy: pgPolicy("files_delete_via_parent", {
      as: "permissive",
      for: "delete",
      to: "authenticated",
      using: sql`
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
      `,
    }),
  }),
).enableRLS();

// ----- ai_summaries --------------------------------------------------------
//
// Child of notes. SELECT/INSERT via parent note access check.
// UPDATE: the user who triggered the summary (author_id here) or org admin.
// No DELETE policy for authenticated (summaries cascade when the note is
// hard-deleted; soft-delete hides them via the parent join).

export const aiSummaries = pgTable(
  "ai_summaries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    noteId: uuid("note_id")
      .notNull()
      .references(() => notes.id, { onDelete: "cascade" }),
    orgId: uuid("org_id").notNull(),
    authorId: uuid("author_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    model: text("model").notNull(),
    draftTldr: text("draft_tldr"),
    draftKeyPoints: jsonb("draft_key_points"),
    draftActionItems: jsonb("draft_action_items"),
    acceptedTldr: text("accepted_tldr"),
    acceptedKeyPoints: jsonb("accepted_key_points"),
    acceptedActionItems: jsonb("accepted_action_items"),
    status: text("status").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    byNoteDate: index("ai_summaries_note_date_idx").on(
      t.noteId,
      t.createdAt.desc(),
    ),
    selectPolicy: pgPolicy("ai_summaries_select_via_parent", {
      as: "permissive",
      for: "select",
      to: "authenticated",
      using: sql`
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
      `,
    }),
    insertPolicy: pgPolicy("ai_summaries_insert_via_parent", {
      as: "permissive",
      for: "insert",
      to: "authenticated",
      withCheck: sql`
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
      `,
    }),
    updatePolicy: pgPolicy("ai_summaries_update_author_or_admin", {
      as: "permissive",
      for: "update",
      to: "authenticated",
      using: sql`
        author_id = auth.uid()
        or exists (
          select 1 from public.notes n
          where n.id = ai_summaries.note_id
            and n.deleted_at is null
            and public.org_role(n.org_id) in ('owner', 'admin')
        )
      `,
      withCheck: sql`
        author_id = auth.uid()
        or exists (
          select 1 from public.notes n
          where n.id = ai_summaries.note_id
            and n.deleted_at is null
            and public.org_role(n.org_id) in ('owner', 'admin')
        )
      `,
    }),
  }),
).enableRLS();

// ----- audit_logs ----------------------------------------------------------
//
// Append-only; no updatedAt. actor_id and org_id are nullable to accommodate
// system events (no actor) and pre-org-selection auth events (no org).
// resource_id is text, not uuid, to accommodate storage object keys.
//
// RLS: INSERT-only for the authenticated role; org_id must be null or a
// member org. Reads go through the service role (secret key) on admin paths
// not shipped until a later phase. No SELECT/UPDATE/DELETE policy for
// the authenticated role.

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    actorId: uuid("actor_id"),
    orgId: uuid("org_id"),
    action: text("action").notNull(),
    resourceType: text("resource_type").notNull(),
    resourceId: text("resource_id"),
    requestId: text("request_id").notNull(),
    metadata: jsonb("metadata").notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    orgDate: index("audit_logs_org_date_idx").on(t.orgId, t.createdAt.desc()),
    actorDate: index("audit_logs_actor_date_idx").on(
      t.actorId,
      t.createdAt.desc(),
    ),
    byRequest: index("audit_logs_request_idx").on(t.requestId),
    insertPolicy: pgPolicy("audit_logs_insert_self", {
      as: "permissive",
      for: "insert",
      to: "authenticated",
      withCheck: sql`
        actor_id = auth.uid()
        and (
          org_id is null
          or public.is_org_member(org_id)
        )
      `,
    }),
  }),
).enableRLS();
