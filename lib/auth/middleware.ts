import { NextResponse, type NextRequest } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { ulid } from "ulid";
import {
  AUTH_CONTINUE_PATH,
  buildLoginPath,
} from "@/lib/auth/navigation";
import { redirectToInternalPath } from "@/lib/http/redirect";

// Public paths that do not require authentication. Everything else under
// (app) is protected — unauthenticated requests are redirected to /login.
export const PUBLIC_PATHS = [
  "/login",
  "/sign-up",
  AUTH_CONTINUE_PATH,
  "/api/health",
];

export function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some(
    (p) => pathname === p || pathname.startsWith(p + "/"),
  );
}

// updateSession runs on every request that reaches middleware. It:
//   1. Mints a ULID request-id and attaches it as x-request-id.
//   2. Reads the current-org cookie and forwards it as x-org-id.
//   3. Refreshes the Supabase session and redirects unauthenticated requests.
//
// Key fix: the response is rebuilt AFTER supabase.auth.getUser() so that any
// session-token refresh (setAll) is reflected in the request headers forwarded
// to Server Components. Without this, an expired token refreshed here writes
// new cookies to the browser response but the current Server Component render
// calls requireUser() with the old expired token from the incoming request.
export async function updateSession(request: NextRequest) {
  const start = Date.now();
  const requestId = ulid();
  const pendingCookies: {
    name: string;
    value: string;
    options: CookieOptions;
  }[] = [];

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishable = process.env.SUPABASE_PUBLISHABLE_KEY;

  // Strip trust-boundary headers that must be server-minted.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.delete("x-request-id");
  requestHeaders.delete("x-org-id");
  requestHeaders.delete("x-return-to");
  requestHeaders.set("x-request-id", requestId);
  requestHeaders.set(
    "x-return-to",
    `${request.nextUrl.pathname}${request.nextUrl.search}`,
  );

  const orgId = request.cookies.get("org_id")?.value;
  if (orgId) {
    requestHeaders.set("x-org-id", orgId);
  }

  if (!url || !publishable) {
    const earlyResponse = NextResponse.next({ request: { headers: requestHeaders } });
    earlyResponse.headers.set("x-request-id", requestId);
    console.log(JSON.stringify({ event: "request", method: request.method, path: request.nextUrl.pathname, ms: Date.now() - start, warn: "no_supabase_env" }));
    return earlyResponse;
  }

  const supabase = createServerClient(url, publishable, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(
        cookiesToSet: { name: string; value: string; options: CookieOptions }[],
      ) {
        for (const { name, value, options } of cookiesToSet) {
          pendingCookies.push({ name, value, options });
          // Mutate the local request cookie store so getAll() returns fresh values.
          request.cookies.set(name, value);
          // Also update requestHeaders so the Server Component's cookies() store
          // sees the refreshed token on THIS request, not just the next one.
          // Without this, an expired token is refreshed here but requireUser()
          // in the Server Component still sees the stale token from the original
          // incoming request headers.
          requestHeaders.set(
            "cookie",
            request.cookies
              .getAll()
              .map((c) => `${c.name}=${c.value}`)
              .join("; "),
          );
        }
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Rebuild the forwarded response AFTER getUser() so setAll() mutations are
  // reflected in the headers passed to the Server Component.
  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });
  response.headers.set("x-request-id", requestId);
  for (const { name, value, options } of pendingCookies) {
    response.cookies.set(name, value, options);
  }

  const { pathname } = request.nextUrl;
  const returnTo = `${pathname}${request.nextUrl.search}`;

  function withPendingCookies(target: NextResponse) {
    target.headers.set("x-request-id", requestId);
    for (const { name, value, options } of pendingCookies) {
      target.cookies.set(name, value, options);
    }
    return target;
  }

  if (!user && !isPublicPath(pathname)) {
    console.log(JSON.stringify({ event: "request", method: request.method, path: pathname, ms: Date.now() - start, auth: "redirect_login" }));
    return withPendingCookies(
      redirectToInternalPath(request, buildLoginPath(returnTo, "/notes")),
    );
  }

  console.log(JSON.stringify({ event: "request", method: request.method, path: pathname, ms: Date.now() - start, auth: user ? "ok" : "public" }));
  return response;
}
