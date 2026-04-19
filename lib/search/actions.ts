// FTS search Server Action (Phase 3C, search-ai).
//
// AGENTS.md section 2 item 10: "Search queries scope by org_id in SQL in
// addition to RLS. Defense in depth. Parameterized only — no sql.raw with
// user input."
//
// Flow:
//   1. requireUser() + read current org from x-org-id header.
//   2. Validate input with searchNotesInput schema.
//   3. requireOrgAccess(orgId, 'viewer') — server-side auth before any DB work.
//   4. Query notes using plainto_tsquery with explicit eq(notes.orgId, orgId)
//      AND RLS (both are required per the defense-in-depth principle).
//   5. Log search.query to audit_logs (hit count only — no query text, which
//      may contain PII). (AGENTS.md section 11)
//
// Audit event: search.query

"use server";

export const runtime = "nodejs";

import { and, eq, isNull, sql } from "drizzle-orm";
import { headers } from "next/headers";
import { getDb } from "@/lib/db/client";
import { notes, noteVersions } from "@/lib/db/schema";
import { requireUser } from "@/lib/auth/server";
import { requireOrgAccess } from "@/lib/security/permissions";
import { logAudit } from "@/lib/logging/audit";
import { withContext } from "@/lib/logging/request-context";
import { searchNotesInput, type SearchNoteResult } from "@/lib/search/schemas";

export async function searchNotes(
  rawInput: unknown,
): Promise<SearchNoteResult[]> {
  const user = await requireUser();

  const parsed = searchNotesInput.safeParse(rawInput);
  if (!parsed.success) throw new Error("Invalid search input");

  const { query, limit, offset } = parsed.data;

  // Read current org from the header that middleware sets from the cookie.
  const h = await headers();
  const orgId = h.get("x-org-id");
  if (!orgId) throw new Error("No org selected");

  const ctx = {
    requestId: h.get("x-request-id") ?? "unknown",
    orgId,
    userId: user.id,
  };

  return withContext(ctx, async () => {
    await requireOrgAccess(orgId, "viewer");

    const db = getDb();

    // ts_headline generates a snippet with matched terms highlighted.
    // plainto_tsquery is safe against user input (no special operators).
    // Both the explicit org_id filter AND RLS are applied — defense in depth.
    //
    // We join to note_versions to get the content for snippets; the join
    // condition is current_version_id so we always hit the current version.
    const tsQuery = sql`plainto_tsquery('english', ${query})`;

    const rows = await db
      .select({
        id: notes.id,
        title: notes.title,
        orgId: notes.orgId,
        updatedAt: notes.updatedAt,
        snippet: sql<string | null>`
          ts_headline(
            'english',
            coalesce(${noteVersions.content}, ''),
            ${tsQuery},
            'MaxWords=30, MinWords=10, StartSel=<mark>, StopSel=</mark>'
          )
        `,
      })
      .from(notes)
      .leftJoin(
        noteVersions,
        eq(noteVersions.id, notes.currentVersionId),
      )
      .where(
        and(
          eq(notes.orgId, orgId),           // <-- defense in depth (AGENTS.md item 10)
          isNull(notes.deletedAt),
          sql`${notes.searchTsv} @@ ${tsQuery}`,
        ),
      )
      .orderBy(sql`ts_rank(${notes.searchTsv}, ${tsQuery}) desc`)
      .limit(limit)
      .offset(offset);

    await logAudit({
      action: "search.query",
      resourceType: "notes",
      metadata: {
        hitCount: rows.length,
        // No query text — may contain PII. (AGENTS.md section 11)
      },
    });

    return rows.map((r) => ({
      id: r.id,
      title: r.title,
      snippet: r.snippet,
      orgId: r.orgId,
      updatedAt: r.updatedAt,
    }));
  });
}
