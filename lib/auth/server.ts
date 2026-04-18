import { cookies } from "next/headers";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import type { Session } from "@supabase/supabase-js";

function getEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishable = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !publishable) return null;
  return { url, publishable };
}

export async function getServerSupabase() {
  const env = getEnv();
  if (!env) return null;
  const cookieStore = await cookies();
  return createServerClient(env.url, env.publishable, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // called from a Server Component; middleware handles the refresh.
        }
      },
    },
  });
}

// getSession() reads the local cookie without re-validating with Supabase's
// server. It is intentionally kept for reading JWT claims (e.g. org metadata)
// but must NEVER be used for authorization decisions. Use requireUser() for
// any auth check — it calls getUser() which validates with the server.
export async function getSession(): Promise<Session | null> {
  const supabase = await getServerSupabase();
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session;
}

// requireUser() calls getUser(), which re-validates the JWT with Supabase's
// auth server. This is the only correct way to gate access in Server Components
// and Server Actions. Never use getSession() for authorization.
export async function requireUser() {
  const supabase = await getServerSupabase();
  if (!supabase) {
    throw new Error("Not authenticated");
  }
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) {
    throw new Error("Not authenticated");
  }
  return data.user;
}
