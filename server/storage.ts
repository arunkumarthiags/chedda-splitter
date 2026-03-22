import {
  type User, type InsertUser, users,
  type Group, type InsertGroup, groups,
  type GroupMember, groupMembers,
  type Expense, type InsertExpense, expenses,
  type ExpenseSplit, expenseSplits,
  type Settlement, type InsertSettlement, settlements,
  type AuditLog, auditLogs,
  type Balance, type SimplifiedDebt, type Activity,
} from "@shared/schema";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { eq, and, desc } from "drizzle-orm";
import crypto from "crypto";

const client = postgres(process.env.DATABASE_URL!);
export const db = drizzle(client);

const AVATAR_COLORS = [
  "#1B9C85", "#E8AA42", "#4A6FA5", "#D35D6E", "#6C5B7B",
  "#45B7D1", "#F38181", "#AA96DA", "#FCBAD3", "#A8D8EA",
];

function generateInviteCode(): string {
  return crypto.randomBytes(6).toString("hex").toUpperCase();
}

function getRandomColor(): string {
  return AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)];
}

export interface IStorage {
  // Users
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserByAuthId(authId: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: InsertUser & { authId?: string }): Promise<User>;

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
  deleteExpense(id: number, userId: number): Promise<void>;

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

  // Audit Logs
  createAuditLog(groupId: number, userId: number, action: string, details: string): Promise<void>;
  getGroupAuditLogs(groupId: number): Promise<(AuditLog & { user: { id: number; displayName: string; avatarColor: string } })[]>;
}

export class DatabaseStorage implements IStorage {
  // Users
  async getUser(id: number): Promise<User | undefined> {
    const rows = await db.select().from(users).where(eq(users.id, id));
    return rows[0];
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const rows = await db.select().from(users).where(eq(users.username, username));
    return rows[0];
  }

  async getUserByAuthId(authId: string): Promise<User | undefined> {
    const rows = await db.select().from(users).where(eq(users.authId, authId));
    return rows[0];
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const rows = await db.select().from(users).where(eq(users.email, email));
    return rows[0];
  }

  async createUser(insertUser: InsertUser & { authId?: string }): Promise<User> {
    const rows = await db.insert(users).values({
      ...insertUser,
      avatarColor: getRandomColor(),
    }).returning();
    return rows[0];
  }

  // Groups
  async createGroup(group: InsertGroup, userId: number): Promise<Group> {
    const now = new Date().toISOString();
    const newGroupRows = await db.insert(groups).values({
      ...group,
      createdBy: userId,
      createdAt: now,
      inviteCode: generateInviteCode(),
    }).returning();
    const newGroup = newGroupRows[0];

    // Add creator as member
    await db.insert(groupMembers).values({
      groupId: newGroup.id,
      userId: userId,
      joinedAt: now,
    });

    // Audit log
    const userRows = await db.select().from(users).where(eq(users.id, userId));
    const actorName = userRows[0]?.displayName ?? "Someone";
    await this.createAuditLog(newGroup.id, userId, "group_created", `${actorName} created group "${newGroup.name}"`);

    return newGroup;
  }

  async getGroup(id: number): Promise<Group | undefined> {
    const rows = await db.select().from(groups).where(eq(groups.id, id));
    return rows[0];
  }

  async getGroupByInviteCode(code: string): Promise<Group | undefined> {
    const rows = await db.select().from(groups).where(eq(groups.inviteCode, code));
    return rows[0];
  }

  async getUserGroups(userId: number): Promise<Group[]> {
    const memberRows = await db.select().from(groupMembers).where(eq(groupMembers.userId, userId));
    if (memberRows.length === 0) return [];

    const groupIds = memberRows.map(m => m.groupId);
    const result: Group[] = [];
    for (const gid of groupIds) {
      const rows = await db.select().from(groups).where(eq(groups.id, gid));
      if (rows[0]) result.push(rows[0]);
    }
    return result;
  }

  async getGroupMembers(groupId: number): Promise<(GroupMember & { user: User })[]> {
    const members = await db.select().from(groupMembers).where(eq(groupMembers.groupId, groupId));
    const result: (GroupMember & { user: User })[] = [];
    for (const m of members) {
      const userRows = await db.select().from(users).where(eq(users.id, m.userId));
      if (userRows[0]) {
        result.push({ ...m, user: userRows[0] });
      }
    }
    return result;
  }

  async addGroupMember(groupId: number, userId: number): Promise<GroupMember> {
    const rows = await db.insert(groupMembers).values({
      groupId,
      userId,
      joinedAt: new Date().toISOString(),
    }).returning();

    // Audit log
    const userRows = await db.select().from(users).where(eq(users.id, userId));
    const actorName = userRows[0]?.displayName ?? "Someone";
    await this.createAuditLog(groupId, userId, "member_joined", `${actorName} joined the group`);

    return rows[0];
  }

  async isGroupMember(groupId: number, userId: number): Promise<boolean> {
    const rows = await db.select().from(groupMembers)
      .where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, userId)));
    return rows.length > 0;
  }

  // Expenses
  async createExpense(expense: InsertExpense, splits: { userId: number; amount: number }[]): Promise<Expense> {
    const now = new Date().toISOString();
    const expenseRows = await db.insert(expenses).values({
      ...expense,
      createdAt: now,
    }).returning();
    const newExpense = expenseRows[0];

    for (const split of splits) {
      await db.insert(expenseSplits).values({
        expenseId: newExpense.id,
        userId: split.userId,
        amount: String(split.amount),
      });
    }

    // Audit log
    const userRows = await db.select().from(users).where(eq(users.id, newExpense.paidById));
    const actorName = userRows[0]?.displayName ?? "Someone";
    const amt = parseFloat(newExpense.amount as string).toFixed(2);
    await this.createAuditLog(newExpense.groupId, newExpense.paidById, "expense_created", `${actorName} added "${newExpense.description}" ($${amt})`);

    return newExpense;
  }

  async getExpense(id: number): Promise<Expense | undefined> {
    const rows = await db.select().from(expenses).where(eq(expenses.id, id));
    return rows[0];
  }

  async getGroupExpenses(groupId: number): Promise<(Expense & { paidBy: User; splits: (ExpenseSplit & { user: User })[] })[]> {
    const expenseRows = await db.select().from(expenses)
      .where(eq(expenses.groupId, groupId))
      .orderBy(desc(expenses.createdAt));

    const result: (Expense & { paidBy: User; splits: (ExpenseSplit & { user: User })[] })[] = [];

    for (const exp of expenseRows) {
      const paidByRows = await db.select().from(users).where(eq(users.id, exp.paidById));
      if (!paidByRows[0]) continue;

      const splitRows = await db.select().from(expenseSplits).where(eq(expenseSplits.expenseId, exp.id));
      const splitsWithUser: (ExpenseSplit & { user: User })[] = [];

      for (const s of splitRows) {
        const userRows = await db.select().from(users).where(eq(users.id, s.userId));
        if (userRows[0]) {
          splitsWithUser.push({ ...s, user: userRows[0] });
        }
      }

      result.push({ ...exp, paidBy: paidByRows[0], splits: splitsWithUser });
    }

    return result;
  }

  async deleteExpense(id: number, userId: number): Promise<void> {
    const expRows = await db.select().from(expenses).where(eq(expenses.id, id));
    const exp = expRows[0];

    await db.delete(expenseSplits).where(eq(expenseSplits.expenseId, id));
    await db.delete(expenses).where(eq(expenses.id, id));

    // Audit log (fire-and-forget if expense already missing)
    if (exp) {
      const userRows = await db.select().from(users).where(eq(users.id, userId));
      const actorName = userRows[0]?.displayName ?? "Someone";
      const amt = parseFloat(exp.amount as string).toFixed(2);
      await this.createAuditLog(exp.groupId, userId, "expense_deleted", `${actorName} deleted "${exp.description}" ($${amt})`);
    }
  }

  // Settlements
  async createSettlement(settlement: InsertSettlement): Promise<Settlement> {
    const rows = await db.insert(settlements).values({
      ...settlement,
      createdAt: new Date().toISOString(),
    }).returning();
    const newSettlement = rows[0];

    // Audit log
    const paidByRows = await db.select().from(users).where(eq(users.id, newSettlement.paidById));
    const paidToRows = await db.select().from(users).where(eq(users.id, newSettlement.paidToId));
    const paidByName = paidByRows[0]?.displayName ?? "Someone";
    const paidToName = paidToRows[0]?.displayName ?? "someone";
    const amt = parseFloat(newSettlement.amount as string).toFixed(2);
    await this.createAuditLog(newSettlement.groupId, newSettlement.paidById, "settlement_created", `${paidByName} paid $${amt} to ${paidToName}`);

    return newSettlement;
  }

  async getGroupSettlements(groupId: number): Promise<(Settlement & { paidBy: User; paidTo: User })[]> {
    const rows = await db.select().from(settlements)
      .where(eq(settlements.groupId, groupId))
      .orderBy(desc(settlements.createdAt));

    const result: (Settlement & { paidBy: User; paidTo: User })[] = [];
    for (const s of rows) {
      const paidByRows = await db.select().from(users).where(eq(users.id, s.paidById));
      const paidToRows = await db.select().from(users).where(eq(users.id, s.paidToId));
      if (paidByRows[0] && paidToRows[0]) {
        result.push({ ...s, paidBy: paidByRows[0], paidTo: paidToRows[0] });
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
    const expenseRows = await db.select().from(expenses)
      .where(eq(expenses.groupId, groupId));

    for (const exp of expenseRows) {
      const expAmount = parseFloat(exp.amount as string);
      // Person who paid gets credit
      if (balanceMap[exp.paidById] !== undefined) {
        balanceMap[exp.paidById] += expAmount;
      }

      // Each person's split is a debit
      const splitRows = await db.select().from(expenseSplits)
        .where(eq(expenseSplits.expenseId, exp.id));

      for (const s of splitRows) {
        if (balanceMap[s.userId] !== undefined) {
          balanceMap[s.userId] -= parseFloat(s.amount as string);
        }
      }
    }

    // Get all settlements
    const settlementRows = await db.select().from(settlements)
      .where(eq(settlements.groupId, groupId));

    for (const s of settlementRows) {
      const sAmount = parseFloat(s.amount as string);
      if (balanceMap[s.paidById] !== undefined) {
        balanceMap[s.paidById] += sAmount;
      }
      if (balanceMap[s.paidToId] !== undefined) {
        balanceMap[s.paidToId] -= sAmount;
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

    const expenseRows = await db.select().from(expenses)
      .where(eq(expenses.groupId, groupId))
      .orderBy(desc(expenses.createdAt));

    for (const exp of expenseRows) {
      const userRows = await db.select().from(users).where(eq(users.id, exp.paidById));
      if (userRows[0]) {
        const expAmount = parseFloat(exp.amount as string);
        activities.push({
          id: exp.id,
          type: "expense",
          description: exp.description,
          amount: expAmount,
          createdAt: exp.createdAt,
          user: { id: userRows[0].id, displayName: userRows[0].displayName, avatarColor: userRows[0].avatarColor },
          groupName: group.name,
          groupId: group.id,
          details: `paid $${expAmount.toFixed(2)} for ${exp.description}`,
        });
      }
    }

    const settlementRows = await db.select().from(settlements)
      .where(eq(settlements.groupId, groupId))
      .orderBy(desc(settlements.createdAt));

    for (const s of settlementRows) {
      const paidByRows = await db.select().from(users).where(eq(users.id, s.paidById));
      const paidToRows = await db.select().from(users).where(eq(users.id, s.paidToId));
      if (paidByRows[0] && paidToRows[0]) {
        const sAmount = parseFloat(s.amount as string);
        activities.push({
          id: s.id + 100000,
          type: "settlement",
          description: `${paidByRows[0].displayName} paid ${paidToRows[0].displayName}`,
          amount: sAmount,
          createdAt: s.createdAt,
          user: { id: paidByRows[0].id, displayName: paidByRows[0].displayName, avatarColor: paidByRows[0].avatarColor },
          groupName: group.name,
          groupId: group.id,
          details: `settled $${sAmount.toFixed(2)}`,
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

  // Audit Logs
  async createAuditLog(groupId: number, userId: number, action: string, details: string): Promise<void> {
    await db.insert(auditLogs).values({
      groupId,
      userId,
      action,
      details,
      createdAt: new Date().toISOString(),
    });
  }

  async getGroupAuditLogs(groupId: number): Promise<(AuditLog & { user: { id: number; displayName: string; avatarColor: string } })[]> {
    const rows = await db.select().from(auditLogs)
      .where(eq(auditLogs.groupId, groupId))
      .orderBy(desc(auditLogs.createdAt));

    const result: (AuditLog & { user: { id: number; displayName: string; avatarColor: string } })[] = [];
    for (const row of rows) {
      const userRows = await db.select().from(users).where(eq(users.id, row.userId));
      if (userRows[0]) {
        result.push({
          ...row,
          user: { id: userRows[0].id, displayName: userRows[0].displayName, avatarColor: userRows[0].avatarColor },
        });
      }
    }
    return result;
  }
}

export const storage = new DatabaseStorage();
