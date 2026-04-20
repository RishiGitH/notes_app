import { NextResponse, type NextRequest } from "next/server";

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

function assertInternalRedirectTarget(target: string) {
  if (!target.startsWith("/") || target.startsWith("//")) {
    throw new Error(`Redirect target must be an internal path: ${target}`);
  }

  return target;
}

function firstHeaderValue(headers: Headers, name: string) {
  const raw = headers.get(name);
  if (!raw) return null;
  return raw
    .split(",")
    .map((value) => value.trim())
    .find(Boolean) ?? null;
}

function splitHostPort(host: string) {
  try {
    return new URL(`http://${host}`).hostname;
  } catch {
    return host.split(":", 1)[0] ?? host;
  }
}

function isLocalOnlyHost(host: string) {
  const hostname = splitHostPort(host).toLowerCase();
  return LOCAL_HOSTS.has(hostname) || hostname === "0.0.0.0";
}

function readAppOrigin() {
  const appUrl = process.env.APP_URL;
  if (!appUrl) return null;

  try {
    return new URL(appUrl).origin;
  } catch {
    return null;
  }
}

export function buildPublicRedirectUrl(
  request: NextRequest | Request,
  target: string,
) {
  const internalTarget = assertInternalRedirectTarget(target);
  const headers = request.headers;
  const appOrigin = readAppOrigin();
  const requestUrl = new URL(request.url);
  const requestProtocol =
    "nextUrl" in request && request.nextUrl
      ? request.nextUrl.protocol.replace(/:$/, "")
      : requestUrl.protocol.replace(/:$/, "");
  const requestHost =
    "nextUrl" in request && request.nextUrl
      ? request.nextUrl.host
      : requestUrl.host;
  const forwardedProto = firstHeaderValue(headers, "x-forwarded-proto");
  const fallbackProtocol =
    forwardedProto ??
    (appOrigin ? new URL(appOrigin).protocol.replace(/:$/, "") : null) ??
    requestProtocol;

  const candidateHosts = [
    firstHeaderValue(headers, "x-forwarded-host"),
    appOrigin ? new URL(appOrigin).host : null,
    firstHeaderValue(headers, "host"),
    requestHost,
  ];

  for (const host of candidateHosts) {
    if (!host) continue;
    if (process.env.NODE_ENV === "production" && isLocalOnlyHost(host)) {
      continue;
    }
    return new URL(internalTarget, `${fallbackProtocol}://${host}`);
  }

  throw new Error(
    `Unable to determine public origin for redirect target: ${internalTarget}`,
  );
}

export function redirectToInternalPath(
  request: NextRequest | Request,
  target: string,
  init?: number | ResponseInit,
) {
  const status = typeof init === "number" ? init : init?.status ?? 307;
  if (!REDIRECT_STATUSES.has(status)) {
    throw new RangeError(`Invalid redirect status code: ${status}`);
  }

  const headers = new Headers(typeof init === "object" ? init.headers : undefined);
  headers.set("Location", String(buildPublicRedirectUrl(request, target)));

  return new NextResponse(null, {
    ...(typeof init === "object" ? init : {}),
    headers,
    status,
  });
}
