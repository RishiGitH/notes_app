"use client";

// TagsPanel: view and manage tags on a note.
// Shows current tags as removable badges. Provides a combobox to pick an
// existing org tag (or type a new one to create-then-add). Only visible when
// the user canEdit; read-only badge list shown to viewers.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { X, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  createTagAction,
  addTagToNoteAction,
  removeTagFromNoteAction,
  type TagItem,
} from "@/lib/notes/tag-actions";

interface TagsPanelProps {
  noteId: string;
  orgId: string;
  currentTags: string[];     // tag names already on the note
  allOrgTags: TagItem[];     // all tags that exist in the org
  canEdit: boolean;
}

export function TagsPanel({
  noteId,
  orgId,
  currentTags,
  allOrgTags,
  canEdit,
}: TagsPanelProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [inputValue, setInputValue] = useState("");

  // Tags not yet on the note.
  const available = allOrgTags.filter((t) => !currentTags.includes(t.name));

  // Filtered by what the user typed.
  const filtered = inputValue.trim()
    ? available.filter((t) =>
        t.name.toLowerCase().includes(inputValue.toLowerCase()),
      )
    : available;

  // Whether the typed value matches an existing tag exactly.
  const exactMatch = allOrgTags.find(
    (t) => t.name.toLowerCase() === inputValue.trim().toLowerCase(),
  );

  function handleAddExisting(tag: TagItem) {
    setOpen(false);
    setInputValue("");
    startTransition(async () => {
      const result = await addTagToNoteAction(noteId, tag.id, orgId);
      if (result && "error" in result) {
        toast.error(result.error);
      } else {
        router.refresh();
      }
    });
  }

  function handleCreateAndAdd() {
    const name = inputValue.trim();
    if (!name) return;
    setOpen(false);
    setInputValue("");
    startTransition(async () => {
      // Create tag then add it to the note.
      const created = await createTagAction(orgId, name);
      if ("error" in created) {
        // Might already exist (race) — find it.
        const existing = allOrgTags.find(
          (t) => t.name.toLowerCase() === name.toLowerCase(),
        );
        if (existing) {
          const result = await addTagToNoteAction(noteId, existing.id, orgId);
          if (result && "error" in result) { toast.error(result.error); return; }
        } else {
          toast.error(created.error);
          return;
        }
      } else {
        const result = await addTagToNoteAction(noteId, created.tagId, orgId);
        if (result && "error" in result) { toast.error(result.error); return; }
      }
      router.refresh();
    });
  }

  function handleRemove(tagName: string) {
    const tag = allOrgTags.find((t) => t.name === tagName);
    if (!tag) return;
    startTransition(async () => {
      const result = await removeTagFromNoteAction(noteId, tag.id, orgId);
      if (result && "error" in result) {
        toast.error(result.error);
      } else {
        router.refresh();
      }
    });
  }

  return (
    <div className="pt-4 space-y-4">
      <div className="flex flex-wrap gap-2 items-center min-h-[2rem]">
        {currentTags.length === 0 && (
          <span className="text-sm text-muted-foreground">No tags yet.</span>
        )}
        {currentTags.map((name) => (
          <Badge key={name} variant="secondary" className="gap-1 pr-1">
            {name}
            {canEdit && (
              <button
                type="button"
                disabled={isPending}
                onClick={() => handleRemove(name)}
                className="ml-0.5 hover:text-destructive transition-colors disabled:opacity-50"
                aria-label={`Remove tag ${name}`}
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </Badge>
        ))}

        {canEdit && (
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="h-6 px-2 text-xs gap-1">
                <Plus className="h-3 w-3" />
                Add tag
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-64 p-2" align="start">
              <Input
                placeholder="Search or create tag…"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                className="h-8 text-sm mb-2"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    if (exactMatch && !currentTags.includes(exactMatch.name)) {
                      handleAddExisting(exactMatch);
                    } else if (inputValue.trim() && !exactMatch) {
                      handleCreateAndAdd();
                    }
                  }
                }}
                autoFocus
              />
              <div className="max-h-48 overflow-y-auto space-y-0.5">
                {filtered.map((tag) => (
                  <button
                    key={tag.id}
                    type="button"
                    className="w-full text-left text-sm px-2 py-1.5 rounded hover:bg-accent transition-colors"
                    onClick={() => handleAddExisting(tag)}
                  >
                    {tag.name}
                  </button>
                ))}
                {inputValue.trim() && !exactMatch && (
                  <button
                    type="button"
                    className="w-full text-left text-sm px-2 py-1.5 rounded hover:bg-accent transition-colors text-muted-foreground"
                    onClick={handleCreateAndAdd}
                  >
                    Create &ldquo;{inputValue.trim()}&rdquo;
                  </button>
                )}
                {filtered.length === 0 && !inputValue.trim() && (
                  <p className="text-xs text-muted-foreground px-2 py-1.5">
                    All org tags are already applied. Type to create a new one.
                  </p>
                )}
              </div>
            </PopoverContent>
          </Popover>
        )}
      </div>

      {!canEdit && currentTags.length === 0 && (
        <p className="text-sm text-muted-foreground">No tags on this note.</p>
      )}
    </div>
  );
}
