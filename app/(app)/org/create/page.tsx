"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Building2 } from "lucide-react";
import { createOrgAction } from "@/lib/org/actions";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" className="w-full" disabled={pending}>
      {pending ? "Creating…" : "Create workspace"}
    </Button>
  );
}

export default function CreateOrgPage() {
  const [error, formAction] = useActionState(createOrgAction, null);

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/30 px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex flex-col items-center gap-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-foreground text-background">
            <Building2 className="h-5 w-5" />
          </div>
          <p className="text-sm font-medium">Notes</p>
        </div>

        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-xl">Create your workspace</CardTitle>
            <CardDescription>
              You&apos;ll be the owner and can invite others.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form action={formAction} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="name">Workspace name</Label>
                <Input
                  id="name"
                  name="name"
                  type="text"
                  required
                  placeholder="Acme Corp"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="slug">URL slug</Label>
                <Input
                  id="slug"
                  name="slug"
                  type="text"
                  required
                  placeholder="acme-corp"
                  pattern="[a-z0-9-]+"
                  title="Lowercase letters, numbers, and hyphens only"
                  className="font-mono"
                />
                <p className="text-xs text-muted-foreground">
                  Lowercase letters, numbers, and hyphens only
                </p>
              </div>
              {error && (
                <p className="text-sm text-destructive" role="alert">
                  {error}
                </p>
              )}
              <SubmitButton />
            </form>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
