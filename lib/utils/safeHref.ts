/**
 * Allowlists URL schemes to prevent javascript:, data:, and other dangerous
 * protocols from appearing in user-authored content.
 *
 * Pass as `urlTransform` to react-markdown. Returns undefined for disallowed
 * schemes so react-markdown omits the attribute entirely.
 */
const ALLOWED_SCHEMES = ["http:", "https:", "mailto:"];

export function safeHref(url: string): string | undefined {
  try {
    const parsed = new URL(url);
    if (ALLOWED_SCHEMES.includes(parsed.protocol)) {
      return url;
    }
    return undefined;
  } catch {
    // Relative URLs (no scheme) are safe to pass through as-is.
    if (url.startsWith("/") || url.startsWith("#") || url.startsWith(".")) {
      return url;
    }
    return undefined;
  }
}
