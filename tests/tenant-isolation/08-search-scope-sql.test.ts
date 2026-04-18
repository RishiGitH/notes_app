// Case 8: Search (title filter) returns only results from the authenticated
// user's own org, even when both orgs have notes with the same title.
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
import { and, eq, ilike } from "drizzle-orm";
import { asUser, asAdmin } from "./helpers/as-user";
import { seedTwoOrgs, truncateAll, type TestFixture } from "./helpers/fixtures";
import { notes } from "@/lib/db/schema";
import { v4 as uuidv4 } from "uuid";

let fx: TestFixture;

beforeAll(async () => {
  fx = await seedTwoOrgs();

  const { sql, release } = await asAdmin();
  try {
    await sql`
      insert into public.notes
        (id, org_id, author_id, visibility, title, created_at, updated_at)
      values
        (${uuidv4()}, ${fx.org1.id}, ${fx.userA.id}, 'org', 'Alpha Note', now(), now()),
        (${uuidv4()}, ${fx.org2.id}, ${fx.userC.id}, 'org', 'Alpha Note', now(), now())
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
});
