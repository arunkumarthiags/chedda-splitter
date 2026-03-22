# CheddaSplit

> Split expenses with friends — no spreadsheets, no drama.

CheddaSplit is a full-stack web app for tracking shared expenses across group trips, households, couples, or any shared situation. Add expenses, split them however you like, settle up, and see exactly who owes what.

---

## Features

**Groups**
- Create groups by category: Trip, Home, Couple, or Other
- Invite friends via a short alphanumeric invite code
- Multiple groups, each with their own ledger

**Expenses**
- Add expenses paid by any group member
- Three split modes: **Equal** (auto-split), **Exact** (fixed amounts per person), **Percentage**
- Category tags: Food, Transport, Stay, Drinks, Activities, Shopping, General
- Optional notes per expense

**Balances & Debts**
- Per-group member balances computed on-demand
- Simplified debt algorithm — minimizes the number of payments needed to settle up
- Overall balance summary on the dashboard (how much you're owed or owe across all groups)

**Settlements**
- Record payments between members to clear debts
- Settlements reduce outstanding balances immediately

**Audit Log**
- Every group has an Audit tab showing a timestamped history of all changes: expenses added/deleted, settlements recorded, members joined, and group creation

**Dashboard**
- Recent activity feed across all groups
- Quick overview: total owed to you, total you owe, your groups

**Auth**
- Username + email + password registration
- JWT-based sessions (token stored in localStorage)
- Forgot password / email reset flow
- Sessions persist across page refreshes and deployments (data lives in Supabase)

**UI**
- Dark / light mode toggle
- Responsive layout (works on mobile)
- Skeleton loaders while data fetches

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, Wouter (hash routing), TanStack Query, shadcn/ui, Tailwind CSS |
| Backend | Express 5, Drizzle ORM |
| Database | Supabase Postgres (postgres-js driver) |
| Auth | Supabase Auth (JWT bearer tokens) |
| Build | Vite (client), esbuild (server) |
| Language | TypeScript throughout |

---

## Project Structure

```
chedda-splitter/
├── client/              # React SPA
│   └── src/
│       ├── components/  # Reusable UI components
│       ├── lib/         # Auth context, React Query client
│       └── pages/       # Dashboard, Group, Auth
├── server/
│   ├── routes.ts        # All API endpoints
│   ├── storage.ts       # DB logic (IStorage interface + DatabaseStorage)
│   ├── supabase.ts      # Supabase admin client
│   └── index.ts         # Express app setup
├── shared/
│   └── schema.ts        # Drizzle schema, Zod validators, shared types
└── script/
    └── build.ts         # Vite + esbuild production build
```

---

## Getting Started

### Prerequisites

- Node.js 20+
- A [Supabase](https://supabase.com) project

### 1. Clone and install

```bash
git clone https://github.com/athiagarajan/chedda-splitter.git
cd chedda-splitter
npm install --registry=https://registry.npmjs.org
```

### 2. Create the database tables

In your Supabase project → **SQL Editor**, run:

```sql
CREATE TABLE IF NOT EXISTS public.users (
  id           SERIAL PRIMARY KEY,
  auth_id      UUID UNIQUE,
  username     TEXT NOT NULL UNIQUE,
  password     TEXT NOT NULL DEFAULT '',
  display_name TEXT NOT NULL,
  email        TEXT,
  avatar_color TEXT NOT NULL DEFAULT '#1B9C85'
);
CREATE TABLE IF NOT EXISTS public.groups (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL,
  description TEXT,
  category    TEXT NOT NULL DEFAULT 'trip',
  created_by  INTEGER NOT NULL REFERENCES public.users(id),
  created_at  TEXT NOT NULL DEFAULT '',
  invite_code TEXT NOT NULL UNIQUE
);
CREATE TABLE IF NOT EXISTS public.group_members (
  id        SERIAL PRIMARY KEY,
  group_id  INTEGER NOT NULL REFERENCES public.groups(id),
  user_id   INTEGER NOT NULL REFERENCES public.users(id),
  joined_at TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS public.expenses (
  id          SERIAL PRIMARY KEY,
  group_id    INTEGER NOT NULL REFERENCES public.groups(id),
  description TEXT NOT NULL,
  amount      NUMERIC(12,4) NOT NULL,
  paid_by_id  INTEGER NOT NULL REFERENCES public.users(id),
  category    TEXT NOT NULL DEFAULT 'general',
  split_type  TEXT NOT NULL DEFAULT 'equal',
  created_at  TEXT NOT NULL DEFAULT '',
  notes       TEXT
);
CREATE TABLE IF NOT EXISTS public.expense_splits (
  id         SERIAL PRIMARY KEY,
  expense_id INTEGER NOT NULL REFERENCES public.expenses(id),
  user_id    INTEGER NOT NULL REFERENCES public.users(id),
  amount     NUMERIC(12,4) NOT NULL
);
CREATE TABLE IF NOT EXISTS public.settlements (
  id         SERIAL PRIMARY KEY,
  group_id   INTEGER NOT NULL REFERENCES public.groups(id),
  paid_by_id INTEGER NOT NULL REFERENCES public.users(id),
  paid_to_id INTEGER NOT NULL REFERENCES public.users(id),
  amount     NUMERIC(12,4) NOT NULL,
  created_at TEXT NOT NULL DEFAULT '',
  notes      TEXT
);
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id         SERIAL PRIMARY KEY,
  group_id   INTEGER NOT NULL REFERENCES public.groups(id),
  user_id    INTEGER NOT NULL REFERENCES public.users(id),
  action     TEXT NOT NULL,
  details    TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT ''
);

ALTER TABLE public.users          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.groups         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_members  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expense_splits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settlements    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs     ENABLE ROW LEVEL SECURITY;
```

### 3. Configure Supabase redirect URLs

Supabase dashboard → **Authentication** → **URL Configuration** → add your app's public URL to **Redirect URLs** (required for password reset emails to work).

### 4. Configure environment variables

Copy `.env.example` to `.env` and fill in your values:

```bash
cp .env.example .env
```

```env
# Supabase project URL  (Project Settings → API → Project URL)
SUPABASE_URL=https://xxxxxxxxxxxxxxxxxxxx.supabase.co

# Service role secret key  (Project Settings → API → service_role)
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here

# Postgres Transaction pooler URL  (Supabase → Connect → Transaction pooler)
DATABASE_URL=postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres

# Public URL of your deployed app (used for password reset redirect links)
APP_URL=https://your-app.up.railway.app
```

### 5. Run in development

```bash
npm run dev
```

App runs at `http://localhost:5000`.

---

## Available Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start dev server (Express + Vite HMR on port 5000) |
| `npm run build` | Production build (Vite client → `dist/public/`, esbuild server → `dist/index.cjs`) |
| `npm run start` | Run the production build |
| `npm run check` | TypeScript type check |

---

## API Overview

All routes require `Authorization: Bearer <token>` except auth endpoints.

| Method | Path | Description |
|---|---|---|
| POST | `/api/auth/register` | Create account |
| POST | `/api/auth/login` | Sign in |
| POST | `/api/auth/logout` | Sign out (invalidates token) |
| GET | `/api/auth/me` | Get current user |
| POST | `/api/auth/forgot-password` | Send password reset email |
| POST | `/api/auth/reset-password` | Set new password via reset token |
| GET | `/api/groups` | List user's groups |
| POST | `/api/groups` | Create a group |
| POST | `/api/groups/join` | Join via invite code |
| GET | `/api/groups/:id/members` | Group members |
| GET | `/api/groups/:id/expenses` | Group expenses |
| POST | `/api/groups/:id/expenses` | Add expense |
| DELETE | `/api/expenses/:id` | Delete expense |
| GET | `/api/groups/:id/settlements` | Group settlements |
| POST | `/api/groups/:id/settlements` | Record settlement |
| GET | `/api/groups/:id/balances` | Per-member balances |
| GET | `/api/groups/:id/debts` | Simplified debts |
| GET | `/api/groups/:id/activity` | Group activity feed |
| GET | `/api/groups/:id/audit` | Audit log |
| GET | `/api/activity` | User activity feed |
| GET | `/api/user/balance` | Overall balance |

---

## How Balance Math Works

Balances and debts are computed on-demand (never stored) in `server/storage.ts`.

1. For each group member, start at 0
2. For every expense: **+amount** to the payer, **−split amount** to each participant
3. For every settlement: **+amount** to the payer, **−amount** to the recipient
4. Simplified debts use a greedy algorithm matching the largest debtor to the largest creditor, minimizing total transactions

---

Created with ♥ in San Jose, CA
