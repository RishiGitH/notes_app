// Tenant-isolation test helper: impersonate a Postgres user via JWT claim.
//
// Supabase RLS evaluates auth.uid() by reading the "sub" field from the JWT
// stored in request.jwt.claims. We simulate this without a real JWT server by
// issuing set_config() calls on a dedicated single-connection postgres.js
// client, then setting the role to "authenticated".
//
// This approach tests the SQL policies directly, independent of the Supabase
// Auth server, which is intentional: Phase 1 tests schema correctness.
//
// Usage:
//   const { db, release } = await asUser(userA.id);
//   try { const rows = await db.select().from(notes); expect(rows).toHaveLength(0); }
//   finally { await release(); }
//
//   const { db: adminDb, release: adminRelease } = await asAdmin();
//   // asAdmin bypasses RLS for fixture setup

import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "@/lib/db/schema";

export type TestDb = ReturnType<typeof drizzle<typeof schema>>;

export interface TestHandle {
  db: TestDb;
  sql: postgres.Sql;
  release: () => Promise<void>;
}

function directUrl(): string {
  const url = process.env.DIRECT_URL;
  if (!url) throw new Error("DIRECT_URL is not set");
  return url;
}

/**
 * Open a Postgres connection impersonating the given user id under the
 * "authenticated" role. The connection is single-use and must be released
 * after the test to avoid connection leaks.
 */
export async function asUser(userId: string): Promise<TestHandle> {
  const client = postgres(directUrl(), { max: 1, prepare: false });
  // Impersonate: set the role first, then configure jwt claims.
  // is_local = false (third arg) means the setting persists for the connection,
  // not just the current transaction, so subsequent queries see the same claims.
  await client`select set_config('role', 'authenticated', false)`;
  await client`set role authenticated`;
  await client`select set_config('request.jwt.claim.sub', ${userId}, false)`;
  await client`
    select set_config(
      'request.jwt.claims',
      ${JSON.stringify({ sub: userId, role: "authenticated" })},
      false
    )
  `;

  const db = drizzle(client, { schema });

  return {
    db,
    sql: client,
    release: async () => {
      await client`reset role`;
      await client.end();
    },
  };
}

/**
 * Open a superuser connection that bypasses RLS. Used for fixture setup only:
 * seeding users, orgs, memberships before each test case.
 *
 * Never use this connection for assertions — it bypasses the policies
 * under test.
 */
export async function asAdmin(): Promise<TestHandle> {
  const client = postgres(directUrl(), { max: 1, prepare: false });
  const db = drizzle(client, { schema });
  return {
    db,
    sql: client,
    release: async () => {
      await client.end();
    },
  };
}
