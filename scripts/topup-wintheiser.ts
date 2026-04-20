/**
 * scripts/topup-wintheiser.ts
 *
 * One-shot top-up: brings "Wintheiser - Boyle" (slug: wintheiser-boyle-Gr7u2U)
 * to 10,000 notes so reviewers can exercise search at volume. Preserves all
 * existing notes, versions, shares, tags, members, and files.
 *
 * This org already contains jamesmathew@gmail.com (admin) and
 * rishi101@gmail.com (member), so both reviewer accounts see the full
 * 10k dataset on login.
 *
 *   pnpm exec tsx scripts/topup-wintheiser.ts [--target=10000] [--dry]
 *
 * Idempotent: computes (target - current_count) and only inserts the delta.
 * Uses DIRECT_URL (port 5432, bypasses RLS) — same pattern as scripts/seed.ts.
 */

import "dotenv/config";
import { config } from "dotenv";
import { resolve } from "path";
config({ path: resolve(process.cwd(), ".env.local"), override: true });
import postgres from "postgres";
import { faker } from "@faker-js/faker";

faker.seed(424242); // distinct seed so titles don't collide with scripts/seed.ts

const args = new Set(process.argv.slice(2));
const dry = args.has("--dry");
const targetArg = process.argv.find((a) => a.startsWith("--target="));
const TARGET = targetArg ? Number(targetArg.split("=")[1]) : 10_000;

const ORG_SLUG = "wintheiser-boyle-Gr7u2U";
const VISIBILITIES = ["private", "org", "public_in_org"] as const;
const CHUNK = 500;
const MULTI_VERSION_PCT = 0.05; // 5% of newly-added notes get 3 versions
const TAG_ATTACH_PCT = 0.3;
const ADD_FILES = 20;

const DIRECT_URL = process.env.DIRECT_URL;
if (!DIRECT_URL) {
  console.error("DIRECT_URL missing. Set it in .env.local.");
  process.exit(1);
}
const sql = postgres(DIRECT_URL, { max: 1, prepare: false });

function now(): string {
  return new Date().toISOString();
}
function iso(d: Date): string {
  return d.toISOString();
}
function randomElement<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}
function chunks<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}
function randomParagraphs(min = 1, max = 4): string {
  const n = Math.floor(Math.random() * (max - min + 1)) + min;
  return Array.from({ length: n }, () => faker.lorem.paragraph()).join("\n\n");
}

async function main() {
  // 1. Resolve org.
  const orgRow = (await sql`
    select id, name from public.organizations where slug = ${ORG_SLUG}
  `)[0];
  if (!orgRow) throw new Error(`Org not found: ${ORG_SLUG}`);
  const orgId = orgRow.id as string;
  console.log(`Target org: ${orgRow.name} (${orgId})`);

  // 2. Resolve members (authors). Skip viewers — RLS does not allow them to
  // author notes anyway, and seeding bypasses RLS but we want the data to be
  // consistent with the app's rules.
  const members = (await sql`
    select user_id, role from public.memberships
     where org_id = ${orgId}
       and role in ('owner', 'admin', 'member')
  `) as Array<{ user_id: string; role: string }>;
  if (members.length === 0) throw new Error("No authorable members in org.");
  const authorIds = members.map((m) => m.user_id);
  console.log(`  ${members.length} authorable members`);

  // 3. Tags — reuse whatever's already there.
  const tagRows = (await sql`
    select id from public.tags where org_id = ${orgId}
  `) as Array<{ id: string }>;
  const tagIds = tagRows.map((t) => t.id);
  console.log(`  ${tagIds.length} existing tags`);

  // 4. Count current notes & compute delta.
  const [{ count: currentCount }] = (await sql`
    select count(*)::int as count
      from public.notes
     where org_id = ${orgId}
       and deleted_at is null
  `) as Array<{ count: number }>;
  console.log(`  Current notes: ${currentCount}`);

  const toAdd = Math.max(0, TARGET - currentCount);
  if (toAdd === 0) {
    console.log(`Already at or above target ${TARGET}. Nothing to do.`);
    await sql.end();
    return;
  }
  console.log(`  To insert: ${toAdd}`);

  if (dry) {
    console.log("--dry set; exiting without writes.");
    await sql.end();
    return;
  }

  // 5. Pre-pick which new notes get multiple versions.
  const multiVersionSet = new Set<number>();
  const multiCount = Math.floor(toAdd * MULTI_VERSION_PCT);
  while (multiVersionSet.size < multiCount) {
    multiVersionSet.add(Math.floor(Math.random() * toAdd));
  }

  const newNoteIds: Array<{ noteId: string; orgId: string; authorId: string }> = [];

  // 6. Insert in batches: notes → versions → update current_version_id → note_tags.
  const idxs = Array.from({ length: toAdd }, (_, i) => i);
  let inserted = 0;
  for (const batch of chunks(idxs, CHUNK)) {
    type NoteIns = {
      id: string;
      authorId: string;
      visibility: string;
      title: string;
      createdAt: string;
    };
    const noteInserts: NoteIns[] = batch.map(() => {
      const authorId = randomElement(authorIds);
      const visibility = randomElement(VISIBILITIES);
      const title = faker.lorem.sentence().replace(/\.$/, "");
      const createdAt = iso(faker.date.past({ years: 2 }));
      return { id: faker.string.uuid(), authorId, visibility, title, createdAt };
    });

    await sql`
      insert into public.notes
        (id, org_id, author_id, visibility, title, created_at, updated_at)
      values ${sql(
        noteInserts.map((r) => [
          r.id,
          orgId,
          r.authorId,
          r.visibility,
          r.title,
          r.createdAt,
          now(),
        ]),
      )}
      on conflict do nothing
    `;

    // Version rows
    type VerIns = {
      id: string;
      noteId: string;
      authorId: string;
      title: string;
      content: string;
      versionNumber: number;
      createdAt: string;
    };
    const versionInserts: VerIns[] = [];
    const latestVersion = new Map<string, string>();

    for (let i = 0; i < batch.length; i++) {
      const globalIdx = batch[i]!;
      const note = noteInserts[i]!;
      const numVersions = multiVersionSet.has(globalIdx) ? 3 : 1;
      for (let v = 1; v <= numVersions; v++) {
        const vId = faker.string.uuid();
        versionInserts.push({
          id: vId,
          noteId: note.id,
          authorId: note.authorId,
          title: v === 1 ? note.title : faker.lorem.sentence().replace(/\.$/, ""),
          content: randomParagraphs(),
          versionNumber: v,
          createdAt: iso(
            faker.date.between({ from: note.createdAt, to: new Date() }),
          ),
        });
        latestVersion.set(note.id, vId);
      }
      newNoteIds.push({ noteId: note.id, orgId, authorId: note.authorId });
    }

    for (const vchunk of chunks(versionInserts, CHUNK)) {
      await sql`
        insert into public.note_versions
          (id, note_id, org_id, author_id, title, content, version_number, created_at)
        values ${sql(
          vchunk.map((r) => [
            r.id,
            r.noteId,
            orgId,
            r.authorId,
            r.title,
            r.content,
            r.versionNumber,
            r.createdAt,
          ]),
        )}
        on conflict do nothing
      `;
    }

    // Point current_version_id → latest version (fires FTS trigger).
    const updates = [...latestVersion.entries()];
    for (const uchunk of chunks(updates, CHUNK)) {
      await sql`
        update public.notes n
           set current_version_id = v.vid::uuid,
               updated_at = now()
          from (
            values ${sql(uchunk.map(([nid, vid]) => [nid, vid]))}
          ) as v(nid, vid)
         where n.id = v.nid::uuid
      `;
    }

    // Attach a tag to ~30% of new notes.
    if (tagIds.length > 0) {
      const tagRowsToInsert = noteInserts
        .filter(() => Math.random() < TAG_ATTACH_PCT)
        .map((n) => [n.id, randomElement(tagIds), now()] as const);
      if (tagRowsToInsert.length > 0) {
        for (const tchunk of chunks([...tagRowsToInsert], CHUNK)) {
          await sql`
            insert into public.note_tags (note_id, tag_id, created_at)
            values ${sql(tchunk.map((r) => [r[0], r[1], r[2]]))}
            on conflict do nothing
          `;
        }
      }
    }

    inserted += noteInserts.length;
    if (inserted % 2000 === 0 || inserted === toAdd) {
      console.log(`  … inserted ${inserted}/${toAdd}`);
    }
  }

  // 7. A handful of extra file rows on random new notes.
  console.log(`Inserting ${ADD_FILES} file rows…`);
  const fileRows = Array.from({ length: ADD_FILES }, () => {
    const { noteId, authorId } = randomElement(newNoteIds);
    const mime = randomElement([
      "image/png",
      "image/jpeg",
      "application/pdf",
      "text/plain",
    ] as const);
    const path = `org/${orgId}/note/${noteId}/${faker.string.uuid()}`;
    return [
      faker.string.uuid(),
      orgId,
      noteId,
      authorId,
      path,
      mime,
      faker.number.int({ min: 1_000, max: 2_000_000 }),
      now(),
    ];
  });
  await sql`
    insert into public.files
      (id, org_id, note_id, uploader_id, path, mime, size_bytes, created_at)
    values ${sql(fileRows)}
    on conflict do nothing
  `;

  // 8. A few extra note_shares between existing org members to exercise the
  // share list UI at volume.
  console.log("Inserting 10 extra note_shares…");
  const memberPairs: Array<[string, string]> = [];
  for (const a of authorIds) {
    for (const b of authorIds) if (a !== b) memberPairs.push([a, b]);
  }
  const shareRows: Array<[string, string, string, string]> = [];
  for (let i = 0; i < Math.min(10, memberPairs.length, newNoteIds.length); i++) {
    const { noteId } = newNoteIds[i * 37 % newNoteIds.length]!;
    const [, recipient] = randomElement(memberPairs);
    const perm = randomElement(["view", "comment", "edit"] as const);
    shareRows.push([noteId, recipient, perm, now()]);
  }
  if (shareRows.length > 0) {
    await sql`
      insert into public.note_shares (note_id, user_id, permission, created_at)
      values ${sql(shareRows)}
      on conflict do nothing
    `;
  }

  // 9. Final count.
  const [{ count: finalCount }] = (await sql`
    select count(*)::int as count
      from public.notes
     where org_id = ${orgId}
       and deleted_at is null
  `) as Array<{ count: number }>;
  console.log(`\nDone. ${orgRow.name}: ${finalCount} notes (target ${TARGET}).`);

  await sql.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
