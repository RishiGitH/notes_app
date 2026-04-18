/**
 * scripts/perf-search.ts
 *
 * Autocannon load test for the /search?q=<term> route.
 * Hits the full Next.js RSC render path with an authenticated session.
 *
 * Authentication:
 *   Option A (preferred): set PERF_COOKIE in .env.local to the raw value
 *     of the sb-<ref>-auth-token cookie copied from browser DevTools.
 *   Option B: set PERF_USER_EMAIL and PERF_USER_PASSWORD. The script signs
 *     in via @supabase/supabase-js and synthesises the cookie automatically.
 *
 * Usage:
 *   pnpm perf:search
 *   pnpm perf:search -- --url=http://localhost:3000 --query=lorem
 *   pnpm perf:search -- --url=https://my-app.railway.app --query=project
 *
 * NOTE: The /search route is owned by search-ai (feat/infra) and does not
 * yet exist on feat/deploy. The script will return 404s until that branch
 * merges. This is expected and documented in NOTES.md.
 */

import "dotenv/config";
import autocannon from "autocannon";
import { createClient } from "@supabase/supabase-js";

// ---------------------------------------------------------------------------
// CLI argument parsing
// ---------------------------------------------------------------------------

const rawArgs = process.argv.slice(2);
const argMap: Record<string, string> = {};
for (const a of rawArgs) {
  if (a.startsWith("--")) {
    const [k, v] = a.slice(2).split("=");
    if (k && v !== undefined) argMap[k] = v;
  }
}

const APP_URL = argMap["url"] ?? process.env.APP_URL ?? "http://localhost:3000";
const QUERY = argMap["query"] ?? "lorem";
const CONNECTIONS = parseInt(argMap["connections"] ?? "10", 10);
const DURATION = parseInt(argMap["duration"] ?? "30", 10);

// ---------------------------------------------------------------------------
// Cookie acquisition
// ---------------------------------------------------------------------------

async function getCookie(): Promise<string> {
  // Option A: caller supplies the raw cookie value directly.
  const envCookie = process.env.PERF_COOKIE;
  if (envCookie) {
    return envCookie;
  }

  // Option B: sign in with email/password and synthesise the cookie.
  const email = process.env.PERF_USER_EMAIL;
  const password = process.env.PERF_USER_PASSWORD;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!email || !password) {
    throw new Error(
      "Set PERF_COOKIE (raw cookie from DevTools) OR both PERF_USER_EMAIL and PERF_USER_PASSWORD."
    );
  }
  if (!supabaseUrl || !supabaseKey) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY must be set.");
  }

  console.log(`Signing in as ${email} to obtain session cookie…`);
  const client = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error || !data.session) {
    throw error ?? new Error("Sign-in returned no session");
  }

  // Synthesise the sb-<project-ref>-auth-token cookie that @supabase/ssr reads.
  // The cookie value is a URL-encoded JSON array: [access_token, refresh_token].
  const ref = new URL(supabaseUrl).hostname.split(".")[0];
  const cookieValue = encodeURIComponent(
    JSON.stringify([data.session.access_token, data.session.refresh_token])
  );
  return `sb-${ref}-auth-token=${cookieValue}`;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log(`Perf target: ${APP_URL}/search?q=${encodeURIComponent(QUERY)}`);
  console.log(`Connections: ${CONNECTIONS}, Duration: ${DURATION}s`);

  let cookie: string;
  try {
    cookie = await getCookie();
  } catch (err) {
    console.error("Could not obtain auth cookie:", err instanceof Error ? err.message : err);
    process.exit(1);
  }

  const result = await autocannon({
    url: `${APP_URL}/search?q=${encodeURIComponent(QUERY)}`,
    connections: CONNECTIONS,
    duration: DURATION,
    headers: {
      cookie,
    },
  });

  console.log("\n--- Results ---");
  console.log(autocannon.printResult(result));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
