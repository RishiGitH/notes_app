// F-0012 — root route must not use getSession() for auth gating.
//
// Policy invariant: lib/auth/server.ts explicitly documents that getSession()
// must never be used for authorization decisions. The root route is a
// navigation entrypoint, so it must validate auth with getUser() instead of
// reading the local session cookie directly.

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(__dirname, "../..");
const SRC_REL = "app/page.tsx";

describe("F-0012: root route validates auth without getSession()", () => {
  const src = readFileSync(path.join(ROOT, SRC_REL), "utf8");

  it("does not import or call getSession()", () => {
    expect(src).not.toMatch(/\bgetSession\b/);
  });

  it("uses getUser() to choose between /login and /notes", () => {
    expect(src).toMatch(/auth\.getUser\(\)/);
    expect(src).toMatch(/["']\/login["']/);
    expect(src).toMatch(/["']\/notes["']/);
  });
});
