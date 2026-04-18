# AGENTS.md — Project Constitution

This file is read on startup by every agent (Claude Code, subagents, parallel
workers) operating in this repository. It defines the project rules, security
invariants, file layout, conventions, and the agent roster. When an agent's
behavior or output conflicts with this document, this document wins.

This is a single-author, agent-assisted build of a multi-tenant
collaborative notes application. It is built deliberately, with
security as the primary correctness criterion. Speed is achieved by
parallelizing agents across non-overlapping slices, not by skipping
review.

**Document roles:** `AGENTS.md` is the rules (this file). `PLAN.md`
is the phases and gates. `UI.md` is the page and component
contract. `NOTES.md` is the live work journal (append-only,
per section 5). When in doubt, rules in `AGENTS.md` beat anything else.

---

## 1. Stack (locked — do not propose alternatives)

- **Framework:** Next.js 16, App Router, React Server Components by default.
- **Language:** TypeScript, `strict: true`, no implicit `any`, no `as any`
  except at clearly-commented FFI boundaries.
- **Runtime:** Node 20 LTS. Package manager: `pnpm`.
- **Auth + DB + Storage:** Supabase. Auth via `@supabase/ssr` (never the
  deprecated `@supabase/auth-helpers-*`). DB is Postgres. Storage is
  Supabase Storage with bucket-level + object-level RLS.
- **ORM:** Drizzle ORM with `drizzle-kit` for migrations. Postgres driver:
  `postgres` (not `pg`). Pooler URL (port 6543) for the app, direct URL
  (port 5432) for migrations only.
- **UI:** Tailwind CSS, shadcn/ui components, lucide-react icons.
- **Forms / validation:** `react-hook-form` + `zod` everywhere. No ad-hoc
  validation.
- **Markdown rendering:** `react-markdown` with `remark-gfm` and
  `rehype-sanitize`. Never `rehype-raw`. Never `dangerouslySetInnerHTML`
  for user content.
- **Diffs:** `diff` library for computation, `react-diff-viewer-continued`
  for display.
- **Tables:** `@tanstack/react-table`.
- **AI:** `@anthropic-ai/sdk`. All model output validated against a `zod`
  schema before persistence or render. Default model IDs:
  `claude-opus-4-7` for planning and security-critical execution;
  `claude-sonnet-4-6` for bulk implementation. Expose via `ANTHROPIC_MODEL`
  env var so the ID is swappable without code changes. Never hard-code a
  deprecated model ID (`claude-3-5-*`, `claude-opus-4-0`, etc.).
- **Tests:** Vitest. Optional Playwright smoke test only if time permits.
- **Deploy:** Docker (multi-stage, `output: 'standalone'`) → Railway.
- **Observability:** application-level audit log table in Postgres;
  request-id propagation in middleware; structured stdout logs.

**Environment variable contract (canonical names — do not invent new ones):**

| Variable | Visibility | Value locally | Value in production |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Public | Supabase project URL | same |
| `SUPABASE_PUBLISHABLE_KEY` | Server-only (SSR) | Legacy anon JWT | `sb_publishable_...` |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Public (browser) | Same value as above | same |
| `SUPABASE_SECRET_KEY` | **Server-only** | Legacy service_role JWT | `sb_secret_...` |
| `DATABASE_URL` | Server-only | Pooler URL (port 6543) | same |
| `DIRECT_URL` | Server-only | Direct URL (port 5432) | same |
| `ANTHROPIC_API_KEY` | Server-only | API key | same |
| `ANTHROPIC_MODEL` | Server-only | `claude-sonnet-4-6` | same |
| `APP_URL` | Public | `http://localhost:3000` | Railway URL |

Why two values for `SUPABASE_PUBLISHABLE_KEY` / `SUPABASE_SECRET_KEY`:
the Supabase CLI (used for local dev and tests) supports only the legacy
JWT-based keys. The hosted Supabase platform (production) prefers the new
`sb_*` scheme. The env var names stay the same either way — only the
values differ. The security rule in section 2 item 3 applies to whichever value
is present.

---

## 2. Security invariants (non-negotiable)

These are correctness requirements, not style preferences. A change that
violates any of them is a bug.

1. **Every tenant-scoped table has an `org_id` column.** No exceptions. If a
   row belongs to a tenant, the tenant must be on the row.
2. **RLS is enabled on every table holding user or tenant data**, with
   explicit `USING` and `WITH CHECK` clauses for every operation
   (SELECT/INSERT/UPDATE/DELETE).
3. **The Supabase secret key is server-only.** (Called "secret key"
   in the current Supabase API key model — `sb_secret_...`; legacy
   name was `service_role`.) It must never be imported by any module
   that ships to the client bundle, never used inside any Server
   Action or route handler that takes a user-supplied identifier
   without a prior server-verified authorization check, and never
   used to "bypass" RLS for convenience.
4. **Every Server Action and route handler that reads or writes
   tenant-scoped data calls `requireOrgAccess(orgId, minRole)` before any
   DB work.** The function lives in `lib/security/`. Client-supplied
   `orgId` is verified against the session, never trusted.
5. **AI calls receive exactly one note's content per request.** No
   cross-tenant data is concatenated into a single prompt. The model
   never receives secret-key-fetched rows.
6. **All LLM output is validated against a `zod` schema** before being
   stored, before being rendered, and before being passed to any tool
   call. Unparseable output is rejected, not "best effort" parsed.
7. **User-authored content is rendered through the sanitized markdown
   pipeline only.** No `dangerouslySetInnerHTML` for user content,
   anywhere. URL fields go through a scheme allowlist (`http`, `https`,
   `mailto`).
8. **Access to children of a `notes` row (`note_versions`, `note_shares`,
   `note_tags`, attachments, AI summaries) resolves authorization by
   joining to the parent `notes` row** and checking *current* visibility,
   share grants, and role — never the historical state at the time the
   child was created.
9. **File uploads validate MIME by sniffing bytes**, not by trusting the
   client `Content-Type`. Size limits enforced server-side. Stored paths
   are `<org_id>/<note_id>/<random>` and never derived from user-supplied
   filenames.
10. **Search queries scope by `org_id` in SQL** in addition to RLS.
    Defense in depth. Parameterized only — no `sql.raw` with user input.
11. **Logging never contains** secrets, API keys, full note content, or
    PII beyond user id + org id + action. Errors are logged with stack +
    request id, not request body.
12. **Soft-deleted parents hide all children.** A soft-deleted note hides
    its versions, shares, tags, attachments, and AI summaries from every
    code path.

---

## 3. File layout

```
app/
  (auth)/login/                 # public auth routes
  (app)/                        # authenticated layout group
    layout.tsx                  # shell: org switcher, sidebar
    notes/
    notes/[noteId]/
    notes/[noteId]/versions/
    notes/[noteId]/versions/[versionId]/
    search/
    org/settings/
    org/members/
  api/
    health/route.ts             # liveness for Railway
lib/
  db/
    schema.ts                   # Drizzle schema, all tables
    client.ts                   # pooled + direct clients
    migrations/                 # SQL migrations from drizzle-kit
  auth/
    server.ts                   # getServerSupabase, getSession, requireUser
    client.ts                   # browser supabase client
    middleware.ts               # session refresh helper
  security/
    permissions.ts              # roles, requireOrgAccess, canEditNote, ...
  ai/
    client.ts                   # Anthropic client factory
    summarize.ts                # summarizer Server Action
    schemas.ts                  # zod schemas for model output
  logging/
    audit.ts                    # logAudit({...})
  validation/                   # shared zod schemas
  utils/
drizzle/                        # generated migrations + meta
scripts/
  seed.ts                       # 10k-note seeder
tests/
  tenant-isolation/             # the gate suite, see section 6
  integration/
  unit/
docker/
  Dockerfile
.claude/
  agents/                       # subagent definitions, see section 7
  commands/                     # slash commands
middleware.ts                   # root middleware
AGENTS.md                       # this file
PLAN.md                         # schedule
UI.md                           # UI choices
NOTES.md                        # agent work journal — append-only
BUGS.md                         # confirmed bugs found and fixed
REVIEW.md                       # final personal review notes
AI_USAGE.md                     # final agent-utilization writeup
DEFERRED.md                     # explicit out-of-scope decisions
```

---

## 4. Git protocol

- One commit per logical unit of work. A logical unit is a feature,
  a table + its RLS, a security helper + its tests, a bug fix, or a
  dependency group install. It is **not** every file save, every
  individual `pnpm add`, or every stub file. Group related installs
  and stubs into a single commit. Do not commit each bullet of a
  NOTES.md plan as its own commit.
- Rough commit budget per phase (sanity check, not a hard cap):
  Phase 0: 4-6. Phase 1: 6-10. Phase 2: 4-6. Phase 3 per track:
  15-25. Phase 4: 5-10. Phase 5: 3-5. Exceeding these means you are
  committing too granularly.
- Commit message format:
  `<scope>: <what>, <why>`
  Examples:
  - `db: add note_versions table, store historical content per note`
  - `security: tighten RLS on note_shares, child must join parent`
  - `ai: validate summarizer output via zod, reject unparseable model output`
- Commit messages are plain ASCII. No `§`, no em-dashes (`—`), no
  phase number references. Describe the change itself.
- Branches:
  - `main` — lead/backend track
  - `feat/ui` — UI track (separate worktree)
  - `feat/infra` — search + files + AI track (separate worktree)
  - `feat/deploy` — Docker + Railway + seed track, if split from
    `feat/infra`.
  - Other branches: `fix/*`, `chore/*`.
- Never squash branches into one commit on merge. Preserve history.
- **All merges between parallel branches are `git merge --no-ff`** so
  the parallel structure is visible in `git log --graph`. This graph
  is a deliverable artifact of parallelism.
- Never force-push `main`.
- Before merging a parallel branch into `main`, run
  `pnpm test:tenant-isolation`. If it fails, do not merge.
- Dependency discipline: any `pnpm add` must produce a lockfile change
  that ships in the same commit. No lockfile-less installs.
- Environment variables: all names are defined once in `.env.example`.
  No new env var is introduced without adding it there in the same
  commit. Client-visible vars are prefixed `NEXT_PUBLIC_`.
- Runtime pinning: any route handler or Server Action that calls
  `logAudit` or otherwise relies on `AsyncLocalStorage` is Node
  runtime only (`export const runtime = 'nodejs'`), never edge.
- `middleware.ts` has an explicit `matcher` excluding `/api/health`,
  static assets, and favicon. Never a bare `matcher: '/:path*'`.

---

## 5. NOTES.md protocol

`NOTES.md` is the live work journal, authored by the agent actually
doing the work, as the work happens. Never authored on demand by an
external command. Append-only, chronological. It shows how decisions
were made and where the rough edges were — authenticity over polish.

This is a **standing rule**, not a triggered workflow. Every agent —
implementer or review — follows it without being reminded per task.

- Before starting any task, the executing agent appends a heading and
  a Plan section:

  ```
  ## YYYY-MM-DD HH:MM — <agent-name> — <one-line title>

  Plan
  - <bullet>
  - <bullet>
  ```

  Timestamp is current local time, minute-precision. The agent name
  is the executing agent's name (`lead-backend`, `ui-builder`,
  `search-ai`, `infra-deploy`, `security-reviewer`, etc.), not the
  caller's.

- After finishing the task, the same executing agent appends under
  the same heading (never editing prior content):

  ```
  Result
  - what was done
  - decisions and why
  - what was deferred (to DEFERRED.md or a follow-up)

  Blockers / pivots
  - things tried that didn't work
  - mid-task changes of approach
  - (skip this section if the task was perfectly linear — rare)

  Commits
  - `<short-sha>` <subject>
  - `<short-sha>` <subject>
  ```

  The Commits list is every commit produced by this task, in order,
  using 7-character short SHAs from `git log --oneline`. Subject line
  only, not the full message body. Review-only agents
  (security-reviewer, schema-reviewer, observability-reviewer,
  scope-cutter, bug-verifier) omit the Commits section since they
  produce no commits. The NOTES.md Result commit itself is not listed
  in its own Commits block.

- **Authenticity over polish.** If something took two attempts, say
  so. If a plan bullet got dropped mid-task, note it in
  `Blockers / pivots`. A journal with zero false starts across a
  24-hour build is not a journal, it's a press release. The goal is
  to show how decisions were actually made.

- Write in third person as the executing agent. Never include raw
  user prompts. Never edit or "clean up" prior entries — append only.

- If a task was attempted but not finished, still append a Result,
  describing where it stopped and why. Abandoned tasks are
  documented, not deleted.

- **Concurrent appends.** When two worktrees append to NOTES.md at
  nearly the same time and git produces a merge conflict on this
  file, the resolution is always: keep both entries, ordered by
  their timestamps. Never delete an entry to resolve a conflict.

- **Inter-agent requests.** When an agent is blocked on work owned
  by another agent (e.g. `ui-builder` needs a new Server Action
  from `lead-backend`), append a block of the form:

  ```
  ## YYYY-MM-DD HH:MM — <requesting-agent> — Request to <owning-agent>: <title>

  Need: <interface or outcome>
  Why: <one line>
  Blocking: <task this is blocking>
  ```

  The owning agent responds in a new standard Task entry referencing
  the request.

---

## 6. Testing protocol

Tests are gates, not coverage targets. Three tiers:

**Tier 1 — Tenant isolation (`tests/tenant-isolation/`).** The
non-negotiable suite. Must be green before merging any branch into
`main` and before any deploy.

Required cases:
- User A in Org 1 cannot read Org 2's notes through any API path.
- User A cannot read a private note in their own org if they are not
  the author and not a share recipient.
- User A cannot update a note they have view-only access on.
- User A cannot read versions of a note they cannot read currently.
- User A cannot download files from Org 2 (direct path or signed URL).
- User A cannot generate, view, or accept an AI summary for an Org 2 note.
- User A cannot invite themselves into Org 2.
- Search executed by User A returns zero rows from Org 2.
- Role downgrade revokes write access immediately on the next request.
- Soft-deleted notes are invisible from every list / detail / search /
  version / file / AI path.

Run with: `pnpm test:tenant-isolation`.

**Tier 2 — Critical-path integration (`tests/integration/`).**
- Sign up → create org → create note → edit → version diff displays
  correctly.
- Upload file → download via signed URL → unauthenticated download fails.
- Generate AI summary → partial accept → only accepted fields merged.
- Search returns expected results on seeded data.

**Tier 3 — Sampled units (`tests/unit/`).**
- Diff computation, permission helpers, AI output schema validation,
  MIME sniffing utility.

Rule: any change to auth, RLS, AI, or file uploads requires `test-writer`
to add or update a test before commit. The corresponding `test-skeptic`
review is strongly recommended for security-critical changes.

---

## 7. Agent roster

Agents are split into **implementers** (write code, run in their own git
worktree) and **review subagents** (read-only or test-only, invoked on
demand). All subagent definitions live in `.claude/agents/*.md`. Every
named agent below corresponds to a file in that directory; every file
corresponds to a named agent here. Agents not listed here are not used.

### Implementers (parallel, one per worktree)

1. **lead-backend** (Opus). Owns schema, migrations, RLS, auth,
   Server Actions, security-critical helpers, and any code touching
   Supabase secret key. Works on `main`.
2. **ui-builder** (Sonnet). Owns pages, components, layouts, styling,
   client-side state. Works on `feat/ui` in a separate worktree.
   Forbidden from editing `lib/security/`, `lib/auth/`, `lib/db/schema.ts`,
   `middleware.ts`, or any RLS migration. Enforced by a pre-commit
   path-allowlist check the agent runs itself.
3. **search-ai** (Sonnet). Owns Postgres FTS, file upload pipeline,
   Anthropic summarizer Server Action, and the storage RLS policy SQL
   (coordinated with `lead-backend`). Works on `feat/infra`.
4. **infra-deploy** (Sonnet). Owns multi-stage Dockerfile, `railway.json`,
   `.env.example`, the `/api/health` route, and `scripts/seed.ts`.
   Works on `feat/deploy` (or late on `feat/infra` after `search-ai`
   stabilizes its interfaces).

### Review subagents (read-only or test-only; never edit production source)

5. **security-reviewer** (Opus). Adversarial diff review. Output:
   structured findings with file, line, exploit, suggested test, and
   fix. Never edits source. Callable via `/review-diff`.
6. **schema-reviewer** (Sonnet). Reviews migrations and Drizzle
   schema for missing indexes, missing FKs, missing `org_id`, wrong
   cascade rules, and RLS policy gaps.
7. **test-writer** (Sonnet). Generates Vitest tests for a given
   diff, emphasizing the tenant-isolation matrix. Writes only under
   `tests/`. Invoked by `search-ai` and other implementers on demand.
8. **bug-verifier** (Opus). The oracle for `BUGS.md`. Given a
   candidate finding, writes a failing Vitest test that demonstrates
   it. If no failing test can be written, the claim is downgraded to
   a "suspicion" and does not enter `BUGS.md`. Callable via
   `/verify-bug` or via `/triage` for batch verification. When writing
   a confirmed entry into `BUGS.md`, read the format and existing
   entries at the top of that file first and match the tone exactly —
   plain English, no bullet lists, two short paragraphs per bug.
9. **observability-reviewer** (Sonnet). Audits logging coverage:
   every mutation, auth event, permission denial, and AI call must
   produce a row in `audit_logs` with no PII / secret / content
   leakage. Invoke directly: *"use the observability-reviewer
   subagent on the full repo."* Run once in Phase 4.
10. **scope-cutter** (Opus). Given current state + remaining risk,
    decides what to ship, what to ship as a degraded version, and
    what to move to `DEFERRED.md`. Invoke directly: *"use the
    scope-cutter subagent."* Run once in Phase 4.

Per-agent prompt template: `.claude/agents/<name>.md`. Each template
references this document by section number. Other review modes
(planning, test-coverage critique, doc drafting) are handled as
direct prompts to the relevant implementer agent and are documented
in `AI_USAGE.md` after the fact.

---

## 8. Logging requirements

- `audit_logs` table receives a row for every:
  - sign-in, sign-out, password reset, magic-link request
  - org create, org switch, member invite/accept/remove, role change
  - note create / update / delete / restore
  - share grant / revoke
  - file upload / download (with object key, not contents)
  - AI summarize request, accept (full or partial), reject
  - permission denial returned by `requireOrgAccess`
  - any 5xx error (with request id)
- Required fields: `actor_id`, `org_id`, `action`, `resource_type`,
  `resource_id`, `request_id`, `metadata` (jsonb), `created_at`.
- Forbidden in any log line, structured or not: secrets, API keys, full
  note content, file bytes, raw model output, prompts.
- A request id (ULID) is generated in `middleware.ts` and propagated to
  every log line via async context (`AsyncLocalStorage`).

---

## 9. Scope discipline

If a feature, refinement, or "nice-to-have" is not explicitly listed in
`PLAN.md`, the default answer is **no**. Add it to `DEFERRED.md` with a
one-line reason and move on.

Out of scope for this build (recorded explicitly so agents do not
re-litigate):

- Real-time collaborative editing (CRDT, OT, websockets for editor sync).
- Rich-text WYSIWYG editor (markdown source + preview is sufficient).
- Email-based invites with verification flow (direct add by email
  address by an admin is sufficient).
- File versioning (files are attached to notes, not to versions).
- Full-text search across file contents (only note title + body).
- Multi-language UI (English only).
- Mobile-native apps; PWA install; offline mode.
- SSO, SAML, SCIM provisioning.
- Billing, usage limits, plan tiers.
- Custom domains per org.

---

## 10. Definition of done

A feature is done when **all** of the following are true:

1. Code is committed with a message per section 4.
2. `pnpm typecheck && pnpm lint` is clean.
3. `pnpm test:tenant-isolation` is green if the change touched any
   tenant-scoped path.
4. A `NOTES.md` "Result" entry exists for the task.
5. If the change touches auth, RLS, AI, file uploads, or search:
   `security-reviewer` has reviewed the diff and any findings are
   either fixed or recorded in `BUGS.md` with a fix commit SHA.
6. Logging requirements per section 8 are satisfied for any new mutation,
   auth event, permission denial, or AI call.
