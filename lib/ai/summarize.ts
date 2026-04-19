"use server";

// AI summarizer Server Actions (Phase 3C, search-ai).
//
// Security invariants enforced here (AGENTS.md section 2):
//   - Item 5: AI calls receive exactly one note's content per request.
//   - Item 6: All LLM output is validated against summaryOutputSchema before
//             it is stored, rendered, or passed anywhere.
//   - Item 11: Logs never contain content, secrets, or raw model output.
//   - Item 8: Access to ai_summaries resolves via the current parent notes row.
//
// Audit events produced (AGENTS.md section 8):
//   ai.summarize.request  — a summary was generated (or rejected due to schema fail)
//   ai.summarize.accept   — fields were accepted (partial or full)
//   ai.summarize.reject   — user explicitly rejected the draft
//
// Node runtime: "use server" files always run on Node; export const runtime
// is not valid in 'use server' modules and has been removed.

import { and, desc, eq, isNull } from "drizzle-orm";
import { headers } from "next/headers";
import { getDb } from "@/lib/db/client";
import { aiSummaries, notes, noteVersions } from "@/lib/db/schema";
import { requireUser, getAdminSupabase, getServerSupabase } from "@/lib/auth/server";
import { requireOrgAccess, canEditNote } from "@/lib/security/permissions";
import { logAudit } from "@/lib/logging/audit";
import { withContext } from "@/lib/logging/request-context";
import { createDoChatCompletion, getModelId } from "@/lib/ai/client";
import {
  summaryOutputSchema,
  acceptSummaryInput,
  type AcceptSummaryInput,
} from "@/lib/ai/schemas";
import { AiOutputInvalidError } from "@/lib/ai/errors";

// Helper: read request-id and org-id from headers minted by middleware.
async function buildContext(userId: string, orgId?: string) {
  const h = await headers();
  return {
    requestId: h.get("x-request-id") ?? "unknown",
    orgId: orgId ?? h.get("x-org-id") ?? null,
    userId,
  };
}

// generateSummary: call the configured inference API with exactly one note's content
// and persist the validated draft into ai_summaries.
//
// Returns the new ai_summaries row id.
export async function generateSummary(noteId: string): Promise<string> {
  const user = await requireUser();
  const db = getDb();

  // Fetch the note to get the org_id before requireOrgAccess.
  const [note] = await db
    .select({
      id: notes.id,
      orgId: notes.orgId,
      authorId: notes.authorId,
      currentVersionId: notes.currentVersionId,
      deletedAt: notes.deletedAt,
    })
    .from(notes)
    .where(and(eq(notes.id, noteId), isNull(notes.deletedAt)))
    .limit(1);

  if (!note) throw new Error("Note not found");

  const ctx = await buildContext(user.id, note.orgId);

  return withContext(ctx, async () => {
    await requireOrgAccess(note.orgId, "member");

    // Verify the user can read the note using the user-scoped client.
    // RLS enforces visibility (private/org/public_in_org) and share grants —
    // the same pattern as getNoteAction (lib/notes/actions.ts).
    // (AGENTS.md section 2 item 8: access resolves via current parent notes row)
    const supabase = await getServerSupabase();
    if (!supabase) throw new Error("Service unavailable");

    const { data: noteAccess } = await supabase
      .from("notes")
      .select("id, current_version_id")
      .eq("id", noteId)
      .is("deleted_at", null)
      .maybeSingle();

    if (!noteAccess) throw new Error("Note not found");

    // Fetch exactly one note's current version. (AGENTS.md item 5)
    const currentVersionId = noteAccess.current_version_id as string | null;
    if (!currentVersionId) throw new Error("Note has no content yet");

    const [version] = await db
      .select({ title: noteVersions.title, content: noteVersions.content })
      .from(noteVersions)
      .where(eq(noteVersions.id, currentVersionId))
      .limit(1);

    if (!version) throw new Error("Note version not found");

    // Cap content length before sending to the model provider.
    // Without a cap, a user can save an arbitrarily large note and trigger
    // unbounded token charges per generateSummary call (cost amplification).
    // 20 000 chars ≈ 5 000 tokens — plenty for a meaningful summary and well
    // within claude-sonnet context, while bounding per-call cost.
    // The cap is applied BEFORE the API call so the check is synchronous and
    // testable without a live Anthropic connection.
    const CONTENT_CHAR_LIMIT = 20_000;
    const rawContent = version.content ?? "";
    if (rawContent.length > CONTENT_CHAR_LIMIT) {
      throw new Error(
        `Note content exceeds the ${CONTENT_CHAR_LIMIT.toLocaleString()}-character limit for AI summarization. Shorten the note before generating a summary.`,
      );
    }

    const model = getModelId();

    const systemPrompt = `You are a note summarizer. Given a note's title and content, produce a structured JSON summary with these exact fields:
{
  "tldr": "<one-paragraph summary, max 500 chars>",
  "key_points": ["<point>", ...],  // 1–8 items, each max 200 chars
  "action_items": ["<action>", ...]  // 0–8 items, each max 200 chars
}
Return ONLY the JSON object. No markdown fences. No explanation.`;

    // Wrap user-supplied content in unambiguous delimiters so an adversarial
    // note cannot break out of the content role and override the system prompt.
    // The closing tag is on a separate line so injected text cannot reach it
    // by appending to the last line of the note body.
    const userMessage = `Title: ${version.title}\n\n<note_content>\n${rawContent}\n</note_content>`;

    const rawText = await createDoChatCompletion({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
      maxTokens: 1024,
      temperature: 0,
    });

    // Parse and validate. (AGENTS.md item 6)
    let parsed: ReturnType<typeof summaryOutputSchema.safeParse>;
    try {
      const json: unknown = JSON.parse(rawText);
      parsed = summaryOutputSchema.safeParse(json);
    } catch {
      await logAudit({
        action: "ai.summarize.request",
        resourceType: "ai_summaries",
        metadata: { model, noteId, error: "json_parse_failed" },
      });
      throw new AiOutputInvalidError("response was not valid JSON");
    }

    if (!parsed.success) {
      await logAudit({
        action: "ai.summarize.request",
        resourceType: "ai_summaries",
        metadata: { model, noteId, error: "schema_validation_failed" },
      });
      throw new AiOutputInvalidError(parsed.error.message);
    }

    const data = parsed.data;

    // Insert the draft summary row.
    const [inserted] = await db
      .insert(aiSummaries)
      .values({
        noteId,
        orgId: note.orgId,
        authorId: user.id,
        model,
        draftTldr: data.tldr,
        draftKeyPoints: data.key_points,
        draftActionItems: data.action_items,
        status: "draft",
      })
      .returning({ id: aiSummaries.id });

    if (!inserted) throw new Error("Failed to insert summary");

    await logAudit({
      action: "ai.summarize.request",
      resourceType: "ai_summaries",
      resourceId: inserted.id,
      metadata: { model, noteId },
      // No prompt, no raw output per AGENTS.md section 11.
    });

    return inserted.id;
  });
}

// acceptSummary: copy selected draft fields to accepted fields.
// Partial accept: pass { tldr: true } to accept only the TLDR, leaving
// key_points and action_items unchanged.
export async function acceptSummary(
  summaryId: string,
  input: AcceptSummaryInput,
): Promise<void> {
  const parsed = acceptSummaryInput.safeParse(input);
  if (!parsed.success) throw new Error("Invalid input");

  const user = await requireUser();
  const db = getDb();

  // Fetch the summary row via admin to get the note_id for auth.
  const admin = getAdminSupabase();
  const { data: summary } = await admin
    .from("ai_summaries")
    .select("id, note_id, org_id, draft_tldr, draft_key_points, draft_action_items, accepted_tldr, accepted_key_points, accepted_action_items")
    .eq("id", summaryId)
    .maybeSingle();

  if (!summary) throw new Error("Summary not found");

  const ctx = await buildContext(user.id, summary.org_id);

  await withContext(ctx, async () => {
    await requireOrgAccess(summary.org_id, "member");

    const canEdit = await canEditNote(summary.note_id, user.id);
    if (!canEdit) throw new Error("Forbidden");

    const { tldr, keyPoints, actionItems } = parsed.data;
    const acceptedFields: string[] = [];

    if (tldr) acceptedFields.push("tldr");
    if (keyPoints) acceptedFields.push("keyPoints");
    if (actionItems) acceptedFields.push("actionItems");

    // Determine status: all three accepted = 'accepted', subset = 'partial'.
    const allThreeAccepted =
      (tldr || summary.accepted_tldr !== null) &&
      (keyPoints || summary.accepted_key_points !== null) &&
      (actionItems || summary.accepted_action_items !== null);

    const newStatus = allThreeAccepted ? "accepted" : "partial";

    await db
      .update(aiSummaries)
      .set({
        ...(tldr ? { acceptedTldr: summary.draft_tldr } : {}),
        ...(keyPoints ? { acceptedKeyPoints: summary.draft_key_points as string[] } : {}),
        ...(actionItems ? { acceptedActionItems: summary.draft_action_items as string[] } : {}),
        status: newStatus,
        updatedAt: new Date(),
      })
      .where(eq(aiSummaries.id, summaryId));

    await logAudit({
      action: "ai.summarize.accept",
      resourceType: "ai_summaries",
      resourceId: summaryId,
      metadata: { fields: acceptedFields, noteId: summary.note_id },
    });
  });
}

// rejectSummary: mark the draft as rejected and null out draft fields.
export async function rejectSummary(summaryId: string): Promise<void> {
  const user = await requireUser();

  const admin = getAdminSupabase();
  const { data: summary } = await admin
    .from("ai_summaries")
    .select("id, note_id, org_id")
    .eq("id", summaryId)
    .maybeSingle();

  if (!summary) throw new Error("Summary not found");

  const ctx = await buildContext(user.id, summary.org_id);

  await withContext(ctx, async () => {
    await requireOrgAccess(summary.org_id, "member");

    const canEdit = await canEditNote(summary.note_id, user.id);
    if (!canEdit) throw new Error("Forbidden");

    const db = getDb();
    await db
      .update(aiSummaries)
      .set({
        status: "rejected",
        draftTldr: null,
        draftKeyPoints: null,
        draftActionItems: null,
        updatedAt: new Date(),
      })
      .where(eq(aiSummaries.id, summaryId));

    await logAudit({
      action: "ai.summarize.reject",
      resourceType: "ai_summaries",
      resourceId: summaryId,
      metadata: { noteId: summary.note_id },
    });
  });
}

// getLatestSummary: fetch the most recent summary for a note (for the UI).
export async function getLatestSummary(noteId: string) {
  const user = await requireUser();
  const db = getDb();

  const [note] = await db
    .select({ orgId: notes.orgId, deletedAt: notes.deletedAt })
    .from(notes)
    .where(and(eq(notes.id, noteId), isNull(notes.deletedAt)))
    .limit(1);

  if (!note) return null;

  const ctx = await buildContext(user.id, note.orgId);

  return withContext(ctx, async () => {
    await requireOrgAccess(note.orgId, "viewer");

    const [summary] = await db
      .select()
      .from(aiSummaries)
      .where(eq(aiSummaries.noteId, noteId))
      .orderBy(desc(aiSummaries.createdAt))
      .limit(1);

    return summary ?? null;
  });
}
