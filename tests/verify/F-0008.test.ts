// F-0008 — Missing audit events on createOrgAction failure branches.
//
// Policy (AGENTS.md section 8): every privileged mutation must emit an
// audit event on BOTH success and every failure branch so that the
// audit log is a faithful forensic record. `createOrgAction` in
// lib/org/actions.ts currently has three privileged-failure branches
// that return an error string to the caller without calling
// `logAudit`:
//
//   1. Slug collision        (existing row found)   -> "Slug is already taken"
//   2. Org-insert DB error   (orgError || !org)     -> orgError.message
//   3. Membership-insert err (memberError)          -> memberError.message
//
// Compare with `addMemberAction` in the same file, which correctly
// emits `member.add.failed` on each of its failure branches.
//
// This test is a source-level invariant check. The failure branches
// are syntactic features of the function body, not runtime behaviors,
// and the bug we are asserting against is "no logAudit call exists in
// this branch" — which is expressible exactly once, at the source
// level, with no mock surface needed.

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";

const ROOT = path.resolve(__dirname, "../..");
const SRC_REL = "lib/org/actions.ts";

// Extract the body of `export async function createOrgAction(...)`.
function extractCreateOrgBody(src: string): string {
  const start = src.indexOf("export async function createOrgAction");
  expect(start, "createOrgAction export must exist").toBeGreaterThan(-1);

  // Walk to the opening brace of the function body.
  const openBrace = src.indexOf("{", start);
  expect(openBrace).toBeGreaterThan(-1);

  // Find the matching close brace. Naive depth walk, skipping strings
  // and template literals; adequate for this file.
  let depth = 1;
  let i = openBrace + 1;
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
      if (ch === inString) inString = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      inString = ch;
      continue;
    }
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) break;
    }
  }
  return src.slice(openBrace, i + 1);
}

// Given the function body, find the block that follows an `if (...)`
// guard whose condition matches `conditionRe`. Returns the full text
// of that block (including the braces), or null if not found.
function extractIfBlock(body: string, conditionRe: RegExp): string | null {
  const match = conditionRe.exec(body);
  if (!match) return null;
  // Find the `{` that opens this if's block after the match end.
  const openBrace = body.indexOf("{", match.index + match[0].length);
  if (openBrace === -1) return null;
  let depth = 1;
  let i = openBrace + 1;
  for (; i < body.length; i++) {
    const ch = body[i];
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) break;
    }
  }
  return body.slice(openBrace, i + 1);
}

describe("F-0008: createOrgAction must logAudit on every failure branch", () => {
  const src = readFileSync(path.join(ROOT, SRC_REL), "utf8");
  const body = extractCreateOrgBody(src);

  it("slug-collision branch calls logAudit", () => {
    // `if (existing) { ... }` — the slug uniqueness guard.
    const block = extractIfBlock(body, /if\s*\(\s*existing\s*\)/);
    expect(block, "slug-collision if-block must exist").not.toBeNull();
    expect(
      block!,
      "slug-collision branch must emit an audit event (e.g. org.create.failed)",
    ).toMatch(/logAudit\s*\(/);
  });

  it("org-insert-error branch calls logAudit", () => {
    // `if (orgError || !org) { ... }` — the DB-insert failure guard.
    const block = extractIfBlock(body, /if\s*\(\s*orgError\s*\|\|\s*!\s*org\s*\)/);
    expect(block, "org-insert-error if-block must exist").not.toBeNull();
    expect(
      block!,
      "org-insert-error branch must emit an audit event",
    ).toMatch(/logAudit\s*\(/);
  });

  it("membership-insert-error branch calls logAudit", () => {
    // `if (memberError) { ... }` — the membership-insert failure guard.
    const block = extractIfBlock(body, /if\s*\(\s*memberError\s*\)/);
    expect(block, "membership-error if-block must exist").not.toBeNull();
    expect(
      block!,
      "membership-error branch must emit an audit event",
    ).toMatch(/logAudit\s*\(/);
  });
});
