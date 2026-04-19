"use client";

import Link from "next/link";
import { type VersionListItem } from "@/lib/notes/actions";
import { EmptyState } from "@/components/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { GitCommit, Eye } from "lucide-react";
import { formatDate } from "@/lib/utils/note-display";

interface VersionsTabProps {
  versions: VersionListItem[];
  noteId: string;
}

export function VersionsTab({ versions, noteId }: VersionsTabProps) {
  if (versions.length === 0) {
    return (
      <EmptyState
        title="No versions yet"
        description="Save the note to create the first version snapshot."
      />
    );
  }

  return (
    <div className="pt-4">
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Version</TableHead>
              <TableHead>Author</TableHead>
              <TableHead>Saved</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {versions.map((v, i) => (
              <TableRow key={v.id}>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <GitCommit className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="font-medium text-sm">v{v.versionNumber}</span>
                    {i === 0 && (
                      <Badge variant="secondary" className="text-xs">
                        current
                      </Badge>
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground max-w-[160px] truncate">
                  {v.authorEmail || v.authorId}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                  {formatDate(v.createdAt)}
                </TableCell>
                <TableCell className="text-right">
                  <Button asChild variant="ghost" size="sm" className="h-7 gap-1">
                    <Link href={`/notes/${noteId}/versions/${v.id}`}>
                      <Eye className="h-3.5 w-3.5" />
                      View diff
                    </Link>
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
