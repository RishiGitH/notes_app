// Shared display utilities for notes UI components.
// Centralises VISIBILITY constants and formatDate to avoid duplication.

export const VISIBILITY_VARIANTS: Record<string, "outline" | "secondary" | "default"> = {
  private: "outline",
  org: "secondary",
  public_in_org: "default",
};

export const VISIBILITY_LABELS: Record<string, string> = {
  private: "Private",
  org: "Org",
  public_in_org: "Org (public)",
};

export function formatDate(iso: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));
}

export function formatDateShort(iso: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(iso));
}
