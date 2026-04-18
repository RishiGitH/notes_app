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
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

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
