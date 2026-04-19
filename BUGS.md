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


## addmember action leaked whether a user was registered or not

**med** — fix `f54ad9d`


using addmember action and anyone can brute force and find out which emails are registered. The response told whether the user was registered or not and if they were already a member or not. 

Update the response to a genric error message and fixed it.

---


---


## Visiting /org/create crashed the app with an infinite redirect loop

**high** — fix `858a03f`

When a freshly signed-up user (no org yet) visited `/org/create`, the page
would never load — the browser just kept spinning and eventually showed
"This site can't be reached." The terminal showed hundreds of rapid-fire
requests per second.

Why it happened: The `/org/create` page lives inside the `(app)` route
group, which means the `(app)/layout.tsx` runs first for every request to
that URL. That layout checks "does this user have any org memberships?"
and if not, redirects to `/org/create`. So a new user with no org would:

1. Land on `/org/create`
2. Layout runs, finds no orgs, redirects to `/org/create`
3. Layout runs again, finds no orgs, redirects again
4. ... forever

Removed the redirect from the layout entirely. When `orgs.length === 0`
the layout now renders the page content directly (the create-org page has
its own full-screen card layout so it looks correct without the sidebar
shell). All other app pages already have their own `if (!orgId)
redirect("/org/create")` guard, so new users still get sent there when
they try to access notes or the dashboard.

---