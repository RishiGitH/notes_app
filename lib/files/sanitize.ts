// safeFilename: sanitize a user-supplied filename so it is safe to embed
// in a Supabase Storage object key suffix.
//
// Rules:
//   - Strip path separators and null bytes (common traversal vectors).
//   - Collapse any character outside [A-Za-z0-9._-] to "_".
//   - Truncate to 80 characters (keys are <org>/<note>/<ulid>-<safe>, total < 200).
//   - If the result is empty after sanitization, fall back to "file".
//
// The sanitized name is only the display portion of the key — the authoritative
// key is built as `${orgId}/${noteId}/${ulid()}-${safeFilename(original)}` and
// is never derived solely from the user-supplied name. (AGENTS.md section 2 item 9)

export function safeFilename(name: string): string {
  // Remove path separators, null bytes, and control characters.
  const stripped = name.replace(/[/\\:*?"<>|\x00-\x1f]/g, "_");
  // Collapse any remaining unsafe chars to "_".
  const collapsed = stripped.replace(/[^A-Za-z0-9._-]/g, "_");
  // Collapse consecutive underscores for readability.
  const deduped = collapsed.replace(/_+/g, "_").replace(/^_|_$/g, "");
  // Truncate.
  const truncated = deduped.slice(0, 80);
  return truncated.length > 0 ? truncated : "file";
}
