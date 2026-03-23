import { useState, useRef, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRoute, Link, useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { getQueryFn } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { UserAvatar } from "@/components/UserAvatar";
import { AddExpenseDialog } from "@/components/AddExpenseDialog";
import { EditExpenseDialog } from "@/components/EditExpenseDialog";
import { SettleUpDialog } from "@/components/SettleUpDialog";
import { ThemeToggle } from "@/components/ThemeToggle";
import { PerplexityAttribution } from "@/components/PerplexityAttribution";
import { ToastAction } from "@/components/ui/toast";
import {
  ArrowLeft, Plus, Handshake, Copy, Check, Receipt,
  ArrowRight, Utensils, Car, BedDouble, Wine, Tent,
  ShoppingBag, Trash2, History, Pencil, UserX, Download, BarChart3,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";

const expenseCategoryIcons: Record<string, React.ReactNode> = {
  food: <Utensils className="w-4 h-4" />,
  transport: <Car className="w-4 h-4" />,
  stay: <BedDouble className="w-4 h-4" />,
  drinks: <Wine className="w-4 h-4" />,
  activities: <Tent className="w-4 h-4" />,
  shopping: <ShoppingBag className="w-4 h-4" />,
  general: <Receipt className="w-4 h-4" />,
};

const CATEGORY_COLORS: Record<string, string> = {
  food: "#F38181",
  transport: "#4A6FA5",
  stay: "#6C5B7B",
  drinks: "#1B9C85",
  activities: "#45B7D1",
  shopping: "#E8AA42",
  general: "#AA96DA",
};

const CATEGORY_LABELS: Record<string, string> = {
  food: "Food", transport: "Transport", stay: "Stay",
  drinks: "Drinks", activities: "Activities", shopping: "Shopping", general: "General",
};

export default function GroupPage() {
  const [, params] = useRoute("/group/:id");
  const [, setLocation] = useLocation();
  const groupId = parseInt(params?.id || "0");
  const { user } = useAuth();
  const { toast } = useToast();

  const [expenseOpen, setExpenseOpen] = useState(false);
  const [settleOpen, setSettleOpen] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [editExpense, setEditExpense] = useState<any>(null);

  // Filter/sort state
  const [filterDesc, setFilterDesc] = useState("");
  const [filterCategory, setFilterCategory] = useState("all");
  const [filterPaidBy, setFilterPaidBy] = useState("all");
  const [sortBy, setSortBy] = useState("date-desc");

  // Pending undo timers
  const pendingExpenseDeletes = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());
  const pendingSettlementDeletes = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  const { data: group, isLoading: groupLoading } = useQuery<any>({
    queryKey: ["/api/groups", groupId],
    queryFn: getQueryFn({ on401: "throw" }),
    enabled: groupId > 0,
  });

  const { data: members } = useQuery<any[]>({
    queryKey: ["/api/groups", groupId, "members"],
    queryFn: getQueryFn({ on401: "throw" }),
    enabled: groupId > 0,
  });

  const { data: expenses, isLoading: expensesLoading } = useQuery<any[]>({
    queryKey: ["/api/groups", groupId, "expenses"],
    queryFn: getQueryFn({ on401: "throw" }),
    enabled: groupId > 0,
  });

  const { data: balances } = useQuery<any[]>({
    queryKey: ["/api/groups", groupId, "balances"],
    queryFn: getQueryFn({ on401: "throw" }),
    enabled: groupId > 0,
  });

  const { data: debts } = useQuery<any[]>({
    queryKey: ["/api/groups", groupId, "debts"],
    queryFn: getQueryFn({ on401: "throw" }),
    enabled: groupId > 0,
  });

  const { data: settlements } = useQuery<any[]>({
    queryKey: ["/api/groups", groupId, "settlements"],
    queryFn: getQueryFn({ on401: "throw" }),
    enabled: groupId > 0,
  });

  const { data: auditLogs } = useQuery<any[]>({
    queryKey: ["/api/groups", groupId, "audit"],
    queryFn: getQueryFn({ on401: "throw" }),
    enabled: groupId > 0,
  });

  const myBalance = balances?.find((b: any) => b.userId === user?.id);
  const totalGroupSpend = expenses?.reduce((sum: number, e: any) => sum + e.amount, 0) || 0;
  const isCreator = user?.id === group?.createdBy;

  // Filtered + sorted expenses
  const filteredExpenses = useMemo(() => {
    let result = [...(expenses || [])];
    if (filterDesc) result = result.filter(e => e.description.toLowerCase().includes(filterDesc.toLowerCase()));
    if (filterCategory !== "all") result = result.filter(e => e.category === filterCategory);
    if (filterPaidBy !== "all") result = result.filter(e => e.paidById.toString() === filterPaidBy);
    if (sortBy === "date-asc") result.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    else if (sortBy === "date-desc") result.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    else if (sortBy === "amount-asc") result.sort((a, b) => a.amount - b.amount);
    else if (sortBy === "amount-desc") result.sort((a, b) => b.amount - a.amount);
    return result;
  }, [expenses, filterDesc, filterCategory, filterPaidBy, sortBy]);

  const hasFilters = filterDesc !== "" || filterCategory !== "all" || filterPaidBy !== "all" || sortBy !== "date-desc";

  function clearFilters() {
    setFilterDesc("");
    setFilterCategory("all");
    setFilterPaidBy("all");
    setSortBy("date-desc");
  }

  // Stats chart data
  const chartData = useMemo(() => {
    const totals: Record<string, number> = {};
    for (const e of expenses || []) {
      totals[e.category] = (totals[e.category] || 0) + e.amount;
    }
    return Object.entries(totals)
      .map(([name, value]) => ({ name, value: Math.round(value * 100) / 100 }))
      .sort((a, b) => b.value - a.value);
  }, [expenses]);

  function copyInviteCode() {
    if (group?.inviteCode) {
      navigator.clipboard.writeText(group.inviteCode).catch(() => {});
      setCopiedCode(true);
      toast({ title: "Copied!", description: "Invite code copied to clipboard." });
      setTimeout(() => setCopiedCode(false), 2000);
    }
  }

  function deleteExpense(exp: any) {
    // Cancel any existing pending delete for this expense
    const existing = pendingExpenseDeletes.current.get(exp.id);
    if (existing) clearTimeout(existing);

    // Optimistically remove from cache
    queryClient.setQueryData<any[]>(["/api/groups", groupId, "expenses"],
      old => (old || []).filter(e => e.id !== exp.id));

    const timer = setTimeout(async () => {
      try {
        await apiRequest("DELETE", `/api/expenses/${exp.id}`);
        queryClient.invalidateQueries({ queryKey: ["/api/groups", groupId, "balances"] });
        queryClient.invalidateQueries({ queryKey: ["/api/groups", groupId, "debts"] });
        queryClient.invalidateQueries({ queryKey: ["/api/groups", groupId, "audit"] });
        queryClient.invalidateQueries({ queryKey: ["/api/user/balance"] });
        queryClient.invalidateQueries({ queryKey: ["/api/activity"] });
      } catch {
        queryClient.setQueryData<any[]>(["/api/groups", groupId, "expenses"],
          old => [exp, ...(old || [])]);
        toast({ title: "Error", description: "Failed to delete expense.", variant: "destructive" });
      }
      pendingExpenseDeletes.current.delete(exp.id);
    }, 5000);

    pendingExpenseDeletes.current.set(exp.id, timer);

    toast({
      title: "Expense deleted",
      action: (
        <ToastAction altText="Undo" onClick={() => {
          clearTimeout(pendingExpenseDeletes.current.get(exp.id));
          pendingExpenseDeletes.current.delete(exp.id);
          queryClient.setQueryData<any[]>(["/api/groups", groupId, "expenses"],
            old => [exp, ...(old || [])]);
        }}>
          Undo
        </ToastAction>
      ),
    });
  }

  function deleteSettlement(s: any) {
    const existing = pendingSettlementDeletes.current.get(s.id);
    if (existing) clearTimeout(existing);

    queryClient.setQueryData<any[]>(["/api/groups", groupId, "settlements"],
      old => (old || []).filter(x => x.id !== s.id));

    const timer = setTimeout(async () => {
      try {
        await apiRequest("DELETE", `/api/settlements/${s.id}`);
        queryClient.invalidateQueries({ queryKey: ["/api/groups", groupId, "balances"] });
        queryClient.invalidateQueries({ queryKey: ["/api/groups", groupId, "debts"] });
        queryClient.invalidateQueries({ queryKey: ["/api/user/balance"] });
        queryClient.invalidateQueries({ queryKey: ["/api/activity"] });
      } catch {
        queryClient.setQueryData<any[]>(["/api/groups", groupId, "settlements"],
          old => [s, ...(old || [])]);
        toast({ title: "Error", description: "Failed to delete settlement.", variant: "destructive" });
      }
      pendingSettlementDeletes.current.delete(s.id);
    }, 5000);

    pendingSettlementDeletes.current.set(s.id, timer);

    toast({
      title: "Settlement deleted",
      action: (
        <ToastAction altText="Undo" onClick={() => {
          clearTimeout(pendingSettlementDeletes.current.get(s.id));
          pendingSettlementDeletes.current.delete(s.id);
          queryClient.setQueryData<any[]>(["/api/groups", groupId, "settlements"],
            old => [s, ...(old || [])]);
        }}>
          Undo
        </ToastAction>
      ),
    });
  }

  async function removeMember(targetUserId: number) {
    if (!window.confirm("Remove this member from the group?")) return;
    try {
      await apiRequest("DELETE", `/api/groups/${groupId}/members/${targetUserId}`);
      queryClient.invalidateQueries({ queryKey: ["/api/groups", groupId, "members"] });
      queryClient.invalidateQueries({ queryKey: ["/api/groups", groupId, "balances"] });
      queryClient.invalidateQueries({ queryKey: ["/api/groups", groupId, "debts"] });
      toast({ title: "Member removed" });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  }

  async function leaveGroup() {
    if (!window.confirm("Are you sure you want to leave this group?")) return;
    try {
      await apiRequest("POST", `/api/groups/${groupId}/leave`);
      queryClient.invalidateQueries({ queryKey: ["/api/groups"] });
      setLocation("/");
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  }

  async function exportCSV() {
    try {
      const res = await apiRequest("GET", `/api/groups/${groupId}/export`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${(group?.name ?? "group").replace(/[^a-z0-9]/gi, "_")}-export.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      toast({ title: "Error", description: "Export failed.", variant: "destructive" });
    }
  }

  if (groupLoading) {
    return (
      <div className="min-h-screen bg-background">
        <header className="border-b bg-card/50 sticky top-0 z-50">
          <div className="max-w-5xl mx-auto px-4 h-14 flex items-center gap-3">
            <Skeleton className="h-5 w-40" />
          </div>
        </header>
        <main className="max-w-5xl mx-auto px-4 py-6">
          <Skeleton className="h-32 w-full mb-4" />
          <Skeleton className="h-64 w-full" />
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background" data-testid="group-page">
      {/* Header */}
      <header className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <Link href="/">
              <Button variant="ghost" size="icon" data-testid="button-back">
                <ArrowLeft className="w-4 h-4" />
              </Button>
            </Link>
            <div className="min-w-0">
              <h1 className="font-bold text-sm truncate">{group?.name}</h1>
              <p className="text-xs text-muted-foreground">{members?.length || 0} {(members?.length || 0) === 1 ? 'member' : 'members'}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Button variant="ghost" size="icon" onClick={exportCSV} title="Export CSV" data-testid="button-export-csv">
              <Download className="w-4 h-4" />
            </Button>
            <Button variant="secondary" size="sm" onClick={copyInviteCode} data-testid="button-copy-invite">
              {copiedCode ? <Check className="w-3.5 h-3.5 mr-1" /> : <Copy className="w-3.5 h-3.5 mr-1" />}
              <span className="font-mono text-xs">{group?.inviteCode}</span>
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        {/* Summary cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Card>
            <CardContent className="pt-4 pb-3 text-center">
              <p className="text-xs text-muted-foreground mb-1">Total Spent</p>
              <p className="text-lg font-bold">${totalGroupSpend.toFixed(2)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3 text-center">
              <p className="text-xs text-muted-foreground mb-1">Your Balance</p>
              <p className={`text-lg font-bold ${(myBalance?.amount || 0) > 0 ? "text-emerald-600 dark:text-emerald-400" : (myBalance?.amount || 0) < 0 ? "text-red-500" : ""}`}>
                {(myBalance?.amount || 0) > 0 ? "+" : (myBalance?.amount || 0) < 0 ? "-" : ""}${Math.abs(myBalance?.amount || 0).toFixed(2)}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3 text-center">
              <p className="text-xs text-muted-foreground mb-1">Expenses</p>
              <p className="text-lg font-bold">{expenses?.length || 0}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3 text-center">
              <p className="text-xs text-muted-foreground mb-1">Members</p>
              <p className="text-lg font-bold">{members?.length || 0}</p>
            </CardContent>
          </Card>
        </div>

        {/* Action buttons */}
        <div className="flex gap-3">
          <Button onClick={() => setExpenseOpen(true)} className="flex-1" data-testid="button-add-expense">
            <Plus className="w-4 h-4 mr-1.5" />
            Add Expense
          </Button>
          <Button variant="secondary" onClick={() => setSettleOpen(true)} className="flex-1" data-testid="button-settle-up">
            <Handshake className="w-4 h-4 mr-1.5" />
            Settle Up
          </Button>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="expenses">
          <TabsList className="w-full">
            <TabsTrigger value="expenses" className="flex-1" data-testid="tab-expenses">Expenses</TabsTrigger>
            <TabsTrigger value="balances" className="flex-1" data-testid="tab-balances">Balances</TabsTrigger>
            <TabsTrigger value="stats" className="flex-1" data-testid="tab-stats">Stats</TabsTrigger>
            <TabsTrigger value="members" className="flex-1" data-testid="tab-members">Members</TabsTrigger>
            <TabsTrigger value="audit" className="flex-1" data-testid="tab-audit">Audit</TabsTrigger>
          </TabsList>

          {/* Expenses tab */}
          <TabsContent value="expenses" className="mt-4 space-y-3">
            {/* Filter / sort controls */}
            {(expenses && expenses.length > 0) && (
              <div className="space-y-2">
                <div className="flex gap-2">
                  <Input
                    placeholder="Search expenses..."
                    value={filterDesc}
                    onChange={e => setFilterDesc(e.target.value)}
                    className="flex-1 h-8 text-sm"
                    data-testid="input-filter-desc"
                  />
                  {hasFilters && (
                    <Button variant="outline" size="sm" onClick={clearFilters} data-testid="button-clear-filters">
                      Clear
                    </Button>
                  )}
                </div>
                <div className="flex gap-2 flex-wrap">
                  <Select value={filterCategory} onValueChange={setFilterCategory}>
                    <SelectTrigger className="h-8 text-xs w-36" data-testid="select-filter-category">
                      <SelectValue placeholder="Category" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All categories</SelectItem>
                      <SelectItem value="food">Food</SelectItem>
                      <SelectItem value="transport">Transport</SelectItem>
                      <SelectItem value="stay">Stay</SelectItem>
                      <SelectItem value="drinks">Drinks</SelectItem>
                      <SelectItem value="activities">Activities</SelectItem>
                      <SelectItem value="shopping">Shopping</SelectItem>
                      <SelectItem value="general">General</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={filterPaidBy} onValueChange={setFilterPaidBy}>
                    <SelectTrigger className="h-8 text-xs w-36" data-testid="select-filter-payer">
                      <SelectValue placeholder="Paid by" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All members</SelectItem>
                      {members?.map((m: any) => (
                        <SelectItem key={m.user.id} value={m.user.id.toString()}>{m.user.displayName}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={sortBy} onValueChange={setSortBy}>
                    <SelectTrigger className="h-8 text-xs w-36" data-testid="select-sort">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="date-desc">Newest first</SelectItem>
                      <SelectItem value="date-asc">Oldest first</SelectItem>
                      <SelectItem value="amount-desc">Highest amount</SelectItem>
                      <SelectItem value="amount-asc">Lowest amount</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            {expensesLoading ? (
              [1, 2, 3].map(i => <Skeleton key={i} className="h-16 w-full" />)
            ) : filteredExpenses.length > 0 ? (
              <>
                {filteredExpenses.map((exp: any) => (
                  <Card key={exp.id} data-testid={`card-expense-${exp.id}`}>
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-3">
                          <div className="p-2 rounded-lg bg-muted shrink-0 mt-0.5">
                            {expenseCategoryIcons[exp.category] || expenseCategoryIcons.general}
                          </div>
                          <div>
                            <p className="font-semibold text-sm">{exp.description}</p>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              Paid by <span className="font-medium text-foreground">{exp.paidBy.displayName}</span>
                              {" "}&middot; {new Date(exp.createdAt).toLocaleDateString()}
                            </p>
                            <div className="flex flex-wrap gap-1 mt-2">
                              {exp.splits.map((s: any) => (
                                <Badge key={s.id} variant="secondary" className="text-xs font-normal">
                                  {s.user.displayName}: ${s.amount.toFixed(2)}
                                </Badge>
                              ))}
                            </div>
                            {exp.notes && (
                              <p className="text-xs text-muted-foreground mt-1.5 italic">"{exp.notes}"</p>
                            )}
                          </div>
                        </div>
                        <div className="flex items-start gap-1 shrink-0">
                          <span className="font-bold text-sm pt-1">${exp.amount.toFixed(2)}</span>
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditExpense(exp)} data-testid={`button-edit-expense-${exp.id}`}>
                            <Pencil className="w-3.5 h-3.5 text-muted-foreground" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => deleteExpense(exp)} data-testid={`button-delete-expense-${exp.id}`}>
                            <Trash2 className="w-3.5 h-3.5 text-muted-foreground" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}

                {/* Settlements list */}
                {settlements && settlements.length > 0 && (
                  <div className="pt-4">
                    <h3 className="text-sm font-semibold text-muted-foreground mb-3">Settlements</h3>
                    {settlements.map((s: any) => (
                      <Card key={s.id} className="mb-2" data-testid={`card-settlement-${s.id}`}>
                        <CardContent className="p-4 flex items-center gap-3">
                          <div className="p-2 rounded-lg bg-emerald-500/10 shrink-0">
                            <Handshake className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium">
                              {s.paidBy.displayName} <ArrowRight className="w-3 h-3 inline mx-1" /> {s.paidTo.displayName}
                            </p>
                            <p className="text-xs text-muted-foreground">{new Date(s.createdAt).toLocaleDateString()}</p>
                            {s.notes && <p className="text-xs text-muted-foreground italic">"{s.notes}"</p>}
                          </div>
                          <span className="font-bold text-sm text-emerald-600 dark:text-emerald-400">${s.amount.toFixed(2)}</span>
                          <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => deleteSettlement(s)} data-testid={`button-delete-settlement-${s.id}`}>
                            <Trash2 className="w-3.5 h-3.5 text-muted-foreground" />
                          </Button>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </>
            ) : expenses && expenses.length > 0 ? (
              // Has expenses but none match the filter
              <Card>
                <CardContent className="py-8 text-center">
                  <p className="text-sm text-muted-foreground">No expenses match your filters.</p>
                  <Button variant="ghost" size="sm" onClick={clearFilters} className="mt-1">Clear filters</Button>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="py-12 text-center">
                  <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
                    <Receipt className="w-6 h-6 text-muted-foreground" />
                  </div>
                  <h3 className="font-semibold mb-1">No expenses yet</h3>
                  <p className="text-sm text-muted-foreground mb-4">Start tracking your shared expenses.</p>
                  <Button size="sm" onClick={() => setExpenseOpen(true)}>
                    <Plus className="w-4 h-4 mr-1.5" />
                    Add First Expense
                  </Button>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* Balances tab */}
          <TabsContent value="balances" className="mt-4 space-y-4">
            <div>
              <h3 className="text-sm font-semibold text-muted-foreground mb-3">Member Balances</h3>
              <Card>
                <CardContent className="p-0 divide-y">
                  {balances?.map((b: any) => (
                    <div key={b.userId} className="px-4 py-3 flex items-center gap-3" data-testid={`balance-${b.userId}`}>
                      <UserAvatar name={b.displayName} color={b.avatarColor} size="sm" />
                      <span className="text-sm font-medium flex-1">{b.displayName}</span>
                      <span className={`text-sm font-bold ${b.amount > 0 ? "text-emerald-600 dark:text-emerald-400" : b.amount < 0 ? "text-red-500" : "text-muted-foreground"}`}>
                        {b.amount > 0 ? "+" : b.amount < 0 ? "-" : ""}${Math.abs(b.amount).toFixed(2)}
                      </span>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>

            {debts && debts.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-muted-foreground mb-3">Who Owes Whom</h3>
                <div className="space-y-2">
                  {debts.map((d: any, i: number) => (
                    <Card key={i} data-testid={`debt-${i}`}>
                      <CardContent className="p-4 flex items-center gap-3">
                        <UserAvatar name={d.fromUserName} color={d.fromAvatarColor} size="sm" />
                        <div className="flex-1 text-center">
                          <p className="text-sm font-medium">{d.fromUserName}</p>
                          <div className="flex items-center justify-center gap-1 my-1">
                            <div className="h-px bg-border flex-1" />
                            <span className="text-xs text-muted-foreground px-2">owes</span>
                            <ArrowRight className="w-3 h-3 text-muted-foreground" />
                            <div className="h-px bg-border flex-1" />
                          </div>
                          <p className="text-sm font-medium">{d.toUserName}</p>
                        </div>
                        <div className="text-right">
                          <span className="text-lg font-bold text-red-500">${d.amount.toFixed(2)}</span>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            )}

            {(!debts || debts.length === 0) && balances && balances.length > 0 && (
              <Card>
                <CardContent className="py-8 text-center">
                  <div className="w-12 h-12 rounded-full bg-emerald-500/10 flex items-center justify-center mx-auto mb-3">
                    <Check className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <h3 className="font-semibold mb-1">All settled up</h3>
                  <p className="text-sm text-muted-foreground">No outstanding debts in this group.</p>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* Stats tab */}
          <TabsContent value="stats" className="mt-4 space-y-4">
            {chartData.length > 0 ? (
              <>
                <Card>
                  <CardContent className="pt-4 pb-3 text-center">
                    <p className="text-xs text-muted-foreground mb-1">Total Group Spend</p>
                    <p className="text-2xl font-bold">${totalGroupSpend.toFixed(2)}</p>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="pt-4 pb-2">
                    <p className="text-sm font-semibold text-muted-foreground mb-4 text-center">Spending by Category</p>
                    <ResponsiveContainer width="100%" height={200}>
                      <PieChart>
                        <Pie
                          data={chartData}
                          cx="50%"
                          cy="50%"
                          innerRadius={55}
                          outerRadius={85}
                          paddingAngle={2}
                          dataKey="value"
                        >
                          {chartData.map((entry, index) => (
                            <Cell key={index} fill={CATEGORY_COLORS[entry.name] || "#94a3b8"} />
                          ))}
                        </Pie>
                        <Tooltip
                          formatter={(value: number | string) => [`$${Number(value).toFixed(2)}`, ""]}
                          labelFormatter={() => ""}
                        />
                      </PieChart>
                    </ResponsiveContainer>

                    <div className="mt-2 space-y-2">
                      {chartData.map((entry) => {
                        const pct = totalGroupSpend > 0 ? ((entry.value / totalGroupSpend) * 100).toFixed(1) : "0.0";
                        return (
                          <div key={entry.name} className="flex items-center gap-3 px-2 py-1.5 rounded-lg hover:bg-muted/50" data-testid={`stat-${entry.name}`}>
                            <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: CATEGORY_COLORS[entry.name] || "#94a3b8" }} />
                            <div className="p-1 rounded bg-muted shrink-0">
                              {expenseCategoryIcons[entry.name] || expenseCategoryIcons.general}
                            </div>
                            <span className="text-sm font-medium flex-1">{CATEGORY_LABELS[entry.name] || entry.name}</span>
                            <span className="text-xs text-muted-foreground">{pct}%</span>
                            <span className="text-sm font-bold">${entry.value.toFixed(2)}</span>
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              </>
            ) : (
              <Card>
                <CardContent className="py-12 text-center">
                  <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
                    <BarChart3 className="w-6 h-6 text-muted-foreground" />
                  </div>
                  <h3 className="font-semibold mb-1">No data yet</h3>
                  <p className="text-sm text-muted-foreground">Add expenses to see spending stats.</p>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* Members tab */}
          <TabsContent value="members" className="mt-4">
            <Card>
              <CardContent className="p-0 divide-y">
                {members?.map((m: any) => (
                  <div key={m.user.id} className="px-4 py-3 flex items-center gap-3" data-testid={`member-${m.user.id}`}>
                    <UserAvatar name={m.user.displayName} color={m.user.avatarColor} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{m.user.displayName}</p>
                      <p className="text-xs text-muted-foreground">@{m.user.username}</p>
                    </div>
                    {m.user.id === group?.createdBy && (
                      <Badge variant="secondary" className="text-xs">Creator</Badge>
                    )}
                    {isCreator && m.user.id !== user?.id && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-destructive"
                        onClick={() => removeMember(m.user.id)}
                        data-testid={`button-remove-member-${m.user.id}`}
                      >
                        <UserX className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>

            <div className="mt-4 p-4 rounded-lg border border-dashed text-center">
              <p className="text-sm text-muted-foreground mb-2">Invite friends with this code:</p>
              <button onClick={copyInviteCode} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-muted font-mono text-lg tracking-widest font-bold" data-testid="button-invite-code-large">
                {group?.inviteCode}
                {copiedCode ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4 text-muted-foreground" />}
              </button>
            </div>

            <div className="mt-4">
              <Button
                variant="outline"
                className="w-full text-destructive hover:text-destructive border-destructive/30 hover:bg-destructive/5"
                onClick={leaveGroup}
                data-testid="button-leave-group"
              >
                Leave Group
              </Button>
            </div>
          </TabsContent>

          {/* Audit tab */}
          <TabsContent value="audit" className="mt-4">
            {auditLogs && auditLogs.length > 0 ? (
              <Card>
                <CardContent className="p-0 divide-y">
                  {auditLogs.map((log: any) => (
                    <div key={log.id} className="px-4 py-3 flex items-start gap-3">
                      <div className="p-2 rounded-lg bg-muted shrink-0 mt-0.5">
                        <History className="w-4 h-4 text-muted-foreground" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">{log.details}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {new Date(log.createdAt).toLocaleString()}
                        </p>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="py-12 text-center">
                  <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
                    <History className="w-6 h-6 text-muted-foreground" />
                  </div>
                  <h3 className="font-semibold mb-1">No audit history yet</h3>
                  <p className="text-sm text-muted-foreground">Changes to this group will appear here.</p>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>

        <PerplexityAttribution />
      </main>

      {members && (
        <>
          <AddExpenseDialog
            open={expenseOpen}
            onOpenChange={setExpenseOpen}
            groupId={groupId}
            members={members.map((m: any) => m.user)}
            currentUserId={user?.id || 0}
          />
          <EditExpenseDialog
            open={!!editExpense}
            onOpenChange={v => { if (!v) setEditExpense(null); }}
            expense={editExpense}
            members={members.map((m: any) => m.user)}
            currentUserId={user?.id || 0}
          />
          <SettleUpDialog
            open={settleOpen}
            onOpenChange={setSettleOpen}
            groupId={groupId}
            members={members.map((m: any) => m.user)}
            currentUserId={user?.id || 0}
            debts={debts || []}
          />
        </>
      )}
    </div>
  );
}
