import type { Express, Request, Response, NextFunction } from "express";
import type { Server } from "http";
import rateLimit from "express-rate-limit";
import { storage } from "./storage";
import { supabase } from "./supabase";
import type { User } from "@shared/schema";

declare global {
  namespace Express {
    interface Request {
      user?: User;
    }
  }
}

function toSafeUser(user: User) {
  const { password: _p, authId: _a, ...safe } = user;
  return safe;
}

async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Not authenticated" });
  }
  const token = authHeader.slice(7);
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) {
    return res.status(401).json({ message: "Not authenticated" });
  }
  const dbUser = await storage.getUserByAuthId(data.user.id);
  if (!dbUser) {
    return res.status(401).json({ message: "Not authenticated" });
  }
  req.user = dbUser;
  next();
}

const USERNAME_REGEX = /^[a-zA-Z0-9_]+$/;

// Rate limiters
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many attempts, please try again later" },
});

const forgotPasswordLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many password reset requests, please try again later" },
});

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // === AUTH ROUTES ===
  app.post("/api/auth/register", authLimiter, async (req, res) => {
    try {
      const { username, password, displayName, email } = req.body;
      if (!username || !password || !displayName || !email) {
        return res.status(400).json({ message: "All fields are required" });
      }
      if (username.length < 3 || username.length > 20) {
        return res.status(400).json({ message: "Username must be 3–20 characters" });
      }
      if (!USERNAME_REGEX.test(username)) {
        return res.status(400).json({ message: "Username may only contain letters, numbers, and underscores" });
      }
      if (password.length < 8) {
        return res.status(400).json({ message: "Password must be at least 8 characters" });
      }

      const existing = await storage.getUserByUsername(username);
      if (existing) {
        return res.status(400).json({ message: "Username already taken" });
      }

      const { data: authData, error: createError } = await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });

      if (createError || !authData.user) {
        console.error("Supabase createUser error:", createError);
        return res.status(400).json({ message: createError?.message || "Failed to create account" });
      }

      const user = await storage.createUser({
        username,
        password: "",
        displayName,
        email,
        authId: authData.user.id,
      });

      const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (signInError || !signInData.session) {
        console.error("Supabase signIn after register error:", signInError);
        return res.status(500).json({ message: "Registration succeeded but login failed" });
      }

      return res.json({ ...toSafeUser(user), token: signInData.session.access_token });
    } catch (err: any) {
      console.error("Register error:", err);
      return res.status(500).json({ message: "Something went wrong" });
    }
  });

  app.post("/api/auth/login", authLimiter, async (req, res) => {
    try {
      const { username, password } = req.body;
      if (!username || !password) {
        return res.status(400).json({ message: "Username and password are required" });
      }

      const dbUser = await storage.getUserByUsername(username);
      if (!dbUser || !dbUser.email) {
        return res.status(401).json({ message: "Invalid credentials" });
      }

      const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
        email: dbUser.email,
        password,
      });

      if (signInError || !signInData.session) {
        return res.status(401).json({ message: "Invalid credentials" });
      }

      return res.json({ ...toSafeUser(dbUser), token: signInData.session.access_token });
    } catch (err: any) {
      console.error("Login error:", err);
      return res.status(500).json({ message: "Something went wrong" });
    }
  });

  app.post("/api/auth/logout", async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      if (authHeader?.startsWith("Bearer ")) {
        const token = authHeader.slice(7);
        await supabase.auth.admin.signOut(token);
      }
    } catch (err) {
      console.error("Logout signOut error:", err);
    }
    return res.json({ message: "Logged out" });
  });

  app.get("/api/auth/me", requireAuth, (req, res) => {
    return res.json(toSafeUser(req.user!));
  });

  app.post("/api/auth/forgot-password", forgotPasswordLimiter, async (req, res) => {
    try {
      const { email } = req.body;
      if (!email) {
        return res.status(400).json({ message: "Email is required" });
      }
      const appUrl = process.env.APP_URL || "http://localhost:5000";
      // Always return 200 — don't reveal whether the email exists
      await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: appUrl,
      });
      return res.json({ message: "If an account with that email exists, a reset link has been sent" });
    } catch (err: any) {
      console.error("Forgot password error:", err);
      return res.json({ message: "If an account with that email exists, a reset link has been sent" });
    }
  });

  app.post("/api/auth/reset-password", async (req, res) => {
    try {
      const { token, newPassword } = req.body;
      if (!token || !newPassword) {
        return res.status(400).json({ message: "Token and new password are required" });
      }
      if (newPassword.length < 8) {
        return res.status(400).json({ message: "Password must be at least 8 characters" });
      }

      // Verify the recovery token
      const { data, error } = await supabase.auth.getUser(token);
      if (error || !data.user) {
        return res.status(401).json({ message: "Invalid or expired reset token" });
      }

      const { error: updateError } = await supabase.auth.admin.updateUserById(
        data.user.id,
        { password: newPassword }
      );

      if (updateError) {
        console.error("Password update error:", updateError);
        return res.status(500).json({ message: "Failed to update password" });
      }

      return res.json({ message: "Password updated successfully" });
    } catch (err: any) {
      console.error("Reset password error:", err);
      return res.status(500).json({ message: "Something went wrong" });
    }
  });

  // === GROUP ROUTES ===
  app.post("/api/groups", requireAuth, async (req, res) => {
    try {
      const user = req.user!;
      const group = await storage.createGroup(req.body, user.id);
      return res.json(group);
    } catch (err: any) {
      console.error("Create group error:", err);
      return res.status(500).json({ message: "Something went wrong" });
    }
  });

  app.get("/api/groups", requireAuth, async (req, res) => {
    try {
      const user = req.user!;
      const groups = await storage.getUserGroups(user.id);
      return res.json(groups);
    } catch (err: any) {
      console.error("Get groups error:", err);
      return res.status(500).json({ message: "Something went wrong" });
    }
  });

  app.get("/api/groups/:id", requireAuth, async (req, res) => {
    try {
      const user = req.user!;
      const groupId = parseInt(req.params.id as string);
      const isMember = await storage.isGroupMember(groupId, user.id);
      if (!isMember) return res.status(403).json({ message: "Not a member of this group" });

      const group = await storage.getGroup(groupId);
      if (!group) return res.status(404).json({ message: "Group not found" });
      return res.json(group);
    } catch (err: any) {
      console.error("Get group error:", err);
      return res.status(500).json({ message: "Something went wrong" });
    }
  });

  app.get("/api/groups/:id/members", requireAuth, async (req, res) => {
    try {
      const user = req.user!;
      const groupId = parseInt(req.params.id as string);
      const isMember = await storage.isGroupMember(groupId, user.id);
      if (!isMember) return res.status(403).json({ message: "Not a member" });

      const members = await storage.getGroupMembers(groupId);
      const safeMems = members.map(m => ({ ...m, user: toSafeUser(m.user) }));
      return res.json(safeMems);
    } catch (err: any) {
      console.error("Get members error:", err);
      return res.status(500).json({ message: "Something went wrong" });
    }
  });

  app.post("/api/groups/join", requireAuth, async (req, res) => {
    try {
      const user = req.user!;
      const { inviteCode } = req.body;
      if (!inviteCode) return res.status(400).json({ message: "Invite code required" });

      const group = await storage.getGroupByInviteCode(inviteCode.toUpperCase());
      if (!group) return res.status(404).json({ message: "Invalid invite code" });

      const isMember = await storage.isGroupMember(group.id, user.id);
      if (isMember) return res.status(400).json({ message: "Already a member of this group" });

      await storage.addGroupMember(group.id, user.id);
      return res.json(group);
    } catch (err: any) {
      console.error("Join group error:", err);
      return res.status(500).json({ message: "Something went wrong" });
    }
  });

  // === EXPENSE ROUTES ===
  app.post("/api/groups/:id/expenses", requireAuth, async (req, res) => {
    try {
      const user = req.user!;
      const groupId = parseInt(req.params.id as string);
      const isMember = await storage.isGroupMember(groupId, user.id);
      if (!isMember) return res.status(403).json({ message: "Not a member" });

      const { description, amount, paidById, category, splitType, splits, notes } = req.body;

      if (!description || !amount || !paidById || !splits || splits.length === 0) {
        return res.status(400).json({ message: "Missing required fields" });
      }

      const parsedAmount = parseFloat(amount);
      if (isNaN(parsedAmount) || parsedAmount <= 0) {
        return res.status(400).json({ message: "Amount must be a positive number" });
      }

      const expense = await storage.createExpense(
        { groupId, description, amount: String(parsedAmount), paidById, category: category || "general", splitType: splitType || "equal", notes },
        splits.map((s: any) => ({ userId: s.userId, amount: parseFloat(s.amount) }))
      );

      return res.json({ ...expense, amount: parseFloat(expense.amount) });
    } catch (err: any) {
      console.error("Create expense error:", err);
      return res.status(500).json({ message: "Something went wrong" });
    }
  });

  app.get("/api/groups/:id/expenses", requireAuth, async (req, res) => {
    try {
      const user = req.user!;
      const groupId = parseInt(req.params.id as string);
      const isMember = await storage.isGroupMember(groupId, user.id);
      if (!isMember) return res.status(403).json({ message: "Not a member" });

      const expenses = await storage.getGroupExpenses(groupId);
      const safe = expenses.map(e => ({
        ...e,
        amount: parseFloat(e.amount),
        paidBy: toSafeUser(e.paidBy),
        splits: e.splits.map(s => ({ ...s, amount: parseFloat(s.amount), user: toSafeUser(s.user) })),
      }));
      return res.json(safe);
    } catch (err: any) {
      console.error("Get expenses error:", err);
      return res.status(500).json({ message: "Something went wrong" });
    }
  });

  app.delete("/api/expenses/:id", requireAuth, async (req, res) => {
    try {
      const user = req.user!;
      const id = parseInt(req.params.id as string);

      // Authorization: verify user is a member of the group this expense belongs to
      const expense = await storage.getExpense(id);
      if (!expense) return res.status(404).json({ message: "Expense not found" });

      const isMember = await storage.isGroupMember(expense.groupId, user.id);
      if (!isMember) return res.status(403).json({ message: "Not a member of this group" });

      await storage.deleteExpense(id, user.id);
      return res.json({ message: "Deleted" });
    } catch (err: any) {
      console.error("Delete expense error:", err);
      return res.status(500).json({ message: "Something went wrong" });
    }
  });

  // === SETTLEMENT ROUTES ===
  app.post("/api/groups/:id/settlements", requireAuth, async (req, res) => {
    try {
      const user = req.user!;
      const groupId = parseInt(req.params.id as string);
      const isMember = await storage.isGroupMember(groupId, user.id);
      if (!isMember) return res.status(403).json({ message: "Not a member" });

      const { paidById, paidToId, amount, notes } = req.body;
      if (!paidById || !paidToId || !amount) {
        return res.status(400).json({ message: "Missing required fields" });
      }

      const parsedAmount = parseFloat(amount);
      if (isNaN(parsedAmount) || parsedAmount <= 0) {
        return res.status(400).json({ message: "Amount must be a positive number" });
      }

      const settlement = await storage.createSettlement({
        groupId,
        paidById,
        paidToId,
        amount: String(parsedAmount),
        notes,
      });
      return res.json({ ...settlement, amount: parseFloat(settlement.amount) });
    } catch (err: any) {
      console.error("Create settlement error:", err);
      return res.status(500).json({ message: "Something went wrong" });
    }
  });

  app.get("/api/groups/:id/settlements", requireAuth, async (req, res) => {
    try {
      const user = req.user!;
      const groupId = parseInt(req.params.id as string);
      const isMember = await storage.isGroupMember(groupId, user.id);
      if (!isMember) return res.status(403).json({ message: "Not a member" });

      const settlements = await storage.getGroupSettlements(groupId);
      const safe = settlements.map(s => ({
        ...s,
        amount: parseFloat(s.amount),
        paidBy: toSafeUser(s.paidBy),
        paidTo: toSafeUser(s.paidTo),
      }));
      return res.json(safe);
    } catch (err: any) {
      console.error("Get settlements error:", err);
      return res.status(500).json({ message: "Something went wrong" });
    }
  });

  // === BALANCE ROUTES ===
  app.get("/api/groups/:id/balances", requireAuth, async (req, res) => {
    try {
      const user = req.user!;
      const groupId = parseInt(req.params.id as string);
      const isMember = await storage.isGroupMember(groupId, user.id);
      if (!isMember) return res.status(403).json({ message: "Not a member" });

      const balances = await storage.getGroupBalances(groupId);
      return res.json(balances);
    } catch (err: any) {
      console.error("Get balances error:", err);
      return res.status(500).json({ message: "Something went wrong" });
    }
  });

  app.get("/api/groups/:id/debts", requireAuth, async (req, res) => {
    try {
      const user = req.user!;
      const groupId = parseInt(req.params.id as string);
      const isMember = await storage.isGroupMember(groupId, user.id);
      if (!isMember) return res.status(403).json({ message: "Not a member" });

      const debts = await storage.getSimplifiedDebts(groupId);
      return res.json(debts);
    } catch (err: any) {
      console.error("Get debts error:", err);
      return res.status(500).json({ message: "Something went wrong" });
    }
  });

  app.get("/api/user/balance", requireAuth, async (req, res) => {
    try {
      const user = req.user!;
      const balance = await storage.getUserTotalBalance(user.id);
      return res.json({ balance });
    } catch (err: any) {
      console.error("Get user balance error:", err);
      return res.status(500).json({ message: "Something went wrong" });
    }
  });

  // === ACTIVITY ROUTES ===
  app.get("/api/groups/:id/activity", requireAuth, async (req, res) => {
    try {
      const user = req.user!;
      const groupId = parseInt(req.params.id as string);
      const isMember = await storage.isGroupMember(groupId, user.id);
      if (!isMember) return res.status(403).json({ message: "Not a member" });

      const activity = await storage.getGroupActivity(groupId);
      return res.json(activity);
    } catch (err: any) {
      console.error("Get activity error:", err);
      return res.status(500).json({ message: "Something went wrong" });
    }
  });

  app.get("/api/activity", requireAuth, async (req, res) => {
    try {
      const user = req.user!;
      const activity = await storage.getUserActivity(user.id);
      return res.json(activity);
    } catch (err: any) {
      console.error("Get user activity error:", err);
      return res.status(500).json({ message: "Something went wrong" });
    }
  });

  // === AUDIT LOG ROUTES ===
  app.get("/api/groups/:id/audit", requireAuth, async (req, res) => {
    try {
      const user = req.user!;
      const groupId = parseInt(req.params.id as string);
      const isMember = await storage.isGroupMember(groupId, user.id);
      if (!isMember) return res.status(403).json({ message: "Not a member" });

      const logs = await storage.getGroupAuditLogs(groupId);
      return res.json(logs);
    } catch (err: any) {
      console.error("Get audit logs error:", err);
      return res.status(500).json({ message: "Something went wrong" });
    }
  });

  return httpServer;
}
