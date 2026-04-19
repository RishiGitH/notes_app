import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { requireUser } from "@/lib/auth/server";
import { requireOrgAccess } from "@/lib/security/permissions";
import { withContext } from "@/lib/logging/request-context";
import { listNotesAction } from "@/lib/notes/actions";
import { listTagsAction } from "@/lib/notes/tag-actions";
import { PageHeader } from "@/components/page-header";
import { PermissionDenied } from "@/components/permission-denied";
import { ErrorAlert } from "@/components/error-alert";
import { TableSkeleton } from "@/components/loading-skeleton";
import { NewNoteButton } from "./new-note-button";
import { NotesTable } from "./notes-table";

export default async function NotesPage({
  searchParams,
}: {
  searchParams: Promise<{ deleted?: string }>;
}) {
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
    membership = await withContext({ requestId, orgId, userId: user.id }, () =>
      requireOrgAccess(orgId, "viewer"),
    );
  } catch {
    return <PermissionDenied />;
  }

  const isAdmin =
    membership.role === "admin" || membership.role === "owner";

  const params = await searchParams;
  const includeDeleted = isAdmin && params.deleted === "1";

  const [result, tagsResult] = await Promise.all([
    listNotesAction(orgId, includeDeleted),
    listTagsAction(orgId),
  ]);
  const allTags = "error" in tagsResult ? [] : tagsResult.map((t) => t.name);

  if ("error" in result) {
    return (
      <div className="space-y-4">
        <PageHeader
          title="Notes"
          action={<NewNoteButton orgId={orgId} />}
        />
        <ErrorAlert message={result.error} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Notes"
        action={<NewNoteButton orgId={orgId} />}
      />
      <Suspense fallback={<TableSkeleton />}>
        <NotesTable
          notes={result}
          isAdmin={isAdmin}
          orgId={orgId}
          showDeleted={includeDeleted}
          allTags={allTags}
        />
      </Suspense>
    </div>
  );
}
