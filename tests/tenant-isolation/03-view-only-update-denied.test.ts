// Case 3: A view-only share recipient cannot UPDATE the note.
//
// Setup: userA owns a private note; userB has a view-only share.
// Assertion: as userB, an UPDATE on the note's title affects 0 rows.
//
// Postgres RLS silently filters UPDATE targets: if the USING clause
// does not match, the row is invisible to the UPDATE and 0 rows are
// affected (no error). This test distinguishes that from an error —
// 0 rows is the correct observable behavior.
//
// This test fails if the UPDATE policy grants write to any share
// recipient regardless of permission level.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { asUser, asAdmin } from "./helpers/as-user";
import { seedTwoOrgs, truncateAll, type TestFixture } from "./helpers/fixtures";
import { notes } from "@/lib/db/schema";
import { v4 as uuidv4 } from "uuid";

let fx: TestFixture;
let noteId: string;

beforeAll(async () => {
  fx = await seedTwoOrgs();

  const { sql, release } = await asAdmin();
  try {
    noteId = uuidv4();
    const shareId = uuidv4();

    await sql`
      insert into public.notes
        (id, org_id, author_id, visibility, title, created_at, updated_at)
      values
        (${noteId}, ${fx.org1.id}, ${fx.userA.id}, 'private', 'Shared Private Note', now(), now())
    `;

    // Grant view-only share to userB.
    await sql`
      insert into public.note_shares (id, note_id, user_id, permission, created_at)
      values (${shareId}, ${noteId}, ${fx.userB.id}, 'view', now())
    `;
  } finally {
    await release();
  }
});

afterAll(async () => {
  await truncateAll();
});

describe("view-only share cannot update note", () => {
  it("userB (view share) update title affects 0 rows", async () => {
    const { db, release } = await asUser(fx.userB.id);
    try {
      const result = await db
        .update(notes)
        .set({ title: "Hacked" })
        .where(eq(notes.id, noteId))
        .returning({ id: notes.id });

      // RLS silently filters the row; .returning() yields [] when 0 rows matched.
      expect(result).toHaveLength(0);
    } finally {
      await release();
    }
  });
});
