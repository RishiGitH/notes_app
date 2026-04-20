// Shared display utilities for notes UI components.
// Centralises VISIBILITY constants and formatDate to avoid duplication.

export const VISIBILITY_VARIANTS: Record<string, "outline" | "secondary" | "default"> = {
  private: "outline",
  org: "secondary",
  public_in_org: "secondary",
  shared: "default",
};

export const VISIBILITY_LABELS: Record<string, string> = {
  private: "Private",
  org: "Org members",
  public_in_org: "Org members",
  shared: "Shared with you",
};

/**
 * Resolves the display key for a visibility badge.
 * Returns "shared" when the viewer has an explicit note_shares grant and is
 * not the author. Authors always see the real visibility value.
 */
export function resolveVisibilityKey(
  visibility: "private" | "org" | "public_in_org",
  isSharedWithMe: boolean,
  isAuthor: boolean,
): "private" | "org" | "public_in_org" | "shared" {
  if (isSharedWithMe && !isAuthor) return "shared";
  return visibility;
}

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
