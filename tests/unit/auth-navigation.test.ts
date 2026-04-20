import { describe, expect, it } from "vitest";
import {
  buildAuthContinuePath,
  normalizeNextPath,
  resolveAuthBootstrap,
  shouldRedirectAuthenticatedEntry,
} from "@/lib/auth/navigation";
import { redirectToInternalPath } from "@/lib/http/redirect";
import { isPublicPath } from "@/lib/auth/middleware";

describe("normalizeNextPath", () => {
  it("accepts internal paths", () => {
    expect(normalizeNextPath("/notes", "/fallback")).toBe("/notes");
  });

  it("preserves query strings", () => {
    expect(normalizeNextPath("/notes?q=hello", "/fallback")).toBe(
      "/notes?q=hello",
    );
  });

  it("rejects external URLs", () => {
    expect(normalizeNextPath("https://evil.com", "/fallback")).toBe(
      "/fallback",
    );
  });

  it("rejects protocol-relative URLs", () => {
    expect(normalizeNextPath("//evil.com", "/fallback")).toBe("/fallback");
  });

  it("normalizes non-final auth destinations to the fallback", () => {
    expect(normalizeNextPath("/", "/fallback")).toBe("/fallback");
    expect(normalizeNextPath("/login", "/fallback")).toBe("/fallback");
    expect(normalizeNextPath("/sign-up", "/fallback")).toBe("/fallback");
    expect(normalizeNextPath("/auth/continue", "/fallback")).toBe("/fallback");
  });
});

describe("resolveAuthBootstrap", () => {
  it("routes first-time users to org create", () => {
    expect(
      resolveAuthBootstrap({
        requestedNext: "/notes",
        memberships: [],
        currentOrgId: null,
      }),
    ).toEqual({ destination: "/org/create" });
  });

  it("preserves the destination when the org cookie is valid", () => {
    expect(
      resolveAuthBootstrap({
        requestedNext: "/notes/123",
        memberships: [{ id: "org-1" }],
        currentOrgId: "org-1",
      }),
    ).toEqual({ destination: "/notes/123" });
  });

  it("repairs a missing org cookie to the first valid org", () => {
    expect(
      resolveAuthBootstrap({
        requestedNext: "/notes",
        memberships: [{ id: "org-1" }, { id: "org-2" }],
        currentOrgId: null,
      }),
    ).toEqual({ destination: "/notes", orgCookieToSet: "org-1" });
  });

  it("repairs a stale org cookie to the first valid org", () => {
    expect(
      resolveAuthBootstrap({
        requestedNext: "/search?q=test",
        memberships: [{ id: "org-1" }, { id: "org-2" }],
        currentOrgId: "org-3",
      }),
    ).toEqual({
      destination: "/search?q=test",
      orgCookieToSet: "org-1",
    });
  });
});

describe("auth bootstrap routing helpers", () => {
  it("/auth/continue is public", () => {
    expect(isPublicPath("/auth/continue")).toBe(true);
  });

  it("redirects authenticated GET requests away from login and sign-up", () => {
    expect(shouldRedirectAuthenticatedEntry("GET", "/login")).toBe(true);
    expect(shouldRedirectAuthenticatedEntry("HEAD", "/sign-up")).toBe(true);
  });

  it("does not redirect authenticated POST requests away from auth pages", () => {
    expect(shouldRedirectAuthenticatedEntry("POST", "/login")).toBe(false);
    expect(shouldRedirectAuthenticatedEntry("POST", "/sign-up")).toBe(false);
  });

  it("builds canonical auth-continue paths", () => {
    expect(buildAuthContinuePath("/notes/123")).toBe(
      "/auth/continue?next=%2Fnotes%2F123",
    );
  });

  it("creates relative redirect responses for internal auth targets", () => {
    const response = redirectToInternalPath(buildAuthContinuePath("/notes"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "/auth/continue?next=%2Fnotes",
    );
  });

  it("rejects absolute redirect targets", () => {
    expect(() => redirectToInternalPath("http://evil.test/login")).toThrow(
      /internal path/i,
    );
  });
});
