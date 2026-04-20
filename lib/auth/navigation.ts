export const AUTH_CONTINUE_PATH = "/auth/continue";

const NON_FINAL_DESTINATIONS = new Set([
  "/",
  "/login",
  "/sign-up",
  AUTH_CONTINUE_PATH,
]);

export type BootstrapOrgMembership = {
  id: string;
};

export type AuthBootstrapDecision = {
  destination: string;
  orgCookieToSet?: string;
};

export function normalizeNextPath(
  nextPath: string | null | undefined,
  fallback: string,
) {
  if (!nextPath) return fallback;
  if (!nextPath.startsWith("/") || nextPath.startsWith("//")) return fallback;

  try {
    const url = new URL(nextPath, "http://localhost");
    const normalized = `${url.pathname}${url.search}${url.hash}`;
    if (NON_FINAL_DESTINATIONS.has(url.pathname)) return fallback;
    return normalized;
  } catch {
    return fallback;
  }
}

export function buildAuthContinuePath(
  nextPath?: string | null,
  fallback = "/notes",
) {
  const url = new URL(AUTH_CONTINUE_PATH, "http://localhost");
  if (nextPath) {
    url.searchParams.set("next", normalizeNextPath(nextPath, fallback));
  }
  return `${url.pathname}${url.search}`;
}

export function buildLoginPath(
  nextPath?: string | null,
  fallback = "/notes",
) {
  const url = new URL("/login", "http://localhost");
  url.searchParams.set("next", normalizeNextPath(nextPath, fallback));
  return `${url.pathname}${url.search}`;
}

export function resolveAuthBootstrap(params: {
  requestedNext?: string | null;
  memberships: BootstrapOrgMembership[];
  currentOrgId?: string | null;
  fallbackDestination?: string;
}): AuthBootstrapDecision {
  const {
    requestedNext,
    memberships,
    currentOrgId,
    fallbackDestination = "/notes",
  } = params;

  if (memberships.length === 0) {
    return { destination: "/org/create" };
  }

  const destination = normalizeNextPath(requestedNext, fallbackDestination);
  const hasValidCurrentOrg = memberships.some((membership) => {
    return membership.id === currentOrgId;
  });

  if (hasValidCurrentOrg) {
    return { destination };
  }

  return {
    destination,
    orgCookieToSet: memberships[0]!.id,
  };
}

export function shouldRedirectAuthenticatedEntry(
  method: string,
  pathname: string,
) {
  if (method !== "GET" && method !== "HEAD") return false;
  return pathname === "/" || pathname === "/login" || pathname === "/sign-up";
}
