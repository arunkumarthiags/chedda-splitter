import { useState, useEffect } from "react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { UserAvatar } from "@/components/UserAvatar";
import { ArrowRight, Handshake } from "lucide-react";

type Member = { id: number; displayName: string; avatarColor: string; username: string };
type Debt = { fromUserId: number; fromUserName: string; toUserId: number; toUserName: string; amount: number };

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  groupId: number;
  members: Member[];
  currentUserId: number;
  debts: Debt[];
};

export function SettleUpDialog({ open, onOpenChange, groupId, members, currentUserId, debts }: Props) {
  const [paidById, setPaidById] = useState(currentUserId.toString());
  const [paidToId, setPaidToId] = useState("");
  const [amount, setAmount] = useState("");
  const [amountAutoFilled, setAmountAutoFilled] = useState(false);
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (open) {
      setPaidById(currentUserId.toString());
      setPaidToId("");
      setAmount("");
      setAmountAutoFilled(false);
      setNotes("");
    }
  }, [open, currentUserId]);

  // Auto-fill amount when a suggested debt is selected
  function selectSuggestedDebt(debt: Debt) {
    setPaidById(debt.fromUserId.toString());
    setPaidToId(debt.toUserId.toString());
    setAmount(debt.amount.toFixed(2));
    setAmountAutoFilled(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!paidById || !paidToId || !amount) return;
    if (paidById === paidToId) {
      toast({ title: "Error", description: "Payer and payee must be different.", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      await apiRequest("POST", `/api/groups/${groupId}/settlements`, {
        paidById: parseInt(paidById),
        paidToId: parseInt(paidToId),
        amount: parseFloat(amount),
        notes: notes || undefined,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/groups", groupId, "balances"] });
      queryClient.invalidateQueries({ queryKey: ["/api/groups", groupId, "debts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/groups", groupId, "settlements"] });
      queryClient.invalidateQueries({ queryKey: ["/api/user/balance"] });
      queryClient.invalidateQueries({ queryKey: ["/api/activity"] });
      toast({ title: "Settlement recorded", description: `$${parseFloat(amount).toFixed(2)} settled` });
      onOpenChange(false);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Settle Up</DialogTitle>
          <DialogDescription>Record a payment between group members.</DialogDescription>
        </DialogHeader>

        {/* Suggested settlements */}
        {debts.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground font-medium">Suggested Settlements</p>
            {debts.map((d, i) => (
              <button
                key={i}
                type="button"
                onClick={() => selectSuggestedDebt(d)}
                className="w-full text-left"
                data-testid={`suggested-debt-${i}`}
              >
                <Card className="hover-elevate cursor-pointer">
                  <CardContent className="p-3 flex items-center gap-2">
                    <span className="text-sm font-medium">{d.fromUserName}</span>
                    <ArrowRight className="w-3 h-3 text-muted-foreground" />
                    <span className="text-sm font-medium">{d.toUserName}</span>
                    <span className="ml-auto text-sm font-bold text-red-500">${d.amount.toFixed(2)}</span>
                  </CardContent>
                </Card>
              </button>
            ))}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Who paid</Label>
              <Select value={paidById} onValueChange={setPaidById}>
                <SelectTrigger data-testid="select-settle-from">
                  <SelectValue placeholder="Select..." />
                </SelectTrigger>
                <SelectContent>
                  {members.map(m => (
                    <SelectItem key={m.id} value={m.id.toString()}>{m.displayName}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Paid to</Label>
              <Select value={paidToId} onValueChange={setPaidToId}>
                <SelectTrigger data-testid="select-settle-to">
                  <SelectValue placeholder="Select..." />
                </SelectTrigger>
                <SelectContent>
                  {members.filter(m => m.id.toString() !== paidById).map(m => (
                    <SelectItem key={m.id} value={m.id.toString()}>{m.displayName}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1">
            <Label htmlFor="settle-amount">Amount ($)</Label>
            <Input
              id="settle-amount"
              data-testid="input-settle-amount"
              type="number"
              step="0.01"
              min="0.01"
              placeholder="0.00"
              value={amount}
              onChange={e => { setAmount(e.target.value); setAmountAutoFilled(false); }}
              required
            />
            {amountAutoFilled && (
              <p className="text-xs text-muted-foreground">Suggested amount — edit to pay partially</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="settle-notes">Notes (optional)</Label>
            <Textarea id="settle-notes" data-testid="input-settle-notes" placeholder="e.g. Venmo payment" value={notes} onChange={e => setNotes(e.target.value)} className="resize-none" rows={2} />
          </div>

          <Button type="submit" className="w-full gap-2" disabled={loading || !paidToId} data-testid="button-confirm-settle">
            <Handshake className="w-4 h-4" />
            {loading ? "Recording..." : "Record Settlement"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
