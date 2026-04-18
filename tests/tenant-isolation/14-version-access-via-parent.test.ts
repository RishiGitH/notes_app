// Case 14: Soft-deleted note hides version reads via the parent join.
//
// The note_versions SELECT policy EXISTS-joins to the parent notes row
// and checks n.deleted_at IS NULL. Soft-deleting the parent must make
// all version rows invisible, even to the original author.
//
// This test is a targeted version of test 10 specifically for the
// note_versions table and the access path used by getVersionAction.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { asUser, asAdmin } from "./helpers/as-user";
import { seedTwoOrgs, truncateAll, type TestFixture } from "./helpers/fixtures";
import { noteVersions } from "@/lib/db/schema";
import { v4 as uuidv4 } from "uuid";

let fx: TestFixture;
let noteId: string;
let versionId: string;

beforeAll(async () => {
  fx = await seedTwoOrgs();

  const { sql, release } = await asAdmin();
  try {
    noteId = uuidv4();
    versionId = uuidv4();

    await sql`
      insert into public.notes
        (id, org_id, author_id, visibility, title, created_at, updated_at)
      values
        (${noteId}, ${fx.org1.id}, ${fx.userA.id}, 'org', 'To Delete', now(), now())
    `;

    await sql`
      insert into public.note_versions
        (id, note_id, org_id, author_id, title, content, version_number, created_at)
      values
        (${versionId}, ${noteId}, ${fx.org1.id}, ${fx.userA.id},
         'v1', 'content v1', 1, now())
    `;

    await sql`
      update public.notes set current_version_id = ${versionId} where id = ${noteId}
    `;

    // Soft-delete the parent.
    await sql`
      update public.notes set deleted_at = now() where id = ${noteId}
    `;
  } finally {
    await release();
  }
});

afterAll(async () => {
  await truncateAll();
});

describe("version access via soft-deleted parent", () => {
  it("author cannot read note_versions after parent soft-delete", async () => {
    const { db, release } = await asUser(fx.userA.id);
    try {
      const rows = await db
        .select({ id: noteVersions.id })
        .from(noteVersions)
        .where(eq(noteVersions.noteId, noteId));

      expect(rows).toHaveLength(0);
    } finally {
      await release();
    }
  });

  it("org member cannot read note_versions after parent soft-delete", async () => {
    const { db, release } = await asUser(fx.userB.id);
    try {
      const rows = await db
        .select({ id: noteVersions.id })
        .from(noteVersions)
        .where(eq(noteVersions.noteId, noteId));

      expect(rows).toHaveLength(0);
    } finally {
      await release();
    }
  });
});
