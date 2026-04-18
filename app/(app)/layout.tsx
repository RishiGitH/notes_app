// Authenticated app layout shell. Requires a signed-in user and an active org.
// Reads the current org from the x-org-id header (set by middleware from the
// org_id cookie) and fetches the user's org memberships to populate the
// org switcher. Redirects to /org/create if the user has no orgs.

import { redirect } from "next/navigation";
import { headers, cookies } from "next/headers";
import { requireUser, getAdminSupabase } from "@/lib/auth/server";
import { OrgSwitcher } from "@/components/org-switcher";
import { signOutAction } from "@/lib/auth/actions";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // requireUser() re-validates the JWT with Supabase's auth server.
  // Throws if not authenticated; middleware will have redirected before this
  // but this is a belt-and-suspenders check.
  let user;
  try {
    user = await requireUser();
  } catch {
    redirect("/login");
  }

  const admin = getAdminSupabase();

  // Fetch all orgs this user belongs to.
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
    redirect("/org/create");
  }

  // Read current org from the header forwarded by middleware.
  const h = await headers();
  const currentOrgId = h.get("x-org-id");

  // If the org_id cookie doesn't match any membership, set it to the first org.
  const validCurrentOrg =
    orgs.find((o) => o.id === currentOrgId) ?? orgs[0]!;

  if (!currentOrgId || currentOrgId !== validCurrentOrg.id) {
    // Set the cookie via the response — we can't do it from a Server Component
    // directly, so we rely on the org-switcher action or use a cookie set here.
    // For now: if there's a mismatch, the layout still renders with the first
    // valid org. The cookie is corrected next time the user switches org.
    const cookieStore = await cookies();
    cookieStore.set("org_id", validCurrentOrg.id, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
    });
  }

  return (
    <div className="flex min-h-screen flex-col">
      {/* Top nav bar */}
      <header className="border-b border-border bg-background">
        <div className="flex h-12 items-center justify-between px-4">
          <div className="flex items-center gap-4">
            <span className="text-sm font-semibold">Notes</span>
            <OrgSwitcher
              currentOrgId={validCurrentOrg.id}
              orgs={orgs}
            />
          </div>
          <form action={signOutAction}>
            <button
              type="submit"
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              Sign out
            </button>
          </form>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 p-4">{children}</main>
    </div>
  );
}
