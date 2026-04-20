import { redirect } from "next/navigation";
import { getServerSupabase } from "@/lib/auth/server";

export default async function RootPage() {
  const supabase = await getServerSupabase();
  if (!supabase) {
    redirect("/login");
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  redirect(user ? "/notes" : "/login");
}
