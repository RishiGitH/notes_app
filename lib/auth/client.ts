"use client";

import { createBrowserClient } from "@supabase/ssr";

export function getBrowserSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  // NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY is the browser-safe publishable key.
  // The server-side SUPABASE_PUBLISHABLE_KEY (no NEXT_PUBLIC_ prefix) is not
  // inlined into the client bundle by Next.js, so the browser client must use
  // the NEXT_PUBLIC_ variant.
  const publishable = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !publishable) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY must be set"
    );
  }
  return createBrowserClient(url, publishable);
}
