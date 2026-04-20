"use server";

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
// Node runtime: "use server" files always run on Node; export const runtime
// is not valid in 'use server' modules and has been removed.

import { and, eq, isNull, sql } from "drizzle-orm";
import { headers } from "next/headers";
import { getDb } from "@/lib/db/client";
import { notes, noteVersions } from "@/lib/db/schema";
import { requireUser } from "@/lib/auth/server";
import { requireOrgAccess } from "@/lib/security/permissions";
import { logAudit } from "@/lib/logging/audit";
import { withContext } from "@/lib/logging/request-context";
import { searchNotesInput, type SearchNoteResult } from "@/lib/search/schemas";

// Sentinel values used as ts_headline StartSel/StopSel. They use ASCII control
// characters (STX/ETX, codepoints 2 and 3) that valid Unicode text input will
// never contain after standard input validation and DB storage. Using these
// sentinels allows us to HTML-escape the entire ts_headline output safely and
// then substitute real <mark> tags without risk of re-interpreting user content.
const SNIPPET_MARK_OPEN = "\x02MARK\x03";
const SNIPPET_MARK_CLOSE = "\x02/MARK\x03";

// sanitizeSnippet: HTML-escape all user-authored content in the snippet, then
// restore the literal <mark>/<mark> tags that surround matched lexemes.
// This is the fix for F-0009 (stored XSS via ts_headline output).
function sanitizeSnippet(raw: string): string {
  const escaped = raw
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
  // The sentinels are not HTML-special so they survive the escape chain
  // unchanged, allowing us to substitute real mark tags now.
  return escaped
    .replace(new RegExp(SNIPPET_MARK_OPEN, "g"), "<mark>")
    .replace(new RegExp(SNIPPET_MARK_CLOSE, "g"), "</mark>");
}

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
    //
    // XSS prevention (F-0009): ts_headline does NOT HTML-escape the surrounding
    // document text — only the StartSel/StopSel delimiters are inserted verbatim.
    // We use unique non-HTML sentinels (\x02MARK\x03 / \x02/MARK\x03) that
    // cannot collide with any printable user content, then HTML-escape the full
    // output with a chain of regexp replacements, and finally substitute real
    // <mark>/</mark> tags. The sentinels are ASCII control characters (STX/ETX)
    // which Postgres will faithfully return but user-authored note content will
    // never contain (input is validated and stored as Unicode text without these
    // codepoints). This is the canonical safe pattern for ts_headline + HTML.
    // buildTsQuery: converts user input to a tsquery that supports prefix
    // matching on the last token (so "wo" matches "works", "wor" matches
    // "word", etc.). Strategy:
    //   1. Split on whitespace to get tokens.
    //   2. Escape each token with plainto_tsquery to strip special chars.
    //   3. Append :* to the last token for prefix matching.
    //   4. AND all tokens together.
    // This keeps the safety of plainto_tsquery (no injection via operators)
    // while adding prefix support on the final token.
    // Tags (weight C) use 'simple' dictionary; we query with 'english' which
    // also matches simple lexemes because simple just lowercases — the C-weight
    // lexemes are stored as lowercase tokens and 'english' stemmer will find them.
    function buildPrefixTsQuery(rawQuery: string): ReturnType<typeof sql> {
      const tokens = rawQuery.trim().split(/\s+/).filter(Boolean);
      if (tokens.length === 0) return sql`plainto_tsquery('english', ${rawQuery})`;

      if (tokens.length === 1) {
        // Single token — safe to use prefix directly.
        // to_tsquery requires we sanitize the token first; we strip anything
        // that isn't alphanumeric, hyphen, or apostrophe.
        const safe = tokens[0]!.replace(/[^a-zA-Z0-9\-']/g, "");
        if (!safe) return sql`plainto_tsquery('english', ${rawQuery})`;
        return sql`to_tsquery('english', ${safe + ":*"})`;
      }

      // Multi-token: treat all but the last as complete words (plainto_tsquery
      // is safe for those), and the last as a prefix.
      const lastToken = tokens[tokens.length - 1]!;
      const safeLastToken = lastToken.replace(/[^a-zA-Z0-9\-']/g, "");
      const prefixExpr = safeLastToken ? safeLastToken + ":*" : null;
      const priorTokens = tokens.slice(0, -1).join(" ");

      if (!prefixExpr) {
        // Last token stripped to nothing — just use plainto for everything.
        return sql`plainto_tsquery('english', ${rawQuery})`;
      }

      return sql`(
        plainto_tsquery('english', ${priorTokens}) &&
        to_tsquery('english', ${prefixExpr})
      )`;
    }

    const tsQuery = buildPrefixTsQuery(query);
    const snippetOptions = `MaxWords=30, MinWords=10, StartSel=${SNIPPET_MARK_OPEN}, StopSel=${SNIPPET_MARK_CLOSE}`;

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
            ${snippetOptions}
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
      snippet: r.snippet ? sanitizeSnippet(r.snippet) : r.snippet,
      orgId: r.orgId,
      updatedAt: r.updatedAt,
    }));
  });
}
