/**
 * scripts/seed.ts
 *
 * Seeds the database with realistic multi-tenant data for development and staging.
 * Uses DIRECT_URL (port 5432, bypasses RLS) — same pattern as the test fixtures.
 *
 * Usage:
 *   pnpm seed             # full: 10k notes
 *   pnpm seed:small       # small: 1k notes (for production smoke seeds)
 *
 * Idempotent: every INSERT uses ON CONFLICT DO NOTHING.
 * Deterministic: faker.seed(42).
 *
 * Both auth.users and public.users are seeded manually because the auth trigger
 * (Phase 2 follow-up) is not yet wired. Pattern from tests/tenant-isolation/helpers/fixtures.ts.
 */

import "dotenv/config";
import { config } from "dotenv";
import { resolve } from "path";
config({ path: resolve(process.cwd(), ".env.local"), override: true });
import postgres from "postgres";
import { faker } from "@faker-js/faker";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

faker.seed(42);

const args = new Set(process.argv.slice(2));
const small = args.has("--small");

const N_ORGS = 5;
const N_USERS = 20;
const N_NOTES = small ? 1_000 : 10_000;
const N_VERSIONED = small ? 50 : 500; // notes that get 3-5 versions (rest get 1)
const N_FILES = 50;
const N_SHARES = 30;
const CHUNK = 500;

const ROLES = ["owner", "admin", "member", "viewer"] as const;
const VISIBILITIES = ["private", "org", "public_in_org"] as const;
const SHARE_PERMS = ["view", "comment", "edit"] as const;
const MIME_TYPES = ["image/png", "image/jpeg", "application/pdf", "text/plain"] as const;

const DIRECT_URL = process.env.DIRECT_URL;
if (!DIRECT_URL) {
  console.error("DIRECT_URL is required. Set it in .env.local or the environment.");
  process.exit(1);
}

const sql = postgres(DIRECT_URL, { max: 1, prepare: false });

// postgres.js sql() helper requires (string | number)[][] — convert Date to ISO string.
function now(): string {
  return new Date().toISOString();
}
function iso(d: Date): string {
  return d.toISOString();
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function randomElement<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

function chunks<T>(arr: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    result.push(arr.slice(i, i + size));
  }
  return result;
}

function randomParagraphs(min = 1, max = 5): string {
  const count = Math.floor(Math.random() * (max - min + 1)) + min;
  return Array.from({ length: count }, () => faker.lorem.paragraph()).join("\n\n");
}

// ---------------------------------------------------------------------------
// Entity ID bags (generated once, referenced throughout)
// ---------------------------------------------------------------------------

const orgIds: string[] = [];
const userIds: string[] = [];

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log(`Seeding ${small ? "small" : "full"} dataset…`);
  console.log(`  Orgs: ${N_ORGS}, Users: ${N_USERS}, Notes: ${N_NOTES}`);

  // --- 1. Organizations -------------------------------------------------------
  console.log("Inserting organizations…");
  const orgRows: Array<{ id: string; name: string; slug: string }> = [];
  for (let i = 0; i < N_ORGS; i++) {
    const id = faker.string.uuid();
    orgIds.push(id);
    const name = faker.company.name();
    const slug =
      name.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40) +
      "-" +
      faker.string.alphanumeric(6);
    orgRows.push({ id, name, slug });
  }

  for (const chunk of chunks(orgRows, CHUNK)) {
    await sql`
      insert into public.organizations (id, name, slug, created_at, updated_at)
      values ${sql(chunk.map((r) => [r.id, r.name, r.slug, now(), now()]))}
      on conflict do nothing
    `;
  }

  // --- 2. Users (auth.users + public.users mirror) ----------------------------
  console.log("Inserting users…");
  const userRows: Array<{ id: string; email: string; displayName: string }> = [];
  for (let i = 0; i < N_USERS; i++) {
    const id = faker.string.uuid();
    userIds.push(id);
    const email = `seed-${id.slice(0, 8)}@example.com`;
    const displayName = faker.person.fullName();
    userRows.push({ id, email, displayName });
  }

  // auth.users first (minimal columns required by Supabase auth schema)
  for (const chunk of chunks(userRows, CHUNK)) {
    await sql`
      insert into auth.users (id, email, created_at, updated_at, role, aud)
      values ${sql(chunk.map((r) => [r.id, r.email, now(), now(), "authenticated", "authenticated"]))}
      on conflict (id) do nothing
    `;
  }

  // public.users mirror (auth trigger is deferred; seed manually)
  for (const chunk of chunks(userRows, CHUNK)) {
    await sql`
      insert into public.users (id, email, display_name, created_at, updated_at)
      values ${sql(chunk.map((r) => [r.id, r.email, r.displayName, now(), now()]))}
      on conflict (id) do nothing
    `;
  }

  // --- 3. Memberships ---------------------------------------------------------
  console.log("Inserting memberships…");
  const membershipRows: Array<{
    id: string;
    userId: string;
    orgId: string;
    role: string;
  }> = [];

  // userOrgs[userId] = [orgId, ...] — which orgs the user belongs to
  const userOrgs = new Map<string, string[]>();

  // Distribute users across orgs; first 4 users are multi-org.
  for (let i = 0; i < userIds.length; i++) {
    const uid = userIds[i]!;
    const primaryOrg = orgIds[i % N_ORGS]!;
    userOrgs.set(uid, [primaryOrg]);
    if (i < 4) {
      const secondOrg = orgIds[(i + 1) % N_ORGS]!;
      userOrgs.get(uid)!.push(secondOrg);
    }
  }

  // First user in each org is owner; rest get random roles.
  const orgUserCount = new Map<string, number>();
  for (const [uid, oids] of userOrgs) {
    for (const oid of oids) {
      const count = orgUserCount.get(oid) ?? 0;
      orgUserCount.set(oid, count + 1);
      const role = count === 0 ? "owner" : randomElement(ROLES);
      membershipRows.push({ id: faker.string.uuid(), userId: uid, orgId: oid, role });
    }
  }

  for (const chunk of chunks(membershipRows, CHUNK)) {
    await sql`
      insert into public.memberships (id, user_id, org_id, role, created_at, updated_at)
      values ${sql(chunk.map((r) => [r.id, r.userId, r.orgId, r.role, now(), now()]))}
      on conflict do nothing
    `;
  }

  // --- 4. Tags (5 per org) ---------------------------------------------------
  console.log("Inserting tags…");
  type TagRow = { id: string; orgId: string; name: string };
  const tagsByOrg = new Map<string, TagRow[]>();
  const allTags: TagRow[] = [];

  for (const oid of orgIds) {
    const orgTags: TagRow[] = [];
    const tagNames = new Set<string>();
    while (orgTags.length < 5) {
      const name = faker.word.noun().toLowerCase().slice(0, 30);
      if (!tagNames.has(name)) {
        tagNames.add(name);
        const tag: TagRow = { id: faker.string.uuid(), orgId: oid, name };
        orgTags.push(tag);
        allTags.push(tag);
      }
    }
    tagsByOrg.set(oid, orgTags);
  }

  for (const chunk of chunks(allTags, CHUNK)) {
    await sql`
      insert into public.tags (id, org_id, name, created_at)
      values ${sql(chunk.map((r) => [r.id, r.orgId, r.name, now()]))}
      on conflict do nothing
    `;
  }

  // --- 5. Notes + versions (batched, chicken-and-egg resolved per batch) -----
  console.log(`Inserting ${N_NOTES} notes (chunk size ${CHUNK})…`);

  // Which note indices get multiple versions?
  const multiVersionSet = new Set<number>();
  while (multiVersionSet.size < Math.min(N_VERSIONED, N_NOTES)) {
    multiVersionSet.add(Math.floor(Math.random() * N_NOTES));
  }

  // Collect all note IDs for later (files, shares, note_tags)
  const allNoteIds: Array<{ noteId: string; orgId: string; authorId: string }> = [];

  const noteIndices = Array.from({ length: N_NOTES }, (_, i) => i);
  for (const batch of chunks(noteIndices, CHUNK)) {
    type NoteInsertRow = {
      id: string;
      orgId: string;
      authorId: string;
      visibility: string;
      title: string;
      createdAt: string;
    };
    const noteInserts: NoteInsertRow[] = [];

    for (const i of batch) {
      const orgId = orgIds[i % N_ORGS]!;
      const orgUsers = membershipRows
        .filter((m) => m.orgId === orgId)
        .map((m) => m.userId);
      const authorId = orgUsers.length > 0 ? randomElement(orgUsers) : userIds[0]!;
      const visibility = randomElement(VISIBILITIES);
      const title = faker.lorem.sentence().replace(/\.$/, "");
      const createdAt = iso(faker.date.past({ years: 2 }));
      const id = faker.string.uuid();
      noteInserts.push({ id, orgId, authorId, visibility, title, createdAt });
      allNoteIds.push({ noteId: id, orgId, authorId });
    }

    // Insert notes; current_version_id and deleted_at omitted (both nullable,
    // both default to NULL in Postgres — no need to pass null explicitly).
    await sql`
      insert into public.notes (id, org_id, author_id, visibility, title, created_at, updated_at)
      values ${sql(noteInserts.map((r) => [r.id, r.orgId, r.authorId, r.visibility, r.title, r.createdAt, now()]))}
      on conflict do nothing
    `;

    // Build version rows for each note in this batch
    type VersionRow = {
      id: string;
      noteId: string;
      orgId: string;
      authorId: string;
      title: string;
      content: string;
      versionNumber: number;
      createdAt: string;
    };
    const versionInserts: VersionRow[] = [];
    // Track latest version id per note for the UPDATE
    const latestVersion = new Map<string, string>(); // noteId -> versionId

    for (let batchIdx = 0; batchIdx < batch.length; batchIdx++) {
      const noteIdx = batch[batchIdx]!;
      const note = noteInserts[batchIdx]!;
      const numVersions = multiVersionSet.has(noteIdx)
        ? Math.floor(Math.random() * 3) + 3 // 3-5
        : 1;

      for (let v = 1; v <= numVersions; v++) {
        const vId = faker.string.uuid();
        versionInserts.push({
          id: vId,
          noteId: note.id,
          orgId: note.orgId,
          authorId: note.authorId,
          title: v === 1 ? note.title : faker.lorem.sentence().replace(/\.$/, ""),
          content: randomParagraphs(),
          versionNumber: v,
          createdAt: iso(faker.date.between({ from: note.createdAt, to: new Date() })),
        });
        latestVersion.set(note.id, vId);
      }
    }

    for (const vChunk of chunks(versionInserts, CHUNK)) {
      await sql`
        insert into public.note_versions (id, note_id, org_id, author_id, title, content, version_number, created_at)
        values ${sql(vChunk.map((r) => [r.id, r.noteId, r.orgId, r.authorId, r.title, r.content, r.versionNumber, r.createdAt]))}
        on conflict do nothing
      `;
    }

    // Update notes to point at their latest version.
    // Run individual UPDATEs per note — simpler than a FROM-VALUES batch update
    // and fully safe; postgres.js handles each as a prepared-like statement.
    for (const [noteId, versionId] of latestVersion.entries()) {
      await sql`
        update public.notes
        set current_version_id = ${versionId}::uuid,
            updated_at = now()
        where id = ${noteId}::uuid
      `;
    }

    const processed = Math.min((batch[0]! ?? 0) + batch.length, N_NOTES);
    if (batch.length === CHUNK || processed === N_NOTES) {
      console.log(`  notes processed: ${processed}/${N_NOTES}`);
    }
  }

  // --- 6. note_tags (~2 tags per note for 30% of notes) ---------------------
  console.log("Inserting note_tags…");
  const noteTagRows: Array<{ noteId: string; tagId: string }> = [];
  const taggedNoteCount = Math.floor(N_NOTES * 0.3);
  const taggedNotes = allNoteIds.slice(0, taggedNoteCount);
  const noteTagSet = new Set<string>();

  for (const { noteId, orgId } of taggedNotes) {
    const orgTags = tagsByOrg.get(orgId) ?? [];
    if (orgTags.length === 0) continue;
    const numTags = Math.min(2, orgTags.length);
    const picked = new Set<string>();
    while (picked.size < numTags) {
      picked.add(randomElement(orgTags).id);
    }
    for (const tagId of picked) {
      const key = `${noteId}:${tagId}`;
      if (!noteTagSet.has(key)) {
        noteTagSet.add(key);
        noteTagRows.push({ noteId, tagId });
      }
    }
  }

  for (const chunk of chunks(noteTagRows, CHUNK)) {
    await sql`
      insert into public.note_tags (note_id, tag_id, created_at)
      values ${sql(chunk.map((r) => [r.noteId, r.tagId, now()]))}
      on conflict do nothing
    `;
  }

  // --- 7. note_shares (~30 cross-user shares within same org) ---------------
  console.log("Inserting note_shares…");
  const shareRows: Array<{
    id: string;
    noteId: string;
    userId: string;
    permission: string;
  }> = [];
  const shareSet = new Set<string>();
  let shareAttempts = 0;

  while (shareRows.length < N_SHARES && shareAttempts < N_SHARES * 10) {
    shareAttempts++;
    const { noteId, orgId, authorId } = randomElement(allNoteIds);
    const orgUsers = membershipRows
      .filter((m) => m.orgId === orgId && m.userId !== authorId)
      .map((m) => m.userId);
    if (orgUsers.length === 0) continue;
    const userId = randomElement(orgUsers);
    const key = `${noteId}:${userId}`;
    if (shareSet.has(key)) continue;
    shareSet.add(key);
    shareRows.push({
      id: faker.string.uuid(),
      noteId,
      userId,
      permission: randomElement(SHARE_PERMS),
    });
  }

  for (const chunk of chunks(shareRows, CHUNK)) {
    await sql`
      insert into public.note_shares (id, note_id, user_id, permission, created_at)
      values ${sql(chunk.map((r) => [r.id, r.noteId, r.userId, r.permission, now()]))}
      on conflict do nothing
    `;
  }

  // --- 8. files (50 rows, no Storage upload — row-only) ---------------------
  console.log("Inserting files…");
  const fileRows: Array<{
    id: string;
    orgId: string;
    noteId: string;
    uploaderId: string;
    path: string;
    mime: string;
    sizeBytes: number;
  }> = [];
  const filePathSet = new Set<string>();

  for (let i = 0; i < N_FILES; i++) {
    const { noteId, orgId, authorId } = randomElement(allNoteIds);
    const fileId = faker.string.uuid();
    const path = `${orgId}/${noteId}/${fileId}`;
    if (filePathSet.has(path)) continue;
    filePathSet.add(path);
    fileRows.push({
      id: fileId,
      orgId,
      noteId,
      uploaderId: authorId,
      path,
      mime: randomElement(MIME_TYPES),
      sizeBytes: faker.number.int({ min: 1024, max: 10 * 1024 * 1024 }),
    });
  }

  for (const chunk of chunks(fileRows, CHUNK)) {
    await sql`
      insert into public.files (id, org_id, note_id, uploader_id, path, mime, size_bytes, created_at)
      values ${sql(chunk.map((r) => [r.id, r.orgId, r.noteId, r.uploaderId, r.path, r.mime, r.sizeBytes, now()]))}
      on conflict do nothing
    `;
  }

  // --- Done -----------------------------------------------------------------
  console.log("\nSeed complete.");
  console.log(`  Orgs:        ${orgRows.length}`);
  console.log(`  Users:       ${userRows.length}`);
  console.log(`  Memberships: ${membershipRows.length}`);
  console.log(`  Notes:       ${N_NOTES}`);
  console.log(`  Note tags:   ${noteTagRows.length}`);
  console.log(`  Note shares: ${shareRows.length}`);
  console.log(`  Files:       ${fileRows.length}`);
}

main()
  .then(() => sql.end())
  .catch((err) => {
    console.error("Seed failed:", err);
    sql.end();
    process.exit(1);
  });
