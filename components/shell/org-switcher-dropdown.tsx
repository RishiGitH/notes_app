"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { switchOrgAction } from "@/lib/org/actions";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { ChevronsUpDown, Building2, Check } from "lucide-react";

interface Org {
  id: string;
  name: string;
  slug: string;
  role: string;
}

interface OrgSwitcherDropdownProps {
  currentOrg: Org;
  orgs: Org[];
}

export function OrgSwitcherDropdown({
  currentOrg,
  orgs,
}: OrgSwitcherDropdownProps) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleSwitch(orgId: string) {
    if (orgId === currentOrg.id) return;
    startTransition(async () => {
      await switchOrgAction(orgId);
      router.refresh();
    });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-between gap-2 px-2 font-medium text-sm"
          disabled={isPending}
        >
          <div className="flex items-center gap-2 min-w-0">
            <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="truncate">{currentOrg.name}</span>
          </div>
          <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56" align="start">
        <DropdownMenuLabel className="text-xs text-muted-foreground font-normal">
          Switch workspace
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {orgs.map((org) => (
          <DropdownMenuItem
            key={org.id}
            onClick={() => handleSwitch(org.id)}
            className="gap-2"
          >
            <Building2 className="h-4 w-4 text-muted-foreground" />
            <span className="flex-1 truncate">{org.name}</span>
            {org.id === currentOrg.id && (
              <Check className="h-3.5 w-3.5 text-muted-foreground" />
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
