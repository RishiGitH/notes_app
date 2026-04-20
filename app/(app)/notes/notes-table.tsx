"use client";

import { type ColumnDef } from "@tanstack/react-table";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { DataTable } from "@/components/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState } from "@/components/empty-state";
import { type NoteListItem } from "@/lib/notes/actions";
import {
  VISIBILITY_VARIANTS,
  VISIBILITY_LABELS,
  resolveVisibilityKey,
  formatDateShort,
} from "@/lib/utils/note-display";
import { FileText, Trash2, X, ChevronLeft, ChevronRight } from "lucide-react";
import { useState, useMemo, useEffect, useCallback } from "react";

interface NotesTableProps {
  notes: NoteListItem[];
  total: number;
  page: number;
  pageSize: number;
  isAdmin: boolean;
  orgId: string;
  showDeleted: boolean;
  allTags: string[];
  currentUserId: string;
  currentQ: string;
  currentVis: string;
  currentTags: string[];
}

export function NotesTable({
  notes,
  total,
  page,
  pageSize,
  isAdmin,
  showDeleted,
  allTags,
  currentUserId,
  currentQ,
  currentVis,
  currentTags,
}: NotesTableProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Local draft for debounced text search
  const [draft, setDraft] = useState(currentQ);

  // Sync draft when URL changes (e.g. browser back/forward)
  useEffect(() => {
    setDraft(currentQ);
  }, [currentQ]);

  const pushParams = useCallback(
    (updates: Record<string, string | string[] | undefined>) => {
      const p = new URLSearchParams(searchParams.toString());
      // Reset to page 1 whenever any filter changes
      p.delete("page");
      for (const [k, v] of Object.entries(updates)) {
        p.delete(k);
        if (Array.isArray(v)) {
          v.forEach((x) => p.append(k, x));
        } else if (v !== undefined && v !== "" && v !== "all") {
          p.set(k, v);
        }
      }
      router.push(`${pathname}?${p.toString()}`);
    },
    [searchParams, pathname, router],
  );

  // Debounced text search
  useEffect(() => {
    const timer = setTimeout(() => {
      if (draft !== currentQ) {
        pushParams({ q: draft || undefined });
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [draft, currentQ, pushParams]);

  function toggleTag(tag: string) {
    const next = currentTags.includes(tag)
      ? currentTags.filter((t) => t !== tag)
      : [...currentTags, tag];
    pushParams({ tags: next.length > 0 ? next : undefined });
  }

  function toggleDeleted() {
    const p = new URLSearchParams(searchParams.toString());
    if (showDeleted) {
      p.delete("deleted");
    } else {
      p.set("deleted", "1");
    }
    router.push(`${pathname}?${p.toString()}`);
  }

  function goToPage(targetPage: number) {
    const p = new URLSearchParams(searchParams.toString());
    if (targetPage <= 1) {
      p.delete("page");
    } else {
      p.set("page", String(targetPage));
    }
    router.push(`${pathname}?${p.toString()}`);
  }

  const columns = useMemo<ColumnDef<NoteListItem>[]>(
    () => [
      {
        accessorKey: "title",
        header: "Title",
        cell: ({ row }) => (
          <div className="flex items-center gap-2 min-w-0">
            <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="truncate max-w-[240px] font-medium">
              {row.original.title || "Untitled"}
            </span>
            {row.original.deletedAt && (
              <Badge variant="destructive" className="shrink-0 text-xs">
                Deleted
              </Badge>
            )}
          </div>
        ),
        enableSorting: true,
      },
      {
        accessorKey: "tags",
        header: "Tags",
        cell: ({ row }) => (
          <div className="flex flex-wrap gap-1 max-w-[200px]">
            {row.original.tags.length === 0 ? (
              <span className="text-xs text-muted-foreground/50">—</span>
            ) : (
              row.original.tags.map((tag) => (
                <Badge key={tag} variant="outline" className="text-xs px-1.5 py-0">
                  {tag}
                </Badge>
              ))
            )}
          </div>
        ),
        enableSorting: false,
      },
      {
        accessorKey: "visibility",
        header: "Visibility",
        cell: ({ row }) => {
          const isAuthor = row.original.authorId === currentUserId;
          const visKey = resolveVisibilityKey(
            row.original.visibility,
            row.original.isSharedWithMe,
            isAuthor,
          );
          return (
            <Badge variant={VISIBILITY_VARIANTS[visKey] ?? "outline"} className="text-xs">
              {VISIBILITY_LABELS[visKey] ?? row.original.visibility}
            </Badge>
          );
        },
        enableSorting: false,
      },
      {
        accessorKey: "updatedAt",
        header: "Updated",
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground whitespace-nowrap">
            {formatDateShort(row.original.updatedAt)}
          </span>
        ),
        enableSorting: true,
      },
    ],
    [currentUserId],
  );

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const start = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);

  const filterBar = (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          placeholder="Search notes…"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          className="h-8 w-52 text-sm"
        />
        <Select
          value={currentVis || "all"}
          onValueChange={(v) => pushParams({ vis: v })}
        >
          <SelectTrigger className="h-8 w-40 text-sm">
            <SelectValue placeholder="Visibility" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All visibility</SelectItem>
            <SelectItem value="private">Private</SelectItem>
            <SelectItem value="org">Org members</SelectItem>
            <SelectItem value="shared">Shared with me</SelectItem>
          </SelectContent>
        </Select>
        {isAdmin && (
          <Button
            variant={showDeleted ? "secondary" : "ghost"}
            size="sm"
            className="h-8 gap-1 text-xs"
            onClick={toggleDeleted}
          >
            <Trash2 className="h-3.5 w-3.5" />
            {showDeleted ? "Hide deleted" : "Show deleted"}
          </Button>
        )}
      </div>
      {allTags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 items-center">
          <span className="text-xs text-muted-foreground">Tags:</span>
          {allTags.map((tag) => {
            const active = currentTags.includes(tag);
            return (
              <button
                key={tag}
                type="button"
                onClick={() => toggleTag(tag)}
                className="inline-flex items-center gap-1"
              >
                <Badge
                  variant={active ? "default" : "outline"}
                  className="text-xs cursor-pointer hover:opacity-80 transition-opacity"
                >
                  {tag}
                  {active && <X className="h-2.5 w-2.5 ml-0.5" />}
                </Badge>
              </button>
            );
          })}
          {currentTags.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-5 text-xs px-1.5"
              onClick={() => pushParams({ tags: undefined })}
            >
              Clear
            </Button>
          )}
        </div>
      )}
    </div>
  );

  if (notes.length === 0 && total === 0 && !currentQ && currentVis === "all" && currentTags.length === 0) {
    return (
      <EmptyState
        title="No notes yet"
        description="Create your first note to start writing."
      />
    );
  }

  return (
    <div className="space-y-3">
      <DataTable
        columns={columns}
        data={notes}
        filterBar={filterBar}
        onRowClick={(note) => router.push(`/notes/${note.id}`)}
        emptyMessage={
          currentQ || currentVis !== "all" || currentTags.length > 0
            ? "No notes match your filters."
            : "No notes."
        }
      />

      {/* Pagination bar */}
      <div className="flex items-center justify-between text-sm text-muted-foreground px-1">
        <span>
          {total === 0
            ? "No notes"
            : `Showing ${start}–${end} of ${total} note${total === 1 ? "" : "s"}`}
        </span>
        {totalPages > 1 && (
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              className="h-7 px-2"
              disabled={page <= 1}
              onClick={() => goToPage(page - 1)}
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              Prev
            </Button>
            <span className="px-2 text-xs">
              {page} / {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              className="h-7 px-2"
              disabled={page >= totalPages}
              onClick={() => goToPage(page + 1)}
            >
              Next
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
