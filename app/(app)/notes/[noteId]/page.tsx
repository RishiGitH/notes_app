import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/server";
import { getNoteAction, listVersionsAction } from "@/lib/notes/actions";
import { listSharesAction } from "@/lib/notes/share-actions";
import { MarkdownBody } from "@/components/markdown-body";
import { EmptyState } from "@/components/empty-state";
import { ErrorAlert } from "@/components/error-alert";
import { EditForm } from "./edit-form";
import { SharePanel } from "./share-panel";
import { VersionsTab } from "./versions-tab";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Sparkles, Paperclip } from "lucide-react";

export default async function NoteDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ noteId: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const h = await headers();
  const orgId = h.get("x-org-id") ?? "";

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

  // --- Versions tab ---
  if (tab === "versions") {
    const versionsResult = await listVersionsAction(noteId, orgId);
    if ("error" in versionsResult) {
      return <ErrorAlert message={versionsResult.error} />;
    }
    return <VersionsTab versions={versionsResult} noteId={noteId} />;
  }

  // --- Files tab (3C placeholder) ---
  if (tab === "files") {
    return (
      <EmptyState
        title="File attachments"
        description="File upload will be available once the infra track ships."
      >
        <Paperclip className="h-8 w-8 text-muted-foreground/40" />
      </EmptyState>
    );
  }

  // --- AI Summary tab (3C placeholder) ---
  if (tab === "ai") {
    return (
      <EmptyState
        title="AI Summary"
        description="AI summarization will be available once the infra track ships."
      >
        <Sparkles className="h-8 w-8 text-muted-foreground/40" />
      </EmptyState>
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
