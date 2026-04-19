import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search } from "lucide-react";

// searchNotesAction lives on feat/infra (3C) and is not yet available.
// This page renders a functional search UI shell that will wire up once
// searchNotesAction is shipped by search-ai.

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q = "" } = await searchParams;

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

      {q ? (
        <EmptyState
          title="Full-text search coming soon"
          description={`Search for "${q}" will work once the search engine is available.`}
        />
      ) : (
        <EmptyState
          title="Find anything"
          description="Type a query above to search across all notes in your workspace."
        />
      )}
    </div>
  );
}
