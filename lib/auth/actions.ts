"use server";

// Auth Server Actions: login, sign-up, sign-out.
//
// All actions:
// - Are wrapped with withContext() so logAudit can read requestId/orgId/userId.
// - Log every auth event to audit_logs.
// - Use the publishable-key Supabase client for Auth calls (not service role).
// - Redirect on success; return a plain error string on failure (never throw
//   to the client — the client reads the returned error and shows it).
//
// Node runtime required (AsyncLocalStorage via withContext).
import { redirect } from "next/navigation";
import { headers, cookies } from "next/headers";
import { z } from "zod";
import { getServerSupabase, getAdminSupabase } from "@/lib/auth/server";
import { withContext } from "@/lib/logging/request-context";
import { logAudit } from "@/lib/logging/audit";

// ── Schema ────────────────────────────────────────────────────────────────────

const loginSchema = z.object({
  email: z.string().email("Invalid email"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

const signUpSchema = z.object({
  email: z.string().email("Invalid email"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

// ── Helpers ───────────────────────────────────────────────────────────────────

async function buildCtx(userId: string | null = null) {
  const h = await headers();
  return {
    requestId: h.get("x-request-id") ?? "unknown",
    orgId: h.get("x-org-id") ?? null,
    userId,
  };
}

// ── loginAction ───────────────────────────────────────────────────────────────

export async function loginAction(
  _prevState: string | null,
  formData: FormData,
): Promise<string | null> {
  const raw = {
    email: formData.get("email") as string,
    password: formData.get("password") as string,
  };

  const parsed = loginSchema.safeParse(raw);
  if (!parsed.success) {
    return parsed.error.issues[0]?.message ?? "Validation error";
  }

  const supabase = await getServerSupabase();
  if (!supabase) return "Service unavailable";

  const { data, error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  const ctx = await buildCtx(data?.user?.id ?? null);

  await withContext(ctx, () =>
    logAudit({
      action: error ? "auth.login.failed" : "auth.login",
      resourceType: "user",
      resourceId: data?.user?.id,
      // Never write the submitted email into audit metadata: audit_logs is
      // retained indefinitely and readable by ops/analytics paths, and a
      // failed-login row with an email is an enumeration oracle. Keep the
      // error message only. (AGENTS.md section 2 item 11, section 8.)
      metadata: { error: error?.message },
    }),
  );

  if (error) return error.message;

  redirect("/notes");
}

// ── signUpAction ──────────────────────────────────────────────────────────────

export async function signUpAction(
  _prevState: string | null,
  formData: FormData,
): Promise<string | null> {
  const raw = {
    email: formData.get("email") as string,
    password: formData.get("password") as string,
  };

  const parsed = signUpSchema.safeParse(raw);
  if (!parsed.success) {
    return parsed.error.issues[0]?.message ?? "Validation error";
  }

  const supabase = await getServerSupabase();
  if (!supabase) return "Service unavailable";

  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  const ctx = await buildCtx(data?.user?.id ?? null);

  if (error) {
    await withContext(ctx, () =>
      logAudit({
        action: "auth.signup.failed",
        resourceType: "user",
        // No email in metadata — see loginAction for rationale.
        metadata: { error: error.message },
      }),
    );
    return error.message;
  }

  const user = data.user!;

  let admin;
  try {
    admin = getAdminSupabase();
  } catch (e) {
    console.error("[signUp] getAdminSupabase failed:", e instanceof Error ? e.message : e);
    return "Server configuration error. Please try again later.";
  }

  // Mirror user into public.users (auth trigger is deferred to a future
  // migration; we insert manually for now).
  const { error: upsertError } = await admin.from("users").upsert(
    { id: user.id, email: user.email!, updated_at: new Date().toISOString() },
    { onConflict: "id" },
  );
  if (upsertError) {
    console.error("[signUp] users upsert failed:", upsertError.message, upsertError.code);
  }

  await withContext(ctx, () =>
    logAudit({
      action: "auth.signup",
      resourceType: "user",
      resourceId: user.id,
      // user.id is already captured on resourceId/actor_id. Don't duplicate
      // the email in metadata.
      metadata: {},
    }),
  );

  // Redirect to org creation — new users have no org yet.
  redirect("/org/create");
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
