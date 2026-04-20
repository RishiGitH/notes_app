import { NextResponse, type NextRequest } from "next/server";
import { getAdminSupabase, getServerSupabase } from "@/lib/auth/server";
import {
  buildLoginPath,
  normalizeNextPath,
  resolveAuthBootstrap,
} from "@/lib/auth/navigation";
import { redirectToInternalPath } from "@/lib/http/redirect";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const requestedNext = request.nextUrl.searchParams.get("next");
  const normalizedNext = normalizeNextPath(requestedNext, "/notes");

  try {
    const supabase = await getServerSupabase();
    if (!supabase) {
      throw new Error("Supabase server client unavailable");
    }

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      if (authError) {
        console.warn("[auth/continue] getUser failed:", authError.message);
      }
      return redirectToInternalPath(buildLoginPath(normalizedNext));
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

    const response = redirectToInternalPath(decision.destination);

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
