import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRoute, Link } from "wouter";
import { useAuth } from "@/lib/auth";
import { getQueryFn } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { UserAvatar } from "@/components/UserAvatar";
import { AddExpenseDialog } from "@/components/AddExpenseDialog";
import { SettleUpDialog } from "@/components/SettleUpDialog";
import { ThemeToggle } from "@/components/ThemeToggle";
import { PerplexityAttribution } from "@/components/PerplexityAttribution";
import {
  ArrowLeft, Plus, Handshake, Copy, Check, Receipt, Wallet,
  Users, ArrowRight, Utensils, Car, BedDouble, Wine, Tent,
  ShoppingBag, MoreHorizontal, Trash2,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

const expenseCategoryIcons: Record<string, React.ReactNode> = {
  food: <Utensils className="w-4 h-4" />,
  transport: <Car className="w-4 h-4" />,
  stay: <BedDouble className="w-4 h-4" />,
  drinks: <Wine className="w-4 h-4" />,
  activities: <Tent className="w-4 h-4" />,
  shopping: <ShoppingBag className="w-4 h-4" />,
  general: <Receipt className="w-4 h-4" />,
};

export default function GroupPage() {
  const [, params] = useRoute("/group/:id");
  const groupId = parseInt(params?.id || "0");
  const { user } = useAuth();
  const { toast } = useToast();
  const [expenseOpen, setExpenseOpen] = useState(false);
  const [settleOpen, setSettleOpen] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);

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

  const myBalance = balances?.find((b: any) => b.userId === user?.id);

  function copyInviteCode() {
    if (group?.inviteCode) {
      navigator.clipboard.writeText(group.inviteCode).catch(() => {});
      setCopiedCode(true);
      toast({ title: "Copied!", description: "Invite code copied to clipboard." });
      setTimeout(() => setCopiedCode(false), 2000);
    }
  }

  async function deleteExpense(id: number) {
    try {
      await apiRequest("DELETE", `/api/expenses/${id}`);
      queryClient.invalidateQueries({ queryKey: ["/api/groups", groupId, "expenses"] });
      queryClient.invalidateQueries({ queryKey: ["/api/groups", groupId, "balances"] });
      queryClient.invalidateQueries({ queryKey: ["/api/groups", groupId, "debts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/user/balance"] });
      queryClient.invalidateQueries({ queryKey: ["/api/activity"] });
      toast({ title: "Expense deleted" });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
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

  const totalGroupSpend = expenses?.reduce((sum: number, e: any) => sum + e.amount, 0) || 0;

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
              <p className="text-xs text-muted-foreground">{members?.length || 0} members</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
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
                {(myBalance?.amount || 0) >= 0 ? "+" : ""}${Math.abs(myBalance?.amount || 0).toFixed(2)}
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
            <TabsTrigger value="members" className="flex-1" data-testid="tab-members">Members</TabsTrigger>
          </TabsList>

          {/* Expenses tab */}
          <TabsContent value="expenses" className="mt-4 space-y-3">
            {expensesLoading ? (
              [1, 2, 3].map(i => <Skeleton key={i} className="h-16 w-full" />)
            ) : expenses && expenses.length > 0 ? (
              <>
                {expenses.map((exp: any) => (
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
                        <div className="flex items-start gap-2 shrink-0">
                          <span className="font-bold text-sm">${exp.amount.toFixed(2)}</span>
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => deleteExpense(exp.id)} data-testid={`button-delete-expense-${exp.id}`}>
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
                          </div>
                          <span className="font-bold text-sm text-emerald-600 dark:text-emerald-400">${s.amount.toFixed(2)}</span>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </>
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
            {/* Individual balances */}
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

            {/* Simplified debts */}
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

          {/* Members tab */}
          <TabsContent value="members" className="mt-4">
            <Card>
              <CardContent className="p-0 divide-y">
                {members?.map((m: any) => (
                  <div key={m.user.id} className="px-4 py-3 flex items-center gap-3" data-testid={`member-${m.user.id}`}>
                    <UserAvatar name={m.user.displayName} color={m.user.avatarColor} />
                    <div>
                      <p className="text-sm font-medium">{m.user.displayName}</p>
                      <p className="text-xs text-muted-foreground">@{m.user.username}</p>
                    </div>
                    {m.user.id === group?.createdBy && (
                      <Badge variant="secondary" className="ml-auto text-xs">Creator</Badge>
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
