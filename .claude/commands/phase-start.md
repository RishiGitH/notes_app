---
description: Start a new PLAN.md phase; append a NOTES.md entry; print the phase's exit gate.
argument-hint: <phase-id>  (e.g. "3A", "4")
---

Begin phase `$ARGUMENTS` from `PLAN.md`. This command is
**protocol-enforcing**: it ensures no phase starts without a
NOTES.md entry and without the invoker seeing the exit gate.

# Procedure

1. Read `PLAN.md`. Locate the section whose heading matches the
   argument (e.g. `Phase 3A — Notes core`). If no match, stop and
   list the available phase identifiers from `PLAN.md`.

2. Read `AGENTS.md` section 5 (NOTES.md protocol), section 6 (testing), section 10
   (definition of done).

3. Determine the executing agent identity:
   - Read `CLAUDE.md`-equivalent context or ask the primary agent
     to self-identify (`lead-backend`, `ui-builder`, `search-ai`,
     `infra-deploy`).
   - If ambiguous, stop and ask which agent is driving.

4. Append to `NOTES.md` exactly:

   ```
   ## [<UTC timestamp>] [<agent-name>] Task: Phase $ARGUMENTS — <phase title from PLAN.md>

   **Plan:**
   - <bullet extracted from PLAN.md Phase $ARGUMENTS body>
   - <bullet>
   - <bullet>
   ```

   Use the current UTC timestamp in `YYYY-MM-DDTHH:MM:SSZ` form.

5. Commit the NOTES.md append with message
   `notes: start phase $ARGUMENTS, <phase title>`.
   This journal-start commit counts toward the phase's commit budget
   in AGENTS.md section 4.

6. Print:
   - Phase title
   - Bulleted plan (what you just wrote)
   - **Exit gate** text verbatim from PLAN.md
   - The command to run the gate (e.g.
     `pnpm test:tenant-isolation`)

# Hard rules

- Never start implementation work without completing this command
  first.
- Never invent a phase not in PLAN.md — stop and ask.
- Never skip the commit; the NOTES.md entry must be a separate
  commit from implementation work for the journal to be readable.

# Output

One chat summary:

```
Phase: $ARGUMENTS — <title>
NOTES.md entry: appended and committed (<sha>)
Plan:
  - ...
Exit gate: <verbatim from PLAN.md>
Gate command: <e.g. pnpm test:tenant-isolation>
```
