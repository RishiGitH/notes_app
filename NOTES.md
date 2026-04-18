# NOTES.md — Work Journal

Live scratchpad. Append-only, chronological. Written by the agent
actually doing the work, as the work happens. Messy is fine — the
goal is authenticity, not polish. Don't edit prior entries.

Format:

```
## YYYY-MM-DD HH:MM — <agent-name> — <one-line title>

Plan
- what I'm about to do

Result
- what I actually did
- decisions and why
- what I deferred

Blockers / pivots
- things that didn't work
- mid-task changes of approach

Commits
- `<short-sha>` <subject>
```

`Blockers / pivots` is optional but include it when something fought
you — that's the signal the journal is real. If two worktrees append
at the same time and git conflicts, keep both entries in timestamp
order, never delete.

## [2026-04-18T16:46:17Z] [lead-backend] Task: Phase 0 - Scaffold

**Plan:**
- Scaffold Next.js 16 App Router + TypeScript strict + pnpm + Tailwind via create-next-app.
- Install locked stack dependencies in focused commits: Drizzle + postgres driver; @supabase/ssr; react-hook-form + zod + react-markdown + remark-gfm + rehype-sanitize + @tanstack/react-table + react-diff-viewer-continued + diff + lucide-react; @anthropic-ai/sdk; vitest + @testing-library/react + jsdom.
- Initialize shadcn/ui with defaults; add Sonner toast for UI.md contract.
- Add /api/health route returning {ok:true} with runtime='nodejs'.
- Create lib/db, lib/auth, lib/ai scaffolding with env-absent-safe stubs (no instantiation at import time).
- Overwrite app/page.tsx as a server component redirecting by session state (null to /login, otherwise /notes).
- Stub app/(auth)/login/page.tsx and app/(app)/notes/page.tsx so redirects land somewhere valid.
- Write .env.example with canonical env var names (AGENTS.md section 1).
- Commit per AGENTS.md section 4 message format, small logical commits.

**Exit gate (PLAN.md Phase 0):** app boots; health returns 200.
**Gate command:** `pnpm dev` then `curl -fsS http://localhost:3000/api/health`.

**Result:**
- Scaffolded Next.js 16 App Router + TypeScript strict (noUncheckedIndexedAccess, noImplicitOverride) + pnpm + Tailwind 3 + shadcn/ui (Sonner only at this stage).
- Installed full locked stack: drizzle-orm + postgres + drizzle-kit; @supabase/ssr + @supabase/supabase-js; react-hook-form + @hookform/resolvers + zod; react-markdown + remark-gfm + rehype-sanitize; @tanstack/react-table; react-diff-viewer-continued@^4 (v4 for React 19 compat); diff; lucide-react; @anthropic-ai/sdk; vitest + @testing-library/react + jsdom.
- lib/auth/server.ts: getSession returns null when env absent — app boots without Supabase configured.
- lib/db/client.ts: getDb/getDirectDb throw if env absent — safe to import, not to call without env.
- lib/ai/client.ts: reads ANTHROPIC_MODEL with claude-sonnet-4-6 fallback; throws if no API key.
- app/page.tsx: server component redirects to /login (no session) or /notes (session present).
- app/api/health/route.ts: returns {ok:true} with runtime='nodejs', dynamic='force-dynamic'. Note: health route is owned by infra-deploy long-term; created here as a Phase 0 bootstrap exception so the exit gate can be verified.
- middleware.ts: explicit matcher excludes /api/health, static assets, favicon per AGENTS.md section 4 rule.
- eslint.config.mjs: flat config using eslint-config-next v16 native flat export. next lint removed in Next 16, switched to direct eslint invocation.
- Gate verified: pnpm typecheck clean, pnpm lint clean, curl http://localhost:3000/api/health returned 200 {ok:true}.
- Deferred: real Supabase env wiring, requireOrgAccess, audit_logs table, full schema/RLS, UI primitives beyond Sonner, Dockerfile, seed script, FTS, file pipeline, AI summarizer.

**Commits:**
- `807e2e3` added claude configuration and full configuration for agents and sub agents. All added all the MD files required in assignment
- `86ede48` notes: start phase 0, Scaffold

## [2026-04-18T17:36:38Z] [lead-backend] Task: Phase 1 - Schema + RLS + tenant-isolation gate

**Plan:**
- Declare all 11 tables in lib/db/schema.ts per PLAN.md section 2: users, organizations, memberships, notes, note_versions, note_shares, tags, note_tags, files, ai_summaries, audit_logs. Enums role/visibility/share. Indexes per schema-reviewer checklist; partial indexes on `deleted_at IS NULL` for notes list paths.
- Add two SQL security-definer helpers via Drizzle sql blocks: public.is_org_member(org uuid), public.org_role(org uuid). Pinned search_path. Avoids recursive RLS on memberships.
- Enable RLS on every table; declare USING + WITH CHECK policies for every op that supports them. Child-of-notes tables (note_versions, note_shares, note_tags, files, ai_summaries) resolve via EXISTS subquery joining current notes row (deleted_at IS NULL, is_org_member, current visibility/share/role). note_versions is immutable (SELECT + INSERT only). audit_logs INSERT-only for authenticated, no SELECT. organizations INSERT permits any authenticated (owner-membership inserted by Phase 2 Server Action). Soft-deleted parents hide all children via the policy filter.
- `supabase init` + commit supabase/config.toml (site_url, db.seed.enabled=false). Skip seed.sql. Add supabase:start/stop and db:reset scripts to package.json. Document local-dev DATABASE_URL/DIRECT_URL as commented block in .env.example (no new variable names).
- Add tenant-isolation harness: tests/tenant-isolation/helpers/as-user.ts (JWT-claim impersonation via set_config + set role authenticated), helpers/fixtures.ts (seedTwoOrgs → userA owner Org1, userB member Org1, userC owner Org2; truncateAll). globalSetup.ts asserts DIRECT_URL targets 127.0.0.1 and applies pnpm db:migrate. vitest.config.ts gets environmentMatchGlobs to run tenant-isolation + integration in node.
- Write all ten AGENTS.md section 6 Tier-1 cases as 01-..-10-..test.ts. Each has one load-bearing assertion that flips red if any policy is USING (true).
- Commit budget: 8 logical commits (AGENTS.md section 4). ASCII messages, `<scope>: <what>, <why>` format.

**Exit gate (PLAN.md Phase 1):** `pnpm test:tenant-isolation` green; schema-reviewer clean.
**Gate commands:** `pnpm supabase:start && pnpm db:generate && pnpm db:migrate && pnpm test:tenant-isolation && pnpm typecheck && pnpm lint`.

**Result:**
- Declared all 11 tables in lib/db/schema.ts per PLAN.md section 2 with org_id NOT NULL on every tenant-scoped table. Enums: role_enum, visibility_enum, share_permission_enum. Partial indexes on `deleted_at IS NULL` for the notes list path. No tsvector/GIN in Phase 1: FTS is Phase 3C; carrying a dead column+index deferred to DEFERRED.md.
- Added is_org_member(org) and org_role(org) as SECURITY DEFINER STABLE SQL functions in a hand-written migration (0001_rls_helpers.sql) because drizzle-kit cannot generate function DDL. Pinned search_path = public to close function-hijacking path.
- Enabled RLS on all 11 tables. Declared USING + WITH CHECK for every verb via pgPolicy(). Child-of-notes tables (note_versions, note_shares, note_tags, files, ai_summaries) resolve authorization by EXISTS-joining the current parent notes row (deleted_at IS NULL, is_org_member, current visibility/share/role). note_versions is immutable: SELECT + INSERT only.
- Discovered and fixed circular RLS recursion: notes SELECT checked note_shares, note_shares SELECT checked notes. Fixed by simplifying note_shares SELECT policy to `user_id = auth.uid()`. Author/admin reads of all shares go through service role on admin server paths. Documented in schema.ts comment.
- Added missing tags UPDATE policy (schema-reviewer finding: medium). Admin-only rename, matching existing delete policy.
- supabase init run; config.toml committed with site_url=localhost:3000 and db.seed.enabled=false. Migrations applied to local Supabase stack on port 54322.
- JWT-claim impersonation test harness: asUser() sets role=authenticated + request.jwt.claim.sub; asAdmin() bypasses RLS for fixture setup. Fixed Vitest pool from default (concurrent forks) to pool='forks' maxForks=1 so test files run sequentially and beforeAll/afterAll don't interfere across files.
- globalSetup.ts guards against non-localhost DIRECT_URL and applies db:migrate idempotently before any test file runs.
- Seeded two orgs + three users directly into auth.users + public.users (auth trigger is Phase 2). Fixed truncateAll to omit RESTART IDENTITY (auth schema sequences are owned by supabase system user, not postgres).
- All 10 Tier-1 test cases pass (17 assertions). pnpm typecheck and pnpm lint clean.
- Decisions: notes.current_version_id has no DDL FK (chicken-and-egg resolved at application layer, flagged in commit message and schema comment). files.note_id uses ON DELETE RESTRICT (storage object must be cleaned before file row can be removed). note_shares SELECT policy intentionally simplified to break RLS recursion cycle.
- Schema-reviewer invoked; 0 critical, 0 must-fix. tags UPDATE policy gap (medium) fixed before closing. note_versions.org_id and ai_summaries.org_id denormalization without a DDL FK to organizations is noted as an acceptable trade-off and recorded in .reports/schema/.

**Commits:**
- `89475bf` db: add drizzle schema for users organizations memberships, install enums for role visibility share
- `f63f0cb` db: add notes note_versions note_shares tags note_tags tables, core note graph
- `8dd57c7` db: add files ai_summaries audit_logs tables, complete phase 1 schema
- `80ff094` security: add is_org_member and org_role sql helpers, centralize membership lookup for rls
- `a08cb4b` security: enable rls on all tables with using and with check policies, ground truth tenant isolation
- `eeec50b` test: add tenant isolation harness with asUser impersonation and two-org fixture, ground-truth test rig
- `f4d21df` test: add tier 1 tenant isolation cases 1 through 10, gate multi-tenant correctness
- `db0f949` security: fix infinite rls recursion on note_shares, simplify select policy to user_id = auth.uid()
- `2c92c06` security: add tags update policy for org admins, close schema-reviewer gap

## [2026-04-18T20:46:15Z] [lead-backend] Task: Phase 2 - Auth + org switching

**Plan:**
- Install ulid package; add getAdminSupabase() (service-role client using SUPABASE_SECRET_KEY) to lib/auth/server.ts.
- Extend lib/auth/middleware.ts: mint ULID request-id per request, forward as x-request-id response header, read org_id cookie and attach as x-org-id request header for Server Components.
- Create lib/logging/request-context.ts: AsyncLocalStorage store for { requestId, orgId, userId } + withContext HOF. Node runtime only.
- Create lib/logging/audit.ts: logAudit() reads context store, inserts into audit_logs via admin client. Never logs content, secrets, or keys.
- Create lib/security/permissions.ts: requireOrgAccess(orgId, minRole) queries memberships via admin client (authoritative, bypasses RLS), throws and logs permission.denied on failure; canEditNote() for note mutation gates; ROLE_ORDER map.
- Create lib/auth/actions.ts: loginAction, signUpAction (with first-org creation and public.users mirror insert), signOutAction. All wrapped with withContext, all log audit events.
- Implement full login and sign-up pages with react-hook-form + zod + shadcn/ui.
- Create app/(app)/org/create page, app/(app)/org/members page with direct-add-member-by-email. Create components/org-switcher.tsx with switchOrgAction. Wire app/(app)/layout.tsx with requireUser + org shell.
- Add tenant-isolation test 11: user in two orgs sees only their current-org's notes.
- Commit budget: 9 commits (Phase 2 is heavier than PLAN.md's 4-6 estimate due to auth pages).

**Exit gate (PLAN.md Phase 2):** tenant-isolation green; user in two orgs can switch and see correct scope.
**Gate commands:** `pnpm test:tenant-isolation && pnpm typecheck && pnpm lint`

**Result:**
- Installed ulid@3.0.2. Added getAdminSupabase() to lib/auth/server.ts using SUPABASE_SECRET_KEY via createClient from @supabase/supabase-js (not @supabase/ssr, which doesn't export createClient). persistSession and autoRefreshToken disabled on the service-role client.
- Extended lib/auth/middleware.ts: mints a ULID per request, attaches as x-request-id to both request headers (for Server Components) and response headers (for log correlation). Reads org_id cookie and forwards as x-org-id request header. AsyncLocalStorage NOT used in middleware (edge-compatible).
- Created lib/logging/request-context.ts: AsyncLocalStorage<RequestContext> singleton with withContext() HOF. getRequestContext() returns a safe fallback (never throws). Node runtime only.
- Created lib/logging/audit.ts: logAudit() reads context store, inserts via admin client (bypasses RLS so server-initiated events always land). Swallows failures to stderr. Never logs content, secrets, PII beyond actor/org/action/resource.
- Created lib/security/permissions.ts: requireOrgAccess(orgId, minRole) queries memberships via admin client, throws Forbidden and logs permission.denied on failure. ROLE_ORDER map (owner > admin > member > viewer). canEditNote() checks author, org role, or edit share.
- Created lib/auth/actions.ts: loginAction, signUpAction (mirrors user into public.users manually; auth trigger deferred), signOutAction. All call withContext + logAudit for every outcome. signUpAction redirects to /org/create for new users. All export runtime = 'nodejs'.
- Full login page and sign-up page at /sign-up using useActionState + useFormStatus with shadcn/ui Button/Input/Label.
- Created lib/org/actions.ts: createOrgAction (org + membership in one logical unit, sets org_id cookie), switchOrgAction (validates membership before setting cookie), addMemberAction and removeMemberAction (require admin, log member.add/remove).
- OrgSwitcher component (client, useTransition). App layout (requireUser, fetch memberships via admin client, redirect to /org/create if none, render top nav with switcher + sign-out).
- Org create page (/org/create) with slug uniqueness check. Members page with server-rendered list + AddMemberForm client component.
- withContext() is used inline in every Server Action — a separate commit was not needed. Commit 7 from the plan was merged into commits 5 and 6.
- Added tenant-isolation test 11: verifies RLS holds for a user in two orgs (non-member org returns [], member-of-both org returns rows, single-org user cannot see other-org notes).
- Gate: 20/20 tenant-isolation tests green, pnpm typecheck and pnpm lint clean.

**Commits:**
- `e554050` auth: install ulid, add getAdminSupabase service-role client to lib/auth/server.ts
- `34e4903` auth: add request-id minting and org-cookie propagation to middleware
- `b63eb2a` logging: add request-context AsyncLocalStorage store and logAudit helper
- `ffbaccd` security: add requireOrgAccess and canEditNote to lib/security/permissions.ts
- `3336ec0` auth: implement login sign-up sign-out server actions and auth pages
- `d096e8c` auth: add create-org page, org switcher, and member management server actions
- `3d9d91d` test: add org-switch scope tenant isolation case 11

## [2026-04-18T21:57:05Z] [lead-backend] Task: Phase 3A - Notes CRUD, versioning, tags, sharing

**Plan:**
- Create lib/notes/actions.ts: createNoteAction, listNotesAction, getNoteAction, softDeleteNoteAction, restoreNoteAction. All call requireOrgAccess before DB work. All wrapped with withContext + logAudit. No content in logs.
- Create saveNoteAction with full versioning and optimistic concurrency: expectedVersionNumber must match fetched current version or return { conflict: true }. Insert new note_version snapshot, update current_version_id. Log note.save with version number only.
- Create lib/notes/tag-actions.ts: createTagAction, listTagsAction, addTagToNoteAction, removeTagFromNoteAction. All gated by requireOrgAccess + canEditNote where applicable.
- Create lib/notes/share-actions.ts: grantShareAction, revokeShareAction, listSharesAction. Author or admin gate enforced by canEditNote.
- Add changeVisibilityAction: requireOrgAccess + canEditNote, validates against visibility enum, logs from/to.
- Add listVersionsAction and getVersionAction: no content in logs.
- Write tenant-isolation tests 12-15 BEFORE any UI wiring: 12 write isolation (view-only share cannot save), 13 share-grant isolation (non-author/admin cannot grant), 14 version access via soft-deleted parent, 15 tag isolation (cross-org blocked by canEditNote).
- Commit budget: ~8-9 commits per AGENTS.md section 4.

**Exit gate (PLAN.md Phase 3 merge into main):** tenant-isolation green; pnpm typecheck and lint clean.
**Gate command:** `pnpm test:tenant-isolation && pnpm typecheck && pnpm lint`

**Result:**
- Created lib/notes/actions.ts: createNoteAction (inserts note + first version snapshot, documents slim window before current_version_id is set), listNotesAction (user-scoped client so RLS applies), getNoteAction (user-scoped client + canEditNote flag in response), softDeleteNoteAction (requireOrgAccess member + canEditNote), restoreNoteAction (requireOrgAccess admin), saveNoteAction (optimistic concurrency via expectedVersionNumber — returns { conflict: true } if stale, never overwrites silently; full snapshot per save), changeVisibilityAction (validates enum, logs from/to), listVersionsAction and getVersionAction (both use user-scoped client, no content in audit logs — version number and IDs only).
- Created lib/notes/tag-actions.ts: createTagAction, listTagsAction (user-scoped), addTagToNoteAction (requireOrgAccess member + canEditNote + cross-org tag guard: tag.org_id must equal note.org_id), removeTagFromNoteAction.
- Created lib/notes/share-actions.ts: grantShareAction (upsert on conflict; confirms target is an org member before granting), revokeShareAction, listSharesAction. All use canManageShares (author or admin). No email in audit metadata.
- Tests 12-15 written before any UI wiring per plan: 12 (view-share cannot UPDATE via RLS), 13 (non-author/non-admin INSERT note_shares blocked), 14 (soft-deleted parent hides note_versions for author and member), 15 (cross-org note_tags INSERT blocked by RLS; cross-org tag application documented as application-layer guard).
- Gate: 26/26 tenant-isolation tests green, pnpm typecheck and pnpm lint clean.
- Decisions: list/get actions intentionally use user-scoped client (RLS as second gate); write actions use admin client after server-side gate runs. canEditNote is called after requireOrgAccess on all write paths. No note content ever written to audit_logs.

**Commits:**
- `5b68067` notes: start phase 3A, notes CRUD versioning tags sharing
- `992ac0f` notes: add note CRUD server actions, create list get soft-delete restore and versioning
- `e282283` notes: add tag and share server actions with org-scoped gates
- `70d280c` test: add phase 3A tenant isolation cases 12 through 15
- `56b1a6e` notes: record phase 3A result, auth and org switching complete

## 2026-04-19 — infra-deploy — Phase 3D: Dockerfile, railway.json, seed, perf harness

Plan
- Create multi-stage Dockerfile (node:20-alpine, deps/builder/runner stages, standalone output, non-root node user, HEALTHCHECK via node fetch, EXPOSE 3000, HOSTNAME=0.0.0.0).
- Create .dockerignore to exclude .git, .next, node_modules, .env*, tests, .claude, .reports, *.md from build context.
- Create railway.json with Docker builder, /api/health healthcheck path, ON_FAILURE restart policy.
- Leave .env.example unchanged per AGENTS.md §1 (no new var names invented).
- Confirm health route already correct (runtime=nodejs, force-dynamic, {ok:true}); middleware matcher already excludes /api/health — no changes needed.
- Add devDeps (tsx, @faker-js/faker, autocannon, @types/autocannon, dotenv) and seed/seed:small/perf:search scripts plus engines + packageManager fields to package.json.
- Write scripts/seed.ts: 5 orgs, 20 users, 10k notes (1k with --small), 500 versioned notes (3-5 versions each), 50 files rows (no Storage upload), ~30 shares, tags + note_tags; batched inserts (chunk 500); ON CONFLICT DO NOTHING; faker.seed(42); chicken-and-egg current_version_id resolved per batch (insert notes null, insert versions, UPDATE to latest version_id).
- Write scripts/perf-search.ts: autocannon, 10 connections, 30s, GET /search?q=<term> with auth cookie from PERF_COOKIE env or @supabase/supabase-js sign-in; prints p50/p95/p99.
- NOTE: /search route is owned by search-ai (feat/infra); perf harness will 404 until that merges -- shipped anyway as specified.
- Commit order: C1 Dockerfile+.dockerignore, C2 railway.json, C3 deps, C4 seed.ts, C5 perf-search.ts; C6 NOTES.md Result.

Result
- Created Dockerfile (multi-stage node:20-alpine: deps/builder/runner). Standalone output copied correctly: .next/standalone as root, .next/static and public/ added manually (Next does not bundle them). Non-root node user (uid 1000, pre-built in alpine). HOSTNAME=0.0.0.0 env var is critical -- without it Railway's proxy cannot reach the server. HEALTHCHECK uses Node 20 built-in fetch.
- Created .dockerignore to exclude .git, .next, node_modules, .env*, tests, .claude, .reports, *.md from build context.
- Created railway.json: DOCKERFILE builder, /api/health healthcheck, ON_FAILURE restart with 10 retries.
- Left .env.example unchanged per AGENTS.md §1. PORT and NODE_ENV are baked into the Dockerfile as operational defaults, not runtime config.
- Health route (app/api/health/route.ts) was already correct: runtime=nodejs, force-dynamic, {ok:true}. Middleware matcher already excluded /api/health. No changes needed.
- Added devDeps: @faker-js/faker, tsx, autocannon, @types/autocannon, dotenv. Added seed/seed:small/perf:search scripts. Added engines (node>=20) and packageManager (pnpm@10.33.0).
- Wrote scripts/seed.ts: 5 orgs, 20 users, 10k/1k notes, 500/50 versioned notes (3-5 versions), 50 files rows (path-only, no Storage upload), 30 shares, 5 tags/org + note_tags. Batched inserts at chunk 500. ON CONFLICT DO NOTHING (idempotent). faker.seed(42) (deterministic). Both auth.users and public.users seeded (auth trigger deferred).
- Chicken-and-egg for current_version_id: omit column from INSERT (defaults to NULL), insert versions, then run per-note UPDATE. postgres.js sql() helper doesn't accept null in VALUES arrays; used column omission instead.
- Wrote scripts/perf-search.ts: autocannon, 10 connections, 30s, GET /search?q=<term>. Cookie from PERF_COOKIE env or auto-obtained via supabase-js sign-in. Note: /search route (search-ai, feat/infra) doesn't exist yet on this branch; harness returns 404 until that merges.
- typecheck and lint clean on all deliverables.

Blockers / pivots
- postgres.js sql() Values helper (EscapableArray) does not accept Date or null in its array parameter type. Fixed by converting all dates to ISO strings (iso()/now() helpers) and omitting nullable-with-null-intent columns from INSERT column lists, relying on DB defaults.
- Per-note UPDATE for current_version_id: originally planned a FROM-VALUES batch update but nested sql`` in arrays is not supported by postgres.js. Switched to individual UPDATE per note per batch, which is simpler and correct.

Commits
- `a3bdfab` deploy: add multi-stage Dockerfile and .dockerignore, standalone runtime for Railway
- `037d4ff` deploy: add railway.json with Docker builder and health check path
- `7cc3e54` deps: add seed and perf tooling (tsx, faker, autocannon, dotenv)
- `e9ba0dc` scripts: add seed.ts with 10k-note generator and --small flag
- `8031fc5` scripts: add perf-search.ts autocannon harness for /search path
