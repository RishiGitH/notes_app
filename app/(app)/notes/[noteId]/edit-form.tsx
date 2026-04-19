"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { saveNoteAction } from "@/lib/notes/actions";
import { MarkdownBody } from "@/components/markdown-body";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormMessage,
} from "@/components/ui/form";
import { Save, RefreshCw } from "lucide-react";

const editSchema = z.object({
  title: z.string().min(1, "Title is required"),
  content: z.string(),
});

type EditValues = z.infer<typeof editSchema>;

interface EditFormProps {
  noteId: string;
  orgId: string;
  initialTitle: string;
  initialContent: string;
  currentVersionNumber: number;
}

export function EditForm({
  noteId,
  orgId,
  initialTitle,
  initialContent,
  currentVersionNumber,
}: EditFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [saveBlocked, setSaveBlocked] = useState(false);
  const [latestVersion, setLatestVersion] = useState(currentVersionNumber);

  const form = useForm<EditValues>({
    resolver: zodResolver(editSchema),
    defaultValues: { title: initialTitle, content: initialContent },
  });

  const content = form.watch("content");

  function onSubmit(values: EditValues) {
    if (saveBlocked) return;
    startTransition(async () => {
      const result = await saveNoteAction({
        noteId,
        orgId,
        title: values.title,
        content: values.content,
        expectedVersionNumber: latestVersion,
      });

      if ("conflict" in result) {
        toast.error("Conflict — reload to see the latest version", {
          action: {
            label: "Reload",
            onClick: () => router.refresh(),
          },
        });
        setSaveBlocked(true);
        return;
      }

      if ("error" in result) {
        toast.error(result.error);
        return;
      }

      setLatestVersion(result.versionNumber);
      toast.success(`Saved (v${result.versionNumber})`);
      router.refresh();
    });
  }

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className="space-y-4 pt-4"
      >
        {/* Title row + Save button */}
        <div className="flex items-center gap-3">
          <FormField
            control={form.control}
            name="title"
            render={({ field }) => (
              <FormItem className="flex-1">
                <FormControl>
                  <Input
                    {...field}
                    placeholder="Note title"
                    className="text-lg font-semibold border-0 border-b rounded-none px-0 focus-visible:ring-0 focus-visible:border-foreground"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          {saveBlocked ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => router.refresh()}
            >
              <RefreshCw className="h-4 w-4 mr-1" />
              Reload to save
            </Button>
          ) : (
            <Button
              type="submit"
              size="sm"
              disabled={isPending || !form.formState.isDirty}
            >
              <Save className="h-4 w-4 mr-1" />
              {isPending ? "Saving…" : "Save"}
            </Button>
          )}
        </div>

        {/* Editor + Preview split */}
        <div className="grid md:grid-cols-2 gap-4 min-h-[60vh]">
          <FormField
            control={form.control}
            name="content"
            render={({ field }) => (
              <FormItem className="flex flex-col">
                <FormControl>
                  <Textarea
                    {...field}
                    placeholder="Write in Markdown…"
                    className="flex-1 resize-none font-mono text-sm min-h-[60vh] leading-relaxed"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <div className="border rounded-md p-4 overflow-auto min-h-[60vh] bg-muted/20">
            {content.trim() ? (
              <MarkdownBody content={content} />
            ) : (
              <p className="text-sm text-muted-foreground italic">
                Preview will appear here…
              </p>
            )}
          </div>
        </div>
      </form>
    </Form>
  );
}
