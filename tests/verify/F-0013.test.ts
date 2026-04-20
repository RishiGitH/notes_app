// F-0013 — auth redirects must not derive their Location host from request.url.
//
// Policy invariant: auth bootstrap redirects should emit internal relative
// paths, not absolute URLs synthesized from request.url / request.nextUrl.
// In containerized production environments those request hosts may be
// internal-only values like 0.0.0.0:8000, which leaks invalid hosts to users.

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(__dirname, "../..");

const SITES = [
  "app/auth/continue/route.ts",
  "lib/auth/middleware.ts",
] as const;

describe("F-0013: auth redirects stay relative", () => {
  for (const rel of SITES) {
    const src = readFileSync(path.join(ROOT, rel), "utf8");

    it(`${rel} uses the public-origin redirect helper`, () => {
      expect(src).toMatch(/\bbuildPublicRedirectUrl\b|\bredirectToInternalPath\b/);
    });

    it(`${rel} does not build redirect URLs from request.url`, () => {
      expect(src).not.toMatch(/request\.url/);
      expect(src).not.toMatch(/request\.nextUrl\.clone\(\)/);
      expect(src).not.toMatch(/NextResponse\.redirect\(new URL\(/);
    });
  }
});
