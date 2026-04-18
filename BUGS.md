# BUGS.md — Confirmed Bugs Found and Fixed

Every entry here is a bug that:
1. Was identified during review (by `security-reviewer`,
   `observability-reviewer`, manual reading, or the tenant-isolation
   suite),
2. Was verified as reproducible via a failing test by
   `bug-verifier` (or by a directly-authored failing test), and
3. Has a fix commit SHA on `main`.

Entries without a fix commit SHA are not yet bugs. Claims without a
failing test are suspicions and do not belong here — they live in
`.reports/security/*.md` under "Suspicions" or in `REVIEW.md` under
"Known risks."

## Entry format

```
### B-<NNNN> — <title>

- **severity:** crit | high | med | low
- **file:** path/relative/to/repo
- **root cause:** <1–2 sentences>
- **how found:** security-reviewer | observability-reviewer | schema-reviewer | manual read | tenant-isolation suite
- **regression test:** tests/verify/<path> or tests/tenant-isolation/<path>
- **fix commit:** <short SHA>

**Description.** <2–4 sentences.>

**Why the AI made this mistake.** <1–2 sentences. Pattern-level,
not a specific agent call-out.>
```
