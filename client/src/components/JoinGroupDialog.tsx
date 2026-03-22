import { useState } from "react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";

export function JoinGroupDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  async function handleJoin(e: React.FormEvent) {
    e.preventDefault();
    if (!code.trim()) return;
    setLoading(true);
    try {
      const res = await apiRequest("POST", "/api/groups/join", { inviteCode: code.trim() });
      const group = await res.json();
      queryClient.invalidateQueries({ queryKey: ["/api/groups"] });
      queryClient.invalidateQueries({ queryKey: ["/api/user/balance"] });
      toast({ title: "Joined group", description: `Welcome to "${group.name}"!` });
      onOpenChange(false);
      setCode("");
    } catch (err: any) {
      toast({ title: "Error", description: err.message?.replace(/^\d+:\s*/, "") || "Invalid invite code", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Join a Group</DialogTitle>
          <DialogDescription>Enter the invite code shared by a group member.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleJoin} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="invite-code">Invite Code</Label>
            <Input
              id="invite-code"
              data-testid="input-invite-code"
              placeholder="e.g. A1B2C3D4E5F6"
              value={code}
              onChange={e => setCode(e.target.value.toUpperCase())}
              className="font-mono text-center tracking-widest text-lg"
              maxLength={12}
              required
            />
          </div>
          <Button type="submit" className="w-full" disabled={loading} data-testid="button-confirm-join">
            {loading ? "Joining..." : "Join Group"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
