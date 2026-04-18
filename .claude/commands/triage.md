---
description: Batch-walk the newest .reports/security/*.md findings through /verify-bug and summarize the outcomes.
argument-hint: [report-path]  (defaults to newest file in .reports/security/)
---

Walk a security-reviewer report file, resolve each finding through
the `bug-verifier` agent (the same oracle that `/verify-bug`
invokes), and produce a triage summary.

This is the bridge from `security-reviewer` candidates to
`BUGS.md` entries. Nothing enters `BUGS.md` automatically — this
command produces the verified drafts; the human decides which to
file.

# Procedure

1. Resolve `$ARGUMENTS`:
   - If empty: list files under `.reports/security/`, pick the one
     with the latest timestamp in the filename, print the choice.
   - If a path: read it directly.
   - If not a real file: stop and ask.

2. Parse every `### F-<NNNN>` block in the report. For each, extract:
   - `id`
   - `file` and `line-range`
   - `severity` and `confidence`
   - `title`
   - the draft "Failing test (Vitest)" block

3. Read `BUGS.md` and the latest `.reports/verify/` files to skip
   findings that are already verified (CONFIRMED / FALSE_POSITIVE /
   SUSPICION). Print the skip list.

4. For each remaining finding, invoke `bug-verifier` per the
   `/verify-bug` contract. Collect the verdict and the verify report
   path.

5. Produce a triage summary printed to chat and written to
   `.reports/triage/<YYYYMMDD-HHMM>-triage.md`:

   ```
   ## Triage — <date>
   Source: .reports/security/<file>

   | id | severity | verdict | test | draft entry |
   |----|----------|---------|------|-------------|
   | F-0007 | crit | CONFIRMED | tests/verify/... | drafts/BUGS.draft.md#F-0007 |
   | F-0008 | high | FALSE_POSITIVE | — | — |
   | F-0009 | med | SUSPICION | — | — |

   ### Next actions
   - CONFIRMED findings: <n> to be filed in BUGS.md by the human
   - FALSE_POSITIVE: <n>  (no action)
   - SUSPICION: <n>  (no action)
   ```

6. For every `CONFIRMED` finding, append a draft block to
   `drafts/BUGS.draft.md` (if the drafts/ folder is present) with:
   id, title, severity, file, root cause, fix owner, regression
   test path. The human rewrites into `BUGS.md` from there.

# Hard rules

- Never file to `BUGS.md` directly.
- Never re-verify a finding that `.reports/verify/` already covers.
- Never skip a CONFIRMED draft — every confirmed bug must get a
  draft in `drafts/BUGS.draft.md`.

# Output

One chat summary with the triage table and the path to the
triage report file.
