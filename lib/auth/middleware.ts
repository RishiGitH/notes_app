import { NextResponse, type NextRequest } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { ulid } from "ulid";

// Public paths that do not require authentication. Everything else under
// (app) is protected — unauthenticated requests are redirected to /login.
const PUBLIC_PATHS = [
  "/login",
  "/sign-up",
  "/api/health",
];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some(
    (p) => pathname === p || pathname.startsWith(p + "/"),
  );
}

// updateSession runs on every request that reaches middleware. It:
//   1. Mints a ULID request-id and attaches it as x-request-id to both the
//      request (so Server Components can read it via headers()) and the
//      response (for observability / correlation in logs).
//   2. Reads the current-org cookie ("org_id") and forwards its value as
//      x-org-id on the request headers, so Server Components and Actions
//      can read the current org cheaply without re-parsing cookies.
//   3. Refreshes the Supabase session and redirects unauthenticated requests.
//
// AsyncLocalStorage is NOT used here: middleware may run on the edge runtime
// where AsyncLocalStorage is unavailable. The ALS store is populated by the
// withContext() wrapper in lib/logging/request-context.ts for Node-runtime
// Server Actions that call logAudit().
export async function updateSession(request: NextRequest) {
  const requestId = ulid();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishable = process.env.SUPABASE_PUBLISHABLE_KEY;

  // Clone the request headers so we can inject x-request-id and x-org-id.
  // IMPORTANT: strip any client-supplied values for the trust-boundary
  // headers we mint server-side. Without the explicit delete, an attacker
  // who clears the org_id cookie can smuggle x-org-id via a request header
  // and have it forwarded verbatim to Server Components.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.delete("x-request-id");
  requestHeaders.delete("x-org-id");
  requestHeaders.set("x-request-id", requestId);

  // Propagate current-org from the org_id cookie to a request header.
  const orgId = request.cookies.get("org_id")?.value;
  if (orgId) {
    requestHeaders.set("x-org-id", orgId);
  }

  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });

  // Always echo the request-id on the response so clients and edge logs
  // can correlate the pair.
  response.headers.set("x-request-id", requestId);

  if (!url || !publishable) return response;

  const supabase = createServerClient(url, publishable, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(
        cookiesToSet: { name: string; value: string; options: CookieOptions }[],
      ) {
        for (const { name, value, options } of cookiesToSet) {
          request.cookies.set(name, value);
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  if (!user && !isPublicPath(pathname)) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return response;
}
