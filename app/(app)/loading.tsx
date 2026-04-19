import { CardGroupSkeleton } from "@/components/loading-skeleton";

export default function DashboardLoading() {
  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div className="h-8 w-48 bg-muted animate-pulse rounded" />
      <CardGroupSkeleton count={6} />
    </div>
  );
}
