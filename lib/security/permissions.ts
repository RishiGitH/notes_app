// Security helpers for tenant-scoped authorization.
//
// requireOrgAccess() is the primary gate: every Server Action and route
// handler that reads or writes tenant-scoped data calls this before any DB
// work. (AGENTS.md section 2 item 4)
//
// The admin (service-role) client is used deliberately: RLS policies are
// the Postgres-level ground truth, but we need an authoritative server-side
// check that runs before we even touch the DB so that we can log the denial
// and return a clean error to the caller without leaking DB query behaviour.
//
// Node runtime only (calls logAudit which requires AsyncLocalStorage).

import { requireUser } from "@/lib/auth/server";
import { getAdminSupabase } from "@/lib/auth/server";
import { logAudit } from "@/lib/logging/audit";
import {
  getRequestContext,
  withContext,
} from "@/lib/logging/request-context";

// Role ordering: higher index = higher privilege.
export const ROLE_ORDER = {
  viewer: 0,
  member: 1,
  admin: 2,
  owner: 3,
} as const;

export type RoleEnum = keyof typeof ROLE_ORDER;

function roleAtLeast(actual: string, minimum: RoleEnum): boolean {
  const actualLevel = ROLE_ORDER[actual as RoleEnum] ?? -1;
  const minLevel = ROLE_ORDER[minimum];
  return actualLevel >= minLevel;
}

export interface MembershipRow {
  id: string;
  userId: string;
  orgId: string;
  role: RoleEnum;
}

// requireOrgAccess verifies that the authenticated user is a member of orgId
// with at least minRole. Uses the service-role client so it is not affected
// by RLS policies (authoritative server-side check). Logs permission.denied
// on failure so every denial is in the audit trail.
//
// Throws with a generic "Forbidden" message on failure (never leaks why:
// whether the org exists, whether the user is a member, etc.).
export async function requireOrgAccess(
  orgId: string,
  minRole: RoleEnum,
): Promise<MembershipRow> {
  const user = await requireUser();
  const admin = getAdminSupabase();

  const { data, error } = await admin
    .from("memberships")
    .select("id, user_id, org_id, role")
    .eq("user_id", user.id)
    .eq("org_id", orgId)
    .maybeSingle();

  if (error || !data || !roleAtLeast(data.role, minRole)) {
    // Force the calling user's id into the request context before logging.
    // requireOrgAccess is called from many places; if any caller forgets to
    // wrap in withContext, the permission.denied row would otherwise land
    // with actor_id = null (logAudit reads userId from AsyncLocalStorage)
    // and the denial becomes un-attributable, defeating forensic review.
    const existing = getRequestContext();
    await withContext(
      { ...existing, orgId, userId: existing.userId ?? user.id },
      () =>
        logAudit({
          action: "permission.denied",
          resourceType: "org",
          resourceId: orgId,
          metadata: {
            requiredRole: minRole,
            actualRole: data?.role ?? null,
            reason: error
              ? "db_error"
              : !data
                ? "not_member"
                : "insufficient_role",
          },
        }),
    );
    throw new Error("Forbidden");
  }

  return {
    id: data.id as string,
    userId: data.user_id as string,
    orgId: data.org_id as string,
    role: data.role as RoleEnum,
  };
}

// canEditNote returns true if userId can edit the given note: they are the
// author, an org admin/owner, or have an explicit edit-level share.
// Uses the admin client — called from Server Actions after requireOrgAccess.
export async function canEditNote(
  noteId: string,
  userId: string,
): Promise<boolean> {
  const admin = getAdminSupabase();

  // Check author or org admin in one query via the notes join.
  const { data: note } = await admin
    .from("notes")
    .select("id, author_id, org_id, deleted_at")
    .eq("id", noteId)
    .is("deleted_at", null)
    .maybeSingle();

  if (!note) return false;

  if (note.author_id === userId) return true;

  // Check org role.
  const { data: membership } = await admin
    .from("memberships")
    .select("role")
    .eq("user_id", userId)
    .eq("org_id", note.org_id)
    .maybeSingle();

  if (
    membership &&
    roleAtLeast(membership.role as string, "admin")
  ) {
    return true;
  }

  // Check explicit edit share.
  const { data: share } = await admin
    .from("note_shares")
    .select("permission")
    .eq("note_id", noteId)
    .eq("user_id", userId)
    .eq("permission", "edit")
    .maybeSingle();

  return !!share;
}
