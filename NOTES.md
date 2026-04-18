# NOTES.md — Agent Work Journal

Append-only, chronological. Authored by the executing agent of each
task per `AGENTS.md` section 5. Never edited retroactively; never cleaned
up.

Entry format (standing rule, not triggered externally):

```
## [YYYY-MM-DDTHH:MM:SSZ] [<agent-name>] Task: <one-line title>

**Plan:**
- ...

**Result:**
- what was done
- decisions taken and why
- what was deferred
- blockers encountered

**Commits:**
- `<short-sha>` <commit subject>
```

Merge conflicts on this file resolve by keeping both entries in
timestamp order, never delete.

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
