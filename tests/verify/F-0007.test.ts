// F-0007 — org_id cookie missing `secure: true` in production.
//
// Policy invariant: every cookieStore.set("org_id", ...) call in the
// codebase must pass a `secure` option. Omitting it means the browser
// will send the cookie over plain HTTP, enabling cookie-stuffing /
// session-fixation attacks against the active-org selector in
// production (MITM on HTTP would steal/overwrite org_id).
//
// This test is deliberately a source-level check. Server Actions with
// `"use server"` and Next's `next/headers` cookies() API are not
// practically mockable in Vitest without a full Next runtime; the
// invariant we care about ("the option is there") is purely syntactic
// and is cleanly expressed as a static assertion against the source.

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";

const ROOT = path.resolve(__dirname, "../..");

// Sites where the org_id cookie is written. Add new call sites here as
// they are introduced; the security invariant applies to all of them.
const SITES = [
  "lib/org/actions.ts",
  "app/(app)/layout.tsx",
];

// Walk a source string, locate every `cookieStore.set("org_id", ...)`
// invocation, and return the full call argument list (from the opening
// paren of .set( through the matching closing paren). This lets us
// inspect the options object per call independently.
function extractOrgIdSetCalls(src: string): string[] {
  const results: string[] = [];
  const needle = 'cookieStore.set("org_id"';
  let idx = 0;
  while (true) {
    const found = src.indexOf(needle, idx);
    if (found === -1) break;
    // Find the opening paren of .set(
    const openParen = src.indexOf("(", found);
    if (openParen === -1) break;
    // Walk forward tracking paren depth + string state to find the
    // matching close paren.
    let depth = 1;
    let i = openParen + 1;
    let inString: '"' | "'" | "`" | null = null;
    let escape = false;
    for (; i < src.length; i++) {
      const ch = src[i];
      if (escape) {
        escape = false;
        continue;
      }
      if (inString) {
        if (ch === "\\") {
          escape = true;
          continue;
        }
        if (ch === inString) {
          inString = null;
        }
        continue;
      }
      if (ch === '"' || ch === "'" || ch === "`") {
        inString = ch;
        continue;
      }
      if (ch === "(") depth++;
      else if (ch === ")") {
        depth--;
        if (depth === 0) break;
      }
    }
    results.push(src.slice(openParen, i + 1));
    idx = i + 1;
  }
  return results;
}

describe("F-0007: org_id cookie must set `secure` flag", () => {
  for (const rel of SITES) {
    it(`every cookieStore.set("org_id", ...) in ${rel} passes \`secure\``, () => {
      const abs = path.join(ROOT, rel);
      const src = readFileSync(abs, "utf8");
      const calls = extractOrgIdSetCalls(src);
      expect(
        calls.length,
        `expected at least one cookieStore.set("org_id", ...) in ${rel}`,
      ).toBeGreaterThan(0);

      for (const call of calls) {
        // Accept either a literal `secure: true` or the standard
        // production-gated form. Reject calls with no `secure:` key.
        expect(
          call,
          `cookieStore.set("org_id", ...) in ${rel} is missing the \`secure\` option:\n${call}`,
        ).toMatch(/\bsecure\s*:/);
      }
    });
  }
});
