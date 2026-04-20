# Multi-Tenant Notes App

A secure, multi-tenant notes application built with Next.js, Drizzle ORM, and Supabase. Designed with strong tenant isolation, comprehensive audit logging, and AI-powered note summaries.

## Features

- **Multi-Tenancy & RBAC:** Users can belong to multiple organizations with specific roles (Owner, Admin, Member, Viewer). Strict Row Level Security (RLS) ensures data is never leaked across boundaries.
- **Note Management:** Full CRUD capabilities with tagging and selective sharing. Notes support versioning, allowing you to track changes and view diffs over time.
- **Full-Text Search:** High-performance search across note titles, content, and tags, powered by Postgres GIN-indexed `tsvector` queries.
- **File Attachments:** Secure file uploads via Supabase Storage. Files are scoped to specific notes and accessed via short-lived signed URLs.
- **AI Summarization:** Generate structured summaries, key points, and action items for any note. Users can selectively accept parts of the AI output to merge into their notes.
- **Audit Logging:** Every authentication event, mutation, AI request, and permission denial is logged for full operational visibility.

## Tech Stack

- **Framework:** Next.js (App Router)
- **Database & Auth:** Supabase (Postgres)
- **ORM:** Drizzle
- **Styling & UI:** Tailwind CSS, shadcn/ui
- **Testing:** Vitest
- **AI:** Anthropic API

## Local Development Setup

1. **Clone the repository:**
   ```bash
   git clone <repo-url>
   cd notes_app
   ```

2. **Install dependencies:**
   ```bash
   pnpm install
   ```

3. **Configure Environment Variables:**
   Copy `.env.example` to `.env.local` and fill in your Supabase and Anthropic keys.
   ```bash
   cp .env.example .env.local
   ```

4. **Run Database Migrations:**
   Ensure your local Supabase instance is running or connected to a remote DB, then push the schema:
   ```bash
   pnpm run db:push
   ```

5. **Start the Development Server:**
   ```bash
   pnpm dev
   ```

## Testing

The testing suite focuses heavily on security invariants and tenant isolation. 
```bash
# Run unit and integration tests
pnpm test

# Run strict tenant-isolation suite
pnpm test:tenant-isolation
```

## Architecture Notes

- **Tenant Isolation:** Enforced via Supabase Row Level Security (RLS). Every query is scoped to the `org_id`.
- **Search Strategy:** Uses native Postgres Full-Text Search. Search inputs are safely converted using `websearch_to_tsquery`.
- **AI Safety:** Prompts are strictly constructed server-side. Output is validated against Zod schemas before persistence.

For detailed information on the build process and security reviews, please refer to:
- `AI_USAGE.md`: Details on how AI agents were orchestrated during development.
- `REVIEW.md`: My architectural trade-offs and security review notes.
- `BUGS.md`: A log of vulnerabilities caught and fixed during the hardening phase.
