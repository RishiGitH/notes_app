import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/server";
import { listVersionsAction } from "@/lib/notes/actions";
import { ErrorAlert } from "@/components/error-alert";
import { VersionsTab } from "../versions-tab";

// This page handles the /notes/[noteId]/versions route directly
// (standalone — outside note detail tabs).
export default async function VersionsPage({
  params,
}: {
  params: Promise<{ noteId: string }>;
}) {
  let user;
  try {
    user = await requireUser();
  } catch {
    redirect("/login");
  }

  const h = await headers();
  const orgId = h.get("x-org-id") ?? "";
  const { noteId } = await params;

  const result = await listVersionsAction(noteId, orgId);
  if ("error" in result) {
    return <ErrorAlert message={result.error} />;
  }

  return <VersionsTab versions={result} noteId={noteId} />;
}
