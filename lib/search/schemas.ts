// Zod schemas for the searchNotes Server Action.

import { z } from "zod";

export const searchNotesInput = z.object({
  query: z
    .string()
    .min(1, "Query must not be empty")
    .max(500, "Query must be at most 500 characters")
    .trim(),
  limit: z.number().int().min(1).max(50).default(50),
  offset: z.number().int().min(0).default(0),
});

export type SearchNotesInput = z.infer<typeof searchNotesInput>;

export const searchNoteResult = z.object({
  id: z.string().uuid(),
  title: z.string(),
  titleHighlight: z.string().nullable(),
  snippet: z.string().nullable(),
  orgId: z.string().uuid(),
  updatedAt: z.date(),
  tags: z.array(z.object({ name: z.string(), matched: z.boolean() })),
});

export type SearchNoteResult = z.infer<typeof searchNoteResult>;

export interface SearchNotesResponse {
  results: SearchNoteResult[];
  total: number;
  limit: number;
  offset: number;
}
