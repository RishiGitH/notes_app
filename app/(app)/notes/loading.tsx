import { TableSkeleton } from "@/components/loading-skeleton";

export default function Loading() {
  return (
    <div className="space-y-4">
      <div className="h-8 w-32 bg-muted rounded animate-pulse" />
      <TableSkeleton rows={8} />
    </div>
  );
}
