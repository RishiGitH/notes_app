"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  FileText,
  Search,
  Users,
  Settings,
  LogOut,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { signOutAction } from "@/lib/auth/actions";
import { OrgSwitcherDropdown } from "@/components/shell/org-switcher-dropdown";

interface Org {
  id: string;
  name: string;
  slug: string;
  role: string;
}

interface SidebarProps {
  currentOrg: Org;
  orgs: Org[];
  userEmail: string;
}

const NAV_ITEMS = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/notes", label: "Notes", icon: FileText },
  { href: "/search", label: "Search", icon: Search },
  { href: "/org/members", label: "Members", icon: Users },
  { href: "/org/settings", label: "Settings", icon: Settings },
];

export function Sidebar({ currentOrg, orgs, userEmail }: SidebarProps) {
  const pathname = usePathname();

  return (
    <div className="flex h-full flex-col">
      {/* Org switcher */}
      <div className="p-3 pb-0">
        <OrgSwitcherDropdown currentOrg={currentOrg} orgs={orgs} />
      </div>

      <Separator className="my-2" />

      {/* Nav */}
      <ScrollArea className="flex-1 px-2">
        <nav className="space-y-0.5 py-1">
          {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
            const active =
              href === "/"
                ? pathname === "/"
                : pathname.startsWith(href);
            return (
              <Button
                key={href}
                asChild
                variant={active ? "secondary" : "ghost"}
                size="sm"
                className={cn(
                  "w-full justify-start gap-2 text-sm font-normal h-8",
                  active
                    ? "font-medium text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Link href={href}>
                  <Icon className="h-4 w-4 shrink-0" />
                  {label}
                </Link>
              </Button>
            );
          })}
        </nav>
      </ScrollArea>

      {/* User menu */}
      <Separator className="my-2" />
      <div className="p-3 pt-0 space-y-1">
        <p className="text-xs text-muted-foreground truncate px-2">{userEmail}</p>
        <form action={signOutAction}>
          <Button
            type="submit"
            variant="ghost"
            size="sm"
            className="w-full justify-start gap-2 text-sm font-normal text-muted-foreground hover:text-foreground h-8"
          >
            <LogOut className="h-4 w-4 shrink-0" />
            Sign out
          </Button>
        </form>
      </div>
    </div>
  );
}
