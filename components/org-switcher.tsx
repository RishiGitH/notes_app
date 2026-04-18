"use client";

// OrgSwitcher: displays the current org name and a dropdown to switch to
// other orgs the user belongs to. Calls switchOrgAction on selection.
// Rendered in the authenticated layout shell.

import { useTransition } from "react";
import { switchOrgAction } from "@/lib/org/actions";

interface Org {
  id: string;
  name: string;
  slug: string;
  role: string;
}

interface OrgSwitcherProps {
  currentOrgId: string | null;
  orgs: Org[];
}

export function OrgSwitcher({ currentOrgId, orgs }: OrgSwitcherProps) {
  const [isPending, startTransition] = useTransition();

  const currentOrg = orgs.find((o) => o.id === currentOrgId) ?? orgs[0];

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const newOrgId = e.target.value;
    if (newOrgId === currentOrgId) return;
    startTransition(async () => {
      await switchOrgAction(newOrgId);
    });
  }

  if (orgs.length === 0) return null;

  return (
    <div className="flex items-center gap-2">
      <select
        className="rounded-md border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        value={currentOrgId ?? ""}
        onChange={handleChange}
        disabled={isPending}
        aria-label="Switch organization"
      >
        {orgs.map((org) => (
          <option key={org.id} value={org.id}>
            {org.name}
          </option>
        ))}
      </select>
      {isPending && (
        <span className="text-xs text-muted-foreground">Switching…</span>
      )}
    </div>
  );
}
