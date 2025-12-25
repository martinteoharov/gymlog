# GymLog

A mobile-friendly app to track your gym progress.

## Design

**Color Scheme:** Black background with yellow (#E2F163) accents
- Background: #1C1C1E (dark gray/black)
- Cards: #2C2C2E (slightly lighter)
- Primary accent: #E2F163 (yellow/lime)
- Text: #FFFFFF (white)
- Secondary text: #8E8E93 (gray)

## Navigation

Bottom navbar with 4 tabs:
1. **Home** (house icon)
2. **Workouts** (play icon)
3. **Statistics** (chart icon)
4. **Account** (person icon)

Active tab highlighted with yellow background.

---

## Screens

### 1. Home Screen

```
┌─────────────────────────┐
│  ≡  GymLog          🔔  │
├─────────────────────────┤
│                         │
│  3 to go!               │
│                         │
│  ┌───┬───┬───┬───┬───┐  │
│  │Mon│Tue│Wed│Thu│Fri│  │  ← Horizontal scrollable
│  │ 9 │10•│11 │12 │13 │  │    7-day calendar
│  └───┴───┴───┴───┴───┘  │
│                         │
│  Today's Workout        │
│  ┌───────────────────┐  │
│  │ Push Day    [▶]   │  │
│  │ Bench, OHP, Dips  │  │
│  └───────────────────┘  │
│                         │
│  Stats                  │
│  ┌─────────┬─────────┐  │
│  │ Total   │ This    │  │
│  │ 47      │ Week    │  │
│  │workouts │ 3       │  │
│  └─────────┴─────────┘  │
│                         │
│  Recent Workouts        │
│  ┌───────────────────┐  │
│  │ Mon 9 - Push Day  │  │
│  │ Sun 8 - Pull Day  │  │
│  │ Sat 7 - Legs      │  │
│  └───────────────────┘  │
│                         │
├─────────────────────────┤
│ [🏠] [▶] [📊] [👤]     │
└─────────────────────────┘
```

**Tasks:**
- [ ] Horizontal scrollable 7-day calendar component
- [ ] Today's scheduled workout card with quick start
- [ ] Global stats cards (total workouts, workouts this week)
- [ ] Recent workouts list

---

### 2. Workouts Screen

```
┌─────────────────────────┐
│  ≡  Workouts        🔔  │
├─────────────────────────┤
│                         │
│  Today's Workout        │
│  ┌───────────────────┐  │
│  │ ★ Push Day   [▶]  │  │  ← Highlighted (scheduled)
│  │ Bench, OHP, Dips  │  │
│  │ 45 min            │  │
│  └───────────────────┘  │
│                         │
│  My Templates           │
│  ┌───────────────────┐  │
│  │ Pull Day          │  │
│  │ Rows, Pullups...  │  │
│  │ Tue, Fri          │  │
│  └───────────────────┘  │
│  ┌───────────────────┐  │
│  │ Leg Day           │  │
│  │ Squat, Lunges...  │  │
│  │ Sat               │  │
│  └───────────────────┘  │
│                         │
│  [+ Create Template]    │
│                         │
├─────────────────────────┤
│ [🏠] [▶] [📊] [👤]     │
└─────────────────────────┘
```

**Tasks:**
- [ ] Workout template cards
- [ ] Highlight today's scheduled workout (yellow border/accent)
- [ ] Show assigned days on each template
- [ ] Create new template button
- [ ] Template detail/edit screen
- [ ] Exercise picker for templates
- [ ] Weekly schedule assignment UI

---

### 3. Statistics Screen

```
┌─────────────────────────┐
│  ≡  Statistics      🔔  │
├─────────────────────────┤
│                         │
│  ┌─────────┬─────────┐  │
│  │December │ Week 1  │  │  ← Dropdowns
│  └─────────┴─────────┘  │
│                         │
│  Consistency            │
│  ┌───────────────────┐  │
│  │ ▁▃▅▇▅▃▁▃▅▇▅▃     │  │  ← Workouts per week
│  │ 4 workouts/week   │  │
│  └───────────────────┘  │
│                         │
│  Exercise Progress      │
│  ┌───────────────────┐  │
│  │ Bench Press   ↗   │  │
│  │ 60kg → 80kg       │  │
│  │ ▁▂▃▄▅▆▇          │  │
│  └───────────────────┘  │
│  ┌───────────────────┐  │
│  │ Squat         ↗   │  │
│  │ 80kg → 100kg      │  │
│  │ ▁▂▃▄▅▆▇          │  │
│  └───────────────────┘  │
│                         │
├─────────────────────────┤
│ [🏠] [▶] [📊] [👤]     │
└─────────────────────────┘
```

**Tasks:**
- [ ] Month/week filter dropdowns
- [ ] Weekly consistency chart (workouts per week over time)
- [ ] Exercise progress cards with mini charts
- [ ] Weight progression tracking per exercise

---

### 4. Account Screen

**Tasks:**
- [ ] User profile display
- [ ] Login/logout functionality
- [ ] Settings (units: kg/lbs)

---

### 5. Active Workout Screen

```
┌─────────────────────────┐
│  ← Push Day        Done │
├─────────────────────────┤
│                         │
│  Bench Press            │
│  Last: 80kg × 8,8,7     │
│  ┌───────────────────┐  │
│  │ Set 1: 80kg × 8 ✓ │  │
│  │ Set 2: 80kg × 8 ✓ │  │
│  │ Set 3: [  ] × [ ] │  │
│  │ [+ Add Set]       │  │
│  └───────────────────┘  │
│                         │
│  Overhead Press         │
│  Last: 40kg × 10,10,8   │
│  ┌───────────────────┐  │
│  │ Set 1: [ ] × [ ]  │  │
│  └───────────────────┘  │
│                         │
│  [+ Add Exercise]       │
│                         │
└─────────────────────────┘
```

**Tasks:**
- [ ] Active workout view with exercise list
- [ ] Set logging (weight × reps)
- [ ] Show last workout values for reference
- [ ] Add set / add exercise buttons
- [ ] Complete workout and save

---

## Data Features

### Exercise Library
- [ ] Pre-populated exercise database
- [ ] Categorized by muscle group (chest, back, legs, shoulders, arms, core)
- [ ] Search/filter functionality

### Progressive Overload
- [ ] Auto-suggest next weight based on pattern (e.g., +2.5kg)
- [ ] Configurable increment per exercise

### Authentication
- [ ] Email/password login
- [ ] Persist user data across devices
