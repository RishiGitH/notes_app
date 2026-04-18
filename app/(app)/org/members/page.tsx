// Members page — server component. Lists current org members and provides a
// form to add a new member by email. Requires admin access to add/remove.

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { requireUser, getAdminSupabase } from "@/lib/auth/server";
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

  const admin = getAdminSupabase();

  // Fetch members with their user info.
  const { data: memberships } = await admin
    .from("memberships")
    .select("id, role, user_id, users(email, display_name)")
    .eq("org_id", orgId)
    .order("created_at");

  // Check if current user is admin or owner.
  const currentMembership = memberships?.find((m) => m.user_id === user.id);
  const isAdmin =
    currentMembership?.role === "admin" ||
    currentMembership?.role === "owner";

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
