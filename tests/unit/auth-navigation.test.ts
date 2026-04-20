import { describe, expect, it } from "vitest";
import {
  normalizeNextPath,
  resolveAuthBootstrap,
} from "@/lib/auth/navigation";
import {
  buildPublicRedirectUrl,
  redirectToInternalPath,
} from "@/lib/http/redirect";
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

  it("creates relative redirect responses for internal auth targets", () => {
    const request = new Request("http://0.0.0.0:8080/login", {
      headers: {
        host: "0.0.0.0:8080",
        "x-forwarded-host": "notes.example.com",
        "x-forwarded-proto": "https",
      },
    });
    const response = redirectToInternalPath(
      request as unknown as import("next/server").NextRequest,
      "/auth/continue?next=%2Fnotes",
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://notes.example.com/auth/continue?next=%2Fnotes",
    );
  });

  it("rejects absolute redirect targets", () => {
    const request = new Request("http://localhost:3000/login");
    expect(() =>
      redirectToInternalPath(
        request as unknown as import("next/server").NextRequest,
        "http://evil.test/login",
      ),
    ).toThrow(/internal path/i);
  });

  it("prefers forwarded host and proto over internal request origin", () => {
    const request = new Request("http://0.0.0.0:8080/auth/continue", {
      headers: {
        host: "0.0.0.0:8080",
        "x-forwarded-host": "app.up.railway.app",
        "x-forwarded-proto": "https",
      },
    });

    expect(
      String(
        buildPublicRedirectUrl(
          request as unknown as import("next/server").NextRequest,
          "/login?next=%2Fnotes",
        ),
      ),
    ).toBe("https://app.up.railway.app/login?next=%2Fnotes");
  });
});
