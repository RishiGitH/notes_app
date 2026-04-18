# .claude/agents — subagent roster

This directory holds the 9 subagent definitions for this project.
They are invoked by name from any Claude Code session in this repo —
either explicitly ("use the security-reviewer subagent to review this
diff") or auto-delegated when the primary agent matches the description.

All agents read `AGENTS.md` at the repo root as their operating
constitution. Where a rule in an agent's body conflicts with `AGENTS.md`,
`AGENTS.md` wins.

## Roster

**Implementers** (write code; each in its own git worktree):

| name          | model  | owns                                                  |
|---------------|--------|-------------------------------------------------------|
| lead-backend  | opus   | schema, RLS, auth, Server Actions, security helpers   |
| ui-builder    | sonnet | pages, components, styling, client-side state         |
| search-ai     | sonnet | Postgres FTS, file upload pipeline, AI summarizer     |
| infra-deploy  | sonnet | Dockerfile, Railway config, seed script, health route |

**Review / judgment** (read-only or test-only; never edit production
source outside `tests/`):

| name                   | model  | role                                                       |
|------------------------|--------|------------------------------------------------------------|
| security-reviewer      | opus   | adversarial diff review; called via `/review-diff`         |
| schema-reviewer        | sonnet | migration review; called directly                          |
| test-writer            | sonnet | Vitest tests for a diff; called by implementers + directly |
| bug-verifier           | opus   | prove a claimed bug with a failing test; via `/verify-bug` |
| observability-reviewer | sonnet | audit logging coverage and PII leakage; call directly      |
| scope-cutter           | opus   | triage what ships, degrades, defers; call directly         |

## Conventions

- Review agents write structured output under `.reports/` at the repo
  root. They never edit source outside `.reports/` and `tests/`
  (test-writer and bug-verifier only).
- Every finding includes: file, line range, severity, confidence,
  concrete exploit or failure scenario, suggested fix.
- Finding ids are globally monotonic within their domain (`F-NNNN` for
  security, `O-NNNN` for observability). Each agent reads existing files
  before assigning new ids.
- `bug-verifier` is the oracle: a claim becomes a `BUGS.md` candidate
  only if `bug-verifier` can express it as a failing test. Otherwise it
  is a suspicion and does not enter `BUGS.md`.
- Implementer agents commit per `AGENTS.md` §4 and append to `NOTES.md`
  per §5 — standing rule, not triggered externally.

## Invocation

From any Claude Code session in the repo:

```
Use the <agent-name> subagent to <task>.
```

Slash commands (`/review-diff`, `/verify-bug`, `/triage`,
`/tenant-check`, `/phase-start`) wrap the most common invocations.

`observability-reviewer` and `scope-cutter` are invoked with a plain
sentence — no slash command needed:

```
Use the observability-reviewer subagent on the full repo.
Use the scope-cutter subagent given the current state.
```
