# BUGS.md

Stuff I caught and fixed. Each has a commit SHA on main.
No SHA = not a bug yet 

**Format:**

```
## <what was wrong>

**<crit | high | med | low>** — fix `<7-char sha>`

First paragraph: what happened

Second paragraph: How I fixed it
```

Severity guide: 
crit/high = touches tenant isolation, auth, secret
keys, or the AI path. 
med = same-tenant info leak, bad logging.
low = build/config/hygiene.

---

## Ran on Node 16 and used legacy Supabase key names

**high** — fix `<sha>`

Two in one. Agent was on Node 16 despite the Node 20 pin — caught it
when having issues with AsyncLocalStorage and using supabase serivce role directly
ignoring the pushiable and secret key instructions in agents.md

Updated instructions for node version and updated all refrences to use the correct keys.

---

## uuid package installed for ID generation when Postgres already handles it

**low** — fix `<sha>`

Agent unecessary installed uuid package to geenrate id when postgres already handles it.
Also app code should never touch it. Also it installed @types/uuid which is deprecated.

Removed the dev dependency and added a note in the agents.md to never use uuid in app code.

---

## Auth was checking the cookie instead of actually verifying the session

**high** — fix `3f6b000`

`requireUser()` was reading the session straight from the cookie without
verifying it with Supabase. A stale, revoked, or tampered token would
sail right through as authenticated.

Switched to `getUser()` which makes a real round-trip to Supabase Auth
to confirm the token is still valid. Kept `getSession()` around but
added a comment that it's only safe for reading claims, never for
deciding who's allowed in.

---

## Middleware let everyone through regardless of auth state

**high** — fix `3f6b000`

Middleware was refreshing session cookies on every request but then
always returned `next()`. It never actually blocked anyone. Any route
that forgot to call `requireUser()` was just publicly accessible — the
notes page stub was already in this state.

Added a redirect: if Supabase says no user and the path isn't `/login`,
`/sign-up`, or `/api/health`, bounce to `/login` with the original path
in a `?next=` param so the user lands back after signing in.

---

## Any user in two orgs could silently move a note between them

**crit** — fix `023e167`

The RLS UPDATE policy checked that the user is a member of the note's
org before the update (correct) but only checked that they're a member
of the new `org_id` after the update (wrong). Anyone who belongs to
two orgs could UPDATE a note in Org A, set `org_id = Org B`, and both
checks would pass. The note and everything attached to it — versions,
shares, files, AI summaries — would silently appear in Org B.

Added a Postgres trigger (`notes_org_immutable`) that throws the moment
`org_id` changes on any note row, regardless of who's asking. A trigger
is the right tool here because the RLS WITH CHECK can only see the new
row values, not the old ones — you can't catch a field change with a
policy alone.

---

## Same org-move bug existed on four other tables, not just notes

**crit** — fix `198c27f`

After fixing `notes.org_id` I checked every other table with an UPDATE
policy. Same hole existed in four of them. `note_shares` — `note_id`
could be changed so a share pointing at one note now points at another.
`memberships` — both `user_id` and `org_id` were changeable, meaning an
admin's UPDATE for a role change could also silently transfer someone's
membership to a different user or a different org. `tags` — admin
rename policy didn't block changing `org_id`, so a tag could be moved
cross-tenant. `ai_summaries` — both `note_id` and `org_id` changeable,
same cross-tenant leak as notes. Every case was the same pattern:
UPDATE policy checked "are you a member of the relevant org" but never
checked "did you change the key."

Added a BEFORE UPDATE trigger on each of the four tables (migration
0007) that throws if any of the tenant-critical keys change. The
other tables — `note_versions`, `files`, `note_tags`, `audit_logs` —
were already safe because they have no UPDATE policy at all, so RLS
blocks the write entirely. Ran the tenant-isolation suite after the
migration, all 17 tests still green.

---

