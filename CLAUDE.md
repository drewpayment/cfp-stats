# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

CFP Committee Metrics Dashboard - A Next.js 16 full-stack application that displays college football rankings with advanced performance metrics. Uses Turso (SQLite-compatible) for data storage and the College Football Data (CFBD) API for data sourcing.

## Commands

**Use Bun for all package management and builds (not npm/yarn).**

```bash
# Development
bun dev          # Start dev server at http://localhost:3000
bun run build    # Production build
bun start        # Start production server
bun run lint     # Run ESLint
bun add <pkg>    # Install packages

# Database scripts
bun scripts/setup-db.js   # Initialize database schema
bun scripts/reset-db.js   # Drop all tables
bun scripts/sync-data.js  # Sync data from CFBD API
bun scripts/test-db.js    # Test database connection
```

## Architecture

**Stack:** Next.js 16 (App Router) + React 19 + TypeScript + Turso (SQLite) + Tailwind CSS 4

**Key Files:**
- `src/app/page.tsx` - Server component, fetches rankings data with `force-dynamic`
- `src/components/RankingDashboard.tsx` - Main client component (~2400 lines), handles all UI state
- `src/lib/metrics.ts` - `getRankings()` - queries database, calculates 12 performance metrics per team, computes percentiles
- `src/lib/sync.ts` - `syncData()` - fetches external CFBD API, upserts to database

**Data Flow:**
1. Page loads → `getRankings()` queries rankings/teams/stats → calculates metrics & percentiles → passes to client
2. User triggers sync → POST `/api/sync` → `syncData()` fetches CFBD API → upserts to Turso
3. Scheduled sync → GitHub Actions (hourly Fri-Mon) → GET `/api/cron/sync` → checks if in-season → `syncData()`

**Database Tables:**
- `teams` - school info, colors, logos, season_stats (JSON)
- `rankings` - poll rankings by season/week (AP, Coaches, CFP Committee)
- `team_season_stats` - season-specific stats separated from teams table
- `games` - game results with advanced stats

## Environment Variables

```
TURSO_DATABASE_URL=file:local.db   # or remote Turso URL
TURSO_AUTH_TOKEN=<token>           # required for remote Turso
NEXT_PUBLIC_CFBD_API_KEY=<key>     # CFBD API key for data sync
CRON_SECRET=<secret>               # secures /api/cron/sync endpoint
```

**GitHub Secrets (for scheduled sync):**
- `SYNC_ENDPOINT_URL` - Production cron endpoint URL
- `CRON_SECRET` - Same value as Vercel env var

## Patterns

- **Path alias:** `@/*` maps to `./src/*`
- **Styling:** Inline style objects with dark slate theme (#0f172a, #1e293b), no component libraries
- **State:** React useState/useMemo in client components, URL search params for poll/year persistence
- **Exports:** Named exports for utility functions
- **Database:** `ON CONFLICT` upserts for idempotent syncs
