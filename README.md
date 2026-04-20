# Multi-Tenant Notes App

A secure, multi-tenant notes application built with Next.js, Drizzle ORM, and Supabase. Designed with strong tenant isolation, comprehensive audit logging, and AI-powered note summaries.

## Features

- **Multi-Tenancy & RBAC:** Users can belong to multiple organizations with specific roles (Owner, Admin, Member, Viewer). Strict Row Level Security (RLS) ensures data is never leaked across boundaries.
- **Note Management:** Full CRUD capabilities with tagging and selective sharing. Notes support versioning, allowing you to track changes and view diffs over time.
- **Full-Text Search:** High-performance search across note titles, content, and tags, powered by Postgres GIN-indexed `tsvector` queries.
- **File Attachments:** Secure file uploads via Supabase Storage. Files are scoped to specific notes and accessed via short-lived signed URLs.
- **AI Summarization:** Generate structured summaries, key points, and action items for any note. Users can selectively accept parts of the AI output to merge into their notes.
- **Audit Logging:** Every authentication event, mutation, AI request, and permission denial is logged for full operational visibility.

## Architecture

```mermaid
flowchart TB
    subgraph client["Client (Browser)"]
        Browser["Next.js App Router\nReact Server Components"]
    end

    subgraph server["Server"]
        MW["Middleware\nSession Validation · Org Cookie"]
        SA["Server Actions\nrequireUser → requireOrgAccess\n→ Business Logic → logAudit"]
        AI["AI Service\nAnthropic API\nZod-validated output"]
    end

    subgraph data["Data Layer"]
        PG["Postgres + RLS\n11 migrations · Immutable triggers\nGIN FTS index"]
        Storage["Supabase Storage\nSigned URLs · MIME sniffing\nVisibility-aware RLS"]
    end

    Browser --> MW --> SA
    SA --> PG
    SA --> Storage
    SA --> AI

    style client fill:#0d1117,stroke:#30363d,color:#c9d1d9
    style server fill:#161b22,stroke:#30363d,color:#c9d1d9
    style data fill:#0d1117,stroke:#30363d,color:#c9d1d9
```

### Security Model (3 Layers)

```mermaid
flowchart LR
    R["Request"] --> L1["Layer 1\nMiddleware\nSession + org cookie\nvalidation on every request"]
    L1 --> L2["Layer 2\nServer Actions\nrequireOrgAccess()\ncanEditNote()\nlogAudit()"]
    L2 --> L3["Layer 3\nPostgres RLS\norg_id scoping\nchild→parent EXISTS joins\nimmutable triggers"]

    style L1 fill:#1a1a2e,stroke:#e94560,color:#fff
    style L2 fill:#16213e,stroke:#0f3460,color:#fff
    style L3 fill:#533483,stroke:#e94560,color:#fff
```

### Agent-Orchestrated Build

This project was built using parallelized AI agents, each assigned a specific domain through custom system prompts. A human orchestrator managed all merge decisions, security reviews, and trust boundaries.

```mermaid
flowchart LR
    subgraph serial["Serial"]
        S1["Schema\n+ RLS"] --> S2["Auth\n+ Middleware"]
    end
    subgraph parallel["Parallel Agents"]
        A["Backend"]
        B["UI"]
        C["Search+AI"]
        D["Infra"]
    end
    subgraph harden["Harden"]
        E["Security\nReview"] --> F["Deploy"]
    end
    serial --> parallel --> harden
```

> For full details on the build process, agent roles, and what was caught during review, see [`AI_USAGE.md`](AI_USAGE.md).

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js (App Router) |
| Database & Auth | Supabase (Postgres) |
| ORM | Drizzle |
| Styling & UI | Tailwind CSS, shadcn/ui |
| Testing | Vitest |
| AI | Anthropic API |
| Deployment | Railway (Docker) |

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

## Documentation

| Document | Purpose |
|----------|---------|
| [`AI_USAGE.md`](AI_USAGE.md) | Agent orchestration strategy, parallelization pipeline, and trust boundaries |
| [`REVIEW.md`](REVIEW.md) | Architectural trade-offs, security review notes, and acknowledged risks |
| [`BUGS.md`](BUGS.md) | Vulnerabilities caught and fixed during the hardening phase (with commit SHAs) |
