import { NextResponse } from "next/server";

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

function assertInternalRedirectTarget(target: string) {
  if (!target.startsWith("/") || target.startsWith("//")) {
    throw new Error(`Redirect target must be an internal path: ${target}`);
  }

  return target;
}

export function redirectToInternalPath(
  target: string,
  init?: number | ResponseInit,
) {
  const status = typeof init === "number" ? init : init?.status ?? 307;
  if (!REDIRECT_STATUSES.has(status)) {
    throw new RangeError(`Invalid redirect status code: ${status}`);
  }

  const headers = new Headers(typeof init === "object" ? init.headers : undefined);
  headers.set("Location", assertInternalRedirectTarget(target));

  return new NextResponse(null, {
    ...(typeof init === "object" ? init : {}),
    headers,
    status,
  });
}
