"use server";

// Org-scoped Server Actions: create org, switch org, add member, remove member.
//
// All actions require authentication (requireUser) and where applicable
// require org admin access (requireOrgAccess). All events are logged to
// audit_logs via logAudit.
//
// Node runtime required (AsyncLocalStorage via withContext / logAudit).
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { headers, cookies } from "next/headers";
import { z } from "zod";
import { requireUser, getAdminSupabase } from "@/lib/auth/server";
import { requireOrgAccess } from "@/lib/security/permissions";
import { withContext, type RequestContext } from "@/lib/logging/request-context";
import { logAudit } from "@/lib/logging/audit";

// ── Helpers ───────────────────────────────────────────────────────────────────

async function buildCtx(userId: string): Promise<RequestContext> {
  const h = await headers();
  return {
    requestId: h.get("x-request-id") ?? "unknown",
    orgId: h.get("x-org-id") ?? null,
    userId,
  };
}

// ── createOrgAction ───────────────────────────────────────────────────────────

const createOrgSchema = z.object({
  name: z.string().min(1, "Name is required").max(100),
  slug: z
    .string()
    .min(1, "Slug is required")
    .max(50)
    .regex(/^[a-z0-9-]+$/, "Slug must be lowercase letters, numbers, or hyphens"),
});

export async function createOrgAction(
  _prevState: string | null,
  formData: FormData,
): Promise<string | null> {
  const user = await requireUser();
  const ctx = await buildCtx(user.id);

  const raw = {
    name: formData.get("name") as string,
    slug: formData.get("slug") as string,
  };

  const parsed = createOrgSchema.safeParse(raw);
  if (!parsed.success) {
    return parsed.error.issues[0]?.message ?? "Validation error";
  }

  const admin = getAdminSupabase();

  // Check slug uniqueness.
  const { data: existing } = await admin
    .from("organizations")
    .select("id")
    .eq("slug", parsed.data.slug)
    .maybeSingle();

  if (existing) {
    return "Slug is already taken";
  }

  // Insert org + owner membership in a single logical unit via two statements.
  // Supabase JS client doesn't support multi-statement transactions; we accept
  // the slim inconsistency window here (org exists without membership for <1ms).
  const { data: org, error: orgError } = await admin
    .from("organizations")
    .insert({ name: parsed.data.name, slug: parsed.data.slug })
    .select("id")
    .single();

  if (orgError || !org) {
    return orgError?.message ?? "Failed to create organization";
  }

  const { error: memberError } = await admin
    .from("memberships")
    .insert({ user_id: user.id, org_id: org.id, role: "owner" });

  if (memberError) {
    // Rollback-ish: delete the org we just created.
    await admin.from("organizations").delete().eq("id", org.id);
    return memberError.message;
  }

  // Set the new org as the current org cookie.
  const cookieStore = await cookies();
  cookieStore.set("org_id", org.id, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
  });

  await withContext({ ...ctx, orgId: org.id }, () =>
    logAudit({
      action: "org.create",
      resourceType: "org",
      resourceId: org.id,
      metadata: { name: parsed.data.name, slug: parsed.data.slug },
    }),
  );

  redirect("/notes");
}

// ── switchOrgAction ───────────────────────────────────────────────────────────

export async function switchOrgAction(orgId: string): Promise<void> {
  const user = await requireUser();
  const ctx = await buildCtx(user.id);

  // Validate membership before setting the cookie (prevents cookie stuffing).
  await withContext(ctx, () => requireOrgAccess(orgId, "viewer"));

  const cookieStore = await cookies();
  cookieStore.set("org_id", orgId, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
  });

  await withContext({ ...ctx, orgId }, () =>
    logAudit({
      action: "org.switch",
      resourceType: "org",
      resourceId: orgId,
    }),
  );

  revalidatePath("/", "layout");
  redirect("/notes");
}

// ── addMemberAction ───────────────────────────────────────────────────────────

const addMemberSchema = z.object({
  email: z.string().email("Invalid email"),
  role: z.enum(["member", "admin", "viewer"]),
});

export async function addMemberAction(
  _prevState: string | null,
  formData: FormData,
): Promise<string | null> {
  const user = await requireUser();
  const ctx = await buildCtx(user.id);

  const orgId = (await headers()).get("x-org-id");
  if (!orgId) return "No active organization";

  const parsed = addMemberSchema.safeParse({
    email: formData.get("email"),
    role: formData.get("role"),
  });
  if (!parsed.success) {
    return parsed.error.issues[0]?.message ?? "Validation error";
  }

  // Require admin access.
  await withContext(ctx, () => requireOrgAccess(orgId, "admin"));

  const admin = getAdminSupabase();

  // Generic "can't add" message used for every non-success branch below.
  // Distinct messages ("User not found" vs "already a member" vs DB errors)
  // would let any admin enumerate the user table by probing candidate
  // emails and reading the response. Same text for every failure mode; the
  // details only go to the audit log (without the email itself, so we
  // don't turn the log into an enumeration oracle either).
  const genericError = "Unable to add member. Check the email and try again.";

  // Look up the target user by email.
  const { data: targetUser } = await admin
    .from("users")
    .select("id")
    .eq("email", parsed.data.email)
    .maybeSingle();

  if (!targetUser) {
    await withContext(ctx, () =>
      logAudit({
        action: "member.add.failed",
        resourceType: "membership",
        metadata: { reason: "user_not_found" },
      }),
    );
    return genericError;
  }

  // Check if already a member.
  const { data: existing } = await admin
    .from("memberships")
    .select("id")
    .eq("user_id", targetUser.id)
    .eq("org_id", orgId)
    .maybeSingle();

  if (existing) {
    await withContext(ctx, () =>
      logAudit({
        action: "member.add.failed",
        resourceType: "membership",
        metadata: { reason: "already_member", targetUserId: targetUser.id },
      }),
    );
    return genericError;
  }

  const { error } = await admin.from("memberships").insert({
    user_id: targetUser.id,
    org_id: orgId,
    role: parsed.data.role,
  });

  if (error) {
    await withContext(ctx, () =>
      logAudit({
        action: "member.add.failed",
        resourceType: "membership",
        metadata: { reason: "db_error" },
      }),
    );
    return genericError;
  }

  await withContext(ctx, () =>
    logAudit({
      action: "member.add",
      resourceType: "membership",
      // orgId is already on the audit row's org_id column; targetEmail is
      // PII and must not be written to audit_logs (AGENTS.md section 2
      // item 11). targetUserId + role is sufficient attribution.
      metadata: {
        targetUserId: targetUser.id,
        role: parsed.data.role,
      },
    }),
  );

  revalidatePath("/org/members");
  return null;
}

// ── removeMemberAction ────────────────────────────────────────────────────────

export async function removeMemberAction(
  _prevState: string | null,
  formData: FormData,
): Promise<string | null> {
  const user = await requireUser();
  const ctx = await buildCtx(user.id);

  const orgId = (await headers()).get("x-org-id");
  if (!orgId) return "No active organization";

  const membershipId = formData.get("membershipId") as string;
  if (!membershipId) return "Missing membership id";

  // Require admin access.
  await withContext(ctx, () => requireOrgAccess(orgId, "admin"));

  const admin = getAdminSupabase();

  // Fetch the membership to prevent removing owners.
  const { data: membership } = await admin
    .from("memberships")
    .select("user_id, role")
    .eq("id", membershipId)
    .eq("org_id", orgId)
    .maybeSingle();

  if (!membership) return "Membership not found";
  if (membership.role === "owner") return "Cannot remove the org owner";

  const { error } = await admin
    .from("memberships")
    .delete()
    .eq("id", membershipId)
    .eq("org_id", orgId);

  if (error) return error.message;

  await withContext(ctx, () =>
    logAudit({
      action: "member.remove",
      resourceType: "membership",
      resourceId: membershipId,
      metadata: { targetUserId: membership.user_id, orgId },
    }),
  );

  revalidatePath("/org/members");
  return null;
}
