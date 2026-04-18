// Vitest globalSetup for the tenant-isolation suite.
//
// This module runs once before all test files in the suite (outside any
// worker; see vitest docs for globalSetup). It:
//
//   0. Loads .env and .env.local from the repo root into process.env.
//      Vitest does not auto-load these (unlike Next.js). Variables
//      already set in the environment take precedence (no override).
//
//   1. Asserts that DIRECT_URL targets 127.0.0.1 so we never accidentally
//      run destructive fixture operations against a production database.
//
//   2. Applies all pending Drizzle migrations via `pnpm db:migrate`. This
//      is idempotent: drizzle-kit migrate only runs unapplied migrations,
//      so re-running the suite is safe.
//
// teardown() is intentionally empty: each test file calls truncateAll()
// in its own afterAll(), which is sufficient cleanup. Dropping the schema
// or stopping Supabase is the developer's responsibility outside of Vitest.

import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** Parse a .env file into key=value pairs (no deps, no override). */
function loadEnvFile(filePath: string): void {
  let raw: string;
  try {
    raw = readFileSync(filePath, "utf8");
  } catch {
    return; // file doesn't exist — skip silently
  }
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
    if (!(key in process.env)) {
      process.env[key] = val;
    }
  }
}

export async function setup(): Promise<void> {
  // Resolve repo root from this file's location:
  // tests/tenant-isolation/globalSetup.ts -> ../../ = repo root
  const thisFile = typeof __filename !== "undefined"
    ? __filename
    : fileURLToPath(import.meta.url);
  const repoRoot = path.resolve(path.dirname(thisFile), "../..");

  // Load env files — .env first, then .env.local overrides.
  loadEnvFile(path.join(repoRoot, ".env"));
  loadEnvFile(path.join(repoRoot, ".env.local"));

  const directUrl = process.env.DIRECT_URL ?? "";

  if (!directUrl.includes("127.0.0.1") && !directUrl.includes("localhost")) {
    throw new Error(
      `[globalSetup] Refusing to run tenant-isolation tests against a non-local database.\n` +
        `DIRECT_URL must contain '127.0.0.1' or 'localhost', got: ${directUrl || "(unset)"}\n` +
        `Start the local Supabase stack with: pnpm supabase:start`,
    );
  }

  console.log("[globalSetup] Applying Drizzle migrations…");
  try {
    execSync("pnpm db:migrate", {
      cwd: repoRoot,
      stdio: "pipe",
      env: process.env,
    });
    console.log("[globalSetup] Migrations applied.");
  } catch (err) {
    const out = err instanceof Error && "stdout" in err
      ? String((err as NodeJS.ErrnoException & { stdout: Buffer }).stdout)
      : "";
    const errOut = err instanceof Error && "stderr" in err
      ? String((err as NodeJS.ErrnoException & { stderr: Buffer }).stderr)
      : String(err);
    throw new Error(
      `[globalSetup] pnpm db:migrate failed:\n${out}\n${errOut}`,
    );
  }
}

export async function teardown(): Promise<void> {
  // Nothing to do: each test file manages its own truncate in afterAll().
}
