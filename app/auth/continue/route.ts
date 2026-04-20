import { NextResponse, type NextRequest } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { getAdminSupabase } from "@/lib/auth/server";
import {
  buildLoginPath,
  normalizeNextPath,
  resolveAuthBootstrap,
} from "@/lib/auth/navigation";
import { buildPublicRedirectUrl } from "@/lib/http/redirect";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const requestedNext = request.nextUrl.searchParams.get("next");
  const normalizedNext = normalizeNextPath(requestedNext, "/notes");

  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const publishable = process.env.SUPABASE_PUBLISHABLE_KEY;

    if (!url || !publishable) {
      throw new Error("Supabase env vars not set");
    }

    // Use a pending-cookies buffer so we can copy refreshed session cookies
    // onto the redirect response. NextResponse.redirect() is a plain response
    // object; @supabase/ssr's setAll() normally writes to next/headers which
    // is tied to the RSC response pipeline. Here we collect the cookies
    // manually and apply them to the redirect response.
    const pendingCookies: { name: string; value: string; options: CookieOptions }[] = [];

    const supabase = createServerClient(url, publishable, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          for (const c of cookiesToSet) {
            pendingCookies.push(c);
          }
        },
      },
    });

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      if (authError) {
        console.warn("[auth/continue] getUser failed:", authError.message);
      }
      const loginUrl = buildPublicRedirectUrl(
        request,
        buildLoginPath(normalizedNext),
      );
      const res = NextResponse.redirect(loginUrl, { status: 307 });
      for (const { name, value, options } of pendingCookies) {
        res.cookies.set(name, value, options);
      }
      return res;
    }

    const admin = getAdminSupabase();
    const { data: memberships, error: membershipsError } = await admin
      .from("memberships")
      .select("org_id, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true });

    if (membershipsError) {
      throw membershipsError;
    }

    const decision = resolveAuthBootstrap({
      requestedNext: normalizedNext,
      memberships: (memberships ?? []).flatMap((membership) => {
        if (!membership.org_id) return [];
        return [{ id: membership.org_id as string }];
      }),
      currentOrgId: request.cookies.get("org_id")?.value ?? null,
      fallbackDestination: "/notes",
    });

    console.log(
      "[auth/continue] user:",
      user.id,
      "memberships:",
      memberships?.length ?? 0,
      "requestedNext:",
      normalizedNext,
      "destination:",
      decision.destination,
      "repairCookie:",
      decision.orgCookieToSet ?? "none",
    );

    const destUrl = buildPublicRedirectUrl(request, decision.destination);
    const response = NextResponse.redirect(destUrl, { status: 307 });

    // Copy refreshed session cookies onto the redirect so the browser sends
    // them on the next request (to /org/create or /notes).
    for (const { name, value, options } of pendingCookies) {
      response.cookies.set(name, value, options);
    }

    if (decision.orgCookieToSet) {
      response.cookies.set("org_id", decision.orgCookieToSet, {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: process.env.NODE_ENV === "production",
      });
    }

    return response;
  } catch (error) {
    console.error(
      "[auth/continue] bootstrap failed:",
      error instanceof Error ? error.message : error,
    );
    return new NextResponse("Auth bootstrap failed", { status: 500 });
  }
}
