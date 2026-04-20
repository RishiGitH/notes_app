export const dynamic = "force-dynamic";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { requireUser } from "@/lib/auth/server";
import { buildAuthContinuePath } from "@/lib/auth/navigation";
import { requireOrgAccess } from "@/lib/security/permissions";
import { withContext } from "@/lib/logging/request-context";
import { listNotesAction, type ListNotesParams } from "@/lib/notes/actions";
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
  searchParams: Promise<{
    deleted?: string;
    page?: string;
    vis?: string;
    q?: string;
    tags?: string | string[];
  }>;
}) {
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
  const page = Math.max(1, parseInt(params.page ?? "1", 10) || 1);
  const pageSize = 25;
  const q = params.q?.trim() || undefined;
  const VALID_VIS = ["all", "private", "org", "shared"] as const;
  const visibility = (VALID_VIS.includes(params.vis as typeof VALID_VIS[number])
    ? params.vis
    : "all") as ListNotesParams["visibility"];
  const tags = Array.isArray(params.tags)
    ? params.tags
    : params.tags
    ? [params.tags]
    : [];

  const [result, tagsResult] = await Promise.all([
    listNotesAction({ orgId, includeDeleted, page, pageSize, q, visibility, tags }),
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
          notes={result.notes}
          total={result.total}
          page={result.page}
          pageSize={result.pageSize}
          isAdmin={isAdmin}
          orgId={orgId}
          showDeleted={includeDeleted}
          allTags={allTags}
          currentUserId={user.id}
          currentQ={q ?? ""}
          currentVis={visibility ?? "all"}
          currentTags={tags}
        />
      </Suspense>
    </div>
  );
}
