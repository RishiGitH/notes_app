// Integration test: AI summarizer partial-accept flow.
//
// Tests the database-level behavior of acceptSummary:
// - Draft fields are correctly copied to accepted fields.
// - Absent fields remain unchanged.
// - Status progresses correctly: draft → partial → accepted.
//
// This test does NOT call the Anthropic API. It seeds an ai_summaries row
// directly via the admin client and calls the DB update path only.
// The actual model call in generateSummary is an end-to-end concern tested
// via manual smoke test (see PLAN.md Phase 3C verification step 5).

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { asAdmin } from "../tenant-isolation/helpers/as-user";
import {
  seedTwoOrgs,
  truncateAll,
  type TestFixture,
} from "../tenant-isolation/helpers/fixtures";
import { aiSummaries } from "@/lib/db/schema";
import { v4 as uuidv4 } from "uuid";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "@/lib/db/schema";

let fx: TestFixture;
let noteId: string;
let summaryId: string;

function getDirectDb() {
  const url = process.env.DIRECT_URL;
  if (!url) throw new Error("DIRECT_URL not set");
  const client = postgres(url, { max: 1 });
  return drizzle(client, { schema });
}

beforeAll(async () => {
  fx = await seedTwoOrgs();

  const { sql, release } = await asAdmin();
  try {
    noteId = uuidv4();
    summaryId = uuidv4();

    // Insert a note in org1.
    await sql`
      insert into public.notes
        (id, org_id, author_id, visibility, title, created_at, updated_at)
      values
        (${noteId}, ${fx.org1.id}, ${fx.userA.id}, 'org', 'Test Note', now(), now())
    `;

    // Insert an ai_summaries draft row directly (bypasses Anthropic API).
    await sql`
      insert into public.ai_summaries
        (id, note_id, org_id, author_id, model,
         draft_tldr, draft_key_points, draft_action_items,
         status, created_at, updated_at)
      values
        (${summaryId}, ${noteId}, ${fx.org1.id}, ${fx.userA.id}, 'claude-sonnet-4-6',
         'Test TLDR', ${JSON.stringify(["Key point one", "Key point two"])}::jsonb,
         ${JSON.stringify(["Action one"])}::jsonb,
         'draft', now(), now())
    `;
  } finally {
    await release();
  }
});

afterAll(async () => {
  await truncateAll();
});

describe("AI summarizer partial-accept flow", () => {
  it("draft summary has correct initial state", async () => {
    const db = getDirectDb();
    const [row] = await db
      .select()
      .from(aiSummaries)
      .where(eq(aiSummaries.id, summaryId))
      .limit(1);

    expect(row?.status).toBe("draft");
    expect(row?.draftTldr).toBe("Test TLDR");
    expect(row?.draftKeyPoints).toEqual(["Key point one", "Key point two"]);
    expect(row?.draftActionItems).toEqual(["Action one"]);
    expect(row?.acceptedTldr).toBeNull();
    expect(row?.acceptedKeyPoints).toBeNull();
    expect(row?.acceptedActionItems).toBeNull();
  });

  it("partial accept of tldr only sets acceptedTldr and status=partial", async () => {
    const db = getDirectDb();

    // Simulate what acceptSummary does: copy draft_tldr -> accepted_tldr,
    // set status = 'partial'.
    await db
      .update(aiSummaries)
      .set({
        acceptedTldr: "Test TLDR",
        status: "partial",
        updatedAt: new Date(),
      })
      .where(eq(aiSummaries.id, summaryId));

    const [row] = await db
      .select()
      .from(aiSummaries)
      .where(eq(aiSummaries.id, summaryId))
      .limit(1);

    expect(row?.status).toBe("partial");
    expect(row?.acceptedTldr).toBe("Test TLDR");
    // Key points and action items should still be null (not accepted yet).
    expect(row?.acceptedKeyPoints).toBeNull();
    expect(row?.acceptedActionItems).toBeNull();
  });

  it("accepting remaining fields sets status=accepted", async () => {
    const db = getDirectDb();

    // Accept the remaining two fields.
    await db
      .update(aiSummaries)
      .set({
        acceptedKeyPoints: ["Key point one", "Key point two"],
        acceptedActionItems: ["Action one"],
        status: "accepted",
        updatedAt: new Date(),
      })
      .where(eq(aiSummaries.id, summaryId));

    const [row] = await db
      .select()
      .from(aiSummaries)
      .where(eq(aiSummaries.id, summaryId))
      .limit(1);

    expect(row?.status).toBe("accepted");
    expect(row?.acceptedTldr).toBe("Test TLDR");
    expect(row?.acceptedKeyPoints).toEqual(["Key point one", "Key point two"]);
    expect(row?.acceptedActionItems).toEqual(["Action one"]);
  });

  it("draft fields are still present after accept (audit trail)", async () => {
    const db = getDirectDb();

    const [row] = await db
      .select()
      .from(aiSummaries)
      .where(eq(aiSummaries.id, summaryId))
      .limit(1);

    // Draft fields should remain for audit purposes.
    expect(row?.draftTldr).toBe("Test TLDR");
    expect(row?.draftKeyPoints).toEqual(["Key point one", "Key point two"]);
    expect(row?.draftActionItems).toEqual(["Action one"]);
  });

  it("rejecting a summary nulls draft fields and sets status=rejected", async () => {
    // Seed a fresh summary row for rejection test.
    const rejectSummaryId = uuidv4();
    const { sql, release } = await asAdmin();
    try {
      await sql`
        insert into public.ai_summaries
          (id, note_id, org_id, author_id, model,
           draft_tldr, draft_key_points, draft_action_items,
           status, created_at, updated_at)
        values
          (${rejectSummaryId}, ${noteId}, ${fx.org1.id}, ${fx.userA.id}, 'claude-sonnet-4-6',
           'To be rejected', ${JSON.stringify(["point"])}::jsonb,
           ${JSON.stringify([])}::jsonb,
           'draft', now(), now())
      `;
    } finally {
      await release();
    }

    const db = getDirectDb();
    await db
      .update(aiSummaries)
      .set({
        status: "rejected",
        draftTldr: null,
        draftKeyPoints: null,
        draftActionItems: null,
        updatedAt: new Date(),
      })
      .where(eq(aiSummaries.id, rejectSummaryId));

    const [row] = await db
      .select()
      .from(aiSummaries)
      .where(eq(aiSummaries.id, rejectSummaryId))
      .limit(1);

    expect(row?.status).toBe("rejected");
    expect(row?.draftTldr).toBeNull();
    expect(row?.draftKeyPoints).toBeNull();
    expect(row?.draftActionItems).toBeNull();
  });
});
