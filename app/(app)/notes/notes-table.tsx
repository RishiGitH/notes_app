"use client";

import { type ColumnDef } from "@tanstack/react-table";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { DataTable } from "@/components/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/empty-state";
import { type NoteListItem } from "@/lib/notes/actions";
import { FileText, Trash2 } from "lucide-react";
import { useState, useMemo } from "react";
import Link from "next/link";

const VISIBILITY_VARIANTS: Record<string, "outline" | "secondary" | "default"> =
  {
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
  }).format(new Date(iso));
}

const columns: ColumnDef<NoteListItem>[] = [
  {
    accessorKey: "title",
    header: "Title",
    cell: ({ row }) => (
      <div className="flex items-center gap-2 min-w-0">
        <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="truncate max-w-[320px] font-medium">
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
        {formatDate(row.original.updatedAt)}
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
}

export function NotesTable({
  notes,
  isAdmin,
  orgId,
  showDeleted,
}: NotesTableProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [filter, setFilter] = useState("");
  const [visFilter, setVisFilter] = useState<string>("all");

  const filtered = useMemo(() => {
    return notes.filter((n) => {
      const matchesText =
        filter === "" ||
        (n.title ?? "").toLowerCase().includes(filter.toLowerCase());
      const matchesVis =
        visFilter === "all" || n.visibility === visFilter;
      return matchesText && matchesVis;
    });
  }, [notes, filter, visFilter]);

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
    <div className="flex flex-wrap items-center gap-2">
      <Input
        placeholder="Filter notes…"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        className="h-8 w-52 text-sm"
      />
      <select
        value={visFilter}
        onChange={(e) => setVisFilter(e.target.value)}
        className="h-8 rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
      >
        <option value="all">All visibility</option>
        <option value="private">Private</option>
        <option value="org">Org</option>
        <option value="public_in_org">Public</option>
      </select>
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
      emptyMessage={filter || visFilter !== "all" ? "No notes match your filters." : "No notes."}
    />
  );
}
