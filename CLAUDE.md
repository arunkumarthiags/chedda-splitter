# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev        # Start development server (Express + Vite HMR on port 5000)
npm run build      # Build client (Vite) and server (esbuild) to dist/
npm run start      # Run production build
npm run check      # TypeScript type checking
npm run db:push    # Push schema changes to SQLite database
```

No test framework is configured.

## Architecture

Full-stack TypeScript monorepo with three zones:

- **`client/`** — React 18 SPA using Wouter (hash-based routing), TanStack Query for server state, shadcn/ui components, Tailwind CSS
- **`server/`** — Express 5 REST API with Passport.js session auth, Drizzle ORM over SQLite
- **`shared/schema.ts`** — Single source of truth for database schema (Drizzle), Zod validation schemas, and TypeScript types used by both client and server

### Path aliases
- `@/*` → `client/src/*`
- `@shared/*` → `shared/*`

### Data flow
```
React Query → fetch /api/* → Express routes → storage.ts (DatabaseStorage) → SQLite (data.db)
```

### Key server files
- `server/routes.ts` — All API endpoints; authentication is checked inline per route
- `server/storage.ts` — `IStorage` interface + `DatabaseStorage` class; all DB logic lives here including balance/debt calculations
- `server/index.ts` — App setup; in dev mode injects Vite middleware, in production serves `dist/public/`

### Authentication
Session-based with Express-session (MemoryStore). SHA256 password hashing. `AuthProvider` in `client/src/lib/auth.tsx` fetches `/api/auth/me` on mount to hydrate auth state. Unauthenticated users see `AuthPage`.

### Balance and debt calculations
Computed on-demand in `storage.ts` (not stored). Balance = sum of expense credits/debits + settlement adjustments. Debts are simplified via a greedy algorithm that minimizes transaction count by matching largest debtors to largest creditors.

### Build
`script/build.ts` runs Vite for the client (output: `dist/public/`) then esbuild for the server (output: `dist/index.cjs`). The esbuild step has an explicit allowlist of dependencies to bundle; platform-specific packages like `better-sqlite3` are externalized.

### Expense splits
Three modes: `equal` (divided among selected members), `exact` (fixed amounts), `percentage`. Split amounts are stored in the `expenseSplits` table, one row per participant.
