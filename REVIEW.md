# Code & Architecture Review

Given the 24-hour constraint, deep security and architecture reviews were prioritized over UI polish.

## Focus Areas: Deep Review

The following areas were manually reviewed, as they represent the highest risks in a multi-tenant application:

- **Security & Auth (`lib/security/**`, `lib/auth/**`, `middleware.ts`):** Verified that every request is correctly authenticated, sessions are validated server-side, and boundaries are enforced before any data access.

- **Row Level Security (`drizzle/` migrations):** Manually verified all RLS policies, especially the complex EXISTS-joins between parent and child tables.

- **AI Integrations (`lib/ai/summarize.ts`, `lib/ai/schemas.ts`):** Audited the prompt construction and input validation to ensure user content cannot manipulate the prompt into leaking cross-tenant data.

- **File Uploads (`app/(app)/notes/[noteId]/files/`):** Checked for path traversal vulnerabilities, MIME type spoofing protections, and ensured signed URLs are scoped correctly.

- **Tenant Isolation Tests (`tests/tenant-isolation/**`):** Confirmed these tests use real Postgres JWT injection rather than mocks to accurately validate RLS.

## Focus Areas: Sampled Review

These areas were sampled for general correctness but not scrutinized :
- UI components and Tailwind styling (`app/(app)/**` and `components/**`).
- Seed data generation scripts (checked output shape, not the implementation).
- Non-critical utility functions.

## Primary Concerns (Where Output Was Distrusted)

- **RLS Policy Drift:** It's incredibly easy for an RLS policy on a child table (like `note_versions` or `note_shares`) to drift from its parent table's logic. Every child table policy was treated as guilty until proven innocent.

- **AI Prompt Injection:** The flow of user content into an LLM and back into the database is a massive risk. Strict Zod validation on the output and single-note scoping on the input were enforced.

- **FTS Scoping:** Relying purely on RLS for full-text search is risky. Verified that the SQL queries explicitly include an `org_id` filter as defense-in-depth.

- **Version Permissions:** A note's child records (like versions) must always resolve access via the current parent state, preventing leaked access after a share is revoked.

## Key Architectural Trade-Offs

- **Postgres FTS vs. External Search (e.g., Elasticsearch):** Chose Postgres FTS. With a GIN-indexed `tsvector`, it handles 10k–1M rows comfortably, keeps the deployment simple, and avoids distributed data sync issues. Revisit at 10M+ notes or if typo tolerance becomes a product requirement.

- **Full-Content Version Snapshots vs. Delta Chains:** Opted to store full snapshots for each note version. The storage overhead is negligible at this scale (~10 KB per note), and it dramatically simplifies RLS, diff computation, and mental overhead compared to replaying delta chains. For 10k notes and even with 5 versions it will 1 GB of storage which works for our use case. If storage becomes a problem we can always move to delta chains.

- **Soft-Delete:** Notes are soft-deleted via a `deleted_at` timestamp. This preserves the audit trail and simplifies potential data recovery, with RLS filtering out deleted rows on read.

- **Optimistic Concurrency:** Rather than implementing complex CRDTs for collaborative editing, optimistic concurrency was used (`expected_current_version_id`). If there's a conflict, the server returns a 409. This is appropriate for an explicit "Save" flow.


## Next Steps With More Time

With more time, focus would shift to:
- **TOCTOU Vulnerabilities:** Checking for race conditions between role downgrades and in-flight Server Actions.
- **Rate Limiting:** Implementing strict rate limits per user and per organization, especially for the AI summary feature.
- **Storage Scalability:** Refining the Supabase Storage RLS policies to handle deeper bucket structures as the app scales.
- **Cold-Start Behavior:** Profiling `AsyncLocalStorage` behavior under Railway's autoscaling.
