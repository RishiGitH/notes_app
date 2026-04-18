// Case 12: A user with view-only share cannot save (UPDATE) the note.
//
// This test verifies RLS at the SQL layer: the notes UPDATE policy requires
// author_id = auth.uid() OR org admin role OR an edit-level share. A view-only
// share does not satisfy any of those conditions.
//
// We test via direct SQL UPDATE (same approach as test 03) rather than
// calling saveNoteAction, because the Server Action also calls canEditNote
// which is a server-side gate — the RLS itself is the critical invariant.

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

    // Note by userA, visibility private.
    await sql`
      insert into public.notes
        (id, org_id, author_id, visibility, title, created_at, updated_at)
      values
        (${noteId}, ${fx.org1.id}, ${fx.userA.id}, 'private', 'Shared Note', now(), now())
    `;

    // userB has view-only share.
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

describe("note write isolation: view-only share cannot update", () => {
  it("userB with view share cannot update note title via SQL (RLS blocks UPDATE)", async () => {
    const { db, release } = await asUser(fx.userB.id);
    try {
      const result = await db
        .update(notes)
        .set({ title: "Hijacked" })
        .where(eq(notes.id, noteId))
        .returning({ id: notes.id });

      // RLS UPDATE policy requires author OR admin role OR edit share.
      // view share does not satisfy any condition; 0 rows affected.
      expect(result).toHaveLength(0);
    } finally {
      await release();
    }
  });
});
