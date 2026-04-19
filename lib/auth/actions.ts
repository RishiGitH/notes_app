"use server";

// Auth Server Actions: post-auth bookkeeping + sign-out.
//
// All actions:
// - Are wrapped with withContext() so logAudit can read requestId/orgId/userId.
// - Log every auth event to audit_logs.
// - Validate the authenticated user from the server-side session.
// - Mirror auth users into public.users for app-level lookups.
// - Log auth events to audit_logs.
//
// Node runtime required (AsyncLocalStorage via withContext).
import { redirect } from "next/navigation";
import { headers, cookies } from "next/headers";
import { requireUser, getServerSupabase, getAdminSupabase } from "@/lib/auth/server";
import { withContext } from "@/lib/logging/request-context";
import { logAudit } from "@/lib/logging/audit";

// ── Helpers ───────────────────────────────────────────────────────────────────

async function buildCtx(userId: string | null = null) {
  const h = await headers();
  return {
    requestId: h.get("x-request-id") ?? "unknown",
    orgId: h.get("x-org-id") ?? null,
    userId,
  };
}

async function syncCurrentUserRow(user: { id: string; email?: string | null }) {
  let admin;
  try {
    admin = getAdminSupabase();
  } catch (e) {
    console.error("[auth.sync] getAdminSupabase failed:", e instanceof Error ? e.message : e);
    return "Server configuration error. Please try again later.";
  }

  const { error: upsertError } = await admin.from("users").upsert(
    {
      id: user.id,
      email: user.email ?? "",
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" },
  );
  if (upsertError) {
    console.error("[auth.sync] users upsert failed:", upsertError.message, upsertError.code);
    return "Failed to sync user profile";
  }

  return null;
}

// ── Browser-auth follow-up actions ───────────────────────────────────────────

export async function finalizeLoginAction(): Promise<string | null> {
  let user;
  try {
    user = await requireUser();
  } catch {
    return "Signed in, but the server could not read your session yet.";
  }

  const syncError = await syncCurrentUserRow(user);
  const ctx = await buildCtx(user.id);

  await withContext(ctx, () =>
    logAudit({
      action: "auth.login",
      resourceType: "user",
      resourceId: user.id,
      metadata: syncError ? { syncError } : {},
    }),
  );

  return syncError;
}

export async function finalizeSignUpAction(): Promise<string | null> {
  let user;
  try {
    user = await requireUser();
  } catch {
    return "Account created, but the server could not read your session yet.";
  }

  const syncError = await syncCurrentUserRow(user);
  const ctx = await buildCtx(user.id);

  await withContext(ctx, () =>
    logAudit({
      action: "auth.signup",
      resourceType: "user",
      resourceId: user.id,
      metadata: syncError ? { syncError } : {},
    }),
  );

  return syncError;
}

export async function recordAuthFailureAction(
  event: "auth.login.failed" | "auth.signup.failed",
  message: string,
): Promise<void> {
  const ctx = await buildCtx(null);

  await withContext(ctx, () =>
    logAudit({
      action: event,
      resourceType: "user",
      metadata: { error: message },
    }),
  );
}

// ── signOutAction ─────────────────────────────────────────────────────────────

export async function signOutAction(): Promise<void> {
  const supabase = await getServerSupabase();

  // Build context before sign-out so userId is still available.
  let userId: string | null = null;
  if (supabase) {
    const { data } = await supabase.auth.getUser();
    userId = data.user?.id ?? null;
  }

  const ctx = await buildCtx(userId);

  await withContext(ctx, () =>
    logAudit({
      action: "auth.logout",
      resourceType: "user",
      resourceId: userId ?? undefined,
    }),
  );

  if (supabase) await supabase.auth.signOut();

  // Clear the org_id cookie on sign-out.
  const cookieStore = await cookies();
  cookieStore.delete("org_id");

  redirect("/login");
}
