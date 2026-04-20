import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { requireUser, getAdminSupabase } from "@/lib/auth/server";
import { buildAuthContinuePath } from "@/lib/auth/navigation";
import { requireOrgAccess } from "@/lib/security/permissions";
import { withContext } from "@/lib/logging/request-context";
import { PermissionDenied } from "@/components/permission-denied";
import { PageHeader } from "@/components/page-header";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

// updateOrgAction and deleteOrgAction are not yet available (Phase 3A gap).
// Rendering read-only org info for now; will wire mutations when lead-backend ships.

export default async function OrgSettingsPage() {
  let user;
  try {
    user = await requireUser();
  } catch {
    redirect("/login");
  }

  const h = await headers();
  const orgId = h.get("x-org-id");
  if (!orgId) redirect(buildAuthContinuePath(h.get("x-return-to"), "/notes"));
  const requestId = h.get("x-request-id") ?? "unknown";

  let membership;
  try {
    membership = await withContext(
      { requestId, orgId, userId: user.id },
      () => requireOrgAccess(orgId, "member"),
    );
  } catch {
    return <PermissionDenied />;
  }

  const isOwner = membership.role === "owner";

  const admin = getAdminSupabase();
  const { data: org } = await admin
    .from("organizations")
    .select("id, name, slug")
    .eq("id", orgId)
    .maybeSingle();

  return (
    <div className="max-w-2xl space-y-8">
      <PageHeader title="Settings" />

      {/* General */}
      <section className="space-y-4">
        <div>
          <h2 className="text-base font-medium">General</h2>
          <p className="text-sm text-muted-foreground">
            Basic information about your workspace.
          </p>
        </div>
        <Separator />
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="org-name">Workspace name</Label>
            <div className="flex gap-2">
              <Input
                id="org-name"
                defaultValue={org?.name ?? ""}
                disabled
                className="max-w-sm"
              />
              <Badge variant="outline" className="self-center text-xs">
                Coming soon
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              Name changes will be available once the backend action ships.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="org-slug">Slug</Label>
            <Input
              id="org-slug"
              defaultValue={org?.slug ?? ""}
              disabled
              className="max-w-sm font-mono text-sm"
            />
          </div>
        </div>
      </section>

      {/* Danger zone */}
      {isOwner && (
        <section className="space-y-4">
          <div>
            <h2 className="text-base font-medium text-destructive">
              Danger zone
            </h2>
          </div>
          <Separator className="border-destructive/30" />
          <Card className="border-destructive/40">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Delete workspace</CardTitle>
              <CardDescription>
                Permanently delete this workspace and all its data. This action
                cannot be undone.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button
                variant="destructive"
                size="sm"
                disabled
                title="Delete org action coming soon"
              >
                Delete workspace
              </Button>
              <p className="text-xs text-muted-foreground mt-2">
                Deletion will be enabled once the backend action ships.
              </p>
            </CardContent>
          </Card>
        </section>
      )}
    </div>
  );
}
