# AI_USAGE.md — Agent utilization write-up

## Agent roster (actually used)

| Agent | Model | Role | Where I overrode / intervened |
|---|---|---|---|
| lead-backend | Claude Opus 4 | Schema, RLS policies, auth middleware, all Server Actions, security-critical code, migrations | Caught RLS recursion on `note_shares` (db0f949), caught cross-tenant `org_id` mutation hole on `notes` (023e167) and 4 other tables (198c27f), caught `getSession` trust gap (3f6b000), caught `canManageShares` missing org_id scope (f0255b5) |
| ui-builder | Claude Sonnet 4 | All app pages and components — Notion-style shell, notes list, note detail tabs, diff viewer, search page, org settings, auth pages | Shadcn primitive batch install was incomplete (alert-dialog missing); caught and fixed before typecheck. MarkdownBody uses `rehype-sanitize` — I verified `rehype-raw` was NOT included. |
| search-ai | Claude Sonnet 4 | FTS migration (0008), file upload pipeline, AI summarizer, search action, Storage RLS | Caught stored XSS via `ts_headline` (`dangerouslySetInnerHTML` on raw snippet output) — switched to STX/ETX sentinel pattern (a324674). Caught file UUID enumeration oracle (7bba1db). Caught AI content cap missing (f0255b5). |
| infra-deploy | Claude Sonnet 4 | Dockerfile, railway.json, seed script, perf harness | Caught hardcoded `PORT=3000` in Dockerfile — switched to ENV var. Caught DO inference endpoint hardcoded in server code (cfaee11). `perf-search.ts` 404'd on initial deploy; unblocked after search merged. |
| security-reviewer | Claude Opus 4 | Adversarial diff review on every meaningful phase boundary; produced structured findings under `.reports/security/` | Findings were triaged via bug-verifier before any fix landed. 11 of ~22 flags were real bugs (in BUGS.md). 6 were false positives (agent misread Next.js server/client boundary). 3 were style. 2 bugs were caught by me on independent re-read that the agent missed (F-0010 uuid creep-back, F-0014 tag FTS gap). |
| schema-reviewer | Claude Sonnet 4 | Migration review: indexes, FKs, cascade rules, org_id presence on every table | Caught missing `tags` UPDATE policy (2c92c02). Found no missing org_id columns (all present per Phase 1 schema). |
| observability-reviewer | Claude Sonnet 4 | Logging coverage: every auth event, mutation, AI call, permission denial, 5xx | Caught O-0002: 5xx audit class missing from download route (fixed 555f057). Flagged O-0001: `acceptSummary` admin lookup before `withContext` — acknowledged in REVIEW.md, not a security issue. |
| test-writer | Claude Sonnet 4 | Vitest tests from diffs — tenant-isolation suite, unit schema tests, AI integration tests | I reviewed every test for over-mocking. The `asUser()` impersonation harness uses real Postgres JWT-claim injection — no mocking of the database. |
| bug-verifier | Claude Opus 4 | Wrote failing tests to confirm or reject security-reviewer findings | Used as the oracle: "if you can't write a failing test, it's not a real bug." Eliminated 6 false positives this way. |
| scope-cutter | Claude Opus 4 | Phase 4 triage — what to ship / degrade / defer | Cut: cmd-K palette, rich-text editor, file versioning, real-time collab, email invites. Kept: all hard requirements. Output went into DEFERRED.md. |

## Parallelization timeline

```
Hours 0–0.5  [lead-backend]  Phase 0: scaffold, health route, root redirect
Hours 0.5–3  [lead-backend]  Phase 1: full schema, RLS, tenant-isolation gate (serial — must be correct before split)
Hours 3–5    [lead-backend]  Phase 2: auth, middleware, org CRUD, org switcher
Hours 5–14   PARALLEL (3 git worktrees):
  [lead-backend]  Phase 3A: notes CRUD, versioning, tags, sharing, 15 tenant-isolation tests
  [ui-builder]    Phase 3B: all 13 UI pages, shadcn shell, diff viewer, search placeholder
  [search-ai]     Phase 3C: FTS migration + trigger, file pipeline, AI summarizer, Storage RLS request
  [infra-deploy]  Phase 3D (concurrent with 3C): Dockerfile, railway.json, seed, perf harness
Hours 14–16  [lead-backend]  Merge + Storage RLS response (0009), seed run, deploy smoke test
Hours 16–20  [security-reviewer + bug-verifier] Phase 4 hardening (parallel review while lead fixes)
Hours 20–22  Sequential deploy: Railway push, production migration, production seed, smoke test
Hours 22–24  Sequential docs: AI_USAGE.md, REVIEW.md, BUGS.md final pass, demo prep
```

Git branch history (compressed):
```
main          807e2e3..f14abbb  (lead-backend, infra patches, post-deploy fixes)
feat/ui       04dcc85..c42468c  (ui-builder, merges back to main at hour 14)
feat/infra    87ec55e..8031fc5  (search-ai/infra-deploy, merges back to main at hour 14)
```

## What the agents got right

- Schema correctness (89475bf–8dd57c7): all 11 tables had `org_id NOT NULL` without prompting; partial indexes on `deleted_at IS NULL` on first pass.
- RLS child-table EXISTS-join pattern (a08cb4b): agent independently chose to resolve child-table auth via parent note join rather than flat `is_org_member(org_id)` — the safer but harder pattern.
- Server Action structure (3336ec0–e282283): `requireUser()` → `requireOrgAccess()` → `canEditNote()` → DB work → `logAudit()` on every action without exception; no action skipped the gate.
- FTS query safety (126050b): `plainto_tsquery` (not `to_tsquery`) plus explicit `eq(notes.orgId, orgId)` defense-in-depth on first pass — matched AGENTS.md requirement exactly.
- Dockerfile standalone output (a3bdfab): `HOSTNAME=0.0.0.0` ENV var was present without being told — agent knew Railway's proxy requires it.
- XSS snippet defense (a324674): STX/ETX sentinel pattern for `ts_headline` is non-obvious; agent produced it correctly when the stored-XSS bug was raised.

## What the agents got wrong

- **RLS recursion** (db0f949): `note_shares` SELECT policy checked `notes`, which checked `note_shares` — circular. Agent didn't detect the cycle during initial policy authoring.
- **Cross-tenant `org_id` mutation** (023e167, 198c27f): RLS UPDATE policies on `notes`, `note_shares`, `memberships`, `tags`, `ai_summaries` didn't block an `org_id` field change. Agent didn't add immutable-key triggers unprompted.
- **`getSession()` trust** (3f6b000): initial `requireUser()` called `getSession()`, which reads the JWT locally without server validation. Agent generated this despite AGENTS.md §2 explicitly banning it. Caught in Phase 2 review.
- **`uuid` package creep** (ece63cf): uuid was banned in AGENTS.md after first removal (low). It came back in Phase 3A via a different agent session that didn't re-read the ban. Demonstrates cross-session drift; AGENTS.md pin wasn't enough alone.
- **Missing tag search** (0011): tags were never added to `search_tsv`. Assignment explicitly requires tag search. Agent on Phase 3C built title+content only; no agent flagged the gap. Caught by user testing post-deploy. Fixed in migration 0011.
- **`dangerouslySetInnerHTML` on raw FTS snippet** (a324674): search-ai agent rendered `ts_headline` output via `dangerouslySetInnerHTML` without escaping. Classic stored XSS. Caught by security-reviewer on Phase 4 sweep.
- **File UUID enumeration oracle** (7bba1db): download route fetched file row via service-role before auth check, leaking whether any UUID existed system-wide via 403 vs 404 difference. Caught by security-reviewer.
- **DO inference endpoint hardcoded** (cfaee11): infra agent hardcoded the DigitalOcean inference URL in server code instead of reading from env var. Caught in Railway deploy smoke test.

## Where I intervened

- Wrote the security-reviewer subagent prompt myself (`.claude/agents/security-reviewer.md`) — the generic "review this diff" framing didn't produce adversarial enough output on first pass.
- Manually read every RLS policy file after Phase 1 (6 files, ~2h) with a fresh Claude session open to explain each line. Found the RLS recursion myself before security-reviewer ran.
- Chose the `plainto_tsquery` over `to_tsquery` constraint in AGENTS.md §2 item 10 — agents default to the more powerful but injection-prone `to_tsquery`.
- Manually verified no `service_role` key leaks to the client bundle: `grep -r "service_role\|SECRET_KEY" app/ components/` — clean.
- Caught 2 bugs the security-reviewer agent missed: F-0010 (uuid creep-back) and F-0014 (tag FTS gap). Labeled "human-caught" in BUGS.md.
- Overrode scope-cutter on one item: it proposed degrading the AI partial-accept to full-accept-only. I kept partial-accept because the assignment calls it out explicitly ("users can selectively accept output").

## What I did not trust agents to do

- **RLS policies on child tables.** Drift between parent and child is the top bug class. I read each policy myself.
- **AI prompt construction.** User content flows into the model. I audited `lib/ai/summarize.ts` system prompt and context-assembly code line by line, confirmed only the single note's content is passed per call.
- **File upload path construction.** Server-built paths only (`<org>/<note>/<ulid>-<safename>`). I verified `lib/files/sanitize.ts` strips all path separators.
- **`service_role` import paths.** Grepped the entire tree: `grep -r "service_role\|SUPABASE_SECRET_KEY" app/ components/` — confirmed only `lib/auth/server.ts` and `lib/logging/audit.ts` import the admin client, both server-only.
- **Test quality.** Every test written by test-writer was read by test-skeptic and by me for over-mocking. The Tier-1 tenant isolation suite uses real Postgres JWT impersonation — no database mocks.

## Tooling

- Claude Code CLI in 4 terminal tabs on git worktrees for parallel tracks:
  - `main/` — lead-backend
  - `../notes_app-ui/` — ui-builder on `feat/ui`
  - `../notes_app-infra/` — search-ai + infra-deploy on `feat/infra`
- Subagent roles defined in `.claude/agents/` and invoked via `.claude/commands/` slash commands: `/review-diff`, `/verify-bug`, `/triage`, `/tenant-check`, `/scope-cut`, `/observability-check`.
- Claude Opus 4 for: lead-backend, security-reviewer, bug-verifier, scope-cutter.
- Claude Sonnet 4 for: ui-builder, search-ai, infra-deploy, schema-reviewer, observability-reviewer, test-writer.
- Parallel worktrees eliminated merge conflicts during the 9-hour parallel phase. Every branch was merged only after `pnpm test:tenant-isolation` passed on the branch.
