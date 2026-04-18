"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { addMemberAction } from "@/lib/org/actions";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? "Adding…" : "Add member"}
    </Button>
  );
}

export function AddMemberForm() {
  const [error, formAction] = useActionState(addMemberAction, null);

  return (
    <form action={formAction} className="flex items-end gap-3">
      <div className="flex-1 space-y-1">
        <Label htmlFor="member-email">Email</Label>
        <Input
          id="member-email"
          name="email"
          type="email"
          required
          placeholder="colleague@example.com"
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="member-role">Role</Label>
        <select
          id="member-role"
          name="role"
          className="h-10 rounded-md border border-border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          defaultValue="member"
        >
          <option value="viewer">Viewer</option>
          <option value="member">Member</option>
          <option value="admin">Admin</option>
        </select>
      </div>
      <SubmitButton />
      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
