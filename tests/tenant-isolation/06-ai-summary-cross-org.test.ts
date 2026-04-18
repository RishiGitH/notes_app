// Case 6: AI summaries for a cross-org note are invisible, and INSERT is blocked.
//
// Setup: userC creates a note and an ai_summaries row in org2.
// Assertion:
//   (a) as userA, SELECT by note_id returns [].
//   (b) as userA, INSERT into ai_summaries referencing org2's note throws a
//       "violates row-level security policy" error (WITH CHECK fails).

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { asUser, asAdmin } from "./helpers/as-user";
import { seedTwoOrgs, truncateAll, type TestFixture } from "./helpers/fixtures";
import { aiSummaries } from "@/lib/db/schema";
import { v4 as uuidv4 } from "uuid";

let fx: TestFixture;
let org2NoteId: string;

beforeAll(async () => {
  fx = await seedTwoOrgs();

  const { sql, release } = await asAdmin();
  try {
    org2NoteId = uuidv4();
    const summaryId = uuidv4();

    await sql`
      insert into public.notes
        (id, org_id, author_id, visibility, title, created_at, updated_at)
      values
        (${org2NoteId}, ${fx.org2.id}, ${fx.userC.id}, 'org', 'Org2 Note', now(), now())
    `;

    await sql`
      insert into public.ai_summaries
        (id, note_id, org_id, author_id, model, status, created_at, updated_at)
      values
        (${summaryId}, ${org2NoteId}, ${fx.org2.id}, ${fx.userC.id},
         'claude-sonnet-4-6', 'draft', now(), now())
    `;
  } finally {
    await release();
  }
});

afterAll(async () => {
  await truncateAll();
});

describe("ai_summaries cross-org isolation", () => {
  it("userA cannot SELECT ai_summaries for org2 note", async () => {
    const { db, release } = await asUser(fx.userA.id);
    try {
      const rows = await db
        .select({ id: aiSummaries.id })
        .from(aiSummaries)
        .where(eq(aiSummaries.noteId, org2NoteId));

      expect(rows).toHaveLength(0);
    } finally {
      await release();
    }
  });

  it("userA INSERT into ai_summaries for org2 note is blocked by WITH CHECK", async () => {
    const { db, release } = await asUser(fx.userA.id);
    try {
      await expect(
        db.insert(aiSummaries).values({
          id: uuidv4(),
          noteId: org2NoteId,
          orgId: fx.org2.id,
          authorId: fx.userA.id,
          model: "claude-sonnet-4-6",
          status: "draft",
        }),
      ).rejects.toThrow(/row-level security|violates/i);
    } finally {
      await release();
    }
  });
});
