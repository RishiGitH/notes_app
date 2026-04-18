# .claude/commands — slash commands

Five reusable orchestration shortcuts. Each delegates to a named
subagent or runs a scripted check. Everything else is handled by
AGENTS.md standing rules or by prompting the primary agent directly.

## Available

| command          | what it does                                               | subagent(s)       |
|------------------|------------------------------------------------------------|-------------------|
| `/phase-start`   | Open a PLAN.md phase; append NOTES.md entry; show gate     | (passive)         |
| `/review-diff`   | Adversarial security review of a diff                      | security-reviewer |
| `/verify-bug`    | Turn a claimed bug into a failing test (oracle for BUGS.md)| bug-verifier      |
| `/triage`        | Batch-walk a security report through /verify-bug           | bug-verifier      |
| `/tenant-check`  | Run the tenant-isolation gate suite; surface failures      | (passive)         |

## Not slash commands (invoke directly)

- **`observability-reviewer`** — say "use the observability-reviewer
  subagent on the full repo." No command wrapper needed.
- **`scope-cutter`** — say "use the scope-cutter subagent." Invoke once
  in Phase 4.
- **`schema-reviewer`** — say "use the schema-reviewer subagent on
  drizzle/ and lib/db/schema.ts."
- **NOTES.md entries** — agents write these autonomously per AGENTS.md section 5.
- **Commit messages** — ask the primary agent directly.

## Invocation

```
/<command-name> <arguments>
```

Examples:

```
/phase-start 3A
/review-diff origin/main
/triage .reports/security/20260418-0900-review.md
/verify-bug F-0007
/tenant-check
```

## Conventions

- `/phase-start` always writes to `NOTES.md` and commits.
- `/review-diff` writes output under `.reports/security/`.
- `/verify-bug` writes a test under `tests/verify/` and a report
  under `.reports/verify/`.
- `/triage` writes under `.reports/triage/` and appends confirmed
  drafts to `notes-interview/drafts/BUGS.draft.md`.
- `/tenant-check` writes failures to `.reports/tenant-check/`.
- `BUGS.md` is only written by the human, from verified drafts.
  No slash command files to it automatically.
