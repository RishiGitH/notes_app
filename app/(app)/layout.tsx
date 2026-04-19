// Authenticated app layout shell. Requires a signed-in user and an active org.
// Reads the current org from the x-org-id header (set by middleware from the
// org_id cookie) and fetches the user's org memberships to populate the
// org switcher.
//
// If the user has no org memberships, renders children directly (no shell).
// The /org/create page (which lives inside this route group) handles its own
// full-screen layout. Individual app pages guard against missing orgId and
// redirect to /org/create themselves.

import { redirect } from "next/navigation";
import { headers, cookies } from "next/headers";
import { requireUser, getAdminSupabase } from "@/lib/auth/server";
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
  } catch {
    redirect("/login");
  }

  const admin = getAdminSupabase();

  const { data: memberships } = await admin
    .from("memberships")
    .select("org_id, role, organizations(id, name, slug)")
    .eq("user_id", user.id);

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
    // redirecting to it would loop. Individual app pages redirect themselves.
    return <>{children}</>;
  }

  const h = await headers();
  const currentOrgId = h.get("x-org-id");
  const validCurrentOrg =
    orgs.find((o) => o.id === currentOrgId) ?? orgs[0]!;

  if (!currentOrgId || currentOrgId !== validCurrentOrg.id) {
    const cookieStore = await cookies();
    cookieStore.set("org_id", validCurrentOrg.id, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      secure: process.env.NODE_ENV === "production",
    });
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
