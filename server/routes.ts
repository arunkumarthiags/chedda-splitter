import type { Express, Request, Response, NextFunction } from "express";
import type { Server } from "http";
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

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // === AUTH ROUTES ===
  app.post("/api/auth/register", async (req, res) => {
    try {
      const { username, password, displayName } = req.body;
      if (!username || !password || !displayName) {
        return res.status(400).json({ message: "All fields are required" });
      }
      if (username.length < 3) {
        return res.status(400).json({ message: "Username must be at least 3 characters" });
      }
      if (password.length < 4) {
        return res.status(400).json({ message: "Password must be at least 4 characters" });
      }

      const existing = await storage.getUserByUsername(username);
      if (existing) {
        return res.status(400).json({ message: "Username already taken" });
      }

      const syntheticEmail = `${username}@splittrip.internal`;

      const { data: authData, error: createError } = await supabase.auth.admin.createUser({
        email: syntheticEmail,
        password,
        email_confirm: true,
      });

      if (createError || !authData.user) {
        return res.status(500).json({ message: createError?.message || "Failed to create auth user" });
      }

      const user = await storage.createUser({
        username,
        password: "",
        displayName,
        authId: authData.user.id,
      });

      const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
        email: syntheticEmail,
        password,
      });

      if (signInError || !signInData.session) {
        return res.status(500).json({ message: "Registration succeeded but login failed" });
      }

      return res.json({ ...toSafeUser(user), token: signInData.session.access_token });
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/auth/login", async (req, res) => {
    try {
      const { username, password } = req.body;
      if (!username || !password) {
        return res.status(400).json({ message: "Username and password are required" });
      }

      const dbUser = await storage.getUserByUsername(username);
      if (!dbUser) {
        return res.status(401).json({ message: "Invalid credentials" });
      }

      const syntheticEmail = `${username}@splittrip.internal`;
      const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
        email: syntheticEmail,
        password,
      });

      if (signInError || !signInData.session) {
        return res.status(401).json({ message: "Invalid credentials" });
      }

      return res.json({ ...toSafeUser(dbUser), token: signInData.session.access_token });
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/auth/logout", (_req, res) => {
    return res.json({ message: "Logged out" });
  });

  app.get("/api/auth/me", requireAuth, (req, res) => {
    return res.json(toSafeUser(req.user!));
  });

  // === GROUP ROUTES ===
  app.post("/api/groups", requireAuth, async (req, res) => {
    try {
      const user = req.user!;
      const group = await storage.createGroup(req.body, user.id);
      return res.json(group);
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/groups", requireAuth, async (req, res) => {
    try {
      const user = req.user!;
      const groups = await storage.getUserGroups(user.id);
      return res.json(groups);
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
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
      return res.status(500).json({ message: err.message });
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
      return res.status(500).json({ message: err.message });
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
      return res.status(500).json({ message: err.message });
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

      const expense = await storage.createExpense(
        { groupId, description, amount: String(parseFloat(amount)), paidById, category: category || "general", splitType: splitType || "equal", notes },
        splits.map((s: any) => ({ userId: s.userId, amount: parseFloat(s.amount) }))
      );

      return res.json({ ...expense, amount: parseFloat(expense.amount) });
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
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
      return res.status(500).json({ message: err.message });
    }
  });

  app.delete("/api/expenses/:id", requireAuth, async (req, res) => {
    try {
      const user = req.user!;
      const id = parseInt(req.params.id as string);
      await storage.deleteExpense(id, user.id);
      return res.json({ message: "Deleted" });
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
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

      const settlement = await storage.createSettlement({
        groupId,
        paidById,
        paidToId,
        amount: String(parseFloat(amount)),
        notes,
      });
      return res.json({ ...settlement, amount: parseFloat(settlement.amount) });
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
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
      return res.status(500).json({ message: err.message });
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
      return res.status(500).json({ message: err.message });
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
      return res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/user/balance", requireAuth, async (req, res) => {
    try {
      const user = req.user!;
      const balance = await storage.getUserTotalBalance(user.id);
      return res.json({ balance });
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
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
      return res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/activity", requireAuth, async (req, res) => {
    try {
      const user = req.user!;
      const activity = await storage.getUserActivity(user.id);
      return res.json(activity);
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
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
      return res.status(500).json({ message: err.message });
    }
  });

  return httpServer;
}
