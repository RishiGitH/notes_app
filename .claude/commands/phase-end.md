---
description: Close a PLAN.md phase; append the NOTES.md Result block including a Commits list with short SHAs.
argument-hint: <phase-id>  (e.g. "0", "3A", "4")
---

Close phase `$ARGUMENTS`. This command enforces the Result + Commits
protocol so no phase ends without a journal entry that can be traced
to exact diffs.

# Procedure

1. Read `NOTES.md`. Locate the open Task entry for Phase `$ARGUMENTS`
   (the one written by `/phase-start`). If no open entry exists, stop
   and ask which phase to close.

2. Collect the commit range for this phase:
   - Find the SHA of the `notes: start phase $ARGUMENTS` commit.
   - Run: `git log --oneline <start-sha>..HEAD`
   - That range is every commit produced since the phase opened.
   - If the range is empty, record that honestly in the Result.

3. Draft the Result block:

   ```
   **Result:**
   - <what was done>
   - <decisions taken and why>
   - <what was deferred and where recorded (DEFERRED.md or follow-up)>
   - <blockers encountered>

   **Commits:**
   - `<short-sha>` <commit subject>
   - `<short-sha>` <commit subject>
   ```

   Use 7-character short SHAs from `git log --oneline`. Paste the
   subject line only. The NOTES.md Result commit itself is not listed
   in its own Commits block.

4. Append the Result block to the open Task entry in `NOTES.md`
   (never edit prior content — append only).

5. Commit the NOTES.md update with message:
   `notes: result for phase $ARGUMENTS`

6. Verify the phase exit gate from `PLAN.md`. Print the gate condition
   and the gate command. If the gate is red, stop and fix before
   declaring the phase closed.

# Hard rules

- Never close a phase without the Commits block populated (even if
  it is just "no commits produced — phase was research only").
- Never invent SHAs. Run `git log --oneline` and copy exactly.
- Never skip the exit gate check. A phase is not closed until the
  gate is green.
- The NOTES.md result commit is not listed in its own Commits block.

# Output

```
Phase: $ARGUMENTS — <title>
NOTES.md Result: appended and committed (<sha>)
Commits in phase: <count>
Exit gate: <status: green | red | not yet run>
Gate command: <e.g. pnpm test:tenant-isolation>
```
