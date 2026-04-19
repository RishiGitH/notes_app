// Case 8: Search (title filter) returns only results from the authenticated
// user's own org, even when both orgs have notes with the same title.
//
// Phase 3C additions: also verifies the tsvector FTS path (searchTsv column,
// plainto_tsquery). Both the explicit org_id WHERE clause and the tsvector
// filter are tested — defense in depth (AGENTS.md section 2 item 10).
//
// Setup: org1 and org2 each have a note titled "Alpha Note". userA (org1).
// Assertion: as userA, `title ilike 'Alpha Note'` returns exactly one row,
// and its org_id equals org1.id.
//
// The RLS SELECT policy on notes already filters by org membership.
// This test additionally validates that the combined effect of RLS + an
// explicit org_id WHERE clause (as the app layer must add per AGENTS.md
// section 2 item 10) returns only org1's result.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { and, eq, ilike, isNull, sql } from "drizzle-orm";
import { asUser, asAdmin } from "./helpers/as-user";
import { seedTwoOrgs, truncateAll, type TestFixture } from "./helpers/fixtures";
import { notes } from "@/lib/db/schema";
import { v4 as uuidv4 } from "uuid";

let fx: TestFixture;
let org1NoteId: string;

beforeAll(async () => {
  fx = await seedTwoOrgs();

  const { sql: adminSql, release } = await asAdmin();
  try {
    org1NoteId = uuidv4();
    const org2NoteId = uuidv4();

    // Insert notes in both orgs with the same title.
    // search_tsv is maintained by trigger; after INSERT we must also trigger
    // the tsvector update. Since the trigger fires on INSERT OR UPDATE OF title,
    // current_version_id — and we are inserting without current_version_id —
    // the trigger fires on INSERT and sets search_tsv from just the title.
    await adminSql`
      insert into public.notes
        (id, org_id, author_id, visibility, title, created_at, updated_at)
      values
        (${org1NoteId}, ${fx.org1.id}, ${fx.userA.id}, 'org', 'Alpha Note', now(), now()),
        (${org2NoteId}, ${fx.org2.id}, ${fx.userC.id}, 'org', 'Alpha Note', now(), now())
    `;
  } finally {
    await release();
  }
});

afterAll(async () => {
  await truncateAll();
});

describe("search scope isolation", () => {
  it("userA title search returns only org1 result (RLS + explicit org_id filter)", async () => {
    const { db, release } = await asUser(fx.userA.id);
    try {
      const rows = await db
        .select({ id: notes.id, orgId: notes.orgId })
        .from(notes)
        .where(
          and(eq(notes.orgId, fx.org1.id), ilike(notes.title, "Alpha Note")),
        );

      expect(rows).toHaveLength(1);
      expect(rows[0]?.orgId).toBe(fx.org1.id);
    } finally {
      await release();
    }
  });

  it("userA title search without org_id filter still returns only org1 result via RLS", async () => {
    const { db, release } = await asUser(fx.userA.id);
    try {
      const rows = await db
        .select({ id: notes.id, orgId: notes.orgId })
        .from(notes)
        .where(ilike(notes.title, "Alpha Note"));

      // RLS alone should hide org2's row.
      expect(rows.every((r) => r.orgId === fx.org1.id)).toBe(true);
    } finally {
      await release();
    }
  });

  // Phase 3C: tsvector FTS path — the same org_id defense-in-depth principle
  // must hold when using the FTS operator (@@ plainto_tsquery).
  it("userA tsvector search with org_id filter returns only org1 result", async () => {
    const { db, release } = await asUser(fx.userA.id);
    try {
      const rows = await db
        .select({ id: notes.id, orgId: notes.orgId })
        .from(notes)
        .where(
          and(
            eq(notes.orgId, fx.org1.id),
            isNull(notes.deletedAt),
            sql`${notes.searchTsv} @@ plainto_tsquery('english', 'Alpha')`,
          ),
        );

      expect(rows).toHaveLength(1);
      expect(rows[0]?.orgId).toBe(fx.org1.id);
    } finally {
      await release();
    }
  });

  it("userA tsvector search without org_id filter returns only org1 result via RLS", async () => {
    const { db, release } = await asUser(fx.userA.id);
    try {
      const rows = await db
        .select({ id: notes.id, orgId: notes.orgId })
        .from(notes)
        .where(
          and(
            isNull(notes.deletedAt),
            sql`${notes.searchTsv} @@ plainto_tsquery('english', 'Alpha')`,
          ),
        );

      // RLS should hide org2's note.
      expect(rows.every((r) => r.orgId === fx.org1.id)).toBe(true);
    } finally {
      await release();
    }
  });

  it("userA tsvector search returns zero results for a term only in org2 notes", async () => {
    // Insert a note in org2 with a unique term, then verify userA sees nothing.
    const { sql: adminSql, release: adminRelease } = await asAdmin();
    try {
      await adminSql`
        insert into public.notes
          (id, org_id, author_id, visibility, title, created_at, updated_at)
        values
          (${uuidv4()}, ${fx.org2.id}, ${fx.userC.id}, 'org', 'UniqueOrg2Term', now(), now())
      `;
    } finally {
      await adminRelease();
    }

    const { db, release } = await asUser(fx.userA.id);
    try {
      const rows = await db
        .select({ id: notes.id, orgId: notes.orgId })
        .from(notes)
        .where(
          and(
            eq(notes.orgId, fx.org1.id),
            sql`${notes.searchTsv} @@ plainto_tsquery('english', 'UniqueOrg2Term')`,
          ),
        );

      expect(rows).toHaveLength(0);
    } finally {
      await release();
    }
  });
});
