// Audit logging helper. Every mutation, auth event, permission denial, and
// AI call must produce a row in audit_logs via this function.
//
// NEVER include in any log call: secrets, API keys, full note content, file
// bytes, raw model output, prompts, or PII beyond user id + org id + action.
// (AGENTS.md section 8 and section 11)
//
// This module is Node runtime only (uses AsyncLocalStorage via request-context).

import { getAdminSupabase } from "@/lib/auth/server";
import { getRequestContext } from "@/lib/logging/request-context";

export interface AuditEntry {
  action: string;
  resourceType: string;
  resourceId?: string;
  metadata?: Record<string, unknown>;
}

// logAudit writes a row to audit_logs using the service-role client.
// Uses the admin client to bypass RLS — the RLS INSERT policy on audit_logs
// covers normal user writes, but server-initiated events (e.g. permission
// denials, system-level auth events) must bypass it so they always land.
//
// Failures are swallowed and logged to stderr: a logging failure must never
// crash the request path.
export async function logAudit(entry: AuditEntry): Promise<void> {
  try {
    const ctx = getRequestContext();
    const admin = getAdminSupabase();

    const { error } = await admin.from("audit_logs").insert({
      actor_id: ctx.userId,
      org_id: ctx.orgId,
      action: entry.action,
      resource_type: entry.resourceType,
      resource_id: entry.resourceId ?? null,
      request_id: ctx.requestId,
      metadata: entry.metadata ?? {},
    });

    if (error) {
      console.error("[audit] insert failed:", {
        action: entry.action,
        requestId: ctx.requestId,
        error: error.message,
      });
    }
  } catch (err) {
    // Swallow: logAudit must never propagate errors to the caller.
    console.error("[audit] unexpected error:", err);
  }
}

// logError emits an error.5xx audit row per AGENTS.md section 8.
// Call this in catch blocks for unexpected server errors that would result
// in a 5xx response. Never logs the error message if it might contain
// user content — only the error name/code.
export async function logError(
  resourceType: string,
  err: unknown,
  resourceId?: string,
): Promise<void> {
  const errorName =
    err instanceof Error ? err.name : "UnknownError";
  await logAudit({
    action: "error.5xx",
    resourceType,
    resourceId,
    metadata: { errorName },
  });
}
