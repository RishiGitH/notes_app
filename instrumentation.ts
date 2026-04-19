// Next.js Instrumentation — runs once per server boot (Node runtime only).
// onRequestError is called for every unhandled error in Server Components,
// Server Actions, and Route Handlers — before Next.js swallows them and
// returns a 500/error response. This gives us visibility in Railway deploy
// logs that we'd otherwise have zero of.
//
// Docs: https://nextjs.org/docs/app/api-reference/file-conventions/instrumentation

export async function register() {
  // Nothing to initialise at boot for now.
}

export function onRequestError(
  err: unknown,
  request: { url: string; method: string },
  context: { routerKind: string; routePath: string; routeType: string },
) {
  const message = err instanceof Error ? err.message : String(err);
  const stack = err instanceof Error ? err.stack : undefined;

  console.error(
    JSON.stringify({
      level: "error",
      event: "request_error",
      method: request.method,
      url: request.url,
      routeType: context.routeType,
      routePath: context.routePath,
      error: message,
      // Truncate stack to first 3 lines to keep logs readable
      stack: stack?.split("\n").slice(0, 3).join(" | "),
    }),
  );
}
