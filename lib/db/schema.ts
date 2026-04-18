// Drizzle schema. Single file by design: keeps cross-table references
// (FKs, RLS policy subselects) trivially in-scope.
//
// Order in this file is load-bearing: drizzle-kit emits CREATE TABLE in
// source order, followed by CREATE POLICY statements. Any FK or policy
// subselect that references another table needs that table above.
//
// See PLAN.md section 2 for the table list and AGENTS.md section 2 for
// the security invariants every policy exists to enforce.

import {
  index,
  integer,
  pgEnum,
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
// owns that boundary and the mirror is maintained by an auth trigger
// (Phase 2 deliverable).

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
  }),
);

// ----- organizations -------------------------------------------------------

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
  }),
);

// ----- memberships (user <-> org with role) --------------------------------

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
  }),
);

// ----- notes ---------------------------------------------------------------
//
// current_version_id is intentionally NOT a DDL FK to note_versions. The
// chicken-and-egg (notes row exists before its first version, first version
// needs a valid note_id) is resolved at the application layer: the first
// save inserts a version then UPDATEs the note's current_version_id in the
// same transaction. Enforcement lives in the Server Action, not the schema.
//
// deleted_at drives the soft-delete invariant (AGENTS.md section 2 item 12).
// All RLS policies below treat deleted_at IS NOT NULL rows as invisible.

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
    // Primary list page: "my org's active notes, newest first".
    orgUpdated: index("notes_org_updated_idx")
      .on(t.orgId, t.updatedAt.desc())
      .where(sql`${t.deletedAt} is null`),
    // "Notes I authored in this org".
    orgAuthor: index("notes_org_author_idx")
      .on(t.orgId, t.authorId)
      .where(sql`${t.deletedAt} is null`),
    currentVersion: index("notes_current_version_idx").on(t.currentVersionId),
  }),
);

// ----- note_versions -------------------------------------------------------
//
// Immutable snapshots. No UPDATE or DELETE policy; cascades on parent delete
// are the only path that removes rows.
//
// org_id is denormalized so (org_id, note_id) can index cheaply and so that a
// future cross-partition move would have to be explicit. RLS still resolves
// tenant isolation by joining to the parent notes row (AGENTS.md section 2
// item 8: child authorization is *never* historical).

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
  }),
);

// ----- note_shares ---------------------------------------------------------

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
  }),
);

// ----- tags ----------------------------------------------------------------

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
  }),
);

// ----- note_tags -----------------------------------------------------------

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
  }),
);
