// Case 13: Non-author, non-admin cannot insert a note_share.
//
// note_shares INSERT policy: author or org admin can create shares.
// A regular member who is neither the author nor an admin of the org
// cannot grant shares on someone else's note.
//
// Verifies: note_shares INSERT WITH CHECK — exists(notes n where
// n.author_id = auth.uid() OR org_role in ('owner','admin')).

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { asUser, asAdmin } from "./helpers/as-user";
import { seedTwoOrgs, truncateAll, type TestFixture } from "./helpers/fixtures";
import { noteShares } from "@/lib/db/schema";
import { v4 as uuidv4 } from "uuid";

let fx: TestFixture;
let noteId: string;

beforeAll(async () => {
  fx = await seedTwoOrgs();

  const { sql, release } = await asAdmin();
  try {
    noteId = uuidv4();

    // Note authored by userA (owner of org1), visibility org.
    await sql`
      insert into public.notes
        (id, org_id, author_id, visibility, title, created_at, updated_at)
      values
        (${noteId}, ${fx.org1.id}, ${fx.userA.id}, 'org', 'Org Note', now(), now())
    `;
  } finally {
    await release();
  }
});

afterAll(async () => {
  await truncateAll();
});

describe("share grant isolation: non-author non-admin cannot grant shares", () => {
  it("userB (member, not author, not admin) cannot insert a note_share", async () => {
    const { db, release } = await asUser(fx.userB.id);
    try {
      await expect(
        db.insert(noteShares).values({
          id: uuidv4(),
          noteId,
          userId: fx.userC.id, // trying to share with userC
          permission: "view",
        }),
      ).rejects.toThrow(/row-level security|violates/i);
    } finally {
      await release();
    }
  });
});
