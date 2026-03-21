import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import session from "express-session";
import createMemoryStore from "memorystore";
import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import crypto from "crypto";

const MemoryStore = createMemoryStore(session);

function hashPassword(password: string): string {
  return crypto.createHash("sha256").update(password).digest("hex");
}

function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ message: "Not authenticated" });
  }
  next();
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // Session setup
  app.use(
    session({
      secret: "splitwise-clone-secret-key-2026",
      resave: false,
      saveUninitialized: false,
      store: new MemoryStore({ checkPeriod: 86400000 }),
      cookie: { maxAge: 7 * 24 * 60 * 60 * 1000 },
    })
  );

  // Passport setup
  app.use(passport.initialize());
  app.use(passport.session());

  passport.use(
    new LocalStrategy(async (username, password, done) => {
      try {
        const user = await storage.getUserByUsername(username);
        if (!user) return done(null, false, { message: "User not found" });
        if (user.password !== hashPassword(password)) {
          return done(null, false, { message: "Invalid password" });
        }
        return done(null, user);
      } catch (err) {
        return done(err);
      }
    })
  );

  passport.serializeUser((user: any, done) => {
    done(null, user.id);
  });

  passport.deserializeUser(async (id: number, done) => {
    try {
      const user = await storage.getUser(id);
      done(null, user || false);
    } catch (err) {
      done(err);
    }
  });

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

      const user = await storage.createUser({
        username,
        password: hashPassword(password),
        displayName,
      });

      req.login(user, (err) => {
        if (err) return res.status(500).json({ message: "Login failed" });
        const { password: _, ...safeUser } = user;
        return res.json(safeUser);
      });
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/auth/login", (req, res, next) => {
    passport.authenticate("local", (err: any, user: any, info: any) => {
      if (err) return res.status(500).json({ message: err.message });
      if (!user) return res.status(401).json({ message: info?.message || "Invalid credentials" });

      req.login(user, (loginErr) => {
        if (loginErr) return res.status(500).json({ message: "Login failed" });
        const { password: _, ...safeUser } = user;
        return res.json(safeUser);
      });
    })(req, res, next);
  });

  app.post("/api/auth/logout", (req, res) => {
    req.logout((err) => {
      if (err) return res.status(500).json({ message: "Logout failed" });
      return res.json({ message: "Logged out" });
    });
  });

  app.get("/api/auth/me", (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    const user = req.user as any;
    const { password: _, ...safeUser } = user;
    return res.json(safeUser);
  });

  // === GROUP ROUTES ===
  app.post("/api/groups", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const group = await storage.createGroup(req.body, user.id);
      return res.json(group);
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/groups", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const groups = await storage.getUserGroups(user.id);
      return res.json(groups);
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/groups/:id", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const groupId = parseInt(req.params.id);
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
      const user = req.user as any;
      const groupId = parseInt(req.params.id);
      const isMember = await storage.isGroupMember(groupId, user.id);
      if (!isMember) return res.status(403).json({ message: "Not a member" });

      const members = await storage.getGroupMembers(groupId);
      const safeMems = members.map(m => {
        const { password: _, ...safeUser } = m.user;
        return { ...m, user: safeUser };
      });
      return res.json(safeMems);
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/groups/join", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
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
      const user = req.user as any;
      const groupId = parseInt(req.params.id);
      const isMember = await storage.isGroupMember(groupId, user.id);
      if (!isMember) return res.status(403).json({ message: "Not a member" });

      const { description, amount, paidById, category, splitType, splits, notes } = req.body;
      
      if (!description || !amount || !paidById || !splits || splits.length === 0) {
        return res.status(400).json({ message: "Missing required fields" });
      }

      const expense = await storage.createExpense(
        { groupId, description, amount: parseFloat(amount), paidById, category: category || "general", splitType: splitType || "equal", notes },
        splits.map((s: any) => ({ userId: s.userId, amount: parseFloat(s.amount) }))
      );

      return res.json(expense);
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/groups/:id/expenses", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const groupId = parseInt(req.params.id);
      const isMember = await storage.isGroupMember(groupId, user.id);
      if (!isMember) return res.status(403).json({ message: "Not a member" });

      const expenses = await storage.getGroupExpenses(groupId);
      const safe = expenses.map(e => {
        const { password: _, ...safePaidBy } = e.paidBy;
        const safeSplits = e.splits.map(s => {
          const { password: __, ...safeU } = s.user;
          return { ...s, user: safeU };
        });
        return { ...e, paidBy: safePaidBy, splits: safeSplits };
      });
      return res.json(safe);
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  app.delete("/api/expenses/:id", requireAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      await storage.deleteExpense(id);
      return res.json({ message: "Deleted" });
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  // === SETTLEMENT ROUTES ===
  app.post("/api/groups/:id/settlements", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const groupId = parseInt(req.params.id);
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
        amount: parseFloat(amount),
        notes,
      });
      return res.json(settlement);
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/groups/:id/settlements", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const groupId = parseInt(req.params.id);
      const isMember = await storage.isGroupMember(groupId, user.id);
      if (!isMember) return res.status(403).json({ message: "Not a member" });

      const settlements = await storage.getGroupSettlements(groupId);
      const safe = settlements.map(s => {
        const { password: _1, ...safePaidBy } = s.paidBy;
        const { password: _2, ...safePaidTo } = s.paidTo;
        return { ...s, paidBy: safePaidBy, paidTo: safePaidTo };
      });
      return res.json(safe);
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  // === BALANCE ROUTES ===
  app.get("/api/groups/:id/balances", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const groupId = parseInt(req.params.id);
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
      const user = req.user as any;
      const groupId = parseInt(req.params.id);
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
      const user = req.user as any;
      const balance = await storage.getUserTotalBalance(user.id);
      return res.json({ balance });
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  // === ACTIVITY ROUTES ===
  app.get("/api/groups/:id/activity", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const groupId = parseInt(req.params.id);
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
      const user = req.user as any;
      const activity = await storage.getUserActivity(user.id);
      return res.json(activity);
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  return httpServer;
}
