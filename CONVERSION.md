# GymLog: HTMX → SvelteKit + Dexie Conversion

## Progress Tracker

### Phase 1: Project Structure
- [x] Create monorepo structure with apps/api and apps/mobile
- [x] Set up SvelteKit project with static adapter
- [ ] Configure Capacitor for mobile builds
- [x] Move existing Hono code to apps/api

### Phase 2: Dexie Database Setup
- [x] Create Dexie schema matching SQLite tables
- [x] Set up sync outbox table
- [x] Create database initialization

### Phase 3: Sync Infrastructure
- [x] Create sync store with outbox pattern
- [x] Add push endpoint to Hono API
- [x] Add pull endpoint to Hono API
- [ ] Add updatedAt to all tables

### Phase 4: Convert Hono Routes to JSON
- [x] POST /api/auth/register
- [x] POST /api/auth/login
- [x] POST /api/auth/logout
- [x] GET /api/exercises
- [x] POST /api/templates
- [x] PUT /api/templates/:id
- [x] DELETE /api/templates/:id
- [x] POST /api/workouts
- [x] POST /api/workouts/:id/complete
- [x] GET /api/templates (new - list all)
- [x] GET /api/templates/:id (new - get one)
- [x] GET /api/schedule (new)
- [x] GET /api/workouts (new - history)

### Phase 5: Svelte Components
- [x] Layout (app shell, navbar)
- [x] lib/components/CalendarStrip.svelte
- [x] lib/components/StatCard.svelte
- [x] lib/components/EmptyState.svelte
- [x] lib/components/ExerciseModal.svelte
- [x] lib/components/PageHeader.svelte
- [x] lib/components/RestTimePicker.svelte
- [x] lib/components/DayToggle.svelte
- [x] lib/components/WorkoutCard.svelte

### Phase 6: Svelte Pages
- [x] routes/+layout.svelte (app shell)
- [x] routes/+page.svelte (home)
- [x] routes/workouts/+page.svelte
- [x] routes/workouts/new/+page.svelte
- [x] routes/workouts/[id]/+page.svelte
- [x] routes/workouts/[id]/active/+page.svelte
- [x] routes/stats/+page.svelte
- [x] routes/account/+page.svelte
- [x] routes/login/+page.svelte

### Phase 7: Client-Side Features
- [x] Active workout with localStorage → Dexie
- [x] Rest timer with audio notification
- [x] Exercise search/filter
- [ ] Drag-and-drop reordering (deferred - can add later)
- [x] Progressive overload calculations

### Phase 8: Final Setup
- [x] Capacitor iOS configuration
- [x] Capacitor Android configuration
- [x] Build scripts
- [x] Build verification (both API and mobile compile successfully)

---

## Notes

### Files to Keep (apps/api)
- src/db.ts (SQLite setup)
- src/index.ts (modified for JSON responses)

### Files to Create (apps/mobile)
- SvelteKit project with all converted components

### CSS
- Move public/styles.css to apps/mobile/static/styles.css
- No modifications needed - exact preservation

---

## How to Run

### Development

```bash
# Start API server (from root)
bun run dev:api

# Start mobile dev server (in another terminal)
bun run dev:mobile

# Or run both concurrently
bun run dev
```

### Building for Production

```bash
# Build mobile app
cd apps/mobile && bun run build

# The built files are in apps/mobile/build/
```

### Mobile (Capacitor)

```bash
cd apps/mobile

# Add platforms (first time only)
bun run cap:add:ios
bun run cap:add:android

# Build and open in Xcode/Android Studio
bun run mobile:ios
bun run mobile:android
```

### Environment

Set `VITE_API_BASE` in `.env` to point to your API server:
```
VITE_API_BASE=https://your-api.example.com
```

---

## Architecture

```
gymlog/
├── apps/
│   ├── api/                    # Hono API (JSON endpoints)
│   │   ├── src/
│   │   │   ├── index.ts        # All routes
│   │   │   ├── db.ts           # SQLite setup
│   │   │   └── eta.ts          # (legacy, can remove)
│   │   └── package.json
│   │
│   └── mobile/                 # SvelteKit + Dexie
│       ├── src/
│       │   ├── lib/
│       │   │   ├── api/        # API client
│       │   │   ├── components/ # Svelte components
│       │   │   ├── db/         # Dexie setup
│       │   │   └── stores/     # Auth & sync stores
│       │   └── routes/         # SvelteKit pages
│       ├── static/styles.css   # Original CSS preserved
│       └── capacitor.config.ts
└── package.json                # Root workspace
```
