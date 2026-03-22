import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Wallet, Users, Receipt, ArrowRight } from "lucide-react";

export default function AuthPage() {
  const [isLogin, setIsLogin] = useState(true);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [loading, setLoading] = useState(false);
  const { login, register } = useAuth();
  const { toast } = useToast();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      if (isLogin) {
        await login(username, password);
      } else {
        await register(username, password, displayName);
      }
    } catch (err: any) {
      toast({
        title: "Error",
        description: err.message?.replace(/^\d+:\s*/, "") || "Something went wrong",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex" data-testid="auth-page">
      {/* Left panel — branding */}
      <div className="hidden lg:flex lg:w-1/2 bg-primary p-12 flex-col justify-between text-primary-foreground">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <svg viewBox="0 0 32 32" className="w-10 h-10" fill="none">
              <rect width="32" height="32" rx="8" fill="currentColor" fillOpacity="0.2" />
              <path d="M10 11h12M10 16h8M10 21h10" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
              <circle cx="24" cy="21" r="3" fill="currentColor" />
            </svg>
            <span className="text-xl font-bold tracking-tight">CheddaSplit</span>
          </div>
          <p className="text-sm opacity-80 mt-1">Split expenses effortlessly with friends</p>
        </div>

        <div className="space-y-8">
          <div className="flex items-start gap-4">
            <div className="p-2.5 rounded-lg bg-white/10">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-semibold mb-1">Group trips made easy</h3>
              <p className="text-sm opacity-75">Create groups, invite friends, and track every shared expense in one place.</p>
            </div>
          </div>
          <div className="flex items-start gap-4">
            <div className="p-2.5 rounded-lg bg-white/10">
              <Receipt className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-semibold mb-1">Smart splitting</h3>
              <p className="text-sm opacity-75">Split equally, by exact amounts, or by percentage. You decide how to divide it.</p>
            </div>
          </div>
          <div className="flex items-start gap-4">
            <div className="p-2.5 rounded-lg bg-white/10">
              <Wallet className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-semibold mb-1">Simplified debts</h3>
              <p className="text-sm opacity-75">We minimize the number of payments needed so everyone settles up quickly.</p>
            </div>
          </div>
        </div>

        <p className="text-xs opacity-50">
          Created with ♥ in San Jose, CA
        </p>
      </div>

      {/* Right panel — form */}
      <div className="flex-1 flex items-center justify-center p-6">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="flex items-center justify-center gap-2 mb-3 lg:hidden">
              <svg viewBox="0 0 32 32" className="w-8 h-8 text-primary" fill="none">
                <rect width="32" height="32" rx="8" fill="currentColor" fillOpacity="0.15" />
                <path d="M10 11h12M10 16h8M10 21h10" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
                <circle cx="24" cy="21" r="3" fill="currentColor" />
              </svg>
              <span className="text-lg font-bold text-primary">CheddaSplit</span>
            </div>
            <CardTitle>{isLogin ? "Welcome back" : "Create your account"}</CardTitle>
            <CardDescription>
              {isLogin ? "Sign in to manage your shared expenses" : "Get started splitting expenses with friends"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {!isLogin && (
                <div className="space-y-2">
                  <Label htmlFor="displayName">Display Name</Label>
                  <Input
                    id="displayName"
                    data-testid="input-display-name"
                    placeholder="Your name"
                    value={displayName}
                    onChange={e => setDisplayName(e.target.value)}
                    required
                  />
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="username">Username</Label>
                <Input
                  id="username"
                  data-testid="input-username"
                  placeholder="Choose a username"
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  data-testid="input-password"
                  type="password"
                  placeholder="Enter password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                />
              </div>
              <Button type="submit" className="w-full gap-2" disabled={loading} data-testid="button-submit-auth">
                {loading ? "Please wait..." : isLogin ? "Sign In" : "Create Account"}
                {!loading && <ArrowRight className="w-4 h-4" />}
              </Button>
            </form>
            <div className="mt-6 text-center text-sm text-muted-foreground">
              {isLogin ? "Don't have an account?" : "Already have an account?"}{" "}
              <button
                data-testid="button-toggle-auth"
                className="text-primary font-medium hover:underline"
                onClick={() => { setIsLogin(!isLogin); setUsername(""); setPassword(""); setDisplayName(""); }}
              >
                {isLogin ? "Sign up" : "Sign in"}
              </button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
