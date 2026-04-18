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

## Anyone who has access to two orgs could bypass security and move a note between them

**crit** — fix `023e167`


The RLS policy would only check that if the user is a member of the org
and has access to the note. It did not check that the user is a member
of the new org after a user send a request to update a note that is in ORG A 
with org_id = ORG B. This notes and all it's details would move to ORG B.

Note:- We could have also used RLS with a CHECK constraint but that could have
lead to recursion risk since we would have to self reference the node row for org_id.
Also this also protect any opertations from our service role key unless we want it to
happen.


Added an immutable trigger that throws error if the org_id changes from its 
original value. 

---

## Same RLSS policy loophole in other tables and same fix as well

**crit** — fix `198c27f`


After fixing the note's org_id loophole, I checked other tables with 
an update policy and found the same loophole in four of them.

1. `note_shares` — `note_id` could be changed so a share pointing at 
one note now points at another.
2. `memberships` — both `user_id` and `org_id` were changeable, meaning an
 admin's UPDATE for a role change could also silently transfer someone's
 membership to a different user or a different org. 

3. `tags` — admin rename policy didn't block changing `org_id`, so a tag
 could be moved cross-tenant. 
 
4. `ai_summaries` — both `note_id` and `org_id`
 changeable, same cross-tenant leak as notes. 
  

Added migration 0007 that adds a immutable trigger on each of the four
tables. The trigger basically does the same thing check if the old and new
IDs are same and if not throws an error.

---


## Auth was not verifying session tampered tokens would have bypassed security

**high** — fix `3f6b000`


the require user logic was flawed. it was only checking if the user is logged in 
but not if the session is valid or not. An old session token or a 
tampered one would have bypassed security.


added getUser() which verifies session directly with supabase auth. so 
if session is expired or tampered it will be caught immediately.


---


## Any logged-in user could read any org's member list by sending a fake header

**crit** — fix `f54ad9d`


Two bugs that chained into the same leak.

First, middleware did `new Headers(request.headers)` which copies every
header the browser sent, including `x-org-id`. It only overwrote that
header when the `org_id` cookie was present. So if the attacker cleared
the cookie and sent `X-Org-Id: <victim-org-uuid>` themselves, the
header survived and got forwarded to Server Components as if we had
set it.

Second, `/org/members` read `x-org-id` straight out of the headers and
queried memberships with the service-role client — no `requireOrgAccess`
call, so nothing actually checked the caller was in the org. Any
authenticated user could dump any org's member roster (emails, roles,
user ids) just by knowing the org UUID.

Fixed both. Middleware now explicitly `delete`s `x-org-id` and
`x-request-id` before the conditional set, so client-supplied values
can never survive. And the members page now calls
`requireOrgAccess(orgId, "viewer")` before any DB work, which throws
and writes a permission.denied audit row on non-members. Defense in
depth: either fix alone would have stopped the leak.


---


## Email addresses were being written to the audit log on every login and signup

**med** — fix `f54ad9d`


AGENTS.md section 2 rule 11 says logs must not contain PII beyond user
id + org id + action. But `loginAction`, `signUpAction`, and
`addMemberAction` were all stuffing the submitted email into
`audit_logs.metadata`. Failed logins were the worst case: they recorded
emails for accounts that may not even exist, turning the audit log
itself into an email-enumeration dump for anyone who later gets read
access to that table.

Removed `email` from the metadata on all three paths. The user id is
already on `actor_id` / `resourceId` so attribution is not lost. For
`addMemberAction` the target user id is kept in metadata but the target
email is dropped.


---


## addMember returned different error messages that leaked whether an email was registered

**med** — fix `f54ad9d`


`addMemberAction` replied with "User not found. They must sign up
first." when the email was unknown and "User is already a member..."
when it was already in the org. Any admin of any org (and everyone
who signs up gets one) could script this action against a list of
candidate emails and learn which belong to real users — a textbook
email-enumeration oracle that defeats the user table's RLS policy.

Collapsed every failure branch to one generic message: "Unable to add
member. Check the email and try again." The real reason goes to
`audit_logs` as a `member.add.failed` row with a `reason` code, so ops
can still see what happened without shipping the detail to the caller.


---


## Permission-denied audit rows could be written with no actor_id attached

**med** — fix `f54ad9d`


`requireOrgAccess` called `logAudit` directly on denial, but `logAudit`
reads the user id out of the AsyncLocalStorage request context — not
from the `user` object `requireOrgAccess` had just loaded. If any
caller forgot to wrap the call in `withContext`, the `permission.denied`
row would land with `actor_id = null` and the denial became
un-attributable. Ops running `SELECT ... WHERE actor_id = '<attacker>'`
to trace probing would get zero rows.

Wrapped the `logAudit` call inside `requireOrgAccess` with its own
`withContext` that threads through the looked-up user id as a fallback,
so the denial is always attributable even when the caller was sloppy
about establishing context.


---




