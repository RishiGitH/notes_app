// F-0010 — `uuid` package reintroduced despite explicit ban.
//
// Policy invariant: BUGS.md explicitly records the prior banning of
// the `uuid` package (entry: "uuid package installed for ID generation
// when Postgres already handles it"). App code must never generate
// UUIDs — Postgres `gen_random_uuid()` handles ID minting. AGENTS.md
// section 4 ("Dependency discipline") requires that any dependency
// addition is deliberate; the preceding BUGS.md entry forbids this
// particular dependency.
//
// This test is deliberately a source-level / manifest-level check.
// The invariant is purely syntactic:
//   1. `package.json` must not list `uuid` in `dependencies`.
//   2. `package.json` must not list `@types/uuid` in `devDependencies`.
//   3. `lib/notes/actions.ts` must not import from `"uuid"` or `'uuid'`.

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";

const ROOT = path.resolve(__dirname, "../..");

describe("F-0010: banned `uuid` package must not be reintroduced", () => {
  it("package.json `dependencies` does not contain `uuid`", () => {
    const pkgPath = path.join(ROOT, "package.json");
    const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as {
      dependencies?: Record<string, string>;
    };
    const deps = pkg.dependencies ?? {};
    expect(
      Object.prototype.hasOwnProperty.call(deps, "uuid"),
      `package.json dependencies must not include "uuid" (banned per BUGS.md: "uuid package installed for ID generation when Postgres already handles it"). Found version: ${deps.uuid}`,
    ).toBe(false);
  });

  it("package.json `devDependencies` does not contain `@types/uuid`", () => {
    const pkgPath = path.join(ROOT, "package.json");
    const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as {
      devDependencies?: Record<string, string>;
    };
    const devDeps = pkg.devDependencies ?? {};
    expect(
      Object.prototype.hasOwnProperty.call(devDeps, "@types/uuid"),
      `package.json devDependencies must not include "@types/uuid" (package is deprecated — \`uuid\` ships its own types — and is banned alongside \`uuid\` per BUGS.md). Found version: ${devDeps["@types/uuid"]}`,
    ).toBe(false);
  });

  it("lib/notes/actions.ts does not import from `uuid`", () => {
    const abs = path.join(ROOT, "lib/notes/actions.ts");
    const src = readFileSync(abs, "utf8");
    // Match `from "uuid"` or `from 'uuid'` in any import statement.
    // Also guard against `require("uuid")` forms for completeness.
    const importRegex = /\bfrom\s+["']uuid["']/;
    const requireRegex = /\brequire\(\s*["']uuid["']\s*\)/;
    expect(
      importRegex.test(src) || requireRegex.test(src),
      `lib/notes/actions.ts must not import from "uuid" (banned per BUGS.md; use Postgres gen_random_uuid() instead of minting IDs in application code).`,
    ).toBe(false);
  });
});
