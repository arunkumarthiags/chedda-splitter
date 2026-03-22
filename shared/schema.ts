import { pgTable, text, integer, serial, numeric } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Users
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  authId: text("auth_id").unique(),
  username: text("username").notNull().unique(),
  password: text("password").notNull().default(""),
  displayName: text("display_name").notNull(),
  email: text("email"),
  avatarColor: text("avatar_color").notNull().default("#1B9C85"),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
  displayName: true,
  email: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

// Groups
export const groups = pgTable("groups", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  category: text("category").notNull().default("trip"), // trip, home, couple, other
  createdBy: integer("created_by").notNull().references(() => users.id),
  createdAt: text("created_at").notNull().default(""),
  inviteCode: text("invite_code").notNull().unique(),
});

export const insertGroupSchema = createInsertSchema(groups).pick({
  name: true,
  description: true,
  category: true,
});

export type InsertGroup = z.infer<typeof insertGroupSchema>;
export type Group = typeof groups.$inferSelect;

// Group Members
export const groupMembers = pgTable("group_members", {
  id: serial("id").primaryKey(),
  groupId: integer("group_id").notNull().references(() => groups.id),
  userId: integer("user_id").notNull().references(() => users.id),
  joinedAt: text("joined_at").notNull().default(""),
});

export type GroupMember = typeof groupMembers.$inferSelect;

// Expenses
export const expenses = pgTable("expenses", {
  id: serial("id").primaryKey(),
  groupId: integer("group_id").notNull().references(() => groups.id),
  description: text("description").notNull(),
  amount: numeric("amount", { precision: 12, scale: 4 }).notNull(),
  paidById: integer("paid_by_id").notNull().references(() => users.id),
  category: text("category").notNull().default("general"), // food, transport, stay, drinks, activities, shopping, general
  splitType: text("split_type").notNull().default("equal"), // equal, exact, percentage
  createdAt: text("created_at").notNull().default(""),
  notes: text("notes"),
});

export const insertExpenseSchema = createInsertSchema(expenses).pick({
  groupId: true,
  description: true,
  amount: true,
  paidById: true,
  category: true,
  splitType: true,
  notes: true,
});

export type InsertExpense = z.infer<typeof insertExpenseSchema>;
export type Expense = typeof expenses.$inferSelect;

// Expense Splits (who owes what for each expense)
export const expenseSplits = pgTable("expense_splits", {
  id: serial("id").primaryKey(),
  expenseId: integer("expense_id").notNull().references(() => expenses.id),
  userId: integer("user_id").notNull().references(() => users.id),
  amount: numeric("amount", { precision: 12, scale: 4 }).notNull(), // how much this user owes for this expense
});

export type ExpenseSplit = typeof expenseSplits.$inferSelect;

// Settlements (recording payments between users)
export const settlements = pgTable("settlements", {
  id: serial("id").primaryKey(),
  groupId: integer("group_id").notNull().references(() => groups.id),
  paidById: integer("paid_by_id").notNull().references(() => users.id),
  paidToId: integer("paid_to_id").notNull().references(() => users.id),
  amount: numeric("amount", { precision: 12, scale: 4 }).notNull(),
  createdAt: text("created_at").notNull().default(""),
  notes: text("notes"),
});

export const insertSettlementSchema = createInsertSchema(settlements).pick({
  groupId: true,
  paidById: true,
  paidToId: true,
  amount: true,
  notes: true,
});

export type InsertSettlement = z.infer<typeof insertSettlementSchema>;
export type Settlement = typeof settlements.$inferSelect;

// Audit Logs
export const auditLogs = pgTable("audit_logs", {
  id: serial("id").primaryKey(),
  groupId: integer("group_id").notNull().references(() => groups.id),
  userId: integer("user_id").notNull().references(() => users.id),
  action: text("action").notNull(), // expense_created, expense_deleted, settlement_created, group_created, member_joined
  details: text("details").notNull(),
  createdAt: text("created_at").notNull().default(""),
});

export type AuditLog = typeof auditLogs.$inferSelect;

// Activity feed type (virtual, computed from expenses + settlements)
export type Activity = {
  id: number;
  type: "expense" | "settlement";
  description: string;
  amount: number;
  createdAt: string;
  user: { id: number; displayName: string; avatarColor: string };
  groupName: string;
  groupId: number;
  details?: string;
};

// Balance type (computed)
export type Balance = {
  userId: number;
  displayName: string;
  avatarColor: string;
  amount: number; // positive = is owed, negative = owes
};

// Simplified debt (who owes whom)
export type SimplifiedDebt = {
  fromUserId: number;
  fromUserName: string;
  fromAvatarColor: string;
  toUserId: number;
  toUserName: string;
  toAvatarColor: string;
  amount: number;
};
