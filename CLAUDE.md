# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

GymLog (OpenRep) is a mobile-friendly gym tracking app with offline-first architecture. Monorepo with three apps:
- **apps/api** - Bun + Hono REST API with SQLite database
- **apps/mobile** - SvelteKit + Capacitor mobile app with Dexie (IndexedDB) for offline storage
- **apps/website** - Marketing website

## Commands

### Development
```bash
bun run dev              # Run both API and mobile concurrently
bun run dev:api          # API only (localhost:3000)
bun run dev:mobile       # Mobile only (localhost:5173)
```

### Mobile/Capacitor
```bash
cd apps/mobile
bun run build            # Build for production
bun run check            # TypeScript/Svelte type checking
bun run mobile:ios       # Build + sync + open Xcode
bun run mobile:android   # Build + sync + open Android Studio
bun run cap:sync         # Sync web build to native projects
```

### API
```bash
cd apps/api
bun run dev              # Watch mode
bun run start            # Production
```

## Architecture

### Offline-First Pattern
The mobile app uses Dexie (IndexedDB wrapper) as the primary data store. Changes are queued in an `outbox` table and synced to the server when online. Key files:
- `apps/mobile/src/lib/db/index.ts` - Dexie schema and local database
- `apps/mobile/src/lib/stores/sync.ts` - Sync logic with exponential backoff retry

Local records use negative IDs (`generateLocalId()`) until synced to server.

### Data Flow
1. User actions write to Dexie + queue change in outbox
2. Sync store processes outbox when online
3. Server responds with canonical IDs, local IDs are remapped

### Database Schema
SQLite (API) and Dexie (mobile) share the same structure:
- `users`, `sessions` - Authentication
- `programmes` - Groups of workout templates
- `templates` - Workout definitions (e.g., "Push Day")
- `template_exercises` - Exercises in a template with `sets_data` JSON
- `schedule` - Which template runs on which day (0-6, Sunday=0)
- `workouts` - Completed workout sessions
- `sets` - Individual set logs (weight, reps)
- `exercises` - Exercise library

### Key Patterns
- Weights stored in kg internally, converted for display based on user preference
- `sets_data` is JSON: `[{"reps":10,"weight":20}, ...]`
- Templates belong to programmes; users can switch active programme
- Schedule uses client's day of week (handled on frontend)

## Design System

- Background: #1C1C1E (dark)
- Cards: #2C2C2E
- Primary accent: #E2F163 (yellow/lime)
- Text: #FFFFFF, Secondary: #8E8E93
