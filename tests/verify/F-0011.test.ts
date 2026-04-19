// F-0011 — getFileInfo ordering fix regression guard.
//
// Original claim: `getFileInfo` in `lib/files/actions.ts` used the admin
// (service-role) Supabase client to fetch the file row keyed by a caller-
// supplied `fileId` BEFORE calling `requireOrgAccess`. This yielded a
// distinguishable 403 (file exists in some org) vs 404 (UUID not found
// anywhere) response, enabling cross-org file UUID enumeration.
//
// Fix (F-0011): `getFileInfo` now uses the user-scoped Supabase client
// (via `getServerSupabase()`) for the initial file lookup. RLS on the
// user-scoped client returns null for files in orgs the caller has no
// access to, making the 403/404 branches indistinguishable.
//
// This file is a REGRESSION guard: every assertion passes when the fix is
// in place and fails if someone reverts it to the admin-client-first pattern.

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";

const ROOT = path.resolve(__dirname, "../..");
const SRC_REL = "lib/files/actions.ts";

// Extract the body of `export async function getFileInfo(...)`.
function extractGetFileInfoBody(src: string): string {
  const start = src.indexOf("export async function getFileInfo");
  if (start === -1) return "";

  const openBrace = src.indexOf("{", start);
  if (openBrace === -1) return "";

  let depth = 1;
  let i = openBrace + 1;
  let inString: '"' | "'" | "`" | null = null;
  let escape = false;
  for (; i < src.length; i++) {
    const ch = src[i]!;
    if (escape) { escape = false; continue; }
    if (inString) {
      if (ch === "\\") { escape = true; continue; }
      if (ch === inString) inString = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") { inString = ch; continue; }
    if (ch === "{") depth++;
    else if (ch === "}") { depth--; if (depth === 0) break; }
  }
  return src.slice(openBrace, i + 1);
}

describe("F-0011: getFileInfo fix — user-scoped client used for initial file lookup", () => {
  const src = readFileSync(path.join(ROOT, SRC_REL), "utf8");
  const body = extractGetFileInfoBody(src);

  it("getFileInfo body exists", () => {
    const start = src.indexOf("export async function getFileInfo");
    expect(start, "getFileInfo export must exist in lib/files/actions.ts").toBeGreaterThan(-1);
    expect(body.length).toBeGreaterThan(10);
  });

  it("getFileInfo uses getServerSupabase() for the initial file lookup, not the admin client", () => {
    // The fix replaces the admin-client fetch with a user-scoped client fetch.
    // getServerSupabase() must be called inside getFileInfo.
    expect(
      body,
      "getFileInfo must call getServerSupabase() to fetch the file row via RLS-scoped client (F-0011 fix)",
    ).toMatch(/getServerSupabase\(\)/);
  });

  it("getFileInfo does NOT call admin client directly to fetch the files table", () => {
    // The admin client should NOT be used for the files lookup that is keyed
    // by the caller-supplied fileId. If it is, the enumeration oracle is back.
    const hasAdminFilesFetch =
      body.includes('admin.from("files")') ||
      body.includes("admin\n    .from(\"files\")") ||
      body.includes("admin\n      .from(\"files\")");

    expect(
      hasAdminFilesFetch,
      [
        'getFileInfo must not use admin.from("files") for the initial file lookup.',
        "Using the service-role client on a caller-supplied fileId before requireOrgAccess",
        "creates a 403-vs-404 enumeration oracle (F-0011). Use the user-scoped client instead.",
      ].join(" "),
    ).toBe(false);
  });
});
