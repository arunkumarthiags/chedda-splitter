import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { Link } from "wouter";
import { apiRequest, getQueryFn } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { UserAvatar } from "@/components/UserAvatar";
import { CreateGroupDialog } from "@/components/CreateGroupDialog";
import { JoinGroupDialog } from "@/components/JoinGroupDialog";
import { ChangePasswordDialog } from "@/components/ChangePasswordDialog";
import { ThemeToggle } from "@/components/ThemeToggle";
import { PerplexityAttribution } from "@/components/PerplexityAttribution";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Plus, UserPlus, LogOut, KeyRound, Users, TrendingUp, TrendingDown,
  Wallet, ChevronRight, Receipt, Plane, Home, Heart, MoreHorizontal,
} from "lucide-react";

const categoryIcons: Record<string, React.ReactNode> = {
  trip: <Plane className="w-4 h-4" />,
  home: <Home className="w-4 h-4" />,
  couple: <Heart className="w-4 h-4" />,
  other: <MoreHorizontal className="w-4 h-4" />,
};

export default function Dashboard() {
  const { user, logout } = useAuth();
  const [createOpen, setCreateOpen] = useState(false);
  const [joinOpen, setJoinOpen] = useState(false);
  const [changePasswordOpen, setChangePasswordOpen] = useState(false);

  const { data: groups, isLoading: groupsLoading } = useQuery<any[]>({
    queryKey: ["/api/groups"],
    queryFn: getQueryFn({ on401: "throw" }),
  });

  const { data: balanceData } = useQuery<{ balance: number }>({
    queryKey: ["/api/user/balance"],
    queryFn: getQueryFn({ on401: "throw" }),
  });

  const { data: activity } = useQuery<any[]>({
    queryKey: ["/api/activity"],
    queryFn: getQueryFn({ on401: "throw" }),
  });

  const totalBalance = balanceData?.balance ?? 0;

  return (
    <div className="min-h-screen bg-background" data-testid="dashboard-page">
      {/* Header */}
      <header className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <svg viewBox="0 0 32 32" className="w-7 h-7 text-primary" fill="none">
              <rect width="32" height="32" rx="8" fill="currentColor" fillOpacity="0.15" />
              <path d="M10 11h12M10 16h8M10 21h10" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
              <circle cx="24" cy="21" r="3" fill="currentColor" />
            </svg>
            <span className="font-bold text-base tracking-tight">CheddaSplit</span>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <div className="pl-2 border-l">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="flex items-center gap-2 rounded-md px-2 py-1 hover:bg-muted transition-colors" data-testid="button-user-menu">
                    <UserAvatar name={user?.displayName || "U"} color={user?.avatarColor || "#1B9C85"} size="sm" />
                    <span className="text-sm font-medium hidden sm:inline">{user?.displayName}</span>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-44">
                  <DropdownMenuItem onClick={() => setChangePasswordOpen(true)} data-testid="menu-item-change-password">
                    <KeyRound className="w-4 h-4 mr-2" />
                    Change Password
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={logout} data-testid="button-logout" className="text-destructive focus:text-destructive">
                    <LogOut className="w-4 h-4 mr-2" />
                    Log out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        {/* Balance summary */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card>
            <CardContent className="pt-5 pb-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary/10">
                  <Wallet className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground font-medium">Overall Balance</p>
                  <p className={`text-lg font-bold ${totalBalance > 0 ? "text-emerald-600 dark:text-emerald-400" : totalBalance < 0 ? "text-red-500" : "text-foreground"}`}>
                    {totalBalance > 0 ? "+" : totalBalance < 0 ? "-" : ""}${Math.abs(totalBalance).toFixed(2)}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-5 pb-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-emerald-500/10">
                  <TrendingUp className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground font-medium">You Are Owed</p>
                  <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400">
                    ${totalBalance > 0 ? totalBalance.toFixed(2) : "0.00"}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-5 pb-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-red-500/10">
                  <TrendingDown className="w-5 h-5 text-red-500" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground font-medium">You Owe</p>
                  <p className="text-lg font-bold text-red-500">
                    ${totalBalance < 0 ? Math.abs(totalBalance).toFixed(2) : "0.00"}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Groups section */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">Your Groups</h2>
            <div className="flex gap-2">
              <Button size="sm" variant="secondary" onClick={() => setJoinOpen(true)} data-testid="button-join-group">
                <UserPlus className="w-4 h-4 mr-1.5" />
                Join
              </Button>
              <Button size="sm" onClick={() => setCreateOpen(true)} data-testid="button-create-group">
                <Plus className="w-4 h-4 mr-1.5" />
                New Group
              </Button>
            </div>
          </div>

          {groupsLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {[1, 2, 3].map(i => (
                <Card key={i}>
                  <CardContent className="p-4">
                    <Skeleton className="h-5 w-32 mb-2" />
                    <Skeleton className="h-4 w-48" />
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : groups && groups.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {groups.map((g: any) => (
                <Link key={g.id} href={`/group/${g.id}`}>
                  <Card className="cursor-pointer hover-elevate transition-colors" data-testid={`card-group-${g.id}`}>
                    <CardContent className="p-4 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="p-2 rounded-lg bg-primary/10 shrink-0">
                          {categoryIcons[g.category] || categoryIcons.other}
                        </div>
                        <div className="min-w-0">
                          <p className="font-semibold text-sm truncate">{g.name}</p>
                          {g.description && (
                            <p className="text-xs text-muted-foreground truncate">{g.description}</p>
                          )}
                        </div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="py-12 text-center">
                <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
                  <Users className="w-6 h-6 text-muted-foreground" />
                </div>
                <h3 className="font-semibold mb-1">No groups yet</h3>
                <p className="text-sm text-muted-foreground mb-4">Create a group for your trip or join one with an invite code.</p>
                <div className="flex gap-2 justify-center">
                  <Button size="sm" variant="secondary" onClick={() => setJoinOpen(true)}>
                    <UserPlus className="w-4 h-4 mr-1.5" />
                    Join Group
                  </Button>
                  <Button size="sm" onClick={() => setCreateOpen(true)}>
                    <Plus className="w-4 h-4 mr-1.5" />
                    Create Group
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Recent activity */}
        {activity && activity.length > 0 && (
          <div>
            <h2 className="text-lg font-semibold mb-4">Recent Activity</h2>
            <Card>
              <CardContent className="p-0 divide-y">
                {activity.slice(0, 8).map((a: any, i: number) => (
                  <div key={`${a.type}-${a.id}`} className="px-4 py-3 flex items-center gap-3">
                    <div className={`p-2 rounded-lg shrink-0 ${a.type === "expense" ? "bg-primary/10" : "bg-emerald-500/10"}`}>
                      {a.type === "expense" ? (
                        <Receipt className="w-4 h-4 text-primary" />
                      ) : (
                        <Wallet className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">
                        {a.type === "expense"
                          ? `${a.user.displayName} added "${a.description}"`
                          : a.description}
                      </p>
                      <p className="text-xs text-muted-foreground">{a.groupName} &middot; {new Date(a.createdAt).toLocaleDateString()}</p>
                    </div>
                    <span className={`text-sm font-semibold shrink-0 ${a.type === "settlement" ? "text-emerald-600 dark:text-emerald-400" : ""}`}>
                      ${a.amount.toFixed(2)}
                    </span>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        )}

        <PerplexityAttribution />
      </main>

      <CreateGroupDialog open={createOpen} onOpenChange={setCreateOpen} />
      <JoinGroupDialog open={joinOpen} onOpenChange={setJoinOpen} />
      <ChangePasswordDialog open={changePasswordOpen} onOpenChange={setChangePasswordOpen} />
    </div>
  );
}
