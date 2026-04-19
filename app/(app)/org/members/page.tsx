import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { requireUser, getAdminSupabase } from "@/lib/auth/server";
import { requireOrgAccess } from "@/lib/security/permissions";
import { withContext } from "@/lib/logging/request-context";
import { PermissionDenied } from "@/components/permission-denied";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { ErrorAlert } from "@/components/error-alert";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AddMemberForm } from "./add-member-form";
import { RemoveMemberButton } from "./remove-member-button";
import { formatDateShort } from "@/lib/utils/note-display";

const ROLE_VARIANTS: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  owner: "default",
  admin: "secondary",
  member: "outline",
  viewer: "outline",
};

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
  const requestId = h.get("x-request-id") ?? "unknown";

  let membership;
  try {
    membership = await withContext(
      { requestId, orgId, userId: user.id },
      () => requireOrgAccess(orgId, "viewer"),
    );
  } catch {
    return <PermissionDenied />;
  }

  const isAdmin = membership.role === "admin" || membership.role === "owner";

  const admin = getAdminSupabase();
  const { data: memberships, error } = await admin
    .from("memberships")
    .select("id, role, user_id, created_at, users(email, display_name)")
    .eq("org_id", orgId)
    .order("created_at");

  if (error) {
    return (
      <div className="space-y-4">
        <PageHeader title="Members" />
        <ErrorAlert message={error.message} />
      </div>
    );
  }

  const rows = (memberships ?? []).map((m) => {
    const u = Array.isArray(m.users) ? m.users[0] : m.users;
    return {
      id: m.id as string,
      userId: m.user_id as string,
      email: (u?.email as string) ?? m.user_id as string,
      displayName: (u?.display_name as string) ?? "",
      role: m.role as string,
      createdAt: m.created_at as string,
    };
  });

  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader
        title="Members"
        description={`${rows.length} member${rows.length === 1 ? "" : "s"} in this workspace`}
      />

      {rows.length === 0 ? (
        <EmptyState title="No members found" />
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Member</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Joined</TableHead>
                {isAdmin && <TableHead className="w-10" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((m) => (
                <TableRow key={m.id}>
                  <TableCell>
                    <div>
                      <p className="text-sm font-medium">{m.email}</p>
                      {m.displayName && (
                        <p className="text-xs text-muted-foreground">
                          {m.displayName}
                        </p>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={ROLE_VARIANTS[m.role] ?? "outline"}
                      className="text-xs capitalize"
                    >
                      {m.role}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {formatDateShort(m.createdAt)}
                  </TableCell>
                  {isAdmin && (
                    <TableCell>
                      {m.role !== "owner" && m.userId !== user.id && (
                        <RemoveMemberButton
                          membershipId={m.id}
                          email={m.email}
                        />
                      )}
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {isAdmin && (
        <div className="space-y-3 pt-2">
          <h2 className="text-sm font-medium">Add member</h2>
          <AddMemberForm />
        </div>
      )}
    </div>
  );
}
