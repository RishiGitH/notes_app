// Request-scoped context propagated via AsyncLocalStorage.
//
// This module is Node runtime ONLY — AsyncLocalStorage is not available on
// the edge runtime. Any Server Action that calls logAudit() must export:
//   export const runtime = 'nodejs';
//
// Usage: wrap each Server Action with withContext() so that logAudit() can
// read the requestId, orgId, and userId without explicit prop-drilling.
//
// withContext() is intentionally a simple wrapper: it reads the x-request-id
// and x-org-id request headers (set by middleware), plus the authenticated
// userId, and runs the action inside the AsyncLocalStorage store.

import { AsyncLocalStorage } from "node:async_hooks";

export interface RequestContext {
  requestId: string;
  orgId: string | null;
  userId: string | null;
}

// Module-level singleton — safe because this file is Node-only.
export const requestContextStore = new AsyncLocalStorage<RequestContext>();

// getRequestContext() returns the current context or a safe fallback.
// Never throws: logging must never crash the request path.
export function getRequestContext(): RequestContext {
  return (
    requestContextStore.getStore() ?? {
      requestId: "unknown",
      orgId: null,
      userId: null,
    }
  );
}

// withContext() runs a Server Action inside the AsyncLocalStorage context.
// requestId comes from the x-request-id header minted by middleware.
// orgId comes from the x-org-id header (the org_id cookie forwarded by middleware).
// userId is the authenticated user's id, typically from requireUser().
export async function withContext<T>(
  ctx: RequestContext,
  fn: () => Promise<T>,
): Promise<T> {
  return requestContextStore.run(ctx, fn);
}
