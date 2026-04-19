"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import {
  changeVisibilityAction,
  type NoteDetail,
} from "@/lib/notes/actions";
import {
  grantShareAction,
  revokeShareAction,
  type ShareItem,
} from "@/lib/notes/share-actions";
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
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { UserX, Plus } from "lucide-react";

interface SharePanelProps {
  noteId: string;
  orgId: string;
  currentVisibility: NoteDetail["visibility"];
  shares: ShareItem[];
  canManage: boolean;
}

const VISIBILITY_LABELS: Record<string, string> = {
  private: "Private — only you",
  org: "Org — all members",
  public_in_org: "Public — anyone with link",
};

const PERMISSION_LABELS: Record<string, string> = {
  view: "View",
  comment: "Comment",
  edit: "Edit",
};

export function SharePanel({
  noteId,
  orgId,
  currentVisibility,
  shares,
  canManage,
}: SharePanelProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [newUserId, setNewUserId] = useState("");
  const [newPermission, setNewPermission] = useState<"view" | "comment" | "edit">("view");

  function handleVisibilityChange(vis: string) {
    startTransition(async () => {
      const result = await changeVisibilityAction(
        noteId,
        orgId,
        vis as NoteDetail["visibility"],
      );
      if (result && "error" in result) {
        toast.error(result.error);
        return;
      }
      toast.success("Visibility updated");
      router.refresh();
    });
  }

  function handleGrant() {
    if (!newUserId.trim()) return;
    startTransition(async () => {
      const result = await grantShareAction(
        noteId,
        newUserId.trim(),
        newPermission,
        orgId,
      );
      if (result && "error" in result) {
        toast.error(result.error);
        return;
      }
      toast.success("Share granted");
      setNewUserId("");
      router.refresh();
    });
  }

  function handleRevoke(userId: string) {
    startTransition(async () => {
      const result = await revokeShareAction(noteId, userId, orgId);
      if (result && "error" in result) {
        toast.error(result.error);
        return;
      }
      toast.success("Share revoked");
      router.refresh();
    });
  }

  return (
    <div className="pt-4 space-y-6 max-w-md">
      {/* Visibility */}
      <div className="space-y-2">
        <Label className="text-sm font-medium">Visibility</Label>
        <Select
          defaultValue={currentVisibility}
          onValueChange={handleVisibilityChange}
          disabled={!canManage || isPending}
        >
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(VISIBILITY_LABELS).map(([val, label]) => (
              <SelectItem key={val} value={val}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Separator />

      {/* Share grants */}
      <div className="space-y-3">
        <Label className="text-sm font-medium">Shared with</Label>
        {shares.length === 0 ? (
          <p className="text-sm text-muted-foreground">Not shared with anyone individually.</p>
        ) : (
          <div className="space-y-2">
            {shares.map((s) => (
              <div
                key={s.userId}
                className="flex items-center justify-between gap-3 text-sm"
              >
                <span className="text-muted-foreground truncate">{s.userId}</span>
                <div className="flex items-center gap-2 shrink-0">
                  <Badge variant="outline" className="text-xs">
                    {PERMISSION_LABELS[s.permission] ?? s.permission}
                  </Badge>
                  {canManage && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 text-muted-foreground hover:text-destructive"
                      onClick={() => handleRevoke(s.userId)}
                      disabled={isPending}
                    >
                      <UserX className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {canManage && (
          <div className="flex items-end gap-2 pt-2">
            <div className="flex-1 space-y-1">
              <Label htmlFor="share-user" className="text-xs text-muted-foreground">
                User ID
              </Label>
              <Input
                id="share-user"
                value={newUserId}
                onChange={(e) => setNewUserId(e.target.value)}
                placeholder="user-uuid"
                className="h-8 text-sm"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Permission</Label>
              <Select
                value={newPermission}
                onValueChange={(v) =>
                  setNewPermission(v as "view" | "comment" | "edit")
                }
              >
                <SelectTrigger className="h-8 w-28">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="view">View</SelectItem>
                  <SelectItem value="comment">Comment</SelectItem>
                  <SelectItem value="edit">Edit</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button
              size="sm"
              className="h-8"
              onClick={handleGrant}
              disabled={isPending || !newUserId.trim()}
            >
              <Plus className="h-3.5 w-3.5 mr-1" />
              Grant
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
