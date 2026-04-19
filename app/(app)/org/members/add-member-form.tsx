"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { addMemberAction } from "@/lib/org/actions";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" className="h-9" disabled={pending}>
      {pending ? "Adding…" : "Add member"}
    </Button>
  );
}

export function AddMemberForm() {
  const [error, formAction] = useActionState(addMemberAction, null);
  const [role, setRole] = useState("member");

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-3">
      <div className="flex-1 min-w-40 space-y-1">
        <Label htmlFor="member-email" className="text-xs">Email</Label>
        <Input
          id="member-email"
          name="email"
          type="email"
          required
          placeholder="colleague@example.com"
          className="h-9"
        />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Role</Label>
        <Select value={role} onValueChange={setRole} name="role">
          <SelectTrigger className="h-9 w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="viewer">Viewer</SelectItem>
            <SelectItem value="member">Member</SelectItem>
            <SelectItem value="admin">Admin</SelectItem>
          </SelectContent>
        </Select>
        {/* Hidden input because shadcn Select doesn't submit via FormData */}
        <input type="hidden" name="role" value={role} />
      </div>
      <SubmitButton />
      {error && (
        <p className="w-full text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
