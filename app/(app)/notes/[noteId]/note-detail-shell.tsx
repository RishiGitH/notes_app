"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTransition, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { type NoteDetail, softDeleteNoteAction } from "@/lib/notes/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Separator } from "@/components/ui/separator";
import {
  ArrowLeft,
  MoreHorizontal,
  Trash2,
  Clock,
  Eye,
  Pencil,
  GitCommit,
  Paperclip,
  Sparkles,
  Share2,
} from "lucide-react";
import { cn } from "@/lib/utils";

const VISIBILITY_VARIANTS: Record<string, "outline" | "secondary" | "default"> = {
  private: "outline",
  org: "secondary",
  public_in_org: "default",
};

const VISIBILITY_LABELS: Record<string, string> = {
  private: "Private",
  org: "Org",
  public_in_org: "Public",
};

function formatDate(iso: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));
}

const TABS = [
  { id: "read", label: "Read", icon: Eye, href: "" },
  { id: "edit", label: "Edit", icon: Pencil, href: "?tab=edit" },
  { id: "versions", label: "Versions", icon: GitCommit, href: "?tab=versions" },
  { id: "files", label: "Files", icon: Paperclip, href: "?tab=files" },
  { id: "ai", label: "AI Summary", icon: Sparkles, href: "?tab=ai" },
  { id: "share", label: "Share", icon: Share2, href: "?tab=share" },
];

interface NoteDetailShellProps {
  note: NoteDetail;
  orgId: string;
  isAdmin: boolean;
  children: React.ReactNode;
}

export function NoteDetailShell({
  note,
  orgId,
  isAdmin,
  children,
}: NoteDetailShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [deleteOpen, setDeleteOpen] = useState(false);

  // Determine active tab from URL
  const searchParams =
    typeof window !== "undefined"
      ? new URLSearchParams(window.location.search)
      : null;
  const activeTab = searchParams?.get("tab") ?? "read";

  // Versions sub-route detection
  const isVersionsRoute = pathname.includes("/versions/");

  function handleDelete() {
    startTransition(async () => {
      const result = await softDeleteNoteAction(note.id, orgId);
      if (result && "error" in result) {
        toast.error(result.error);
        return;
      }
      toast.success("Note deleted");
      router.push("/notes");
    });
  }

  return (
    <div className="max-w-4xl mx-auto space-y-0">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-4">
        <div className="flex items-center gap-3 min-w-0">
          <Button asChild variant="ghost" size="icon" className="h-7 w-7 shrink-0">
            <Link href="/notes">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div className="min-w-0">
            <h1 className="text-xl font-semibold truncate">
              {note.title || "Untitled"}
            </h1>
            <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
              <Clock className="h-3 w-3" />
              <span>v{note.currentVersionNumber} · {formatDate(note.updatedAt)}</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Badge
            variant={VISIBILITY_VARIANTS[note.visibility] ?? "outline"}
            className="text-xs"
          >
            {VISIBILITY_LABELS[note.visibility] ?? note.visibility}
          </Badge>
          {(note.canEdit || isAdmin) && (
            <>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-7 w-7">
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    className="text-destructive focus:text-destructive gap-2"
                    onClick={() => setDeleteOpen(true)}
                  >
                    <Trash2 className="h-4 w-4" />
                    Delete note
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete this note?</AlertDialogTitle>
                    <AlertDialogDescription>
                      The note will be soft-deleted and hidden from the notes list.
                      Admins can restore it.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={handleDelete}
                      disabled={isPending}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                      {isPending ? "Deleting…" : "Delete"}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </>
          )}
        </div>
      </div>

      {/* Tab strip — hide on version diff sub-route */}
      {!isVersionsRoute && (
        <>
          <div className="flex items-center gap-0 border-b border-border overflow-x-auto">
            {TABS.map(({ id, label, icon: Icon, href }) => {
              const isActive = id === "read"
                ? activeTab === "read" || activeTab === ""
                : activeTab === id;
              return (
                <Link
                  key={id}
                  href={`/notes/${note.id}${href}`}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-2 text-sm border-b-2 whitespace-nowrap transition-colors",
                    isActive
                      ? "border-foreground text-foreground font-medium"
                      : "border-transparent text-muted-foreground hover:text-foreground",
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {label}
                </Link>
              );
            })}
          </div>
          <Separator className="mb-6 opacity-0" />
        </>
      )}

      {children}
    </div>
  );
}
