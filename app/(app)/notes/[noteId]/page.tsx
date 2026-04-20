import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { buildAuthContinuePath } from "@/lib/auth/navigation";
import { getNoteAction, listVersionsAction } from "@/lib/notes/actions";
import { listSharesAction } from "@/lib/notes/share-actions";
import { listNoteFiles } from "@/lib/files/actions";
import { getLatestSummary } from "@/lib/ai/summarize";
import { listTagsAction } from "@/lib/notes/tag-actions";
import { MarkdownBody } from "@/components/markdown-body";
import { EmptyState } from "@/components/empty-state";
import { ErrorAlert } from "@/components/error-alert";
import { EditForm } from "./edit-form";
import { SharePanel } from "./share-panel";
import { TagsPanel } from "./tags-panel";
import { VersionsTab } from "./versions-tab";
import { FilesTab } from "./files-tab";
import { AiSummaryTab } from "./ai-summary-tab";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default async function NoteDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ noteId: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const h = await headers();
  const orgId = h.get("x-org-id");
  if (!orgId) redirect(buildAuthContinuePath(h.get("x-return-to"), "/notes"));

  const { noteId } = await params;
  const { tab = "read" } = await searchParams;

  // Note is already loaded in layout; re-fetch here for tab-specific data.
  // This is intentional: each tab needs fresh data without prop-drilling through layout.
  const noteResult = await getNoteAction(noteId, orgId);
  if ("error" in noteResult) {
    return <ErrorAlert message={noteResult.error} />;
  }

  // --- Read tab ---
  if (tab === "read" || !tab) {
    if (!noteResult.content.trim()) {
      return (
        <EmptyState
          title="Empty note"
          description="Switch to Edit to start writing."
        >
          <Button asChild variant="outline" size="sm">
            <Link href={`/notes/${noteId}?tab=edit`}>Edit note</Link>
          </Button>
        </EmptyState>
      );
    }
    return (
      <div className="pt-4">
        <MarkdownBody content={noteResult.content} />
      </div>
    );
  }

  // --- Edit tab ---
  if (tab === "edit") {
    if (!noteResult.canEdit) {
      return (
        <EmptyState
          title="Read-only"
          description="You don't have edit access to this note."
        />
      );
    }
    return (
      <EditForm
        noteId={noteId}
        orgId={orgId}
        initialTitle={noteResult.title}
        initialContent={noteResult.content}
        currentVersionNumber={noteResult.currentVersionNumber}
      />
    );
  }

  // --- Tags tab ---
  if (tab === "tags") {
    const allOrgTags = await listTagsAction(orgId);
    const orgTags = "error" in allOrgTags ? [] : allOrgTags;
    return (
      <TagsPanel
        noteId={noteId}
        orgId={orgId}
        currentTags={noteResult.tags}
        allOrgTags={orgTags}
        canEdit={noteResult.canEdit}
      />
    );
  }

  // --- Versions tab ---
  if (tab === "versions") {    const versionsResult = await listVersionsAction(noteId, orgId);
    if ("error" in versionsResult) {
      return <ErrorAlert message={versionsResult.error} />;
    }
    return <VersionsTab versions={versionsResult} noteId={noteId} />;
  }

  // --- Files tab ---
  if (tab === "files") {
    let noteFiles: Awaited<ReturnType<typeof listNoteFiles>> = [];
    let filesError: string | null = null;
    try {
      noteFiles = await listNoteFiles(noteId);
    } catch (err) {
      filesError = err instanceof Error ? err.message : "Could not load files";
    }
    if (filesError) return <ErrorAlert message={filesError} />;
    return (
      <FilesTab
        noteId={noteId}
        canEdit={noteResult.canEdit}
        initialFiles={noteFiles}
      />
    );
  }

  // --- AI Summary tab ---
  if (tab === "ai") {
    let summary: Awaited<ReturnType<typeof getLatestSummary>> = null;
    let summaryError: string | null = null;
    try {
      summary = await getLatestSummary(noteId);
    } catch (err) {
      summaryError =
        err instanceof Error ? err.message : "Could not load summary";
    }
    if (summaryError) return <ErrorAlert message={summaryError} />;
    return (
      <AiSummaryTab
        noteId={noteId}
        canEdit={noteResult.canEdit}
        initialSummary={summary}
      />
    );
  }

  // --- Share tab ---
  if (tab === "share") {
    const sharesResult = await listSharesAction(noteId, orgId);
    const shares = "error" in sharesResult ? [] : sharesResult;
    return (
      <SharePanel
        noteId={noteId}
        orgId={orgId}
        currentVisibility={noteResult.visibility}
        shares={shares}
        canManage={noteResult.canEdit}
      />
    );
  }

  return null;
}
