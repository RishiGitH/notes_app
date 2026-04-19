"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { createNoteAction } from "@/lib/notes/actions";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { toast } from "sonner";

export function NewNoteButton({ orgId }: { orgId: string }) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleCreate() {
    startTransition(async () => {
      const result = await createNoteAction(orgId);
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      router.push(`/notes/${result.noteId}`);
    });
  }

  return (
    <Button onClick={handleCreate} disabled={isPending} size="sm">
      <Plus className="h-4 w-4 mr-1" />
      {isPending ? "Creating…" : "New note"}
    </Button>
  );
}
