// F-0009 — Stored XSS via search snippet (regression guard).
//
// Original claim: `app/(app)/search/page.tsx` rendered `note.snippet` with
// `dangerouslySetInnerHTML` and no sanitization. ts_headline does NOT
// HTML-escape surrounding note content, so raw HTML in a note body would
// execute in any org member's browser that searched for a matching term.
//
// Fix (F-0009): lib/search/actions.ts now sanitizes snippets via
// `sanitizeSnippet` before returning them. The function HTML-escapes the
// full ts_headline output using a .replace chain (&, <, >, ") and then
// substitutes literal <mark>/<mark> tags for the STX/ETX sentinels
// (SNIPPET_MARK_OPEN / SNIPPET_MARK_CLOSE) that were used as StartSel/StopSel
// so they survive the escape chain unchanged.
//
// This file is a REGRESSION guard: every assertion passes when the fix is in
// place and fails if someone reverts it.

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";

const ROOT = path.resolve(__dirname, "../..");

const PAGE_REL = "app/(app)/search/page.tsx";
const ACTION_REL = "lib/search/actions.ts";

describe("F-0009: search snippet XSS fix must remain in place", () => {
  it("lib/search/actions.ts defines a sanitizeSnippet helper that HTML-escapes the output", () => {
    const src = readFileSync(path.join(ROOT, ACTION_REL), "utf8");
    // The function must exist.
    expect(src).toMatch(/function sanitizeSnippet/);
    // It must escape `<` (the critical XSS vector).
    expect(src).toMatch(/\.replace\(\/</);
    // It must escape `&` (otherwise `&amp;` in note content would double-escape).
    expect(src).toMatch(/\.replace\(\/&/);
  });

  it("lib/search/actions.ts uses sentinel-based StartSel/StopSel, not raw <mark> tags", () => {
    const src = readFileSync(path.join(ROOT, ACTION_REL), "utf8");
    // Sentinel constants must be defined.
    expect(src).toMatch(/SNIPPET_MARK_OPEN/);
    expect(src).toMatch(/SNIPPET_MARK_CLOSE/);
    // The raw <mark> tag must NOT appear as the ts_headline StartSel string.
    // If it does, user content can still inject HTML around the mark tags.
    expect(src).not.toMatch(/StartSel=<mark>/);
  });

  it("lib/search/actions.ts passes snippet through sanitizeSnippet before returning", () => {
    const src = readFileSync(path.join(ROOT, ACTION_REL), "utf8");
    expect(src).toMatch(/sanitizeSnippet\(r\.snippet\)/);
  });

  it("search page dangerouslySetInnerHTML usage is annotated as safe (fix in place)", () => {
    const src = readFileSync(path.join(ROOT, PAGE_REL), "utf8");
    // The dangerouslySetInnerHTML may still be used for the highlight markup,
    // but only after sanitization has been applied server-side.
    // The comment asserting it is safe must be present.
    expect(src).toMatch(/dangerouslySetInnerHTML/);
    // The comment noting the snippet is already escaped must exist.
    expect(src).toMatch(/HTML-escaped by sanitizeSnippet|already HTML-escaped/);
  });
});
