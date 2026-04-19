"use client";

import { useState } from "react";
import { Menu } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Sidebar } from "@/components/shell/sidebar";

interface Org {
  id: string;
  name: string;
  slug: string;
  role: string;
}

interface MobileSidebarProps {
  currentOrg: Org;
  orgs: Org[];
  userEmail: string;
}

export function MobileSidebar({
  currentOrg,
  orgs,
  userEmail,
}: MobileSidebarProps) {
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="md:hidden h-8 w-8">
          <Menu className="h-4 w-4" />
          <span className="sr-only">Toggle navigation</span>
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-64 p-0">
        <SheetHeader className="sr-only">
          <SheetTitle>Navigation</SheetTitle>
        </SheetHeader>
        <Sidebar
          currentOrg={currentOrg}
          orgs={orgs}
          userEmail={userEmail}
        />
      </SheetContent>
    </Sheet>
  );
}
