import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/server";

export default async function RootPage() {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }
  redirect("/notes");
}
