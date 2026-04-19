# REVIEW.md — Personal Review Notes

Authored at the end of the build from `drafts/REVIEW.draft.md`.

## What I deep-reviewed line by line

- `lib/security/**`
- Every RLS migration under `drizzle/`
- `lib/auth/**` and `middleware.ts`
- `lib/ai/summarize.ts` and `lib/ai/schemas.ts`
- The file upload and signed-URL paths under
  `app/(app)/notes/[noteId]/files/`
- `tests/tenant-isolation/**`

## What I sampled

- UI components and styling under `app/(app)/**` and `components/**`
- The seed script (reviewed output shape, not every Faker call)
- Non-critical utilities

## What I distrusted most (and why)

- RLS policy drift between parent and child tables — the top
  bug class in multi-tenant Supabase apps.
- AI prompt-injection surface — user content flows into the
  model and the model's output flows back into the note body.
- File upload MIME handling — client-supplied `Content-Type` is
  inherently untrusted.
- Search `tsvector` scoping — easy to rely on RLS and skip the
  SQL-level `org_id` filter.
- Version permission drift after un-share — children of a note
  must always resolve via the current parent state.

## Trade-offs considered

- **Postgres FTS vs Elasticsearch.** Chose FTS. Postgres FTS on
  a GIN-indexed `tsvector` handles 10k–1M rows comfortably. ES
  would add deploy complexity with no win at this scale. Revisit
  at 10M+ notes or if typo tolerance becomes a product
  requirement.
- **Full-content version snapshots vs delta chain.** Chose
  snapshots. At 10k notes × 5 versions × ~10 KB, storage is
  under 1 GB. Delta chains are worth the complexity only at
  ~100× this scale or for non-text payloads. Simpler RLS,
  simpler diff computation.
- **Soft-delete vs hard-delete for notes.** Chose soft-delete
  with `deleted_at`. Preserves audit trail and allows restore.
  RLS filters out deleted rows from every read path.
- **Optimistic concurrency vs CRDT for concurrent edits.** Chose
  optimistic (`expected_current_version_id` → 409 on mismatch).
  CRDT is out of scope and unnecessary for an edit flow with an
  explicit Save button.

## Known risks (acknowledged, not fixed)

- **O-med-01 (observability, med):** `rejectSummary`, `acceptSummary`, and `generateSummary` run an admin DB lookup before any `withContext` call. If the lookup itself fails, the resulting `console.error` carries `requestId: "unknown"`. Happy-path audit rows are fully correlated. No cross-tenant data is accessible via this gap.
- **O-low-01 (observability, low):** `console.error` in `download/route.ts` was missing the `requestId` field. Fixed in commit 555f057 (added to structured log); `logError` now also fires an `error.5xx` audit row.
- **F-0003 (high, design decision):** `addMemberAction` adds a target user to an org without their consent. PLAN.md §9 explicitly authorizes "direct add by email by an admin"; a pending-invite flow is out of scope. Risk: an admin can use this to enumerate registered users and read their display names via the `users_select_self_or_same_org` RLS policy. Accepted trade-off documented in DEFERRED.md.
- **Supabase signOut scope:** `signOutAction` calls `supabase.auth.signOut()` without specifying scope. Default is global, which invalidates all sessions. Verified against @supabase/ssr@0.5.2 — global is correct for this app's UX (sign out of all devices). No code change needed.

## What I would review next with more time

- Race between role downgrade and in-flight Server Action
  (TOCTOU on permission checks).
- Storage RLS across `storage.objects` when a bucket grows
  beyond one level of path prefix.
- Cold-start behavior of `AsyncLocalStorage` under Railway's
  autoscaling.
- Rate limiting on AI summary calls per user and per org.
