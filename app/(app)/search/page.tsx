import { headers } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { requireUser } from "@/lib/auth/server";
import { buildAuthContinuePath } from "@/lib/auth/navigation";
import { requireOrgAccess } from "@/lib/security/permissions";
import { withContext } from "@/lib/logging/request-context";
import { searchNotes } from "@/lib/search/actions";
import { type SearchNoteResult } from "@/lib/search/schemas";
import { PermissionDenied } from "@/components/permission-denied";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { ErrorAlert } from "@/components/error-alert";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Search, FileText, Clock, Tag, ChevronLeft, ChevronRight } from "lucide-react";

function formatDate(d: Date) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(d);
}

const PAGE_SIZE = 50;

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
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

  const { q = "", page: pageParam } = await searchParams;
  const trimmedQ = q.trim();
  const page = Math.max(1, parseInt(pageParam ?? "1", 10) || 1);
  const offset = (page - 1) * PAGE_SIZE;

  let results: SearchNoteResult[] = [];
  let total = 0;
  let searchError: string | null = null;

  if (trimmedQ) {
    try {
      const response = await searchNotes({ query: trimmedQ, limit: PAGE_SIZE, offset });
      results = response.results;
      total = response.total;
    } catch (err) {
      searchError = err instanceof Error ? err.message : "Search failed";
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const resultStart = total === 0 ? 0 : offset + 1;
  const resultEnd = Math.min(offset + results.length, total);

  function buildPageUrl(targetPage: number) {
    const params = new URLSearchParams();
    if (trimmedQ) params.set("q", trimmedQ);
    if (targetPage > 1) params.set("page", String(targetPage));
    return `/search?${params.toString()}`;
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <PageHeader title="Search" />

      <form method="GET" action="/search" className="flex gap-2">
        <Input
          name="q"
          defaultValue={q}
          placeholder="Search notes…"
          className="flex-1"
          autoFocus
        />
        <Button type="submit">
          <Search className="h-4 w-4 mr-1" />
          Search
        </Button>
      </form>

      {searchError && <ErrorAlert message={searchError} />}

      {trimmedQ && !searchError && (
        <>
          <div className="flex items-center text-sm text-muted-foreground">
            <span>
              {total === 0
                ? "No results"
                : `Showing ${resultStart}–${resultEnd} of ${total} result${total === 1 ? "" : "s"}`}
              {" "}for{" "}
              <span className="font-medium text-foreground">
                &ldquo;{trimmedQ}&rdquo;
              </span>
            </span>
          </div>

          {results.length === 0 ? (
            <EmptyState
              title="No notes found"
              description={`No notes match "${trimmedQ}". Try different keywords.`}
            />
          ) : (
            <>
              <div className="divide-y divide-border rounded-md border">
                {results.map((note) => (
                  <Link
                    key={note.id}
                    href={`/notes/${note.id}`}
                    className="flex flex-col gap-1.5 p-4 hover:bg-muted/40 transition-colors"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                      {note.titleHighlight ? (
                        <span
                          className="font-medium text-sm truncate [&_mark]:bg-yellow-100 [&_mark]:text-yellow-900 [&_mark]:rounded-sm [&_mark]:px-0.5"
                          // titleHighlight is HTML-escaped by sanitizeSnippet; only <mark> tags remain
                          dangerouslySetInnerHTML={{ __html: note.titleHighlight }}
                        />
                      ) : (
                        <span className="font-medium text-sm truncate">
                          {note.title || "Untitled"}
                        </span>
                      )}
                    </div>
                    {note.snippet && (
                      <p
                        className="text-sm text-muted-foreground line-clamp-2 pl-6 [&_mark]:bg-yellow-100 [&_mark]:text-yellow-900 [&_mark]:rounded-sm [&_mark]:px-0.5"
                        // snippet is already HTML-escaped by sanitizeSnippet in lib/search/actions.ts;
                        // only literal <mark>/<mark> tags remain (F-0009 fix)
                        dangerouslySetInnerHTML={{ __html: note.snippet }}
                      />
                    )}
                    {note.tags.length > 0 && (
                      <div className="flex items-center gap-1.5 pl-6 flex-wrap">
                        <Tag className="h-3 w-3 text-muted-foreground shrink-0" />
                        {note.tags.map((t) => (
                          <Badge
                            key={t.name}
                            variant={t.matched ? "default" : "secondary"}
                            className="text-xs px-1.5 py-0"
                          >
                            {t.name}
                          </Badge>
                        ))}
                      </div>
                    )}
                    <div className="flex items-center gap-1 text-xs text-muted-foreground pl-6">
                      <Clock className="h-3 w-3" />
                      <span>{formatDate(note.updatedAt)}</span>
                    </div>
                  </Link>
                ))}
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between text-sm text-muted-foreground">
                  <span>Page {page} of {totalPages}</span>
                  <div className="flex items-center gap-1">
                    {page > 1 ? (
                      <Button asChild variant="outline" size="sm" className="h-7 px-2">
                        <Link href={buildPageUrl(page - 1)}>
                          <ChevronLeft className="h-3.5 w-3.5" />
                          Prev
                        </Link>
                      </Button>
                    ) : (
                      <Button variant="outline" size="sm" className="h-7 px-2" disabled>
                        <ChevronLeft className="h-3.5 w-3.5" />
                        Prev
                      </Button>
                    )}
                    {page < totalPages ? (
                      <Button asChild variant="outline" size="sm" className="h-7 px-2">
                        <Link href={buildPageUrl(page + 1)}>
                          Next
                          <ChevronRight className="h-3.5 w-3.5" />
                        </Link>
                      </Button>
                    ) : (
                      <Button variant="outline" size="sm" className="h-7 px-2" disabled>
                        Next
                        <ChevronRight className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </>
      )}

      {!trimmedQ && !searchError && (
        <EmptyState
          title="Find anything"
          description="Type a query above to search across all notes in your workspace."
        />
      )}
    </div>
  );
}
