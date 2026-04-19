// Zod schemas for Anthropic AI summarizer output (Phase 3C, search-ai).
//
// AGENTS.md section 2 item 6: "All LLM output is validated against a zod schema
// before being stored, before being rendered, and before being passed to any
// tool call. Unparseable output is rejected, not 'best effort' parsed."
//
// summaryOutputSchema: the shape the model MUST return (as JSON in the content
// block). Any deviation causes generateSummary() to reject the response.
//
// The three fields mirror the ai_summaries table columns:
//   draft_tldr          -> tldr
//   draft_key_points    -> key_points
//   draft_action_items  -> action_items

import { z } from "zod";

export const summaryOutputSchema = z.object({
  tldr: z
    .string()
    .min(1, "tldr must not be empty")
    .max(500, "tldr must be at most 500 characters"),
  key_points: z
    .array(
      z
        .string()
        .min(1, "key point must not be empty")
        .max(200, "key point must be at most 200 characters"),
    )
    .min(1, "at least one key point is required")
    .max(8, "at most 8 key points"),
  action_items: z
    .array(
      z
        .string()
        .min(1, "action item must not be empty")
        .max(200, "action item must be at most 200 characters"),
    )
    .max(8, "at most 8 action items"),
});

export type SummaryOutput = z.infer<typeof summaryOutputSchema>;

// acceptSummaryInput: partial — any subset of the three fields may be accepted.
// Absence of a field means "leave unchanged"; the action handles the merge.
export const acceptSummaryInput = z.object({
  tldr: z.boolean().optional(),
  keyPoints: z.boolean().optional(),
  actionItems: z.boolean().optional(),
});

export type AcceptSummaryInput = z.infer<typeof acceptSummaryInput>;
