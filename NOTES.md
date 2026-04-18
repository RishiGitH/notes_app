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
