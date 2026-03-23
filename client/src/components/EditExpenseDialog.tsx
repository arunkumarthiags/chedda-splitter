import { useState, useEffect } from "react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { UserAvatar } from "@/components/UserAvatar";

type Member = { id: number; displayName: string; avatarColor: string; username: string };
type ExpenseSplit = { userId: number; amount: number; user: Member };
type Expense = {
  id: number;
  groupId: number;
  description: string;
  amount: number;
  paidById: number;
  category: string;
  splitType: string;
  notes?: string | null;
  splits: ExpenseSplit[];
};

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  expense: Expense | null;
  members: Member[];
  currentUserId: number;
};

export function EditExpenseDialog({ open, onOpenChange, expense, members, currentUserId }: Props) {
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [paidById, setPaidById] = useState(currentUserId.toString());
  const [category, setCategory] = useState("general");
  const [splitType, setSplitType] = useState("equal");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const [selectedMembers, setSelectedMembers] = useState<number[]>(members.map(m => m.id));
  const [exactAmounts, setExactAmounts] = useState<Record<number, string>>({});
  const [percentages, setPercentages] = useState<Record<number, string>>({});

  useEffect(() => {
    if (open && expense) {
      setDescription(expense.description);
      setAmount(expense.amount.toFixed(2));
      setPaidById(expense.paidById.toString());
      setCategory(expense.category);
      setSplitType(expense.splitType);
      setNotes(expense.notes ?? "");

      if (expense.splitType === "equal") {
        setSelectedMembers(expense.splits.map(s => s.userId));
        setExactAmounts({});
        setPercentages({});
      } else if (expense.splitType === "exact") {
        setSelectedMembers(expense.splits.map(s => s.userId));
        const ea: Record<number, string> = {};
        expense.splits.forEach(s => { ea[s.userId] = s.amount.toFixed(2); });
        setExactAmounts(ea);
        setPercentages({});
      } else if (expense.splitType === "percentage") {
        setSelectedMembers(expense.splits.map(s => s.userId));
        const pct: Record<number, string> = {};
        expense.splits.forEach(s => { pct[s.userId] = ((s.amount / expense.amount) * 100).toFixed(0); });
        setExactAmounts({});
        setPercentages(pct);
      }
    }
  }, [open, expense]);

  function computeSplits(): { userId: number; amount: number }[] | null {
    const total = parseFloat(amount);
    if (isNaN(total) || total <= 0) return null;

    if (splitType === "equal") {
      if (selectedMembers.length === 0) return null;
      const perPerson = Math.round((total / selectedMembers.length) * 100) / 100;
      return selectedMembers.map((uid, i) => ({
        userId: uid,
        amount: i === 0 ? Math.round((total - perPerson * (selectedMembers.length - 1)) * 100) / 100 : perPerson,
      }));
    }

    if (splitType === "exact") {
      const splits: { userId: number; amount: number }[] = [];
      let sum = 0;
      for (const m of members) {
        const val = parseFloat(exactAmounts[m.id] || "0");
        if (val > 0) {
          splits.push({ userId: m.id, amount: Math.round(val * 100) / 100 });
          sum += val;
        }
      }
      if (Math.abs(sum - total) > 0.02) return null;
      return splits;
    }

    if (splitType === "percentage") {
      const splits: { userId: number; amount: number }[] = [];
      let totalPct = 0;
      for (const m of members) {
        const pct = parseFloat(percentages[m.id] || "0");
        totalPct += pct;
        if (pct > 0) {
          splits.push({ userId: m.id, amount: Math.round((total * pct / 100) * 100) / 100 });
        }
      }
      if (Math.abs(totalPct - 100) > 0.5) return null;
      return splits;
    }

    return null;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!expense) return;
    const splits = computeSplits();
    if (!splits) {
      toast({ title: "Invalid split", description: splitType === "exact" ? "Exact amounts must equal the total." : splitType === "percentage" ? "Percentages must add up to 100%." : "Select at least one member.", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      await apiRequest("PATCH", `/api/expenses/${expense.id}`, {
        description,
        amount: parseFloat(amount),
        paidById: parseInt(paidById),
        category,
        splitType,
        splits,
        notes: notes || undefined,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/groups", expense.groupId, "expenses"] });
      queryClient.invalidateQueries({ queryKey: ["/api/groups", expense.groupId, "balances"] });
      queryClient.invalidateQueries({ queryKey: ["/api/groups", expense.groupId, "debts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/groups", expense.groupId, "audit"] });
      queryClient.invalidateQueries({ queryKey: ["/api/user/balance"] });
      queryClient.invalidateQueries({ queryKey: ["/api/activity"] });
      toast({ title: "Expense updated", description: `$${parseFloat(amount).toFixed(2)} for ${description}` });
      onOpenChange(false);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  const totalAmount = parseFloat(amount) || 0;
  const exactSum = Object.values(exactAmounts).reduce((s, v) => s + (parseFloat(v) || 0), 0);
  const pctSum = Object.values(percentages).reduce((s, v) => s + (parseFloat(v) || 0), 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Expense</DialogTitle>
          <DialogDescription>Update the details of this expense.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2 col-span-2">
              <Label htmlFor="edit-exp-desc">Description</Label>
              <Input id="edit-exp-desc" data-testid="input-edit-expense-desc" placeholder="e.g. Dinner at the beach" value={description} onChange={e => setDescription(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-exp-amount">Amount ($)</Label>
              <Input id="edit-exp-amount" data-testid="input-edit-expense-amount" type="number" step="0.01" min="0.01" placeholder="0.00" value={amount} onChange={e => setAmount(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label>Paid by</Label>
              <Select value={paidById} onValueChange={setPaidById}>
                <SelectTrigger data-testid="select-edit-paid-by">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {members.map(m => (
                    <SelectItem key={m.id} value={m.id.toString()}>{m.displayName}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Category</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger data-testid="select-edit-category">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="food">Food</SelectItem>
                <SelectItem value="transport">Transport</SelectItem>
                <SelectItem value="stay">Stay</SelectItem>
                <SelectItem value="drinks">Drinks</SelectItem>
                <SelectItem value="activities">Activities</SelectItem>
                <SelectItem value="shopping">Shopping</SelectItem>
                <SelectItem value="general">General</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-3">
            <Label>Split Method</Label>
            <Tabs value={splitType} onValueChange={setSplitType}>
              <TabsList className="w-full">
                <TabsTrigger value="equal" className="flex-1" data-testid="tab-edit-split-equal">Equal</TabsTrigger>
                <TabsTrigger value="exact" className="flex-1" data-testid="tab-edit-split-exact">Exact</TabsTrigger>
                <TabsTrigger value="percentage" className="flex-1" data-testid="tab-edit-split-pct">Percentage</TabsTrigger>
              </TabsList>

              <TabsContent value="equal" className="mt-3">
                <p className="text-xs text-muted-foreground mb-2">
                  Split equally among selected members
                  {selectedMembers.length > 0 && totalAmount > 0 && (
                    <> &mdash; ${(totalAmount / selectedMembers.length).toFixed(2)}/person</>
                  )}
                </p>
                <div className="space-y-2">
                  {members.map(m => (
                    <label key={m.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 cursor-pointer">
                      <Checkbox
                        checked={selectedMembers.includes(m.id)}
                        onCheckedChange={checked => {
                          setSelectedMembers(prev => checked ? [...prev, m.id] : prev.filter(id => id !== m.id));
                        }}
                        data-testid={`checkbox-edit-member-${m.id}`}
                      />
                      <UserAvatar name={m.displayName} color={m.avatarColor} size="sm" />
                      <span className="text-sm font-medium">{m.displayName}</span>
                    </label>
                  ))}
                </div>
              </TabsContent>

              <TabsContent value="exact" className="mt-3">
                <p className="text-xs text-muted-foreground mb-2">
                  Enter exact amounts &mdash; Remaining: <span className={Math.abs(exactSum - totalAmount) < 0.02 ? "text-emerald-600 dark:text-emerald-400 font-medium" : "text-red-500 font-medium"}>
                    ${(totalAmount - exactSum).toFixed(2)}
                  </span>
                </p>
                <div className="space-y-2">
                  {members.map(m => (
                    <div key={m.id} className="flex items-center gap-3">
                      <UserAvatar name={m.displayName} color={m.avatarColor} size="sm" />
                      <span className="text-sm font-medium flex-1">{m.displayName}</span>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        className="w-24 text-right"
                        placeholder="0.00"
                        value={exactAmounts[m.id] || ""}
                        onChange={e => setExactAmounts(prev => ({ ...prev, [m.id]: e.target.value }))}
                        data-testid={`input-edit-exact-${m.id}`}
                      />
                    </div>
                  ))}
                </div>
              </TabsContent>

              <TabsContent value="percentage" className="mt-3">
                <p className="text-xs text-muted-foreground mb-2">
                  Enter percentages &mdash; Total: <span className={Math.abs(pctSum - 100) < 0.5 ? "text-emerald-600 dark:text-emerald-400 font-medium" : "text-red-500 font-medium"}>
                    {pctSum.toFixed(0)}%
                  </span>
                </p>
                <div className="space-y-2">
                  {members.map(m => (
                    <div key={m.id} className="flex items-center gap-3">
                      <UserAvatar name={m.displayName} color={m.avatarColor} size="sm" />
                      <span className="text-sm font-medium flex-1">{m.displayName}</span>
                      <div className="flex items-center gap-1">
                        <Input
                          type="number"
                          step="1"
                          min="0"
                          max="100"
                          className="w-20 text-right"
                          placeholder="0"
                          value={percentages[m.id] || ""}
                          onChange={e => setPercentages(prev => ({ ...prev, [m.id]: e.target.value }))}
                          data-testid={`input-edit-pct-${m.id}`}
                        />
                        <span className="text-sm text-muted-foreground">%</span>
                      </div>
                    </div>
                  ))}
                </div>
              </TabsContent>
            </Tabs>
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-exp-notes">Notes (optional)</Label>
            <Textarea id="edit-exp-notes" data-testid="input-edit-expense-notes" placeholder="Any additional notes..." value={notes} onChange={e => setNotes(e.target.value)} className="resize-none" rows={2} />
          </div>

          <Button type="submit" className="w-full" disabled={loading} data-testid="button-confirm-edit-expense">
            {loading ? "Saving..." : `Save $${totalAmount.toFixed(2)} Expense`}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
