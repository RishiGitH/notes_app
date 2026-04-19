import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/server";
import { getVersionAction, getNoteAction } from "@/lib/notes/actions";
import { ErrorAlert } from "@/components/error-alert";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { DiffViewer } from "./diff-viewer";

function formatDate(iso: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));
}

export default async function VersionDiffPage({
  params,
}: {
  params: Promise<{ noteId: string; versionId: string }>;
}) {
  let user;
  try {
    user = await requireUser();
  } catch {
    redirect("/login");
  }

  const h = await headers();
  const orgId = h.get("x-org-id") ?? "";
  const { noteId, versionId } = await params;

  const [versionResult, currentResult] = await Promise.all([
    getVersionAction(noteId, versionId, orgId),
    getNoteAction(noteId, orgId),
  ]);

  if ("error" in versionResult) {
    return <ErrorAlert message={versionResult.error} />;
  }
  if ("error" in currentResult) {
    return <ErrorAlert message={currentResult.error} />;
  }

  const isCurrentVersion =
    versionResult.versionNumber === currentResult.currentVersionNumber;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button asChild variant="ghost" size="icon" className="h-7 w-7 shrink-0">
          <Link href={`/notes/${noteId}?tab=versions`}>
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <PageHeader
          title={
            isCurrentVersion
              ? `v${versionResult.versionNumber} — current`
              : `v${versionResult.versionNumber} vs. current (v${currentResult.currentVersionNumber})`
          }
          description={`Saved ${formatDate(versionResult.createdAt)}`}
        />
      </div>

      <DiffViewer
        oldContent={versionResult.content}
        newContent={currentResult.content}
        oldTitle={`v${versionResult.versionNumber}`}
        newTitle={`v${currentResult.currentVersionNumber} (current)`}
      />
    </div>
  );
}
