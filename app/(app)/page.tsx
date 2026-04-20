import { headers } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { requireUser } from "@/lib/auth/server";
import { buildAuthContinuePath } from "@/lib/auth/navigation";
import { requireOrgAccess } from "@/lib/security/permissions";
import { withContext } from "@/lib/logging/request-context";
import { listNotesAction } from "@/lib/notes/actions";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { ErrorAlert } from "@/components/error-alert";
import { PermissionDenied } from "@/components/permission-denied";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { NewNoteButton } from "./notes/new-note-button";
import { FileText, Clock } from "lucide-react";
import { VISIBILITY_VARIANTS, VISIBILITY_LABELS, formatDateShort } from "@/lib/utils/note-display";

export default async function DashboardPage() {
  let user;
  try {
    user = await requireUser();
  } catch {
    redirect("/login");
  }

  const h = await headers();
  const orgId = h.get("x-org-id");
  if (!orgId) redirect(buildAuthContinuePath(h.get("x-return-to"), "/notes"));

  const requestId = h.get("x-request-id") ?? "unknown";

  try {
    await withContext({ requestId, orgId, userId: user.id }, () =>
      requireOrgAccess(orgId, "viewer"),
    );
  } catch {
    return <PermissionDenied />;
  }

  const result = await listNotesAction(orgId);

  if ("error" in result) {
    return (
      <div className="max-w-4xl mx-auto">
        <PageHeader
          title="Dashboard"
          action={<NewNoteButton orgId={orgId} />}
        />
        <ErrorAlert message={result.error} />
      </div>
    );
  }

  const recentNotes = result.filter((n) => !n.deletedAt).slice(0, 10);

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <PageHeader
        title="Dashboard"
        action={<NewNoteButton orgId={orgId} />}
      />

      {/* Recent notes */}
      <section className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
          Recent notes
        </h2>

        {recentNotes.length === 0 ? (
          <EmptyState
            title="No notes yet"
            description="Create your first note to get started."
          >
            <NewNoteButton orgId={orgId} />
          </EmptyState>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {recentNotes.map((note) => (
              <Link key={note.id} href={`/notes/${note.id}`}>
                <Card className="h-full hover:bg-muted/30 transition-colors cursor-pointer">
                  <CardContent className="p-4 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                        <p className="text-sm font-medium truncate">
                          {note.title || "Untitled"}
                        </p>
                      </div>
                      <Badge
                        variant={VISIBILITY_VARIANTS[note.visibility] ?? "outline"}
                        className="shrink-0 text-xs"
                      >
                        {VISIBILITY_LABELS[note.visibility] ?? note.visibility}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      <span>{formatDateShort(note.updatedAt)}</span>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* Activity feed placeholder */}
      <section className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
          Recent activity
        </h2>
        <p className="text-sm text-muted-foreground">
          Activity log will appear here once available.
        </p>
      </section>
    </div>
  );
}
