---
description: Run the tenant-isolation gate suite and surface failures; never auto-fix.
argument-hint: (no arguments)
---

Execute the project's tenant-isolation gate. Do not merge, do not
deploy, do not mark any task "done" while this is red.

# Procedure

1. Run via Bash:

   ```
   pnpm test:tenant-isolation
   ```

2. Classify the exit state into one of:

   - **GREEN** — command exited 0 and tests passed.
   - **RED** — command exited non-zero because tests failed.
   - **UNKNOWN** — command exited non-zero for a non-test reason
     (database not reachable, setup error, dependency missing,
     config error, etc.).

3. If **GREEN**:
   - Print a one-line confirmation with test count and elapsed time.
   - Stop.

4. If **RED**:
   - Print the failing test names and the first assertion diff for
     each.
   - Write a failure summary to
     `.reports/tenant-check/<YYYYMMDD-HHMM>-failures.md` with the
     full raw output and the file list of tests that failed.
   - Print the path and stop.
   - Do not invoke any subagent. Do not propose a fix. Do not edit
     code. The human decides whether to prompt `lead-backend` for
     diagnosis or to dig in directly.

5. If **UNKNOWN**:
   - Print the stderr and exit code verbatim.
   - Write a raw log to
     `.reports/tenant-check/<YYYYMMDD-HHMM>-unknown.md`.
   - Print the path and stop.
   - Do not interpret or guess the cause. The human investigates.

# Hard rules

- Never modify a failing tenant-isolation test to make it pass.
- Never relax an RLS policy or an auth check to make tests pass.
- Never skip a test. A flaky test is itself a bug to report via
  `/verify-bug`, not to hide.
- Never auto-fix. This command is strictly passive.
