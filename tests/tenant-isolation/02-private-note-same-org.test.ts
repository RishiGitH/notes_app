// Case 2: A private note in the same org is hidden from non-author non-share members.
//
// Setup: userA creates a private note in org1.
// Assertion: as userB (member of org1, not the author, no share grant),
// the note is invisible.
//
// This test fails if the SELECT policy allows visibility='private' notes to
// be visible to any org member, rather than author-only.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { asUser, asAdmin } from "./helpers/as-user";
import { seedTwoOrgs, truncateAll, type TestFixture } from "./helpers/fixtures";
import { notes } from "@/lib/db/schema";
import { v4 as uuidv4 } from "uuid";

let fx: TestFixture;
let privateNoteId: string;

beforeAll(async () => {
  fx = await seedTwoOrgs();

  const { sql, release } = await asAdmin();
  try {
    privateNoteId = uuidv4();
    await sql`
      insert into public.notes
        (id, org_id, author_id, visibility, title, created_at, updated_at)
      values
        (${privateNoteId}, ${fx.org1.id}, ${fx.userA.id}, 'private', 'Private Note', now(), now())
    `;
  } finally {
    await release();
  }
});

afterAll(async () => {
  await truncateAll();
});

describe("private note hidden from same-org non-author", () => {
  it("userB cannot read userA private note (no share grant)", async () => {
    const { db, release } = await asUser(fx.userB.id);
    try {
      const rows = await db
        .select({ id: notes.id })
        .from(notes)
        .where(eq(notes.id, privateNoteId));

      expect(rows).toHaveLength(0);
    } finally {
      await release();
    }
  });
});
