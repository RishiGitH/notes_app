"use client";

import { createBrowserClient } from "@supabase/ssr";

export function getBrowserSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishable = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !publishable) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY must be set"
    );
  }
  return createBrowserClient(url, publishable);
}
