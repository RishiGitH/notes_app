# syntax=docker/dockerfile:1.7

# ---------- deps stage -------------------------------------------------------
# Install all dependencies using pnpm (via corepack).
# Layer-cached separately from the builder so a source change does not
# re-run a full pnpm install.
FROM node:20-alpine AS deps
RUN apk add --no-cache libc6-compat && corepack enable
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# ---------- builder stage ----------------------------------------------------
# Compile Next.js with output: 'standalone' (set in next.config.ts).
# The standalone build emits a self-contained server at .next/standalone/
# with a trimmed node_modules subset — do NOT copy the full node_modules
# into the runner stage.
FROM node:20-alpine AS builder
RUN corepack enable
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1

# NEXT_PUBLIC_* vars must be present at build time so Next.js can inline
# them into the client bundle. Pass them as build args from Railway's
# environment (set in service Variables, not just runtime env).
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
ARG APP_URL
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
ENV NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=$NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
ENV APP_URL=$APP_URL

RUN pnpm build

# ---------- runner stage -----------------------------------------------------
# Minimal runtime image. No dev tooling, no build cache, no full node_modules.
FROM node:20-alpine AS runner
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
# HOSTNAME=0.0.0.0 is required: standalone server.js binds to this value.
# Without it the server listens on 127.0.0.1 only and Railway's proxy cannot
# reach it — the image builds but the container health-checks fail.
ENV HOSTNAME=0.0.0.0
ENV PORT=3000

# Copy the self-contained standalone server (includes trimmed node_modules).
COPY --from=builder --chown=node:node /app/.next/standalone ./

# Next.js standalone does NOT copy static assets — add them manually.
# Static assets (JS, CSS, images produced by the build):
COPY --from=builder --chown=node:node /app/.next/static ./.next/static

# public/ directory is optional (favicons, robots.txt, etc.).
# Skipped here because this project has no public/ assets yet;
# add back if public/ is created: COPY --from=builder --chown=node:node /app/public ./public

# Run as the non-root "node" user that ships with the alpine image (uid 1000).
USER node

EXPOSE 3000

# Health check uses Node 20's built-in fetch — no curl install required.
# start-period gives the Next.js cold-start time before failures are counted.
# Use the runtime PORT so Railway can inject its own port if needed.
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "const port = process.env.PORT || 3000; fetch('http://127.0.0.1:' + port + '/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# server.js is the standalone entrypoint emitted by Next.js.
CMD ["node", "server.js"]
