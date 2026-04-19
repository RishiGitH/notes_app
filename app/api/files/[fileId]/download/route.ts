// GET /api/files/[fileId]/download
//
// Proxy route that re-authenticates the caller before issuing a short-lived
// Supabase Storage signed URL. This ensures that even if someone obtains a
// fileId, they cannot download the file without a valid session and membership
// in the owning org. (AGENTS.md section 2 item 9: "signed URLs that re-check
// auth on access")
//
// Flow:
//   1. requireUser() — must have a valid session.
//   2. getFileInfo() — checks requireOrgAccess + soft-delete guard.
//   3. Issue a 60-second signed URL via the admin (service-role) client.
//   4. Log file.download to audit_logs.
//   5. Redirect (302) to the signed URL.
//
// The redirect is to a short-lived URL; the route handler itself is not cached.
// Node runtime only (logAudit uses AsyncLocalStorage).

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { getAdminSupabase } from "@/lib/auth/server";
import { requireUser } from "@/lib/auth/server";
import { getFileInfo } from "@/lib/files/actions";
import { logAudit, logError } from "@/lib/logging/audit";
import { withContext } from "@/lib/logging/request-context";
import { STORAGE_BUCKET } from "@/lib/files/constants";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ fileId: string }> },
) {
  const { fileId } = await params;

  let user: Awaited<ReturnType<typeof requireUser>>;
  try {
    user = await requireUser();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Read context headers minted by middleware.
  const h = await headers();
  const ctx = {
    requestId: h.get("x-request-id") ?? "unknown",
    orgId: h.get("x-org-id") ?? null,
    userId: user.id,
  };

  return withContext(ctx, async () => {
    let fileInfo: Awaited<ReturnType<typeof getFileInfo>>;
    try {
      fileInfo = await getFileInfo(fileId);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "error";
      if (msg === "Forbidden") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    if (!fileInfo) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // Issue a 60-second signed URL. The admin (service-role) client bypasses
    // Storage RLS — intentional; access was already checked via getFileInfo().
    const admin = getAdminSupabase();
    const { data: signedData, error: signError } = await admin.storage
      .from(STORAGE_BUCKET)
      .createSignedUrl(fileInfo.path, 60);

    if (signError || !signedData?.signedUrl) {
      console.error("[download] signed URL error:", {
        requestId: ctx.requestId,
        error: signError?.message,
      });
      await logError("files", signError ?? new Error("signed URL generation failed"), fileId);
      return NextResponse.json(
        { error: "Could not generate download link" },
        { status: 500 },
      );
    }

    await logAudit({
      action: "file.download",
      resourceType: "files",
      resourceId: fileId,
      metadata: {
        noteId: fileInfo.noteId,
        // No path, no URL — those would be sensitive. (AGENTS.md section 11)
      },
    });

    return NextResponse.redirect(signedData.signedUrl, { status: 302 });
  });
}
