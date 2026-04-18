// Case 10: Soft-deleted parent note hides all child rows.
//
// Setup: seed a note with all five child types (note_version, note_share,
// note_tag, file, ai_summary), then set deleted_at = now() on the note.
//
// Assertion: as the author (userA), every child table SELECT by note_id
// returns [].
//
// The child SELECT policies each contain `and n.deleted_at is null` in the
// EXISTS subquery. This test fails if any child policy omits that check.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { asUser, asAdmin } from "./helpers/as-user";
import { seedTwoOrgs, truncateAll, type TestFixture } from "./helpers/fixtures";
import {
  noteVersions,
  noteShares,
  noteTags,
  files,
  aiSummaries,
} from "@/lib/db/schema";
import { v4 as uuidv4 } from "uuid";

let fx: TestFixture;
let noteId: string;

beforeAll(async () => {
  fx = await seedTwoOrgs();

  const { sql, release } = await asAdmin();
  try {
    noteId = uuidv4();
    const versionId = uuidv4();
    const shareId = uuidv4();
    const tagId = uuidv4();
    const fileId = uuidv4();
    const summaryId = uuidv4();

    // Create parent note.
    await sql`
      insert into public.notes
        (id, org_id, author_id, visibility, title, created_at, updated_at)
      values
        (${noteId}, ${fx.org1.id}, ${fx.userA.id}, 'org', 'To Be Deleted', now(), now())
    `;

    // Create one of each child type.
    await sql`
      insert into public.note_versions
        (id, note_id, org_id, author_id, title, content, version_number, created_at)
      values
        (${versionId}, ${noteId}, ${fx.org1.id}, ${fx.userA.id},
         'v1 title', 'v1 content', 1, now())
    `;

    await sql`
      insert into public.note_shares
        (id, note_id, user_id, permission, created_at)
      values
        (${shareId}, ${noteId}, ${fx.userB.id}, 'view', now())
    `;

    await sql`
      insert into public.tags (id, org_id, name, created_at)
      values (${tagId}, ${fx.org1.id}, 'test-tag', now())
      on conflict do nothing
    `;

    await sql`
      insert into public.note_tags (note_id, tag_id, created_at)
      values (${noteId}, ${tagId}, now())
      on conflict do nothing
    `;

    await sql`
      insert into public.files
        (id, org_id, note_id, uploader_id, path, mime, size_bytes, created_at)
      values
        (${fileId}, ${fx.org1.id}, ${noteId}, ${fx.userA.id},
         ${`${fx.org1.id}/${noteId}/${fileId}`}, 'text/plain', 10, now())
    `;

    await sql`
      insert into public.ai_summaries
        (id, note_id, org_id, author_id, model, status, created_at, updated_at)
      values
        (${summaryId}, ${noteId}, ${fx.org1.id}, ${fx.userA.id},
         'claude-sonnet-4-6', 'draft', now(), now())
    `;

    // Soft-delete the parent note.
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

describe("soft-deleted parent hides all children", () => {
  it("note_versions invisible after parent soft-delete", async () => {
    const { db, release } = await asUser(fx.userA.id);
    try {
      const rows = await db
        .select()
        .from(noteVersions)
        .where(eq(noteVersions.noteId, noteId));
      expect(rows).toHaveLength(0);
    } finally {
      await release();
    }
  });

  it("note_shares invisible after parent soft-delete", async () => {
    const { db, release } = await asUser(fx.userA.id);
    try {
      const rows = await db
        .select()
        .from(noteShares)
        .where(eq(noteShares.noteId, noteId));
      expect(rows).toHaveLength(0);
    } finally {
      await release();
    }
  });

  it("note_tags invisible after parent soft-delete", async () => {
    const { db, release } = await asUser(fx.userA.id);
    try {
      const rows = await db
        .select()
        .from(noteTags)
        .where(eq(noteTags.noteId, noteId));
      expect(rows).toHaveLength(0);
    } finally {
      await release();
    }
  });

  it("files invisible after parent soft-delete", async () => {
    const { db, release } = await asUser(fx.userA.id);
    try {
      const rows = await db
        .select()
        .from(files)
        .where(eq(files.noteId, noteId));
      expect(rows).toHaveLength(0);
    } finally {
      await release();
    }
  });

  it("ai_summaries invisible after parent soft-delete", async () => {
    const { db, release } = await asUser(fx.userA.id);
    try {
      const rows = await db
        .select()
        .from(aiSummaries)
        .where(eq(aiSummaries.noteId, noteId));
      expect(rows).toHaveLength(0);
    } finally {
      await release();
    }
  });
});
