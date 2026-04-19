import { headers } from "next/headers";
import { redirect, notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/server";
import { requireOrgAccess } from "@/lib/security/permissions";
import { withContext } from "@/lib/logging/request-context";
import { getNoteAction } from "@/lib/notes/actions";
import { PermissionDenied } from "@/components/permission-denied";
import { NoteDetailShell } from "./note-detail-shell";

export default async function NoteDetailLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ noteId: string }>;
}) {
  let user;
  try {
    user = await requireUser();
  } catch {
    redirect("/login");
  }

  const h = await headers();
  const orgId = h.get("x-org-id");
  if (!orgId) redirect("/org/create");
  const requestId = h.get("x-request-id") ?? "unknown";

  let membership;
  try {
    membership = await withContext({ requestId, orgId, userId: user.id }, () =>
      requireOrgAccess(orgId, "viewer"),
    );
  } catch {
    return <PermissionDenied />;
  }

  const { noteId } = await params;
  const result = await getNoteAction(noteId, orgId);

  if ("error" in result) {
    if (result.error === "Note not found" || result.error === "Note content not found") {
      notFound();
    }
    return <PermissionDenied />;
  }

  const isAdmin = membership.role === "admin" || membership.role === "owner";

  return (
    <NoteDetailShell note={result} orgId={orgId} isAdmin={isAdmin}>
      {children}
    </NoteDetailShell>
  );
}
