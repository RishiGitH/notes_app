"use client";

import { useState, useTransition, useRef } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { uploadNoteFile, type NoteFileItem } from "@/lib/files/actions";
import { deleteNoteFile } from "@/lib/files/actions";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { EmptyState } from "@/components/empty-state";
import { Paperclip, Upload, Download, Trash2, FileText } from "lucide-react";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(d: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(d));
}

interface FilesTabProps {
  noteId: string;
  canEdit: boolean;
  initialFiles: NoteFileItem[];
}

export function FilesTab({ noteId, canEdit, initialFiles }: FilesTabProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    const formData = new FormData();
    formData.append("file", file);

    startTransition(async () => {
      try {
        await uploadNoteFile(noteId, formData);
        toast.success(`${file.name} uploaded`);
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Upload failed");
      } finally {
        setUploading(false);
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    });
  }

  function handleDelete(fileId: string, fileName: string) {
    startTransition(async () => {
      try {
        await deleteNoteFile(fileId, noteId);
        toast.success(`${fileName} deleted`);
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Delete failed");
      }
    });
  }

  return (
    <div className="pt-4 space-y-4">
      {canEdit && (
        <div className="flex items-center gap-3">
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.png,.jpg,.jpeg,.gif,.webp,.txt,.md"
            className="sr-only"
            id="file-upload"
            onChange={handleUpload}
            disabled={uploading || isPending}
          />
          <Button
            asChild
            variant="outline"
            size="sm"
            className="gap-2"
          >
            <label htmlFor="file-upload" className="cursor-pointer">
              <Upload className="h-4 w-4" />
              {uploading ? "Uploading…" : "Upload file"}
            </label>
          </Button>
          <span className="text-xs text-muted-foreground">
            PDF, images, text, markdown · max 10 MB
          </span>
        </div>
      )}

      {initialFiles.length === 0 ? (
        <EmptyState
          title="No files attached"
          description={
            canEdit
              ? "Upload a file to attach it to this note."
              : "No files have been attached to this note."
          }
        >
          <Paperclip className="h-8 w-8 text-muted-foreground/40" />
        </EmptyState>
      ) : (
        <div className="rounded-md border divide-y divide-border">
          {initialFiles.map((file) => (
            <div
              key={file.id}
              className="flex items-center justify-between gap-3 p-3"
            >
              <div className="flex items-center gap-2 min-w-0">
                <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{file.originalName}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatBytes(file.sizeBytes)} · {formatDate(file.createdAt)}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Button asChild variant="ghost" size="icon" className="h-7 w-7">
                  <a
                    href={`/api/files/${file.id}/download`}
                    title="Download"
                  >
                    <Download className="h-3.5 w-3.5" />
                  </a>
                </Button>
                {canEdit && (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-destructive"
                        disabled={isPending}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete file?</AlertDialogTitle>
                        <AlertDialogDescription>
                          <span className="font-medium">{file.originalName}</span> will
                          be permanently deleted and cannot be recovered.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          onClick={() => handleDelete(file.id, file.originalName)}
                        >
                          Delete
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
