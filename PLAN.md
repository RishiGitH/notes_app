# PLAN.md — Architecture and Agentic Approach

This document describes **how the work is structured** — the
architecture of the system, the division of labor across agents,
the gates between phases, and the non-negotiables. It does not
prescribe a clock; ordering and correctness are the reviewable
part.

For the detailed rules that govern every agent, see `AGENTS.md`.
For the UI contract, see `UI.md`.

---

## 1. Architecture at a glance

```
                 ┌──────────────────────────────────────────┐
  Browser  ───▶  │  Next.js 16 App Router (RSC + Actions)   │
                 │  ┌────────────────────────────────────┐  │
                 │  │ middleware.ts (session, request-id)│  │
                 │  └──────────────┬─────────────────────┘  │
                 │                 ▼                        │
                 │  Server Components / Server Actions      │
                 │    └─ requireOrgAccess(orgId, minRole)   │
                 └──────────────┬───────────────────────────┘
                                │
          ┌─────────────────────┼─────────────────────┐
          ▼                     ▼                     ▼
  ┌──────────────┐     ┌───────────────┐     ┌────────────────┐
  │  Supabase DB │     │ Supabase Stg. │     │ Anthropic API  │
  │  + RLS       │     │ notes-files/  │     │ (single-note   │
  │  + Drizzle   │     │ <org>/<note>/ │     │  summary)      │
  └──────────────┘     └───────────────┘     └────────────────┘
```

**Defense in depth.** Every tenant-scoped access is checked in
two places: Postgres RLS (the ground truth) and application-layer
`requireOrgAccess` (first line of defense, logs denials to
`audit_logs`). Either alone is insufficient; both together are
the posture.

**Audit trail.** Every mutation, auth event, permission denial,
and AI call writes a row to `audit_logs` with `actor_id`,
`org_id`, `action`, `resource_type`, `resource_id`, `request_id`,
and `metadata`. No content, no keys, no secrets. Request ids
(ULIDs) are minted in `middleware.ts` and propagated via
`AsyncLocalStorage` to every log call.

---

## 2. Data model (tenant discriminator: `org_id`)

Every tenant-scoped table carries `org_id NOT NULL` and has RLS
policies that scope reads and writes to the authenticated user's
memberships.

- `users` (mirror of `auth.users`)
- `organizations`
- `memberships` (user ↔ org with role: owner / admin / member / viewer)
- `notes` (`org_id`, `author_id`, `current_version_id`,
  `visibility`, `deleted_at`)
- `note_versions` (full snapshots of title, content, tags)
- `note_shares` (`note_id`, `user_id`, `view | comment | edit`)
- `tags` + `note_tags` (tag names unique per org)
- `files` (`org_id`, `note_id`, `uploader_id`, `path`, `mime`, `size`)
- `ai_summaries` (draft + accepted fields)
- `audit_logs`

**Child access resolves via parent.** Access to `note_versions`,
`note_shares`, `note_tags`, `files`, `ai_summaries` always
resolves permission by joining to the parent `notes` row and
checking **current** visibility, share grants, and role — never
historical state. Soft-deleted parents hide every child.

---

## 3. Division of labor (agentic approach)

Work is split so that non-overlapping slices can run in parallel
terminals (each in its own git worktree) without stomping on
shared files. Four implementer roles, six review / judgment
roles.

### Implementer tracks (parallel)

| Track  | Agent          | Branch        | Owns                                                |
|--------|----------------|---------------|-----------------------------------------------------|
| Core   | `lead-backend` | `main`        | Schema, RLS, auth, Server Actions, security helpers |
| UI     | `ui-builder`   | `feat/ui`     | Pages, components, styling, client state            |
| Data   | `search-ai`    | `feat/infra`  | Postgres FTS, file pipeline, AI summarizer          |
| Deploy | `infra-deploy` | `feat/deploy` | Dockerfile, Railway config, seed, health route      |

`ui-builder` is forbidden from editing `lib/security/**`,
`lib/auth/**`, `lib/db/schema.ts`, `middleware.ts`, and any RLS
migration. Enforced by the pre-commit path-allowlist check
documented in `.claude/agents/ui-builder.md`.

Hand-offs between tracks go through `NOTES.md` "Request to
`<agent>`" blocks (AGENTS.md section 5).

### Review / judgment roles (invoked on demand)

- `security-reviewer` — diff-scoped adversarial review
- `schema-reviewer` — migrations, indexes, cascade rules
- `observability-reviewer` — logging coverage, PII leakage (invoke directly)
- `test-writer` — Vitest tests for a diff; also invoked by implementers
- `bug-verifier` — the oracle for `BUGS.md` (a claim is a bug
  only if a failing test can be written)
- `scope-cutter` — triage at the end of Phase 4 (invoke directly)

All review output lands in `.reports/` under structured
subdirectories. `BUGS.md` entries require a `bug-verifier`
CONFIRMED verdict; anything else is a suspicion or a known
risk recorded in `REVIEW.md`.

### Slash commands wrap the common workflows

- `/phase-start <id>` — open a phase; append NOTES.md entry; show exit gate
- `/review-diff <ref>` — security-reviewer over a range
- `/verify-bug <id>` — bug-verifier oracle
- `/triage <report>` — batch-verify a security report
- `/tenant-check` — run the tenant-isolation gate

---

## 4. Parallelism

Three or four Claude Code sessions run concurrently in git
worktrees. Each session has its own role, its own branch, its
own working directory, and its own NOTES.md append cadence. The
human rotates across sessions to review diffs and to run gate
commands.

```
  main ──●──●──────────●────────●────●────●──▶
          \           / \      / \    /
feat/ui    ●──●──●──●   \    /   \  /
                         \  /     \/
feat/infra    ●──●──●─────●───────●
                                   \
feat/deploy            ●──●────────●
```

All merges into `main` are `git merge --no-ff` so the graph
preserves the parallel structure. Before each merge, the
tenant-isolation suite must pass.

The graph itself is an artifact of parallelism — captured as
`git log --graph --all --oneline` in `AI_USAGE.md`.

---

## 5. Phases and gates

Phase boundaries are logical, not temporal. Each phase ends on
an automated gate.

### Phase 0 — Scaffold
Next.js + TS + Drizzle + Supabase SSR + shadcn/ui pinned. `/api/health`
returns `{ok:true}`. Stubs committed for `NOTES.md`, `BUGS.md`,
`REVIEW.md`, `AI_USAGE.md`, `DEFERRED.md`.
**Gate:** app boots; health returns 200.

### Phase 1 — Schema + RLS (lead-backend)
All tables; RLS enabled everywhere with `USING` + `WITH CHECK`;
tenant-isolation test matrix written **before** features.
**Gate:** `pnpm test:tenant-isolation` green; `schema-reviewer` clean.

### Phase 2 — Auth + org switching (lead-backend)
Supabase `@supabase/ssr` email/password; `middleware.ts`
refreshes session, mints request id, attaches current org;
`requireOrgAccess`; direct-add member; org switcher.
**Gate:** tenant-isolation green; user in two orgs can switch
and see correct scope.

### Phase 3 — Parallel tracks
Four worktrees run concurrently:
- **3A (core, `main`):** notes CRUD, versioning (explicit save,
  full snapshots, optimistic concurrency), tags, sharing,
  visibility.
- **3B (UI, `feat/ui`):** all pages per `UI.md`; shadcn/ui
  primitives; server-rendered permission-denied.
- **3C (data, `feat/infra`):** FTS with `tsvector` + GIN;
  file upload with MIME sniff + path-safe keys + signed URLs;
  AI summarizer with zod-validated output.
- **3D (deploy, `feat/deploy`):** Dockerfile, Railway config,
  seed script (10k notes), health.

Merge order into `main` (all `--no-ff`): 3B → 3C → 3D. Each
merge gated by tenant-isolation.

### Phase 4 — Hardening review
`security-reviewer` sweeps all diffs; `/triage` walks findings
through `bug-verifier`; confirmed bugs logged in `BUGS.md` with
fix commits. `observability-reviewer` verifies logging
coverage. `scope-cutter` triages remaining items.
**Gate:** no confirmed bug outstanding; observability clean.

### Phase 5 — Deploy
Push to GitHub; Railway deploys from Dockerfile; migrations
applied via direct URL; 1k-seed against production; 10k-seed
against staging; two-browser smoke test.
**Gate:** tenant-isolation executed against the deployed URL
is green.

### Phase 6 — Deliverables
`AI_USAGE.md`, `REVIEW.md`, `BUGS.md` finalized from drafts.
5-minute demo recorded.

---

## 6. Scope discipline

If it's not in this document it's not in scope. `DEFERRED.md`
receives anything cut. Explicit out-of-scope list: real-time
collaborative editing, WYSIWYG editor, email invites with
verification, file versioning, FTS over file contents,
multi-language UI, mobile apps, SSO / SAML / SCIM, billing,
custom domains.

Cut-list for Phase 4, in order of what to cut first:
1. AI summary partial-accept UX polish (keep accept-all).
2. Diff viewer styling (keep functional diff).
3. File upload UI polish (keep upload + download + RLS).
4. Members page niceties (keep direct add + role change).
5. Empty / error state polish.

Never cut: the tenant-isolation suite, any RLS policy, any
`requireOrgAccess` call, audit logging, soft-delete
enforcement, `--no-ff` merges.

---

## 7. Correctness principles

1. **Every tenant-scoped row carries `org_id`.**
2. **RLS on every table, `USING` + `WITH CHECK`.**
3. **The secret key (`SUPABASE_SECRET_KEY`) is server-only, never in a path with
   user-supplied identifiers.**
4. **Children resolve permission via current parent state.**
5. **LLM output is validated against a zod schema before it is
   stored, rendered, or passed to a tool call.**
6. **AI calls receive exactly one note's content per prompt.**
7. **File uploads sniff bytes for MIME; paths are server-built.**
8. **Search filters by `org_id` in SQL and via RLS.**
9. **Logs never contain content, secrets, or keys.**
10. **Soft-deleted parents hide all children everywhere.**

These principles are enforced by automated tests
(`tests/tenant-isolation/**`), by review agents
(`security-reviewer`, `schema-reviewer`, `observability-reviewer`),
and by a human final pass (see `REVIEW.md`).
