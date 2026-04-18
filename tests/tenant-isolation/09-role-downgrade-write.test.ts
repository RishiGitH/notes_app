// Case 9: Role downgrade revokes write access immediately on the next request.
//
// Setup:
//   1. userA starts as 'admin' of org1 (we update the seeded owner row to
//      admin so that the downgrade-to-viewer is a clean two-step).
//      Actually: userA is seeded as 'owner'. We add a second note authored by
//      userB (visibility='org') and verify userA (as owner) can UPDATE it.
//   2. Then we downgrade userA to 'viewer' via the admin connection.
//   3. userA attempts a second UPDATE and it must affect 0 rows.
//
// The policy calls public.org_role() per statement, so the downgrade is
// immediately visible — there is no cached role state.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { asUser, asAdmin } from "./helpers/as-user";
import { seedTwoOrgs, truncateAll, type TestFixture } from "./helpers/fixtures";
import { notes, memberships } from "@/lib/db/schema";
import { v4 as uuidv4 } from "uuid";

let fx: TestFixture;
let targetNoteId: string;

beforeAll(async () => {
  fx = await seedTwoOrgs();

  const { sql, release } = await asAdmin();
  try {
    // A note authored by userB (visibility='org') that any org1 admin can edit.
    targetNoteId = uuidv4();
    await sql`
      insert into public.notes
        (id, org_id, author_id, visibility, title, created_at, updated_at)
      values
        (${targetNoteId}, ${fx.org1.id}, ${fx.userB.id}, 'org', 'Org Note', now(), now())
    `;
  } finally {
    await release();
  }
});

afterAll(async () => {
  await truncateAll();
});

describe("role downgrade revokes write access immediately", () => {
  it("userA as owner can update an org-visible note", async () => {
    const { db, release } = await asUser(fx.userA.id);
    try {
      const result = await db
        .update(notes)
        .set({ title: "Updated by Owner" })
        .where(eq(notes.id, targetNoteId))
        .returning({ id: notes.id });

      expect(result.length).toBeGreaterThan(0);
    } finally {
      await release();
    }
  });

  it("after downgrade to viewer, userA update affects 0 rows", async () => {
    // Downgrade via admin connection (bypasses RLS).
    const { sql, release: releaseAdmin } = await asAdmin();
    try {
      await sql`
        update public.memberships
        set role = 'viewer', updated_at = now()
        where user_id = ${fx.userA.id}
          and org_id = ${fx.org1.id}
      `;
    } finally {
      await releaseAdmin();
    }

    // New connection for userA — fresh set_config call, fresh role evaluation.
    const { db, release } = await asUser(fx.userA.id);
    try {
      const result = await db
        .update(notes)
        .set({ title: "Should Not Happen" })
        .where(eq(notes.id, targetNoteId))
        .returning({ id: notes.id });

      expect(result).toHaveLength(0);
    } finally {
      await release();
    }
  });
});
