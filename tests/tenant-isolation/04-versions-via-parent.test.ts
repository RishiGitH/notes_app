// Case 4: Versions of a cross-org note are invisible via the child SELECT policy.
//
// Setup: userC creates a note and a version in org2.
// Assertion: as userA (org1 member), querying note_versions by note_id
// returns an empty array.
//
// This test verifies the EXISTS-joins-parent pattern on note_versions.
// It fails if the note_versions SELECT policy uses org_id directly on the
// child row (which could be bypassed) instead of joining to notes.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { asUser, asAdmin } from "./helpers/as-user";
import { seedTwoOrgs, truncateAll, type TestFixture } from "./helpers/fixtures";
import { noteVersions } from "@/lib/db/schema";
import { v4 as uuidv4 } from "uuid";

let fx: TestFixture;
let org2NoteId: string;

beforeAll(async () => {
  fx = await seedTwoOrgs();

  const { sql, release } = await asAdmin();
  try {
    org2NoteId = uuidv4();
    const versionId = uuidv4();

    await sql`
      insert into public.notes
        (id, org_id, author_id, visibility, title, created_at, updated_at)
      values
        (${org2NoteId}, ${fx.org2.id}, ${fx.userC.id}, 'org', 'Org2 Note', now(), now())
    `;

    await sql`
      insert into public.note_versions
        (id, note_id, org_id, author_id, title, content, version_number, created_at)
      values
        (${versionId}, ${org2NoteId}, ${fx.org2.id}, ${fx.userC.id},
         'Org2 Title', 'Org2 content', 1, now())
    `;
  } finally {
    await release();
  }
});

afterAll(async () => {
  await truncateAll();
});

describe("note versions access via parent note", () => {
  it("userA cannot read org2 note_versions even by note_id", async () => {
    const { db, release } = await asUser(fx.userA.id);
    try {
      const rows = await db
        .select({ id: noteVersions.id })
        .from(noteVersions)
        .where(eq(noteVersions.noteId, org2NoteId));

      expect(rows).toHaveLength(0);
    } finally {
      await release();
    }
  });
});
