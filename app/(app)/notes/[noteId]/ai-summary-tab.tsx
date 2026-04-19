"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import {
  generateSummary,
  acceptSummary,
  rejectSummary,
  AiOutputInvalidError,
} from "@/lib/ai/summarize";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Sparkles, Check, X, RefreshCw, CheckCheck } from "lucide-react";
import { EmptyState } from "@/components/empty-state";

// Shape returned by getLatestSummary — we only use the fields we need.
type SummaryRow = {
  id: string;
  status: string;
  draftTldr: string | null;
  draftKeyPoints: unknown;
  draftActionItems: unknown;
  acceptedTldr: string | null;
  acceptedKeyPoints: unknown;
  acceptedActionItems: unknown;
  createdAt: Date;
} | null;

interface AiSummaryTabProps {
  noteId: string;
  canEdit: boolean;
  initialSummary: SummaryRow;
}

function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === "string");
}

function formatDate(d: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(d));
}

export function AiSummaryTab({
  noteId,
  canEdit,
  initialSummary,
}: AiSummaryTabProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [generating, setGenerating] = useState(false);

  const summary = initialSummary;
  const isDraft = summary?.status === "draft" || summary?.status === "partial";
  const hasDraft =
    isDraft &&
    Boolean(summary?.draftTldr || summary?.draftKeyPoints || summary?.draftActionItems);

  const draftTldr = summary?.draftTldr ?? null;
  const draftKeyPoints = asStringArray(summary?.draftKeyPoints);
  const draftActionItems = asStringArray(summary?.draftActionItems);
  const acceptedTldr = summary?.acceptedTldr ?? null;
  const acceptedKeyPoints = asStringArray(summary?.acceptedKeyPoints);
  const acceptedActionItems = asStringArray(summary?.acceptedActionItems);

  function handleGenerate() {
    setGenerating(true);
    startTransition(async () => {
      try {
        await generateSummary(noteId);
        toast.success("Summary generated");
        router.refresh();
      } catch (err) {
        if (err instanceof AiOutputInvalidError) {
          toast.error("AI returned an unexpected response — please try again");
        } else {
          toast.error(err instanceof Error ? err.message : "Generation failed");
        }
      } finally {
        setGenerating(false);
      }
    });
  }

  function handleAcceptField(field: "tldr" | "keyPoints" | "actionItems") {
    if (!summary) return;
    startTransition(async () => {
      try {
        await acceptSummary(summary.id, { [field]: true });
        toast.success("Section accepted");
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Accept failed");
      }
    });
  }

  function handleAcceptAll() {
    if (!summary) return;
    startTransition(async () => {
      try {
        await acceptSummary(summary.id, {
          tldr: true,
          keyPoints: true,
          actionItems: true,
        });
        toast.success("All sections accepted");
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Accept failed");
      }
    });
  }

  function handleReject() {
    if (!summary) return;
    startTransition(async () => {
      try {
        await rejectSummary(summary.id);
        toast.success("Summary rejected");
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Reject failed");
      }
    });
  }

  const generateButton = (
    <Button
      variant="outline"
      size="sm"
      className="gap-2"
      onClick={handleGenerate}
      disabled={generating || isPending}
    >
      {generating ? (
        <RefreshCw className="h-4 w-4 animate-spin" />
      ) : (
        <Sparkles className="h-4 w-4" />
      )}
      {generating ? "Generating…" : summary ? "Re-generate" : "Generate summary"}
    </Button>
  );

  if (!summary) {
    return (
      <div className="pt-4 space-y-4">
        {canEdit ? (
          <div className="flex flex-col items-center gap-4 py-12">
            <Sparkles className="h-8 w-8 text-muted-foreground/40" />
            <div className="text-center space-y-1">
              <p className="text-sm font-medium">No summary yet</p>
              <p className="text-sm text-muted-foreground">
                Generate an AI summary of this note with one click.
              </p>
            </div>
            {generateButton}
          </div>
        ) : (
          <EmptyState
            title="No summary"
            description="The note author can generate an AI summary."
          />
        )}
      </div>
    );
  }

  return (
    <div className="pt-4 space-y-5 max-w-2xl">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Badge
            variant={
              summary.status === "accepted"
                ? "default"
                : summary.status === "rejected"
                ? "destructive"
                : "secondary"
            }
            className="text-xs"
          >
            {summary.status}
          </Badge>
          <span className="text-xs text-muted-foreground">
            Generated {formatDate(summary.createdAt)}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {hasDraft && canEdit && (
            <>
              <Button
                variant="default"
                size="sm"
                className="gap-1.5"
                onClick={handleAcceptAll}
                disabled={isPending}
              >
                <CheckCheck className="h-3.5 w-3.5" />
                Accept all
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 text-destructive hover:text-destructive"
                onClick={handleReject}
                disabled={isPending}
              >
                <X className="h-3.5 w-3.5" />
                Reject
              </Button>
            </>
          )}
          {canEdit && generateButton}
        </div>
      </div>

      <Separator />

      {/* TLDR section */}
      <SummarySection
        label="Summary"
        draft={draftTldr ? <p className="text-sm leading-relaxed">{draftTldr}</p> : null}
        accepted={acceptedTldr ? (
          <p className="text-sm leading-relaxed">{acceptedTldr}</p>
        ) : null}
        hasDraft={!!draftTldr}
        canEdit={canEdit}
        isPending={isPending}
        onAccept={() => handleAcceptField("tldr")}
      />

      <Separator />

      {/* Key points section */}
      <SummarySection
        label="Key points"
        draft={
          draftKeyPoints.length > 0 ? (
            <ul className="space-y-1 text-sm">
              {draftKeyPoints.map((pt, i) => (
                <li key={i} className="flex gap-2">
                  <span className="text-muted-foreground shrink-0">•</span>
                  <span>{pt}</span>
                </li>
              ))}
            </ul>
          ) : null
        }
        accepted={
          acceptedKeyPoints.length > 0 ? (
            <ul className="space-y-1 text-sm">
              {acceptedKeyPoints.map((pt, i) => (
                <li key={i} className="flex gap-2">
                  <span className="text-muted-foreground shrink-0">•</span>
                  <span>{pt}</span>
                </li>
              ))}
            </ul>
          ) : null
        }
        hasDraft={draftKeyPoints.length > 0}
        canEdit={canEdit}
        isPending={isPending}
        onAccept={() => handleAcceptField("keyPoints")}
      />

      {(draftActionItems.length > 0 || acceptedActionItems.length > 0) && (
        <>
          <Separator />

          {/* Action items section */}
          <SummarySection
            label="Action items"
            draft={
              draftActionItems.length > 0 ? (
                <ul className="space-y-1 text-sm">
                  {draftActionItems.map((item, i) => (
                    <li key={i} className="flex gap-2">
                      <span className="text-muted-foreground shrink-0">☐</span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              ) : null
            }
            accepted={
              acceptedActionItems.length > 0 ? (
                <ul className="space-y-1 text-sm">
                  {acceptedActionItems.map((item, i) => (
                    <li key={i} className="flex gap-2">
                      <span className="text-muted-foreground shrink-0">☐</span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              ) : null
            }
            hasDraft={draftActionItems.length > 0}
            canEdit={canEdit}
            isPending={isPending}
            onAccept={() => handleAcceptField("actionItems")}
          />
        </>
      )}
    </div>
  );
}

// ── SummarySection ────────────────────────────────────────────────────────────

interface SummarySectionProps {
  label: string;
  draft: React.ReactNode;
  accepted: React.ReactNode;
  hasDraft: boolean;
  canEdit: boolean;
  isPending: boolean;
  onAccept: () => void;
}

function SummarySection({
  label,
  draft,
  accepted,
  hasDraft,
  canEdit,
  isPending,
  onAccept,
}: SummarySectionProps) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-medium">{label}</h3>
        {hasDraft && canEdit && (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 gap-1 text-xs"
            onClick={onAccept}
            disabled={isPending}
          >
            <Check className="h-3 w-3" />
            Accept
          </Button>
        )}
      </div>

      {/* Draft (pending review) */}
      {draft && (
        <div className="rounded-md border border-dashed border-border bg-muted/20 p-3">
          <p className="text-xs text-muted-foreground mb-1.5 font-medium uppercase tracking-wide">
            Draft
          </p>
          {draft}
        </div>
      )}

      {/* Previously accepted version */}
      {accepted && (
        <div className="rounded-md border bg-background p-3">
          <p className="text-xs text-muted-foreground mb-1.5 font-medium uppercase tracking-wide flex items-center gap-1">
            <Check className="h-3 w-3 text-green-600" />
            Accepted
          </p>
          {accepted}
        </div>
      )}

      {!draft && !accepted && (
        <p className="text-sm text-muted-foreground italic">None</p>
      )}
    </div>
  );
}
