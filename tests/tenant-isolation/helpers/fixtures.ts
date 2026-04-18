// Shared fixture helpers for the tenant-isolation test suite.
//
// seedTwoOrgs(): creates a deterministic fixture of two orgs and three users:
//   - userA (owner of org1)
//   - userB (member  of org1)
//   - userC (owner of org2)
//
// The UUIDs are stable so tests can refer to them by name across runs. This
// makes debugging easier: "org1Id" is always the same value in one test run.
//
// truncateAll(): truncates every public.* table (restart identity, cascade) to
// give each test file a clean slate. Does NOT drop or recreate anything —
// policies, enums, and functions survive, which is correct behavior: we want
// to keep testing the same policies across cases.

import { v4 as uuidv4 } from "uuid";
import { asAdmin } from "./as-user";

export interface TestUser {
  id: string;
  email: string;
}

export interface TestOrg {
  id: string;
  name: string;
  slug: string;
}

export interface TestFixture {
  org1: TestOrg;
  org2: TestOrg;
  userA: TestUser; // owner of org1
  userB: TestUser; // member of org1
  userC: TestUser; // owner of org2
}

// Stable UUIDs for fixture entities. Using fixed values lets us insert the
// same rows across truncate cycles without regenerating ids.
const IDS = {
  org1: "10000000-0000-0000-0000-000000000001",
  org2: "10000000-0000-0000-0000-000000000002",
  userA: "a0000000-0000-0000-0000-000000000001",
  userB: "b0000000-0000-0000-0000-000000000001",
  userC: "c0000000-0000-0000-0000-000000000001",
} as const;

export async function seedTwoOrgs(): Promise<TestFixture> {
  const { sql, release } = await asAdmin();
  try {
    // Seed into auth.users so that auth.uid() lookups can function.
    // The auth schema is provided by Supabase CLI; rows here are minimal.
    await sql`
      insert into auth.users (id, email, created_at, updated_at, role, aud)
      values
        (${IDS.userA}, 'usera@example.com', now(), now(), 'authenticated', 'authenticated'),
        (${IDS.userB}, 'userb@example.com', now(), now(), 'authenticated', 'authenticated'),
        (${IDS.userC}, 'userc@example.com', now(), now(), 'authenticated', 'authenticated')
      on conflict (id) do nothing
    `;

    // Mirror rows into public.users (auth trigger is Phase 2; we seed manually).
    await sql`
      insert into public.users (id, email, created_at, updated_at)
      values
        (${IDS.userA}, 'usera@example.com', now(), now()),
        (${IDS.userB}, 'userb@example.com', now(), now()),
        (${IDS.userC}, 'userc@example.com', now(), now())
      on conflict (id) do nothing
    `;

    // Organizations
    await sql`
      insert into public.organizations (id, name, slug, created_at, updated_at)
      values
        (${IDS.org1}, 'Org One', 'org-one', now(), now()),
        (${IDS.org2}, 'Org Two', 'org-two', now(), now())
      on conflict (id) do nothing
    `;

    // Memberships
    await sql`
      insert into public.memberships (id, user_id, org_id, role, created_at, updated_at)
      values
        (${uuidv4()}, ${IDS.userA}, ${IDS.org1}, 'owner',  now(), now()),
        (${uuidv4()}, ${IDS.userB}, ${IDS.org1}, 'member', now(), now()),
        (${uuidv4()}, ${IDS.userC}, ${IDS.org2}, 'owner',  now(), now())
      on conflict do nothing
    `;
  } finally {
    await release();
  }

  return {
    org1: { id: IDS.org1, name: "Org One", slug: "org-one" },
    org2: { id: IDS.org2, name: "Org Two", slug: "org-two" },
    userA: { id: IDS.userA, email: "usera@example.com" },
    userB: { id: IDS.userB, email: "userb@example.com" },
    userC: { id: IDS.userC, email: "userc@example.com" },
  };
}

/**
 * Truncate every public.* table (and auth.users) between test files.
 * RESTART IDENTITY CASCADE resets sequences and removes dependent rows.
 * The RLS policies, enums, and functions are NOT dropped — we keep them
 * across tests because that is exactly what we are testing.
 */
export async function truncateAll(): Promise<void> {
  const { sql, release } = await asAdmin();
  try {
    await sql`
      truncate table
        public.audit_logs,
        public.ai_summaries,
        public.files,
        public.note_tags,
        public.note_shares,
        public.note_versions,
        public.notes,
        public.tags,
        public.memberships,
        public.organizations,
        public.users,
        auth.users
      restart identity cascade
    `;
  } finally {
    await release();
  }
}
