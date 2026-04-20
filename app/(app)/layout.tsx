// Authenticated app layout shell. Requires a signed-in user and an active org.
// Reads the current org from the x-org-id header (set by middleware from the
// org_id cookie) and fetches the user's org memberships to populate the
// org switcher.
//
// If the user has no org memberships, renders children directly (no shell).
// The /org/create page (which lives inside this route group) handles its own
// full-screen layout. If the org cookie is missing or stale for an existing
// member, the canonical /auth/continue bootstrap route repairs it.

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { requireUser, getAdminSupabase } from "@/lib/auth/server";
import { buildAuthContinuePath } from "@/lib/auth/navigation";
import { Sidebar } from "@/components/shell/sidebar";
import { MobileSidebar } from "@/components/shell/mobile-sidebar";
import { Separator } from "@/components/ui/separator";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let user;
  try {
    user = await requireUser();
    console.log("[AppLayout] requireUser ok:", user.id);
  } catch (e) {
    console.error("[AppLayout] requireUser failed:", e instanceof Error ? e.message : e);
    redirect("/login");
  }

  let admin;
  try {
    admin = getAdminSupabase();
    console.log("[AppLayout] getAdminSupabase ok");
  } catch (e) {
    console.error("[AppLayout] getAdminSupabase failed:", e instanceof Error ? e.message : e);
    redirect("/login");
  }

  console.log("[AppLayout] querying memberships for user:", user.id);
  const { data: memberships, error: membershipsError } = await admin
    .from("memberships")
    .select("org_id, role, organizations(id, name, slug)")
    .eq("user_id", user.id);

  if (membershipsError) {
    console.error("[AppLayout] memberships query failed:", membershipsError.message, membershipsError.code);
  }
  console.log("[AppLayout] memberships count:", memberships?.length ?? 0);

  const orgs = (memberships ?? [])
    .map((m) => {
      const org = Array.isArray(m.organizations)
        ? m.organizations[0]
        : m.organizations;
      if (!org) return null;
      return {
        id: org.id as string,
        name: org.name as string,
        slug: org.slug as string,
        role: m.role as string,
      };
    })
    .filter(Boolean) as { id: string; name: string; slug: string; role: string }[];

  if (orgs.length === 0) {
    // No org memberships yet — render children directly (no sidebar shell).
    // The /org/create page handles its own full-screen layout.
    // We do NOT redirect here: /org/create is inside this route group, so
    // redirecting to it would loop. The bootstrap route handles first-time vs.
    // existing-user routing when a page needs org context.
    return <>{children}</>;
  }

  const h = await headers();
  const currentOrgId = h.get("x-org-id");
  const returnTo = h.get("x-return-to");
  const validCurrentOrg = orgs.find((o) => o.id === currentOrgId);

  if (!validCurrentOrg) {
    redirect(buildAuthContinuePath(returnTo, "/notes"));
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-56 shrink-0 flex-col border-r border-border bg-background">
        <Sidebar
          currentOrg={validCurrentOrg}
          orgs={orgs}
          userEmail={user.email ?? ""}
        />
      </aside>

      {/* Right pane */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Mobile top bar */}
        <header className="flex items-center gap-2 border-b border-border px-4 h-12 md:hidden">
          <MobileSidebar
            currentOrg={validCurrentOrg}
            orgs={orgs}
            userEmail={user.email ?? ""}
          />
          <Separator orientation="vertical" className="h-4" />
          <span className="text-sm font-medium">Notes</span>
        </header>

        {/* Scrollable main area */}
        <main className="flex-1 overflow-y-auto p-6 md:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
