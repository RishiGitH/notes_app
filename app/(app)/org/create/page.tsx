"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createOrgAction } from "@/lib/org/actions";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" className="w-full" disabled={pending}>
      {pending ? "Creating…" : "Create organization"}
    </Button>
  );
}

export default function CreateOrgPage() {
  const [error, formAction] = useActionState(createOrgAction, null);

  return (
    <main className="flex min-h-screen items-center justify-center bg-background">
      <div className="w-full max-w-sm space-y-6 px-4">
        <div className="space-y-1 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">
            Create your organization
          </h1>
          <p className="text-sm text-muted-foreground">
            You&apos;ll be the owner and can invite others.
          </p>
        </div>

        <form action={formAction} className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              name="name"
              type="text"
              required
              placeholder="Acme Corp"
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="slug">URL slug</Label>
            <Input
              id="slug"
              name="slug"
              type="text"
              required
              placeholder="acme-corp"
              pattern="[a-z0-9-]+"
              title="Lowercase letters, numbers, and hyphens only"
            />
          </div>

          {error && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}

          <SubmitButton />
        </form>
      </div>
    </main>
  );
}
