import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Users
export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
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
export const groups = sqliteTable("groups", {
  id: integer("id").primaryKey({ autoIncrement: true }),
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
export const groupMembers = sqliteTable("group_members", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  groupId: integer("group_id").notNull().references(() => groups.id),
  userId: integer("user_id").notNull().references(() => users.id),
  joinedAt: text("joined_at").notNull().default(""),
});

export type GroupMember = typeof groupMembers.$inferSelect;

// Expenses
export const expenses = sqliteTable("expenses", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  groupId: integer("group_id").notNull().references(() => groups.id),
  description: text("description").notNull(),
  amount: real("amount").notNull(),
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
export const expenseSplits = sqliteTable("expense_splits", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  expenseId: integer("expense_id").notNull().references(() => expenses.id),
  userId: integer("user_id").notNull().references(() => users.id),
  amount: real("amount").notNull(), // how much this user owes for this expense
});

export type ExpenseSplit = typeof expenseSplits.$inferSelect;

// Settlements (recording payments between users)
export const settlements = sqliteTable("settlements", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  groupId: integer("group_id").notNull().references(() => groups.id),
  paidById: integer("paid_by_id").notNull().references(() => users.id),
  paidToId: integer("paid_to_id").notNull().references(() => users.id),
  amount: real("amount").notNull(),
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
