import { AlertCircle } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

/**
 * Server-rendered permission-denied card.
 * Rendered inside an RSC try/catch around requireOrgAccess so logAudit
 * fires on the server before this component is returned.
 */
export function PermissionDenied({
  message = "You don't have access to this page.",
  backHref = "/notes",
  backLabel = "Back to notes",
}: {
  message?: string;
  backHref?: string;
  backLabel?: string;
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 px-4 py-24 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
        <AlertCircle className="h-6 w-6 text-muted-foreground" />
      </div>
      <div className="space-y-1">
        <h2 className="text-lg font-semibold">Access denied</h2>
        <p className="text-sm text-muted-foreground max-w-sm">{message}</p>
      </div>
      <Button asChild variant="outline" size="sm">
        <Link href={backHref}>{backLabel}</Link>
      </Button>
    </div>
  );
}
