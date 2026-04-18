// Members page — server component. Lists current org members and provides a
// form to add a new member by email. Requires admin access to add/remove.

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { requireUser, getAdminSupabase } from "@/lib/auth/server";
import { requireOrgAccess } from "@/lib/security/permissions";
import { withContext } from "@/lib/logging/request-context";
import { AddMemberForm } from "./add-member-form";

export default async function MembersPage() {
  let user;
  try {
    user = await requireUser();
  } catch {
    redirect("/login");
  }

  const h = await headers();
  const orgId = h.get("x-org-id");
  if (!orgId) redirect("/org/create");

  // Authoritative server-side gate: verify the caller is a member of orgId
  // before any tenant-scoped DB read. Throws on non-member (caught by the
  // error boundary) and writes a permission.denied audit row. This closes
  // the x-org-id header-smuggling / stale-cookie class of bugs: even if an
  // attacker makes the header say a foreign org, this check rejects them
  // before the admin query runs.
  const requestId = h.get("x-request-id") ?? "unknown";
  const membership = await withContext(
    { requestId, orgId, userId: user.id },
    () => requireOrgAccess(orgId, "viewer"),
  );

  const admin = getAdminSupabase();

  // Fetch members with their user info.
  const { data: memberships } = await admin
    .from("memberships")
    .select("id, role, user_id, users(email, display_name)")
    .eq("org_id", orgId)
    .order("created_at");

  const isAdmin = membership.role === "admin" || membership.role === "owner";

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-xl font-semibold">Members</h1>

      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-muted-foreground">
            <th className="pb-2 pr-4">Email</th>
            <th className="pb-2 pr-4">Role</th>
          </tr>
        </thead>
        <tbody>
          {(memberships ?? []).map((m) => {
            const u = Array.isArray(m.users) ? m.users[0] : m.users;
            return (
              <tr key={m.id} className="border-b border-border">
                <td className="py-2 pr-4">
                  {u?.email ?? m.user_id}
                </td>
                <td className="py-2 pr-4 capitalize">{m.role}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {isAdmin && (
        <div className="space-y-2">
          <h2 className="text-base font-medium">Add member</h2>
          <AddMemberForm />
        </div>
      )}
    </div>
  );
}
