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
import { VISIBILITY_VARIANTS, VISIBILITY_LABELS, formatDateShort } from "@/lib/utils/note-display";
import { FileText, Trash2, X } from "lucide-react";
import { useState, useMemo } from "react";

const columns: ColumnDef<NoteListItem>[] = [
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
    cell: ({ row }) => (
      <Badge
        variant={VISIBILITY_VARIANTS[row.original.visibility] ?? "outline"}
        className="text-xs"
      >
        {VISIBILITY_LABELS[row.original.visibility] ?? row.original.visibility}
      </Badge>
    ),
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
];

interface NotesTableProps {
  notes: NoteListItem[];
  isAdmin: boolean;
  orgId: string;
  showDeleted: boolean;
  allTags: string[];
}

export function NotesTable({
  notes,
  isAdmin,
  showDeleted,
  allTags,
}: NotesTableProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [filter, setFilter] = useState("");
  const [visFilter, setVisFilter] = useState<string>("all");
  const [tagFilter, setTagFilter] = useState<string[]>([]);

  const filtered = useMemo(() => {
    return notes.filter((n) => {
      const matchesText =
        filter === "" ||
        (n.title ?? "").toLowerCase().includes(filter.toLowerCase());
      const matchesVis =
        visFilter === "all" || n.visibility === visFilter;
      const matchesTags =
        tagFilter.length === 0 ||
        tagFilter.some((t) => n.tags.includes(t));
      return matchesText && matchesVis && matchesTags;
    });
  }, [notes, filter, visFilter, tagFilter]);

  function toggleTag(tag: string) {
    setTagFilter((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag],
    );
  }

  function toggleDeleted() {
    const params = new URLSearchParams(searchParams.toString());
    if (showDeleted) {
      params.delete("deleted");
    } else {
      params.set("deleted", "1");
    }
    router.push(`${pathname}?${params.toString()}`);
  }

  const filterBar = (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          placeholder="Filter notes…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="h-8 w-52 text-sm"
        />
        <Select value={visFilter} onValueChange={setVisFilter}>
          <SelectTrigger className="h-8 w-36 text-sm">
            <SelectValue placeholder="Visibility" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All visibility</SelectItem>
            <SelectItem value="private">Private</SelectItem>
            <SelectItem value="org">Org</SelectItem>
            <SelectItem value="public_in_org">Public</SelectItem>
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
            const active = tagFilter.includes(tag);
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
          {tagFilter.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-5 text-xs px-1.5"
              onClick={() => setTagFilter([])}
            >
              Clear
            </Button>
          )}
        </div>
      )}
    </div>
  );

  if (filtered.length === 0 && notes.length === 0) {
    return (
      <EmptyState
        title="No notes yet"
        description="Create your first note to start writing."
      />
    );
  }

  return (
    <DataTable
      columns={columns}
      data={filtered}
      filterBar={filterBar}
      onRowClick={(note) => router.push(`/notes/${note.id}`)}
      emptyMessage={filter || visFilter !== "all" || tagFilter.length > 0 ? "No notes match your filters." : "No notes."}
    />
  );
}
