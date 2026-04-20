import { redirect } from "next/navigation";
import { AUTH_CONTINUE_PATH } from "@/lib/auth/navigation";

export default async function RootPage() {
  redirect(AUTH_CONTINUE_PATH);
}
