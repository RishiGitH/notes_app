// Case 1: User in Org2 cannot read Org1's notes through any SQL path.
//
// Setup: userC (owner of org2) inserts a note in org2.
// Assertion: as userA (member of org1, no access to org2), a direct
// SELECT on notes filtered by org2.id returns an empty array.
//
// This test fails if any SELECT policy on notes is USING (true), or if
// the is_org_member() helper is broken.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { asUser, asAdmin } from "./helpers/as-user";
import { seedTwoOrgs, truncateAll, type TestFixture } from "./helpers/fixtures";
import { notes } from "@/lib/db/schema";
import { v4 as uuidv4 } from "uuid";

let fx: TestFixture;
let org2NoteId: string;

beforeAll(async () => {
  fx = await seedTwoOrgs();

  // userC creates a note in org2 using the admin connection (bypasses RLS
  // so we can set up the fixture without worrying about INSERT policies).
  const { sql, release } = await asAdmin();
  try {
    org2NoteId = uuidv4();
    await sql`
      insert into public.notes
        (id, org_id, author_id, visibility, title, created_at, updated_at)
      values
        (${org2NoteId}, ${fx.org2.id}, ${fx.userC.id}, 'org', 'Org2 Note', now(), now())
    `;
  } finally {
    await release();
  }
});

afterAll(async () => {
  await truncateAll();
});

describe("cross-org notes read isolation", () => {
  it("userA (org1 member) cannot read org2 notes", async () => {
    const { db, release } = await asUser(fx.userA.id);
    try {
      const rows = await db
        .select({ id: notes.id })
        .from(notes)
        .where(eq(notes.orgId, fx.org2.id));

      expect(rows).toHaveLength(0);
    } finally {
      await release();
    }
  });
});
