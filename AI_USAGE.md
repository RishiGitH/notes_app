# AI_USAGE.md — Agent utilization write-up

Authored at the end of the build from `drafts/AI_USAGE.draft.md`.

## Agent roster (actually used)

| Agent | Model | Role | Where I overrode |
|-------|-------|------|------------------|
| (populated at Phase 6) | | | |

## Parallelization timeline

(Populated from NOTES.md timestamps + `git log --graph --all
--oneline --decorate` output.)

## What agents got right / wrong

(Populated at Phase 6 with commit references.)

## Where I intervened

(Populated at Phase 6.)

## What I did not trust agents to do

(Populated at Phase 6.)

## Tooling

Claude Code CLI in multiple terminals on git worktrees for
parallel implementation; subagents defined in `.claude/agents/`
invoked on demand via slash commands under `.claude/commands/`.
