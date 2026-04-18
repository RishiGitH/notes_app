// Audit logging helper. Every mutation, auth event, permission denial, and
// AI call must produce a row in audit_logs via this function.
//
// NEVER include in any log call: secrets, API keys, full note content, file
// bytes, raw model output, prompts, or PII beyond user id + org id + action.
// (AGENTS.md section 8 and section 11)
//
// This module is Node runtime only (uses AsyncLocalStorage via request-context).
// Server Actions that call logAudit() must export: export const runtime = 'nodejs';

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
