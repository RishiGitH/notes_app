// Case 5: Files belonging to a cross-org note are invisible.
//
// Setup: userC creates a note and a files row in org2.
// Assertion: as userA (org1 member), querying files by org_id=org2 returns [].
//
// Note: signed-URL path-level isolation is a Phase 3C concern (Supabase
// Storage bucket RLS). This test covers the SQL row visibility only, which
// is Phase 1's gate.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { asUser, asAdmin } from "./helpers/as-user";
import { seedTwoOrgs, truncateAll, type TestFixture } from "./helpers/fixtures";
import { files } from "@/lib/db/schema";
import { v4 as uuidv4 } from "uuid";

let fx: TestFixture;

beforeAll(async () => {
  fx = await seedTwoOrgs();

  const { sql, release } = await asAdmin();
  try {
    const noteId = uuidv4();
    const fileId = uuidv4();

    await sql`
      insert into public.notes
        (id, org_id, author_id, visibility, title, created_at, updated_at)
      values
        (${noteId}, ${fx.org2.id}, ${fx.userC.id}, 'org', 'Org2 Note', now(), now())
    `;

    await sql`
      insert into public.files
        (id, org_id, note_id, uploader_id, path, mime, size_bytes, created_at)
      values
        (${fileId}, ${fx.org2.id}, ${noteId}, ${fx.userC.id},
         ${`${fx.org2.id}/${noteId}/${fileId}`}, 'text/plain', 42, now())
    `;
  } finally {
    await release();
  }
});

afterAll(async () => {
  await truncateAll();
});

describe("files cross-org isolation", () => {
  it("userA cannot read files belonging to org2", async () => {
    const { db, release } = await asUser(fx.userA.id);
    try {
      const rows = await db
        .select({ id: files.id })
        .from(files)
        .where(eq(files.orgId, fx.org2.id));

      expect(rows).toHaveLength(0);
    } finally {
      await release();
    }
  });
});
