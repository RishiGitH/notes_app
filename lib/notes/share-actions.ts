"use server";

// Share Server Actions: grant, revoke, list.
//
// note_shares: (note_id, user_id, permission: view|comment|edit).
// Only the note author or an org admin/owner can grant or revoke shares.
// A share recipient can see their own share via the RLS SELECT policy
// (user_id = auth.uid()). Listing all shares on a note requires author
// or admin access — this action uses the admin client.
// Node runtime required.
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";
import { requireUser, getAdminSupabase } from "@/lib/auth/server";
import { requireOrgAccess } from "@/lib/security/permissions";
import { withContext, type RequestContext } from "@/lib/logging/request-context";
import { logAudit } from "@/lib/logging/audit";

async function buildCtx(userId: string): Promise<RequestContext> {
  const h = await headers();
  return {
    requestId: h.get("x-request-id") ?? "unknown",
    orgId: h.get("x-org-id") ?? null,
    userId,
  };
}

const permissionSchema = z.enum(["view", "comment", "edit"]);

// Check if user is the note author or an org admin/owner.
// Used for share management (grant/revoke/list): author can share their own
// notes, admins can manage any note's shares.
async function canManageShares(
  noteId: string,
  orgId: string,
  userId: string,
): Promise<boolean> {
  const admin = getAdminSupabase();

  // IMPORTANT: scope by org_id so an admin of org B cannot satisfy this check
  // by referencing a noteId that belongs to org A. Without the org_id filter
  // the note lookup succeeds cross-tenant and the subsequent membership check
  // (which uses the caller-supplied orgId) passes for an org-B admin.
  const { data: note } = await admin
    .from("notes")
    .select("author_id")
    .eq("id", noteId)
    .eq("org_id", orgId)
    .is("deleted_at", null)
    .maybeSingle();

  if (!note) return false;
  if (note.author_id === userId) return true;

  const { data: membership } = await admin
    .from("memberships")
    .select("role")
    .eq("user_id", userId)
    .eq("org_id", orgId)
    .maybeSingle();

  return (
    membership?.role === "admin" || membership?.role === "owner"
  );
}

// ── grantShareAction ──────────────────────────────────────────────────────────

export async function grantShareAction(
  noteId: string,
  targetUserId: string,
  permission: "view" | "comment" | "edit",
  orgId: string,
): Promise<null | { error: string }> {
  const parsedPerm = permissionSchema.safeParse(permission);
  if (!parsedPerm.success) return { error: "Invalid permission value" };

  const user = await requireUser();
  const ctx = await buildCtx(user.id);

  await withContext(ctx, () => requireOrgAccess(orgId, "member"));

  const canManage = await canManageShares(noteId, orgId, user.id);
  if (!canManage) return { error: "Forbidden" };

  const admin = getAdminSupabase();

  // Confirm target user exists and is in this org.
  const { data: targetMembership } = await admin
    .from("memberships")
    .select("user_id")
    .eq("user_id", targetUserId)
    .eq("org_id", orgId)
    .maybeSingle();

  if (!targetMembership) {
    return { error: "Target user is not a member of this organization" };
  }

  // Upsert: update permission if the share already exists.
  const { error } = await admin.from("note_shares").upsert(
    {
      note_id: noteId,
      user_id: targetUserId,
      permission: parsedPerm.data,
    },
    { onConflict: "note_id,user_id" },
  );

  if (error) return { error: error.message };

  await withContext(ctx, () =>
    logAudit({
      action: "note_share.grant",
      resourceType: "note_share",
      resourceId: noteId,
      metadata: { orgId, targetUserId, permission: parsedPerm.data },
    }),
  );

  revalidatePath(`/notes/${noteId}`);
  return null;
}

// ── revokeShareAction ─────────────────────────────────────────────────────────

export async function revokeShareAction(
  noteId: string,
  targetUserId: string,
  orgId: string,
): Promise<null | { error: string }> {
  const user = await requireUser();
  const ctx = await buildCtx(user.id);

  await withContext(ctx, () => requireOrgAccess(orgId, "member"));

  const canManage = await canManageShares(noteId, orgId, user.id);
  if (!canManage) return { error: "Forbidden" };

  const admin = getAdminSupabase();

  const { error } = await admin
    .from("note_shares")
    .delete()
    .eq("note_id", noteId)
    .eq("user_id", targetUserId);

  if (error) return { error: error.message };

  await withContext(ctx, () =>
    logAudit({
      action: "note_share.revoke",
      resourceType: "note_share",
      resourceId: noteId,
      metadata: { orgId, targetUserId },
    }),
  );

  revalidatePath(`/notes/${noteId}`);
  return null;
}

// ── listSharesAction ──────────────────────────────────────────────────────────

export interface ShareItem {
  userId: string;
  userEmail: string;
  permission: "view" | "comment" | "edit";
}

export async function listSharesAction(
  noteId: string,
  orgId: string,
): Promise<ShareItem[] | { error: string }> {
  const user = await requireUser();
  const ctx = await buildCtx(user.id);

  await withContext(ctx, () => requireOrgAccess(orgId, "member"));

  const canManage = await canManageShares(noteId, orgId, user.id);
  if (!canManage) return { error: "Forbidden" };

  const admin = getAdminSupabase();

  const { data, error } = await admin
    .from("note_shares")
    .select("user_id, permission")
    .eq("note_id", noteId);

  if (error) return { error: error.message };

  await withContext(ctx, () =>
    logAudit({
      action: "note_share.list",
      resourceType: "note_share",
      resourceId: noteId,
      metadata: { orgId, count: data?.length ?? 0 },
    }),
  );

  // Batch-fetch user emails for display; never logged.
  const userIds = (data ?? []).map((s) => s.user_id as string);
  const emailMap: Record<string, string> = {};
  if (userIds.length > 0) {
    const { data: usersData } = await admin
      .from("users")
      .select("id, email")
      .in("id", userIds);
    for (const u of usersData ?? []) {
      emailMap[u.id as string] = u.email as string;
    }
  }

  return (data ?? []).map((s) => ({
    userId: s.user_id as string,
    userEmail: emailMap[s.user_id as string] ?? "",
    permission: s.permission as "view" | "comment" | "edit",
  }));
}
