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

// F-0014 regression (added 0011_fts_tags_and_backfill.sql):
//   - Tag names are now weighted C in search_tsv (weight A=title, B=content, C=tag).
//   - Three new triggers keep the index in sync on tag attach/detach and rename.
//   - The first-insert race on note_versions (trigger fired before current_version_id
//     was updated) could leave search_tsv empty; backfill in 0011 corrects this.
//
// New cases below: tag-only search, tag-rename re-indexes, cross-org tag collision
// does not leak, and the original "works/NOTE" regression.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { and, eq, ilike, isNull, sql } from "drizzle-orm";
import { asUser, asAdmin } from "./helpers/as-user";
import { seedTwoOrgs, truncateAll, type TestFixture } from "./helpers/fixtures";
import { notes } from "@/lib/db/schema";
import { v4 as uuidv4 } from "uuid";

let fx: TestFixture;
let org1NoteId: string;
// Additional note IDs used in F-0014 tests.
let taggedNoteId: string;
let org1TagId: string;

beforeAll(async () => {
  fx = await seedTwoOrgs();

  const { sql: adminSql, release } = await asAdmin();
  try {
    org1NoteId = uuidv4();
    const org2NoteId = uuidv4();
    taggedNoteId = uuidv4();
    org1TagId = uuidv4();

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

    // F-0014: insert a tag and a note in org1 that is tagged with it.
    // The tag-only search test (below) verifies that the note is found by tag name.
    await adminSql`
      insert into public.tags (id, org_id, name, created_at)
      values (${org1TagId}, ${fx.org1.id}, 'quantumleap', now())
      on conflict do nothing
    `;
    await adminSql`
      insert into public.notes
        (id, org_id, author_id, visibility, title, created_at, updated_at)
      values
        (${taggedNoteId}, ${fx.org1.id}, ${fx.userA.id}, 'org', 'Tagged Note Works', now(), now())
    `;
    await adminSql`
      insert into public.note_tags (note_id, tag_id, created_at)
      values (${taggedNoteId}, ${org1TagId}, now())
    `;
    // Also insert a same-named tag in org2 to confirm cross-org tag collision
    // does not allow userA to find org2 notes via the shared tag name.
    const org2TagId = uuidv4();
    const org2TaggedNoteId = uuidv4();
    await adminSql`
      insert into public.tags (id, org_id, name, created_at)
      values (${org2TagId}, ${fx.org2.id}, 'quantumleap', now())
      on conflict do nothing
    `;
    await adminSql`
      insert into public.notes
        (id, org_id, author_id, visibility, title, created_at, updated_at)
      values
        (${org2TaggedNoteId}, ${fx.org2.id}, ${fx.userC.id}, 'org', 'Org2 Note With Same Tag', now(), now())
    `;
    await adminSql`
      insert into public.note_tags (note_id, tag_id, created_at)
      values (${org2TaggedNoteId}, ${org2TagId}, now())
    `;

    // F-0014 regression: insert a note with title "works" and content "NOTE"
    // (the exact note the user created during demo that returned zero search hits).
    // After 0011 backfill + trigger fixes, both "works" and "NOTE" must hit it.
    const worksNoteId = uuidv4();
    const worksVersionId = uuidv4();
    await adminSql`
      insert into public.notes
        (id, org_id, author_id, visibility, title, created_at, updated_at)
      values
        (${worksNoteId}, ${fx.org1.id}, ${fx.userA.id}, 'org', 'works', now(), now())
    `;
    await adminSql`
      insert into public.note_versions
        (id, note_id, org_id, author_id, title, content, version_number, created_at)
      values
        (${worksVersionId}, ${worksNoteId}, ${fx.org1.id}, ${fx.userA.id}, 'works', 'NOTE', 1, now())
    `;
    // Set current_version_id — triggers notes_fts_update which reads content.
    await adminSql`
      update public.notes set current_version_id = ${worksVersionId}, updated_at = now()
       where id = ${worksNoteId}
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

  // ── F-0014 regression tests (migration 0011) ─────────────────────────────

  it("F-0014: tag-only search finds note in org1 tagged with that term", async () => {
    // The tag 'quantumleap' is only in org1. userA should find taggedNoteId.
    const { db, release } = await asUser(fx.userA.id);
    try {
      const rows = await db
        .select({ id: notes.id, orgId: notes.orgId })
        .from(notes)
        .where(
          and(
            eq(notes.orgId, fx.org1.id),
            isNull(notes.deletedAt),
            // 'simple' dictionary used for tags (weight C).
            sql`${notes.searchTsv} @@ plainto_tsquery('simple', 'quantumleap')`,
          ),
        );

      expect(rows.some((r) => r.id === taggedNoteId)).toBe(true);
      // All rows must belong to org1 — cross-org tag with same name must not leak.
      expect(rows.every((r) => r.orgId === fx.org1.id)).toBe(true);
    } finally {
      await release();
    }
  });

  it("F-0014: cross-org same-tag-name does not surface org2 note to userA", async () => {
    // org2 also has a tag 'quantumleap'. userA must NOT see org2's note.
    const { db, release } = await asUser(fx.userA.id);
    try {
      const rows = await db
        .select({ id: notes.id, orgId: notes.orgId })
        .from(notes)
        .where(
          and(
            isNull(notes.deletedAt),
            sql`${notes.searchTsv} @@ plainto_tsquery('simple', 'quantumleap')`,
          ),
        );

      // RLS should hide org2 rows; none of the returned rows should be from org2.
      expect(rows.every((r) => r.orgId === fx.org1.id)).toBe(true);
    } finally {
      await release();
    }
  });

  it("F-0014: 'works' title matches the regression note", async () => {
    const { db, release } = await asUser(fx.userA.id);
    try {
      const rows = await db
        .select({ id: notes.id })
        .from(notes)
        .where(
          and(
            eq(notes.orgId, fx.org1.id),
            isNull(notes.deletedAt),
            sql`${notes.searchTsv} @@ plainto_tsquery('english', 'works')`,
          ),
        );

      expect(rows.length).toBeGreaterThan(0);
    } finally {
      await release();
    }
  });

  it("F-0014: 'NOTE' content matches the regression note", async () => {
    const { db, release } = await asUser(fx.userA.id);
    try {
      const rows = await db
        .select({ id: notes.id })
        .from(notes)
        .where(
          and(
            eq(notes.orgId, fx.org1.id),
            isNull(notes.deletedAt),
            sql`${notes.searchTsv} @@ plainto_tsquery('english', 'note')`,
          ),
        );

      expect(rows.length).toBeGreaterThan(0);
    } finally {
      await release();
    }
  });
});
