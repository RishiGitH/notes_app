---
description: Adversarial security review of a diff; writes structured findings.
argument-hint: <git-ref or empty for HEAD~1..HEAD>
---

Perform a security-focused review of the changes in scope. Read
`AGENTS.md` first; sections 2, 6, 8, 10 govern this command.

# Scope

Arguments: `$ARGUMENTS`

- If no argument is given, scope is `HEAD~1..HEAD`.
- If the first argument is a git ref (branch, tag, SHA), scope is
  `<ref>...HEAD`.

Compute the file list once at the start:

```
git diff --name-only <base>...HEAD
```

Print the list so the invoker can confirm before work begins. If the
list is empty, stop and report "no changes in scope".

# Procedure

1. Read `AGENTS.md` and any prior reports under `.reports/security/`
   and `.reports/bugs/` to avoid re-filing known issues. Also note the
   current maximum `F-<NNNN>` id across those directories.
2. Invoke the `security-reviewer` subagent on the file list.
   Request that output go to
   `.reports/security/<YYYYMMDD-HHMM>-review.md` per that agent's
   contract, with finding ids starting at (current max + 1).
3. Do not invoke `bug-verifier` here. Verification is a separate
   explicit step via `/verify-bug`.

# Output

A consolidated chat summary with:

- Files reviewed
- Finding count by severity (crit / high / med / low) with ids
- Path to the full report file

End with the exact next-step instruction:

    Next: run `/verify-bug <id>` for each high-confidence finding
    before any entry lands in BUGS.md.

# Hard rules

- Never edit source code during this command.
- Never file to `BUGS.md` from this command.
- Never skip reading prior reports; duplicates are worse than misses.
