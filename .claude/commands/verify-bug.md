---
description: Turn a claimed bug into a failing test via bug-verifier; the only gate to BUGS.md.
argument-hint: <finding-id | path to candidate | free-text claim>
---

Invoke the `bug-verifier` subagent to determine whether the claim in
`$ARGUMENTS` is a real bug.

# Inputs

`$ARGUMENTS` is one of:

- A finding id like `F-0007`.
- A file path under `.reports/`.
- A free-text claim including file + description.

# Procedure

1. If `$ARGUMENTS` is a finding id (matches `^F-[0-9]+$`), resolve it:

   ```
   grep -rn '^- \*\*id:\*\* F-0007$' .reports/security/ .reports/bugs/
   ```

   (Substitute the actual id for `F-0007`.)

   - If zero matches: stop and ask for clarification.
   - If one match: read that file and extract the full finding block
     (from the `### F-<NNNN>` heading to the next heading of the same
     level).
   - If multiple matches: print all matches with file paths and ask
     the invoker which one.

2. If `$ARGUMENTS` is a file path: read it and ask which finding
   within, if ambiguous.

3. If `$ARGUMENTS` is free text: require it to include a file
   reference and a description. If missing, ask for them.

4. Pass the resolved claim record (file, line-range, description,
   reproduction idea) to the `bug-verifier` subagent. It will:
   - Write a Vitest test under
     `tests/verify/<YYYYMMDD-HHMM>-<slug>.test.ts`.
   - Run the test.
   - Produce a report at
     `.reports/verify/<YYYYMMDD-HHMM>-verify.md` with verdict
     `CONFIRMED`, `FALSE_POSITIVE`, or `SUSPICION`.

5. Print the verdict, the test file path, and the report path.

6. If verdict is `CONFIRMED`, print the exact draft `BUGS.md` entry
   the verifier produced. The human decides whether and how to file
   it. This command does not write to `BUGS.md`.

# Output

A single chat summary:

```
Verdict: CONFIRMED | FALSE_POSITIVE | SUSPICION
Test:    tests/verify/<path>
Report:  .reports/verify/<path>
Draft BUGS.md entry: (only if CONFIRMED, printed verbatim)
```

# Hard rules

- Never file to `BUGS.md` automatically. Human writes that file.
- Never mock the thing under test.
- A claim with no producible failing test is a `SUSPICION` — do not
  promote it, do not argue with the verifier.
