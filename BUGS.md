# BUGS.md

Stuff I caught and fixed. Each has a commit SHA on main.
No SHA = not a bug yet, just a suspicion — those live in `.reports/`
or REVIEW.md under "known risks."

**Format for agents writing new entries:**
Read the existing entries below before adding one — match the tone
and length. Plain English, short paragraphs, no bullet soup.

```
## <what was wrong, plain English>

**<crit | high | med | low>** — fix `<7-char sha>`

First paragraph: what happened and what I changed to fix it.
Second paragraph: why the agent got it wrong (pattern-level, honest).
```

Severity guide: crit/high = touches tenant isolation, auth, secret
keys, or the AI path. med = same-tenant info leak, bad logging.
low = build/config/hygiene.

---

## Ran on Node 16 and used legacy Supabase key names

**high** — fix `<sha>`

Two in one. Agent was on Node 16 despite the Node 20 pin — caught it
when `AsyncLocalStorage` behaved weird. Pinned `.nvmrc` + `engines`
in `package.json`.

Worse: wired `anon` / `service_role` env names straight into code,
ignoring the canonical `SUPABASE_PUBLISHABLE_KEY` /
`SUPABASE_SECRET_KEY` contract in AGENTS.md section 1. Replaced every
reference, verified the secret never reaches the client bundle.

Most tutorials still use the old names. Agent reached for the common
answer instead of reading the project rules first.

---

## uuid package installed for ID generation when Postgres already handles it

**low** — fix `<sha>`

Schema uses `defaultRandom()` so Postgres mints all row IDs. Agent
still `pnpm add`'d `uuid` + the deprecated `@types/uuid` and was
about to import it in lib code. Removed `@types/uuid`, kept `uuid` as
devDep (tests legitimately pre-compute IDs before INSERT). Added rule
in AGENTS.md section 1: DB for row PKs, `node:crypto#randomUUID()`
for server-side random tokens like storage path suffixes, `ulid` for
request IDs, `uuid` in tests only.

Reflex "need a UUID, install uuid" move. Didn't check the DB was
already the source of truth, didn't know Node 20 ships
`crypto.randomUUID()` built in.

---

## Vitest didn't load .env.local so tenant-isolation suite always failed the safety check

**med** — fix `<sha>`

The globalSetup guard correctly refuses to run unless `DIRECT_URL`
points at 127.0.0.1. But vitest doesn't auto-load `.env.local` the
way Next.js does — it only picks up `VITE_`-prefixed vars unless you
wire it explicitly. So `DIRECT_URL` was always `(unset)` and the
guard tripped on every run even with Supabase running. Fixed by
adding a small `loadEnvFile()` helper at the top of `globalSetup.ts`
that reads `.env` then `.env.local` using Node's built-in `fs`,
without overriding vars already set in the shell.

Also caught a trailing space on `SUPABASE_SECRET_KEY` in `.env.local`
while fixing this — trimmed it before it caused an auth bug later.

Agent assumed vitest would auto-load `.env.local` because Next.js
does. It doesn't — this is a well-known vite/vitest gotcha that's
easy to miss when you're thinking in Next.js terms.

---
