import {
  type User, type InsertUser, users,
  type Group, type InsertGroup, groups,
  type GroupMember, groupMembers,
  type Expense, type InsertExpense, expenses,
  type ExpenseSplit, expenseSplits,
  type Settlement, type InsertSettlement, settlements,
  type Balance, type SimplifiedDebt, type Activity,
} from "@shared/schema";
import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import { eq, and, or, desc, sql } from "drizzle-orm";
import crypto from "crypto";

const sqlite = new Database("data.db");
sqlite.pragma("journal_mode = WAL");

export const db = drizzle(sqlite);

// Create tables
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password TEXT NOT NULL,
    display_name TEXT NOT NULL,
    email TEXT,
    avatar_color TEXT NOT NULL DEFAULT '#1B9C85'
  );

  CREATE TABLE IF NOT EXISTS groups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    category TEXT NOT NULL DEFAULT 'trip',
    created_by INTEGER NOT NULL REFERENCES users(id),
    created_at TEXT NOT NULL DEFAULT '',
    invite_code TEXT NOT NULL UNIQUE
  );

  CREATE TABLE IF NOT EXISTS group_members (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    group_id INTEGER NOT NULL REFERENCES groups(id),
    user_id INTEGER NOT NULL REFERENCES users(id),
    joined_at TEXT NOT NULL DEFAULT ''
  );

  CREATE TABLE IF NOT EXISTS expenses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    group_id INTEGER NOT NULL REFERENCES groups(id),
    description TEXT NOT NULL,
    amount REAL NOT NULL,
    paid_by_id INTEGER NOT NULL REFERENCES users(id),
    category TEXT NOT NULL DEFAULT 'general',
    split_type TEXT NOT NULL DEFAULT 'equal',
    created_at TEXT NOT NULL DEFAULT '',
    notes TEXT
  );

  CREATE TABLE IF NOT EXISTS expense_splits (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    expense_id INTEGER NOT NULL REFERENCES expenses(id),
    user_id INTEGER NOT NULL REFERENCES users(id),
    amount REAL NOT NULL
  );

  CREATE TABLE IF NOT EXISTS settlements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    group_id INTEGER NOT NULL REFERENCES groups(id),
    paid_by_id INTEGER NOT NULL REFERENCES users(id),
    paid_to_id INTEGER NOT NULL REFERENCES users(id),
    amount REAL NOT NULL,
    created_at TEXT NOT NULL DEFAULT '',
    notes TEXT
  );
`);

const AVATAR_COLORS = [
  "#1B9C85", "#E8AA42", "#4A6FA5", "#D35D6E", "#6C5B7B",
  "#45B7D1", "#F38181", "#AA96DA", "#FCBAD3", "#A8D8EA",
];

function generateInviteCode(): string {
  return crypto.randomBytes(4).toString("hex").toUpperCase();
}

function getRandomColor(): string {
  return AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)];
}

export interface IStorage {
  // Users
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  
  // Groups
  createGroup(group: InsertGroup, userId: number): Promise<Group>;
  getGroup(id: number): Promise<Group | undefined>;
  getGroupByInviteCode(code: string): Promise<Group | undefined>;
  getUserGroups(userId: number): Promise<Group[]>;
  getGroupMembers(groupId: number): Promise<(GroupMember & { user: User })[]>;
  addGroupMember(groupId: number, userId: number): Promise<GroupMember>;
  isGroupMember(groupId: number, userId: number): Promise<boolean>;
  
  // Expenses
  createExpense(expense: InsertExpense, splits: { userId: number; amount: number }[]): Promise<Expense>;
  getExpense(id: number): Promise<Expense | undefined>;
  getGroupExpenses(groupId: number): Promise<(Expense & { paidBy: User; splits: (ExpenseSplit & { user: User })[] })[]>;
  deleteExpense(id: number): Promise<void>;
  
  // Settlements
  createSettlement(settlement: InsertSettlement): Promise<Settlement>;
  getGroupSettlements(groupId: number): Promise<(Settlement & { paidBy: User; paidTo: User })[]>;
  
  // Balances
  getGroupBalances(groupId: number): Promise<Balance[]>;
  getSimplifiedDebts(groupId: number): Promise<SimplifiedDebt[]>;
  getUserTotalBalance(userId: number): Promise<number>;
  
  // Activity
  getGroupActivity(groupId: number): Promise<Activity[]>;
  getUserActivity(userId: number): Promise<Activity[]>;
}

export class DatabaseStorage implements IStorage {
  // Users
  async getUser(id: number): Promise<User | undefined> {
    return db.select().from(users).where(eq(users.id, id)).get();
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return db.select().from(users).where(eq(users.username, username)).get();
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    return db.insert(users).values({
      ...insertUser,
      avatarColor: getRandomColor(),
    }).returning().get();
  }

  // Groups
  async createGroup(group: InsertGroup, userId: number): Promise<Group> {
    const now = new Date().toISOString();
    const newGroup = db.insert(groups).values({
      ...group,
      createdBy: userId,
      createdAt: now,
      inviteCode: generateInviteCode(),
    }).returning().get();

    // Add creator as member
    db.insert(groupMembers).values({
      groupId: newGroup.id,
      userId: userId,
      joinedAt: now,
    }).run();

    return newGroup;
  }

  async getGroup(id: number): Promise<Group | undefined> {
    return db.select().from(groups).where(eq(groups.id, id)).get();
  }

  async getGroupByInviteCode(code: string): Promise<Group | undefined> {
    return db.select().from(groups).where(eq(groups.inviteCode, code)).get();
  }

  async getUserGroups(userId: number): Promise<Group[]> {
    const memberRows = db.select().from(groupMembers).where(eq(groupMembers.userId, userId)).all();
    if (memberRows.length === 0) return [];
    
    const groupIds = memberRows.map(m => m.groupId);
    const result: Group[] = [];
    for (const gid of groupIds) {
      const g = db.select().from(groups).where(eq(groups.id, gid)).get();
      if (g) result.push(g);
    }
    return result;
  }

  async getGroupMembers(groupId: number): Promise<(GroupMember & { user: User })[]> {
    const members = db.select().from(groupMembers).where(eq(groupMembers.groupId, groupId)).all();
    const result: (GroupMember & { user: User })[] = [];
    for (const m of members) {
      const user = db.select().from(users).where(eq(users.id, m.userId)).get();
      if (user) {
        result.push({ ...m, user });
      }
    }
    return result;
  }

  async addGroupMember(groupId: number, userId: number): Promise<GroupMember> {
    return db.insert(groupMembers).values({
      groupId,
      userId,
      joinedAt: new Date().toISOString(),
    }).returning().get();
  }

  async isGroupMember(groupId: number, userId: number): Promise<boolean> {
    const member = db.select().from(groupMembers)
      .where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, userId)))
      .get();
    return !!member;
  }

  // Expenses
  async createExpense(expense: InsertExpense, splits: { userId: number; amount: number }[]): Promise<Expense> {
    const now = new Date().toISOString();
    const newExpense = db.insert(expenses).values({
      ...expense,
      createdAt: now,
    }).returning().get();

    for (const split of splits) {
      db.insert(expenseSplits).values({
        expenseId: newExpense.id,
        userId: split.userId,
        amount: split.amount,
      }).run();
    }

    return newExpense;
  }

  async getExpense(id: number): Promise<Expense | undefined> {
    return db.select().from(expenses).where(eq(expenses.id, id)).get();
  }

  async getGroupExpenses(groupId: number): Promise<(Expense & { paidBy: User; splits: (ExpenseSplit & { user: User })[] })[]> {
    const expenseRows = db.select().from(expenses)
      .where(eq(expenses.groupId, groupId))
      .orderBy(desc(expenses.createdAt))
      .all();

    const result: (Expense & { paidBy: User; splits: (ExpenseSplit & { user: User })[] })[] = [];

    for (const exp of expenseRows) {
      const paidBy = db.select().from(users).where(eq(users.id, exp.paidById)).get();
      if (!paidBy) continue;

      const splitRows = db.select().from(expenseSplits).where(eq(expenseSplits.expenseId, exp.id)).all();
      const splitsWithUser: (ExpenseSplit & { user: User })[] = [];
      
      for (const s of splitRows) {
        const user = db.select().from(users).where(eq(users.id, s.userId)).get();
        if (user) {
          splitsWithUser.push({ ...s, user });
        }
      }

      result.push({ ...exp, paidBy, splits: splitsWithUser });
    }

    return result;
  }

  async deleteExpense(id: number): Promise<void> {
    db.delete(expenseSplits).where(eq(expenseSplits.expenseId, id)).run();
    db.delete(expenses).where(eq(expenses.id, id)).run();
  }

  // Settlements
  async createSettlement(settlement: InsertSettlement): Promise<Settlement> {
    return db.insert(settlements).values({
      ...settlement,
      createdAt: new Date().toISOString(),
    }).returning().get();
  }

  async getGroupSettlements(groupId: number): Promise<(Settlement & { paidBy: User; paidTo: User })[]> {
    const rows = db.select().from(settlements)
      .where(eq(settlements.groupId, groupId))
      .orderBy(desc(settlements.createdAt))
      .all();

    const result: (Settlement & { paidBy: User; paidTo: User })[] = [];
    for (const s of rows) {
      const paidBy = db.select().from(users).where(eq(users.id, s.paidById)).get();
      const paidTo = db.select().from(users).where(eq(users.id, s.paidToId)).get();
      if (paidBy && paidTo) {
        result.push({ ...s, paidBy, paidTo });
      }
    }
    return result;
  }

  // Balances
  async getGroupBalances(groupId: number): Promise<Balance[]> {
    const members = await this.getGroupMembers(groupId);
    const balanceMap: Record<number, number> = {};
    
    for (const m of members) {
      balanceMap[m.userId] = 0;
    }

    // Get all expenses for the group
    const expenseRows = db.select().from(expenses)
      .where(eq(expenses.groupId, groupId)).all();

    for (const exp of expenseRows) {
      // Person who paid gets credit
      if (balanceMap[exp.paidById] !== undefined) {
        balanceMap[exp.paidById] += exp.amount;
      }

      // Each person's split is a debit
      const splitRows = db.select().from(expenseSplits)
        .where(eq(expenseSplits.expenseId, exp.id)).all();
      
      for (const s of splitRows) {
        if (balanceMap[s.userId] !== undefined) {
          balanceMap[s.userId] -= s.amount;
        }
      }
    }

    // Get all settlements
    const settlementRows = db.select().from(settlements)
      .where(eq(settlements.groupId, groupId)).all();

    for (const s of settlementRows) {
      if (balanceMap[s.paidById] !== undefined) {
        balanceMap[s.paidById] += s.amount;
      }
      if (balanceMap[s.paidToId] !== undefined) {
        balanceMap[s.paidToId] -= s.amount;
      }
    }

    return members.map(m => ({
      userId: m.userId,
      displayName: m.user.displayName,
      avatarColor: m.user.avatarColor,
      amount: Math.round(balanceMap[m.userId] * 100) / 100,
    }));
  }

  async getSimplifiedDebts(groupId: number): Promise<SimplifiedDebt[]> {
    const balances = await this.getGroupBalances(groupId);
    
    // Separate into debtors (negative balance = owes) and creditors (positive balance = owed)
    const debtors: { userId: number; displayName: string; avatarColor: string; amount: number }[] = [];
    const creditors: { userId: number; displayName: string; avatarColor: string; amount: number }[] = [];

    for (const b of balances) {
      if (b.amount < -0.01) {
        debtors.push({ ...b, amount: Math.abs(b.amount) });
      } else if (b.amount > 0.01) {
        creditors.push({ ...b, amount: b.amount });
      }
    }

    // Sort both by amount descending for greedy simplification
    debtors.sort((a, b) => b.amount - a.amount);
    creditors.sort((a, b) => b.amount - a.amount);

    const result: SimplifiedDebt[] = [];
    let i = 0, j = 0;

    while (i < debtors.length && j < creditors.length) {
      const debt = Math.min(debtors[i].amount, creditors[j].amount);
      if (debt > 0.01) {
        result.push({
          fromUserId: debtors[i].userId,
          fromUserName: debtors[i].displayName,
          fromAvatarColor: debtors[i].avatarColor,
          toUserId: creditors[j].userId,
          toUserName: creditors[j].displayName,
          toAvatarColor: creditors[j].avatarColor,
          amount: Math.round(debt * 100) / 100,
        });
      }
      debtors[i].amount -= debt;
      creditors[j].amount -= debt;
      if (debtors[i].amount < 0.01) i++;
      if (creditors[j].amount < 0.01) j++;
    }

    return result;
  }

  async getUserTotalBalance(userId: number): Promise<number> {
    const userGroups = await this.getUserGroups(userId);
    let total = 0;

    for (const g of userGroups) {
      const balances = await this.getGroupBalances(g.id);
      const userBalance = balances.find(b => b.userId === userId);
      if (userBalance) {
        total += userBalance.amount;
      }
    }

    return Math.round(total * 100) / 100;
  }

  // Activity
  async getGroupActivity(groupId: number): Promise<Activity[]> {
    const group = await this.getGroup(groupId);
    if (!group) return [];

    const activities: Activity[] = [];

    const expenseRows = db.select().from(expenses)
      .where(eq(expenses.groupId, groupId))
      .orderBy(desc(expenses.createdAt))
      .all();

    for (const exp of expenseRows) {
      const user = db.select().from(users).where(eq(users.id, exp.paidById)).get();
      if (user) {
        activities.push({
          id: exp.id,
          type: "expense",
          description: exp.description,
          amount: exp.amount,
          createdAt: exp.createdAt,
          user: { id: user.id, displayName: user.displayName, avatarColor: user.avatarColor },
          groupName: group.name,
          groupId: group.id,
          details: `paid $${exp.amount.toFixed(2)} for ${exp.description}`,
        });
      }
    }

    const settlementRows = db.select().from(settlements)
      .where(eq(settlements.groupId, groupId))
      .orderBy(desc(settlements.createdAt))
      .all();

    for (const s of settlementRows) {
      const paidBy = db.select().from(users).where(eq(users.id, s.paidById)).get();
      const paidTo = db.select().from(users).where(eq(users.id, s.paidToId)).get();
      if (paidBy && paidTo) {
        activities.push({
          id: s.id + 100000,
          type: "settlement",
          description: `${paidBy.displayName} paid ${paidTo.displayName}`,
          amount: s.amount,
          createdAt: s.createdAt,
          user: { id: paidBy.id, displayName: paidBy.displayName, avatarColor: paidBy.avatarColor },
          groupName: group.name,
          groupId: group.id,
          details: `settled $${s.amount.toFixed(2)}`,
        });
      }
    }

    activities.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return activities;
  }

  async getUserActivity(userId: number): Promise<Activity[]> {
    const userGroups = await this.getUserGroups(userId);
    const allActivities: Activity[] = [];

    for (const g of userGroups) {
      const activities = await this.getGroupActivity(g.id);
      allActivities.push(...activities);
    }

    allActivities.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return allActivities.slice(0, 50);
  }
}

export const storage = new DatabaseStorage();
