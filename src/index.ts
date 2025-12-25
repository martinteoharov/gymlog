import { Hono } from "hono";
import { serveStatic } from "hono/bun";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { db } from "./db";

const app = new Hono();

// Session duration: 30 days
const SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000;

// Generate random session ID
function generateSessionId(): string {
  return crypto.randomUUID() + crypto.randomUUID();
}

// Hash password using Bun's built-in
async function hashPassword(password: string): Promise<string> {
  return await Bun.password.hash(password);
}

// Verify password
async function verifyPassword(
  password: string,
  hash: string,
): Promise<boolean> {
  return await Bun.password.verify(password, hash);
}

// Create session for user
function createSession(userId: number): string {
  const sessionId = generateSessionId();
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS).toISOString();

  db.prepare(
    "INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)",
  ).run(sessionId, userId, expiresAt);

  return sessionId;
}

// Get user from session
function getUserFromSession(
  sessionId: string | undefined,
): { id: number; username: string; name: string } | null {
  if (!sessionId) return null;

  const result = db
    .query(
      `
    SELECT u.id, u.username, u.name FROM users u
    JOIN sessions s ON s.user_id = u.id
    WHERE s.id = ? AND s.expires_at > datetime('now')
  `,
    )
    .get(sessionId) as { id: number; username: string; name: string } | null;

  return result;
}

// Clean up expired sessions periodically
db.exec("DELETE FROM sessions WHERE expires_at < datetime('now')");

// Helper to require auth - returns user or throws redirect response
function requireAuth(c: any): { id: number; username: string; name: string } {
  const sessionId = getCookie(c, "session");
  const user = getUserFromSession(sessionId);
  if (!user) {
    throw c.redirect("/login");
  }
  return user;
}

// Helper to require auth for API routes - returns user or error response
function requireAuthApi(
  c: any,
): { id: number; username: string; name: string } | null {
  const sessionId = getCookie(c, "session");
  const user = getUserFromSession(sessionId);
  return user;
}

// Helper to get day of week (0 = Sunday, 1 = Monday, etc.)
function getDayOfWeek(date: Date): number {
  return date.getDay();
}

// Helper to format date
function formatDate(date: Date): string {
  return date.toISOString().split("T")[0];
}

// Types
interface Template {
  id: number;
  user_id: number;
  name: string;
  rest_time: number;
  created_at: string;
}

interface TemplateExercise {
  id: number;
  template_id: number;
  exercise_id: number;
  sort_order: number;
  sets_data: string; // JSON array of {reps, weight}
  increment: number; // Weight increment in kg when all sets completed
  exercise_name?: string;
  muscle_group?: string;
}

interface Exercise {
  id: number;
  name: string;
  muscle_group: string;
}

interface Workout {
  id: number;
  user_id: number;
  template_id: number | null;
  started_at: string;
  completed_at: string | null;
  template_name?: string;
}

interface Schedule {
  id: number;
  user_id: number;
  day_of_week: number;
  template_id: number | null;
  template_name?: string;
}

interface SetRecord {
  id: number;
  workout_id: number;
  exercise_id: number;
  set_number: number;
  weight: number | null;
  reps: number | null;
  completed_at: string;
}

// ============== PAGE ROUTES (Return full page HTML fragments) ==============

// Home Page
app.get("/pages/home", (c) => {
  const user = requireAuthApi(c);
  if (!user) return c.html(`<script>window.location.href='/login';</script>`);

  const today = new Date();
  const dayOfWeek = getDayOfWeek(today);

  // Get scheduled workout for today
  const todaySchedule = db
    .query(
      `
    SELECT s.*, t.name as template_name
    FROM schedule s
    LEFT JOIN templates t ON s.template_id = t.id
    WHERE s.user_id = ? AND s.day_of_week = ?
  `,
    )
    .get(user.id, dayOfWeek) as Schedule | null;

  // Get template exercises if there's a scheduled workout
  let templateExercises: TemplateExercise[] = [];
  if (todaySchedule?.template_id) {
    templateExercises = db
      .query(
        `
      SELECT te.*, e.name as exercise_name
      FROM template_exercises te
      JOIN exercises e ON te.exercise_id = e.id
      WHERE te.template_id = ?
      ORDER BY te.sort_order
    `,
      )
      .all(todaySchedule.template_id) as TemplateExercise[];
  }

  // Get stats
  const totalWorkouts = db
    .query(
      "SELECT COUNT(*) as count FROM workouts WHERE user_id = ? AND completed_at IS NOT NULL",
    )
    .get(user.id) as { count: number };

  const thisWeekWorkouts = db
    .query(
      `
    SELECT COUNT(*) as count FROM workouts
    WHERE user_id = ? AND completed_at IS NOT NULL
    AND date(started_at) >= date('now', '-7 days')
  `,
    )
    .get(user.id) as { count: number };

  // Get recent workouts
  const recentWorkouts = db
    .query(
      `
    SELECT w.*, t.name as template_name
    FROM workouts w
    LEFT JOIN templates t ON w.template_id = t.id
    WHERE w.user_id = ? AND w.completed_at IS NOT NULL
    ORDER BY w.started_at DESC
    LIMIT 5
  `,
    )
    .all(user.id) as Workout[];

  // Generate calendar days (7 days starting from 3 days ago)
  const calendarDays = [];
  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  for (let i = -3; i <= 3; i++) {
    const date = new Date(today);
    date.setDate(today.getDate() + i);
    const isToday = i === 0;

    // Check if there's a scheduled workout for this day
    const schedule = db
      .query(
        `
      SELECT template_id FROM schedule
      WHERE user_id = ? AND day_of_week = ?
    `,
      )
      .get(user.id, getDayOfWeek(date)) as {
      template_id: number | null;
    } | null;

    calendarDays.push({
      dayName: dayNames[getDayOfWeek(date)],
      dayNumber: date.getDate(),
      isToday,
      hasWorkout: schedule?.template_id != null,
    });
  }

  const exerciseList =
    templateExercises.map((e) => e.exercise_name).join(", ") || "No exercises";

  return c.html(`
    <div class="page">
      <!-- Calendar Strip -->
      <div class="calendar-strip">
        ${calendarDays
          .map(
            (day) => `
          <button class="calendar-day ${day.isToday ? "today" : ""} ${day.hasWorkout ? "has-workout" : ""}">
            <span class="calendar-day-name">${day.dayName}</span>
            <span class="calendar-day-number">${day.dayNumber}</span>
          </button>
        `,
          )
          .join("")}
      </div>

      <!-- Today's Workout -->
      <div class="section-subtitle">Today's Workout</div>
      ${
        todaySchedule?.template_id
          ? `
        <div class="workout-card highlighted"
             hx-get="/pages/workouts/${todaySchedule.template_id}/active"
             hx-target="#content"
             hx-swap="innerHTML transition:true">
          <div class="workout-card-info">
            <div class="workout-card-name">${todaySchedule.template_name}</div>
            <div class="workout-card-meta">${exerciseList}</div>
          </div>
          <button class="start-btn">Start</button>
        </div>
      `
          : `
        <div class="card">
          <div class="card-subtitle">No workout scheduled for today</div>
        </div>
      `
      }

      <!-- Stats -->
      <div class="section-subtitle" style="margin-top: 24px;">Stats</div>
      <div class="stats-grid">
        <div class="stat-card">
          <div class="stat-value">${totalWorkouts.count}</div>
          <div class="stat-label">Total Workouts</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${thisWeekWorkouts.count}</div>
          <div class="stat-label">This Week</div>
        </div>
      </div>

      <!-- Recent Workouts -->
      <div class="section-subtitle">Recent Workouts</div>
      ${
        recentWorkouts.length > 0
          ? recentWorkouts
              .map((workout) => {
                const date = new Date(workout.started_at);
                return `
          <div class="recent-workout">
            <div class="recent-workout-date">
              <span class="recent-workout-day">${dayNames[date.getDay()]}</span>
              <span class="recent-workout-num">${date.getDate()}</span>
            </div>
            <div class="recent-workout-info">
              <div class="recent-workout-name">${workout.template_name || "Quick Workout"}</div>
              <div class="recent-workout-meta">Completed</div>
            </div>
          </div>
        `;
              })
              .join("")
          : `
        <div class="empty-state">
          <div class="empty-state-text">No workouts yet. Start your first one!</div>
        </div>
      `
      }
    </div>
  `);
});

// Workouts Page (Templates List)
app.get("/pages/workouts", (c) => {
  const user = requireAuthApi(c);
  if (!user) return c.html(`<script>window.location.href='/login';</script>`);

  const today = new Date();
  const dayOfWeek = getDayOfWeek(today);
  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  // Get full week schedule
  const weekSchedule = db
    .query(
      `
    SELECT s.day_of_week, s.template_id, t.name as template_name
    FROM schedule s
    LEFT JOIN templates t ON s.template_id = t.id
    WHERE s.user_id = ?
    ORDER BY s.day_of_week
  `,
    )
    .all(user.id) as {
    day_of_week: number;
    template_id: number | null;
    template_name: string | null;
  }[];

  // Create a map for easy lookup
  const scheduleMap = new Map<
    number,
    { template_id: number | null; template_name: string | null }
  >();
  weekSchedule.forEach((s) =>
    scheduleMap.set(s.day_of_week, {
      template_id: s.template_id,
      template_name: s.template_name,
    }),
  );

  // Get today's scheduled template
  const todaySchedule = scheduleMap.get(dayOfWeek) || null;

  // Get all templates with their exercises and schedule
  const templates = db
    .query(
      `
    SELECT * FROM templates WHERE user_id = ? ORDER BY name
  `,
    )
    .all(user.id) as Template[];

  const templatesWithDetails = templates.map((template) => {
    const exercises = db
      .query(
        `
      SELECT e.name FROM template_exercises te
      JOIN exercises e ON te.exercise_id = e.id
      WHERE te.template_id = ?
      ORDER BY te.sort_order
      LIMIT 3
    `,
      )
      .all(template.id) as { name: string }[];

    const scheduledDays = db
      .query(
        `
      SELECT day_of_week FROM schedule
      WHERE user_id = ? AND template_id = ?
    `,
      )
      .all(user.id, template.id) as { day_of_week: number }[];

    return {
      ...template,
      exercises: exercises.map((e) => e.name),
      scheduledDays: scheduledDays.map((s) => dayNames[s.day_of_week]),
      isToday: todaySchedule?.template_id === template.id,
    };
  });

  return c.html(`
    <div class="page">
      <!-- Today's Date Header -->
      <div class="today-header">
        <span class="today-day" id="today-day"></span>
        <span class="today-date" id="today-date"></span>
      </div>

      ${
        todaySchedule?.template_id
          ? `
        ${templatesWithDetails
          .filter((t) => t.isToday)
          .map(
            (template) => `
          <div class="today-workout-card"
               hx-get="/pages/workouts/${template.id}"
               hx-target="#content"
               hx-swap="innerHTML transition:true"
               hx-push-url="/workouts/${template.id}">
            <div class="today-workout-label">Today's Workout</div>
            <div class="today-workout-name">${template.name}</div>
            <div class="today-workout-meta">${template.exercises.join(", ") || "No exercises"}</div>
            <button class="start-btn-large"
                    hx-get="/pages/workouts/${template.id}/active"
                    hx-target="#content"
                    hx-swap="innerHTML transition:true"
                    hx-push-url="/workouts/${template.id}/active"
                    onclick="event.stopPropagation()">Start Workout</button>
          </div>
        `,
          )
          .join("")}
      `
          : `
        <div class="no-workout-today">
          <div class="no-workout-text">No workout scheduled for today</div>
        </div>
      `
      }

      <div class="section-subtitle" style="margin-top: 24px;">My Templates</div>
      ${templatesWithDetails
        .filter((t) => !t.isToday)
        .map(
          (template) => `
        <div class="workout-card"
             hx-get="/pages/workouts/${template.id}"
             hx-target="#content"
             hx-swap="innerHTML transition:true"
             hx-push-url="/workouts/${template.id}">
          <div class="workout-card-info">
            <div class="workout-card-name">${template.name}</div>
            <div class="workout-card-meta">${template.exercises.join(", ") || "No exercises"}</div>
            <div class="workout-card-days">${template.scheduledDays.join(", ") || "Not scheduled"}</div>
          </div>
        </div>
      `,
        )
        .join("")}

      ${
        templates.length === 0
          ? `
        <div class="empty-state">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
            <line x1="12" y1="8" x2="12" y2="16"></line>
            <line x1="8" y1="12" x2="16" y2="12"></line>
          </svg>
          <div class="empty-state-title">No templates yet</div>
          <div class="empty-state-text">Create your first workout template</div>
        </div>
      `
          : ""
      }

      <button class="btn btn-primary btn-full" style="margin-top: 16px;"
              hx-get="/pages/workouts/new"
              hx-target="#content"
              hx-swap="innerHTML transition:true"
              hx-push-url="/workouts/new">
        + Create Template
      </button>

      <script>
        (function() {
          // Set today's date using user's timezone
          const now = new Date();
          const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
          const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

          const dayEl = document.getElementById('today-day');
          const dateEl = document.getElementById('today-date');
          if (dayEl) dayEl.textContent = dayNames[now.getDay()];
          if (dateEl) dateEl.textContent = monthNames[now.getMonth()] + ' ' + now.getDate() + ', ' + now.getFullYear();
        })();
      </script>
    </div>
  `);
});

// Stats Page (placeholder for now)
app.get("/pages/stats", (c) => {
  return c.html(`
    <div class="page">
      <div class="section-title">Statistics</div>
      <div class="empty-state">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="18" y1="20" x2="18" y2="10"></line>
          <line x1="12" y1="20" x2="12" y2="4"></line>
          <line x1="6" y1="20" x2="6" y2="14"></line>
        </svg>
        <div class="empty-state-title">Coming Soon</div>
        <div class="empty-state-text">Statistics will be available in a future update</div>
      </div>
    </div>
  `);
});

// Account Page
app.get("/pages/account", (c) => {
  const authUser = requireAuthApi(c);
  if (!authUser)
    return c.html(`<script>window.location.href='/login';</script>`);

  const user = db
    .query("SELECT * FROM users WHERE id = ?")
    .get(authUser.id) as {
    id: number;
    username: string;
    name: string;
    units: string;
  };

  return c.html(`
    <div class="page">
      <div class="section-title">Account</div>

      <div class="card">
        <div class="card-title">${user.name || user.username}</div>
        <div class="card-subtitle">@${user.username}</div>
      </div>

      <div class="section-subtitle" style="margin-top: 24px;">Settings</div>

      <form hx-post="/api/settings" hx-swap="none">
        <div class="form-group">
          <label class="form-label">Weight Units</label>
          <select name="units" class="form-input"
                  hx-post="/api/settings/units"
                  hx-trigger="change"
                  hx-swap="none">
            <option value="kg" ${user.units === "kg" ? "selected" : ""}>Kilograms (kg)</option>
            <option value="lbs" ${user.units === "lbs" ? "selected" : ""}>Pounds (lbs)</option>
          </select>
        </div>
      </form>

      <button class="btn btn-danger btn-full" style="margin-top: 24px;"
              hx-post="/api/auth/logout"
              hx-swap="none">
        Log Out
      </button>
    </div>
  `);
});

// New Template Page
app.get("/pages/workouts/new", (c) => {
  const user = requireAuthApi(c);
  if (!user) return c.html(`<script>window.location.href='/login';</script>`);

  // Get user's unit preference
  const userSettings = db
    .query("SELECT units FROM users WHERE id = ?")
    .get(user.id) as { units: string };
  const units = userSettings?.units || "kg";

  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  // Get all exercises grouped by muscle
  const exercises = db
    .query("SELECT * FROM exercises ORDER BY muscle_group, name")
    .all() as Exercise[];
  const grouped = exercises.reduce(
    (acc, ex) => {
      if (!acc[ex.muscle_group]) acc[ex.muscle_group] = [];
      acc[ex.muscle_group].push(ex);
      return acc;
    },
    {} as Record<string, Exercise[]>,
  );

  return c.html(`
    <div class="page">
      <div class="page-header">
        <button class="back-btn" hx-get="/pages/workouts" hx-target="#content" hx-swap="innerHTML transition:true">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="15 18 9 12 15 6"></polyline>
          </svg>
        </button>
        <h1 class="page-title">New Template</h1>
      </div>

      <form hx-post="/api/templates" hx-target="#content" hx-swap="innerHTML transition:true">
        <div class="form-group">
          <label class="form-label">Template Name</label>
          <input type="text" name="name" class="form-input" placeholder="e.g., Push Day" required>
        </div>

        <div class="form-group">
          <label class="form-label">Rest Time Between Sets</label>
          <div class="rest-time-picker">
            <div class="time-spinner">
              <button type="button" class="spinner-btn" onclick="adjustRestTime(-15)">−</button>
              <div class="time-display">
                <span id="rest-time-display">3:00</span>
              </div>
              <button type="button" class="spinner-btn" onclick="adjustRestTime(15)">+</button>
            </div>
            <input type="hidden" name="rest_time" id="rest-time-input" value="180">
          </div>
        </div>

        <div class="form-group">
          <label class="form-label">Schedule (select days)</label>
          <div class="day-toggle">
            ${dayNames
              .map(
                (day, i) => `
              <input type="checkbox" name="days" value="${i}" id="day-${i}" class="day-checkbox">
              <label for="day-${i}" class="day-label">${day}</label>
            `,
              )
              .join("")}
          </div>
        </div>

        <div class="form-group">
          <label class="form-label">Exercises</label>
          <div id="selected-exercises" class="list" style="margin-bottom: 12px;"></div>
          <button type="button" class="btn btn-secondary btn-full" onclick="openExerciseModal()">
            + Add Exercise
          </button>
        </div>

        <input type="hidden" name="exercises" id="exercises-input" value="[]">

        <button type="submit" class="btn btn-primary btn-full" style="margin-top: 24px;">
          Create Template
        </button>
      </form>

      <!-- Exercise Selection Modal -->
      <div id="exercise-modal" class="modal-overlay" onclick="if(event.target === this) closeExerciseModal()">
        <div class="modal">
          <div class="modal-header">
            <h3 class="modal-title">Add Exercise</h3>
            <button type="button" class="modal-close" onclick="closeExerciseModal()">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
          </div>
          <div class="modal-search">
            <input type="text" class="form-input" placeholder="Search exercises..."
                   id="exercise-search" oninput="filterExercises(this.value)">
          </div>
          <div class="modal-body">
            <div id="exercise-list">
              ${Object.entries(grouped)
                .map(
                  ([muscle, exs]) => `
                <div class="muscle-section" data-muscle="${muscle}">
                  <div class="muscle-section-title">${muscle.replace("_", " ")}</div>
                  <div class="exercise-gallery">
                    ${exs
                      .map(
                        (ex) => `
                      <button type="button" class="exercise-chip exercise-option"
                              data-id="${ex.id}" data-name="${ex.name}" data-muscle="${ex.muscle_group}"
                              onclick="addExercise(${ex.id}, '${ex.name.replace(/'/g, "\\'")}', '${ex.muscle_group}')">
                        ${ex.name}
                      </button>
                    `,
                      )
                      .join("")}
                  </div>
                </div>
              `,
                )
                .join("")}
            </div>
          </div>
        </div>
      </div>

      <script>
        (function() {
        let selectedExercises = [];
        let draggedIndex = null;
        let restTimeSeconds = 180;
        const weightUnit = '${units}';

        function formatRestTime(seconds) {
          const mins = Math.floor(seconds / 60);
          const secs = seconds % 60;
          return mins + ':' + secs.toString().padStart(2, '0');
        }

        window.adjustRestTime = function(delta) {
          restTimeSeconds = Math.max(15, Math.min(600, restTimeSeconds + delta));
          document.getElementById('rest-time-display').textContent = formatRestTime(restTimeSeconds);
          document.getElementById('rest-time-input').value = restTimeSeconds;
        };

        window.openExerciseModal = function() {
          document.getElementById('exercise-modal').classList.add('active');
          document.getElementById('exercise-search').value = '';
          window.filterExercises('');
        };

        window.closeExerciseModal = function() {
          document.getElementById('exercise-modal').classList.remove('active');
        };

        window.addExercise = function(id, name, muscle) {
          if (selectedExercises.find(e => e.id === id)) {
            window.closeExerciseModal();
            return;
          }

          // Each exercise has an array of sets, each set has reps and weight
          selectedExercises.push({
            id,
            name,
            muscle,
            increment: 2.5,
            sets: [
              { reps: 10, weight: 20 },
              { reps: 10, weight: 20 },
              { reps: 10, weight: 20 }
            ]
          });
          updateExerciseList();
          window.closeExerciseModal();
        };

        window.removeExercise = function(id) {
          selectedExercises = selectedExercises.filter(e => e.id !== id);
          updateExerciseList();
        };

        window.updateSetValue = function(exerciseId, setIndex, field, value) {
          const ex = selectedExercises.find(e => e.id === exerciseId);
          if (ex && ex.sets[setIndex]) {
            ex.sets[setIndex][field] = parseFloat(value) || 0;
            updateHiddenInput();
          }
        };

        window.addSet = function(exerciseId) {
          const ex = selectedExercises.find(e => e.id === exerciseId);
          if (ex) {
            const lastSet = ex.sets[ex.sets.length - 1] || { reps: 10, weight: 20 };
            ex.sets.push({ reps: lastSet.reps, weight: lastSet.weight });
            updateExerciseList();
          }
        };

        window.removeSet = function(exerciseId, setIndex) {
          const ex = selectedExercises.find(e => e.id === exerciseId);
          if (ex && ex.sets.length > 1) {
            ex.sets.splice(setIndex, 1);
            updateExerciseList();
          }
        };

        window.updateIncrement = function(exerciseId, value) {
          const ex = selectedExercises.find(e => e.id === exerciseId);
          if (ex) {
            ex.increment = parseFloat(value) || 2.5;
            updateHiddenInput();
          }
        };

        function updateHiddenInput() {
          document.getElementById('exercises-input').value = JSON.stringify(
            selectedExercises.map(e => ({ id: e.id, sets: e.sets, increment: e.increment || 2.5 }))
          );
        }

        function updateExerciseList() {
          const container = document.getElementById('selected-exercises');
          container.innerHTML = selectedExercises.map((ex, i) => \`
            <div class="exercise-item-card" draggable="true" data-index="\${i}"
                 ondragstart="handleDragStart(event, \${i})"
                 ondragover="handleDragOver(event)"
                 ondrop="handleDrop(event, \${i})"
                 ondragend="handleDragEnd(event)">
              <div class="exercise-item-header">
                <span class="exercise-item-grip" style="cursor: grab;">☰</span>
                <span class="exercise-item-name">\${ex.name}</span>
                <button type="button" class="exercise-item-remove" onclick="removeExercise(\${ex.id})">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                  </svg>
                </button>
              </div>
              <div class="exercise-sets-header">
                <span class="set-col-label">Set</span>
                <span class="set-col-label">Reps</span>
                <span class="set-col-label">\${weightUnit}</span>
                <span class="set-col-label"></span>
              </div>
              <div class="exercise-sets">
                \${ex.sets.map((set, si) => \`
                  <div class="exercise-set-row">
                    <span class="set-number">\${si + 1}</span>
                    <input type="number" value="\${set.reps}" min="1" max="100"
                           onchange="updateSetValue(\${ex.id}, \${si}, 'reps', this.value)"
                           onfocus="this.select()">
                    <input type="number" value="\${set.weight}" min="0" step="0.5"
                           onchange="updateSetValue(\${ex.id}, \${si}, 'weight', this.value)"
                           onfocus="this.select()">
                    <button type="button" class="set-remove-btn" onclick="removeSet(\${ex.id}, \${si})"
                            \${ex.sets.length <= 1 ? 'disabled' : ''}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="18" y1="6" x2="6" y2="18"></line>
                        <line x1="6" y1="6" x2="18" y2="18"></line>
                      </svg>
                    </button>
                  </div>
                \`).join('')}
              </div>
              <button type="button" class="add-set-btn" onclick="addSet(\${ex.id})">+ Add Set</button>
              <div class="increment-row">
                <span class="increment-label">Auto-increment</span>
                <div class="increment-input">
                  <input type="number" value="\${ex.increment || 2.5}" min="0" max="20" step="0.5"
                         onchange="updateIncrement(\${ex.id}, this.value)">
                  <span>\${weightUnit}</span>
                </div>
              </div>
            </div>
          \`).join('');

          updateHiddenInput();
        }

        window.handleDragStart = function(e, index) {
          draggedIndex = index;
          e.target.classList.add('dragging');
          e.dataTransfer.effectAllowed = 'move';
        };

        window.handleDragOver = function(e) {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
        };

        window.handleDrop = function(e, dropIndex) {
          e.preventDefault();
          if (draggedIndex === null || draggedIndex === dropIndex) return;

          const item = selectedExercises[draggedIndex];
          selectedExercises.splice(draggedIndex, 1);
          selectedExercises.splice(dropIndex, 0, item);
          updateExerciseList();
        };

        window.handleDragEnd = function(e) {
          e.target.classList.remove('dragging');
          draggedIndex = null;
        };

        window.filterExercises = function(query) {
          const q = query.toLowerCase();
          document.querySelectorAll('.exercise-option').forEach(el => {
            const name = el.dataset.name.toLowerCase();
            const muscle = el.dataset.muscle.toLowerCase();
            el.style.display = (name.includes(q) || muscle.includes(q)) ? 'inline-block' : 'none';
          });
          document.querySelectorAll('.muscle-section').forEach(section => {
            const visible = section.querySelectorAll('.exercise-option[style="display: inline-block;"], .exercise-option:not([style])');
            section.style.display = visible.length > 0 ? 'block' : 'none';
          });
        };

        // Initialize the UI after all functions are defined
        updateExerciseList();
        })();
      </script>
    </div>
  `);
});

// View/Edit Template Page
app.get("/pages/workouts/:id", (c) => {
  const user = requireAuthApi(c);
  if (!user) return c.html(`<script>window.location.href='/login';</script>`);

  // Get user's unit preference
  const userSettings = db
    .query("SELECT units FROM users WHERE id = ?")
    .get(user.id) as { units: string };
  const units = userSettings?.units || "kg";

  const id = parseInt(c.req.param("id"));
  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  const template = db
    .query("SELECT * FROM templates WHERE id = ? AND user_id = ?")
    .get(id, user.id) as Template | null;
  if (!template) {
    return c.html(
      `<div class="page"><div class="empty-state">Template not found</div></div>`,
    );
  }

  const exercises = db
    .query(
      `
    SELECT te.*, e.name as exercise_name, e.muscle_group
    FROM template_exercises te
    JOIN exercises e ON te.exercise_id = e.id
    WHERE te.template_id = ?
    ORDER BY te.sort_order
  `,
    )
    .all(id) as TemplateExercise[];

  const scheduledDays = db
    .query(
      `
    SELECT day_of_week FROM schedule WHERE user_id = ? AND template_id = ?
  `,
    )
    .all(user.id, id) as { day_of_week: number }[];

  const scheduledDayNumbers = scheduledDays.map((s) => s.day_of_week);

  // Get all exercises for the modal
  const allExercises = db
    .query("SELECT * FROM exercises ORDER BY muscle_group, name")
    .all() as Exercise[];
  const grouped = allExercises.reduce(
    (acc, ex) => {
      if (!acc[ex.muscle_group]) acc[ex.muscle_group] = [];
      acc[ex.muscle_group].push(ex);
      return acc;
    },
    {} as Record<string, Exercise[]>,
  );

  // Prepare exercises data for JavaScript
  const exercisesJson = JSON.stringify(
    exercises.map((ex) => ({
      id: ex.exercise_id,
      name: ex.exercise_name,
      muscle: ex.muscle_group,
      increment: ex.increment || 2.5,
      sets: JSON.parse(ex.sets_data || "[]"),
    })),
  );

  return c.html(`
    <div class="page">
      <div class="page-header">
        <button class="back-btn" hx-get="/pages/workouts" hx-target="#content" hx-swap="innerHTML transition:true">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="15 18 9 12 15 6"></polyline>
          </svg>
        </button>
        <h1 class="page-title">${template.name}</h1>
      </div>

      <form id="edit-template-form" hx-put="/api/templates/${id}" hx-target="#content" hx-swap="innerHTML transition:true">
        <div class="form-group">
          <label class="form-label">Template Name</label>
          <input type="text" name="name" class="form-input" value="${template.name}" required>
        </div>

        <div class="form-group">
          <label class="form-label">Rest Time Between Sets</label>
          <div class="rest-time-picker">
            <div class="time-spinner">
              <button type="button" class="spinner-btn" onclick="adjustRestTime(-15)">−</button>
              <div class="time-display">
                <span id="rest-time-display">${Math.floor((template.rest_time || 180) / 60)}:${((template.rest_time || 180) % 60).toString().padStart(2, "0")}</span>
              </div>
              <button type="button" class="spinner-btn" onclick="adjustRestTime(15)">+</button>
            </div>
            <input type="hidden" name="rest_time" id="rest-time-input" value="${template.rest_time || 180}">
          </div>
        </div>

        <div class="form-group">
          <label class="form-label">Schedule (select days)</label>
          <div class="day-toggle">
            ${dayNames
              .map(
                (day, i) => `
              <input type="checkbox" name="days" value="${i}" id="day-${i}" class="day-checkbox" ${scheduledDayNumbers.includes(i) ? "checked" : ""}>
              <label for="day-${i}" class="day-label">${day}</label>
            `,
              )
              .join("")}
          </div>
        </div>

        <div class="form-group">
          <label class="form-label">Exercises</label>
          <div id="selected-exercises" class="list" style="margin-bottom: 12px;"></div>
          <button type="button" class="btn btn-secondary btn-full" onclick="openExerciseModal()">
            + Add Exercise
          </button>
        </div>

        <input type="hidden" name="exercises" id="exercises-input" value="[]">

        <button type="submit" class="btn btn-primary btn-full" style="margin-top: 24px;">
          Save Changes
        </button>
      </form>

      <button class="btn btn-primary btn-full" style="margin-top: 12px;"
              hx-get="/pages/workouts/${template.id}/active"
              hx-target="#content"
              hx-swap="innerHTML transition:true"
              hx-push-url="/workouts/${template.id}/active">
        Start Workout
      </button>

      <button class="btn btn-danger btn-full" style="margin-top: 12px;"
              hx-delete="/api/templates/${template.id}"
              hx-target="#content"
              hx-swap="innerHTML transition:true"
              hx-confirm="Are you sure you want to delete this template?">
        Delete Template
      </button>

      <!-- Exercise Selection Modal -->
      <div id="exercise-modal" class="modal-overlay" onclick="if(event.target === this) closeExerciseModal()">
        <div class="modal">
          <div class="modal-header">
            <h3 class="modal-title">Add Exercise</h3>
            <button type="button" class="modal-close" onclick="closeExerciseModal()">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
          </div>
          <div class="modal-search">
            <input type="text" class="form-input" placeholder="Search exercises..."
                   id="exercise-search" oninput="filterExercises(this.value)">
          </div>
          <div class="modal-body">
            <div id="exercise-list">
              ${Object.entries(grouped)
                .map(
                  ([muscle, exs]) => `
                <div class="muscle-section" data-muscle="${muscle}">
                  <div class="muscle-section-title">${muscle.replace("_", " ")}</div>
                  <div class="exercise-gallery">
                    ${exs
                      .map(
                        (ex) => `
                      <button type="button" class="exercise-chip exercise-option"
                              data-id="${ex.id}" data-name="${ex.name}" data-muscle="${ex.muscle_group}"
                              onclick="addExercise(${ex.id}, '${ex.name.replace(/'/g, "\\'")}', '${ex.muscle_group}')">
                        ${ex.name}
                      </button>
                    `,
                      )
                      .join("")}
                  </div>
                </div>
              `,
                )
                .join("")}
            </div>
          </div>
        </div>
      </div>

      <script>
        (function() {
        let selectedExercises = ${exercisesJson};
        let draggedIndex = null;
        let restTimeSeconds = ${template.rest_time || 180};
        const weightUnit = '${units}';

        function formatRestTime(seconds) {
          const mins = Math.floor(seconds / 60);
          const secs = seconds % 60;
          return mins + ':' + secs.toString().padStart(2, '0');
        }

        window.adjustRestTime = function(delta) {
          restTimeSeconds = Math.max(15, Math.min(600, restTimeSeconds + delta));
          document.getElementById('rest-time-display').textContent = formatRestTime(restTimeSeconds);
          document.getElementById('rest-time-input').value = restTimeSeconds;
        };

        // Make functions globally available
        window.openExerciseModal = function() {
          document.getElementById('exercise-modal').classList.add('active');
          document.getElementById('exercise-search').value = '';
          window.filterExercises('');
        };

        window.closeExerciseModal = function() {
          document.getElementById('exercise-modal').classList.remove('active');
        };

        window.addExercise = function(id, name, muscle) {
          if (selectedExercises.find(e => e.id === id)) {
            closeExerciseModal();
            return;
          }

          selectedExercises.push({
            id,
            name,
            muscle,
            increment: 2.5,
            sets: [
              { reps: 10, weight: 20 },
              { reps: 10, weight: 20 },
              { reps: 10, weight: 20 }
            ]
          });
          updateExerciseList();
          window.closeExerciseModal();
        };

        window.removeExercise = function(id) {
          selectedExercises = selectedExercises.filter(e => e.id !== id);
          updateExerciseList();
        };

        window.updateSetValue = function(exerciseId, setIndex, field, value) {
          const ex = selectedExercises.find(e => e.id === exerciseId);
          if (ex && ex.sets[setIndex]) {
            ex.sets[setIndex][field] = parseFloat(value) || 0;
            updateHiddenInput();
          }
        };

        window.addSet = function(exerciseId) {
          const ex = selectedExercises.find(e => e.id === exerciseId);
          if (ex) {
            const lastSet = ex.sets[ex.sets.length - 1] || { reps: 10, weight: 20 };
            ex.sets.push({ reps: lastSet.reps, weight: lastSet.weight });
            updateExerciseList();
          }
        };

        window.removeSet = function(exerciseId, setIndex) {
          const ex = selectedExercises.find(e => e.id === exerciseId);
          if (ex && ex.sets.length > 1) {
            ex.sets.splice(setIndex, 1);
            updateExerciseList();
          }
        };

        window.updateIncrement = function(exerciseId, value) {
          const ex = selectedExercises.find(e => e.id === exerciseId);
          if (ex) {
            ex.increment = parseFloat(value) || 2.5;
            updateHiddenInput();
          }
        };

        function updateHiddenInput() {
          document.getElementById('exercises-input').value = JSON.stringify(
            selectedExercises.map(e => ({ id: e.id, sets: e.sets, increment: e.increment || 2.5 }))
          );
        }

        function updateExerciseList() {
          const container = document.getElementById('selected-exercises');
          container.innerHTML = selectedExercises.map((ex, i) => \`
            <div class="exercise-item-card" draggable="true" data-index="\${i}"
                 ondragstart="handleDragStart(event, \${i})"
                 ondragover="handleDragOver(event)"
                 ondrop="handleDrop(event, \${i})"
                 ondragend="handleDragEnd(event)">
              <div class="exercise-item-header">
                <span class="exercise-item-grip" style="cursor: grab;">☰</span>
                <span class="exercise-item-name">\${ex.name}</span>
                <button type="button" class="exercise-item-remove" onclick="removeExercise(\${ex.id})">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                  </svg>
                </button>
              </div>
              <div class="exercise-sets-header">
                <span class="set-col-label">Set</span>
                <span class="set-col-label">Reps</span>
                <span class="set-col-label">\${weightUnit}</span>
                <span class="set-col-label"></span>
              </div>
              <div class="exercise-sets">
                \${ex.sets.map((set, si) => \`
                  <div class="exercise-set-row">
                    <span class="set-number">\${si + 1}</span>
                    <input type="number" value="\${set.reps}" min="1" max="100"
                           onchange="updateSetValue(\${ex.id}, \${si}, 'reps', this.value)"
                           onfocus="this.select()">
                    <input type="number" value="\${set.weight}" min="0" step="0.5"
                           onchange="updateSetValue(\${ex.id}, \${si}, 'weight', this.value)"
                           onfocus="this.select()">
                    <button type="button" class="set-remove-btn" onclick="removeSet(\${ex.id}, \${si})"
                            \${ex.sets.length <= 1 ? 'disabled' : ''}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="18" y1="6" x2="6" y2="18"></line>
                        <line x1="6" y1="6" x2="18" y2="18"></line>
                      </svg>
                    </button>
                  </div>
                \`).join('')}
              </div>
              <button type="button" class="add-set-btn" onclick="addSet(\${ex.id})">+ Add Set</button>
              <div class="increment-row">
                <span class="increment-label">Auto-increment</span>
                <div class="increment-input">
                  <input type="number" value="\${ex.increment || 2.5}" min="0" max="20" step="0.5"
                         onchange="updateIncrement(\${ex.id}, this.value)">
                  <span>\${weightUnit}</span>
                </div>
              </div>
            </div>
          \`).join('');

          updateHiddenInput();
        }

        window.handleDragStart = function(e, index) {
          draggedIndex = index;
          e.target.classList.add('dragging');
          e.dataTransfer.effectAllowed = 'move';
        };

        window.handleDragOver = function(e) {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
        };

        window.handleDrop = function(e, dropIndex) {
          e.preventDefault();
          if (draggedIndex === null || draggedIndex === dropIndex) return;

          const item = selectedExercises[draggedIndex];
          selectedExercises.splice(draggedIndex, 1);
          selectedExercises.splice(dropIndex, 0, item);
          updateExerciseList();
        };

        window.handleDragEnd = function(e) {
          e.target.classList.remove('dragging');
          draggedIndex = null;
        };

        window.filterExercises = function(query) {
          const q = query.toLowerCase();
          document.querySelectorAll('.exercise-option').forEach(el => {
            const name = el.dataset.name.toLowerCase();
            const muscle = el.dataset.muscle.toLowerCase();
            el.style.display = (name.includes(q) || muscle.includes(q)) ? 'inline-block' : 'none';
          });
          document.querySelectorAll('.muscle-section').forEach(section => {
            const visible = section.querySelectorAll('.exercise-option[style="display: inline-block;"], .exercise-option:not([style])');
            section.style.display = visible.length > 0 ? 'block' : 'none';
          });
        };

        // Initialize the UI
        updateExerciseList();
        })();
      </script>
    </div>
  `);
});

// Active Workout Page
app.get("/pages/workouts/:id/active", (c) => {
  const user = requireAuthApi(c);
  if (!user) return c.html(`<script>window.location.href='/login';</script>`);

  // Get user's unit preference
  const userSettings = db
    .query("SELECT units FROM users WHERE id = ?")
    .get(user.id) as { units: string };
  const units = userSettings?.units || "kg";

  const templateId = parseInt(c.req.param("id"));

  const template = db
    .query("SELECT * FROM templates WHERE id = ? AND user_id = ?")
    .get(templateId, user.id) as Template | null;
  if (!template) {
    return c.html(
      `<div class="page"><div class="empty-state">Template not found</div></div>`,
    );
  }

  // Get exercises for this template
  const exercises = db
    .query(
      `
    SELECT te.*, e.name as exercise_name, e.muscle_group
    FROM template_exercises te
    JOIN exercises e ON te.exercise_id = e.id
    WHERE te.template_id = ?
    ORDER BY te.sort_order
  `,
    )
    .all(templateId) as TemplateExercise[];

  // Get last workout data for each exercise and parse sets_data
  const exercisesWithHistory = exercises.map((ex) => {
    // Get the most recent completed workout that included this exercise
    const lastWorkout = db
      .query(
        `
      SELECT w.id, w.completed_at FROM workouts w
      JOIN sets s ON s.workout_id = w.id
      WHERE w.user_id = ? AND s.exercise_id = ? AND w.completed_at IS NOT NULL
      ORDER BY w.completed_at DESC
      LIMIT 1
    `,
      )
      .get(user.id, ex.exercise_id) as {
      id: number;
      completed_at: string;
    } | null;

    let lastSets: { weight: number; reps: number; completed: boolean }[] = [];
    let allSetsCompleted = false;

    if (lastWorkout) {
      // Get all sets from that workout for this exercise
      lastSets = db
        .query(
          `
        SELECT weight, reps FROM sets
        WHERE workout_id = ? AND exercise_id = ?
        ORDER BY set_number
      `,
        )
        .all(lastWorkout.id, ex.exercise_id) as {
        weight: number;
        reps: number;
        completed: boolean;
      }[];

      // Parse the template sets to check if all were completed
      const templateSets = JSON.parse(ex.sets_data || "[]") as {
        reps: number;
        weight: number;
      }[];

      // Check if user completed all sets with all reps
      allSetsCompleted =
        lastSets.length >= templateSets.length &&
        lastSets.every((set, i) => {
          const targetReps = templateSets[i]?.reps || 0;
          return set.reps >= targetReps;
        });
    }

    // Parse the sets_data JSON
    const templateSets = JSON.parse(ex.sets_data || "[]") as {
      reps: number;
      weight: number;
    }[];

    // Apply auto-increment if all sets were completed in last workout
    const increment = ex.increment || 2.5;
    const adjustedSets = templateSets.map((set) => ({
      reps: set.reps,
      weight: allSetsCompleted ? set.weight + increment : set.weight,
    }));

    return {
      ...ex,
      lastSets,
      templateSets: adjustedSets,
      allSetsCompleted,
      increment,
    };
  });

  // JSON data for client-side use
  const exercisesJson = JSON.stringify(
    exercisesWithHistory.map((ex) => ({
      exercise_id: ex.exercise_id,
      exercise_name: ex.exercise_name,
      lastSets: ex.lastSets,
      templateSets: ex.templateSets,
    })),
  );

  const restTime = template.rest_time || 180;

  return c.html(`
    <div class="page">
      <div class="page-header" style="justify-content: space-between;">
        <div style="display: flex; align-items: center; gap: 12px;">
          <button class="back-btn" onclick="cancelWorkout()">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="15 18 9 12 15 6"></polyline>
            </svg>
          </button>
          <h1 class="page-title">${template.name}</h1>
        </div>
        <div class="workout-timer" id="rest-timer" onclick="toggleTimer()">
          <svg class="timer-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"></circle>
            <polyline points="12 6 12 12 16 14"></polyline>
          </svg>
          <span class="timer-display" id="timer-display">0:00</span>
        </div>
      </div>

      <form id="workout-form">
        <input type="hidden" name="template_id" value="${templateId}">

        <div id="exercises-container">
          ${exercisesWithHistory
            .map(
              (ex) => `
            <div class="card" style="margin-bottom: 16px;" data-exercise-card="${ex.exercise_id}">
              <div class="card-title">${ex.exercise_name}</div>
              ${
                ex.lastSets.length > 0
                  ? `
                <div class="card-subtitle">Last: ${ex.lastSets.map((s) => `${s.reps} × ${s.weight}kg`).join(", ")}</div>
              `
                  : ""
              }

              <div class="sets-container" data-exercise="${ex.exercise_id}" style="margin-top: 12px;">
                ${ex.templateSets
                  .map(
                    (set, setIndex) => `
                  <div class="set-row" data-set-index="${setIndex}">
                    <span class="set-number">${setIndex + 1}</span>
                    <div class="input-spinner">
                      <button type="button" class="spinner-btn" onclick="adjustInput(this, -1)">−</button>
                      <input type="number" name="reps_${ex.exercise_id}_${setIndex}"
                             value="${ex.lastSets[setIndex]?.reps || set.reps}" onfocus="this.select()" oninput="saveProgress()">
                      <button type="button" class="spinner-btn" onclick="adjustInput(this, 1)">+</button>
                    </div>
                    <span class="set-x">×</span>
                    <div class="input-spinner">
                      <button type="button" class="spinner-btn" onclick="adjustInput(this, -2.5)">−</button>
                      <input type="number" name="weight_${ex.exercise_id}_${setIndex}"
                             value="${ex.lastSets[setIndex]?.weight || set.weight}" step="2.5" onfocus="this.select()" oninput="saveProgress()">
                      <button type="button" class="spinner-btn" onclick="adjustInput(this, 2.5)">+</button>
                    </div>
                    <span class="set-unit">kg</span>
                    <button type="button" class="set-check" onclick="toggleSetComplete(this)"></button>
                  </div>
                `,
                  )
                  .join("")}
              </div>

              <button type="button" class="btn btn-secondary btn-sm" style="margin-top: 8px;"
                      onclick="addSetToExercise(${ex.exercise_id})">
                + Add Set
              </button>
            </div>
          `,
            )
            .join("")}
        </div>

        <button type="button" class="btn btn-secondary btn-full" style="margin-top: 16px;"
                onclick="openExerciseModal()">
          + Add Exercise
        </button>
      </form>

      <div class="sticky-bottom">
        <button type="button" class="btn btn-primary btn-full"
                onclick="finishWorkout()">
          Complete Workout
        </button>
      </div>

      <!-- Exercise Selection Modal -->
      <div id="exercise-modal" class="modal-overlay" onclick="if(event.target === this) closeExerciseModal()">
        <div class="modal">
          <div class="modal-header">
            <h3 class="modal-title">Add Exercise</h3>
            <button type="button" class="modal-close" onclick="closeExerciseModal()">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
          </div>
          <div class="modal-search">
            <input type="text" class="form-input" placeholder="Search exercises..."
                   id="exercise-search" oninput="filterExercises(this.value)">
          </div>
          <div class="modal-body">
            <div id="exercise-list"></div>
          </div>
        </div>
      </div>

      <script>
        (function() {
        const STORAGE_KEY = 'activeWorkout_${templateId}';
        const templateId = ${templateId};
        let exercisesData = ${exercisesJson};
        const REST_TIME = ${restTime};
        let setCounters = {};

        // All exercises for modal
        let allExercises = null;

        // Timer state
        let timerInterval = null;
        let timerSeconds = 0;
        let timerRunning = false;
        let timerDirection = 'up';

        // Audio context for beep
        let audioContext = null;

        function initAudio() {
          if (!audioContext) {
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
          }
        }

        function playBeep() {
          initAudio();
          const oscillator = audioContext.createOscillator();
          const gainNode = audioContext.createGain();

          oscillator.connect(gainNode);
          gainNode.connect(audioContext.destination);

          oscillator.frequency.value = 800;
          oscillator.type = 'sine';
          gainNode.gain.value = 0.3;

          oscillator.start();

          setTimeout(() => { gainNode.gain.value = 0; }, 150);
          setTimeout(() => { gainNode.gain.value = 0.3; }, 250);
          setTimeout(() => { gainNode.gain.value = 0; }, 400);
          setTimeout(() => { gainNode.gain.value = 0.3; }, 500);
          setTimeout(() => { gainNode.gain.value = 0; }, 650);
          setTimeout(() => { oscillator.stop(); }, 700);
        }

        function formatTime(seconds) {
          const mins = Math.floor(Math.abs(seconds) / 60);
          const secs = Math.abs(seconds) % 60;
          return \`\${mins}:\${secs.toString().padStart(2, '0')}\`;
        }

        function updateTimerDisplay() {
          const display = document.getElementById('timer-display');
          const timer = document.getElementById('rest-timer');
          display.textContent = formatTime(timerSeconds);

          if (timerDirection === 'down') {
            timer.classList.add('active');
            if (timerSeconds <= 0) {
              timer.classList.remove('active');
              timer.classList.add('warning');
            } else {
              timer.classList.remove('warning');
            }
          } else {
            timer.classList.remove('active', 'warning');
          }
        }

        function startRestTimer() {
          initAudio();
          stopTimer();
          timerSeconds = REST_TIME;
          timerDirection = 'down';
          timerRunning = true;
          updateTimerDisplay();

          timerInterval = setInterval(() => {
            timerSeconds--;
            updateTimerDisplay();

            if (timerSeconds === 0) {
              playBeep();
              // Try to show notification
              if ('Notification' in window && Notification.permission === 'granted') {
                new Notification('Rest Complete!', { body: 'Time to start your next set!' });
              }
            }
          }, 1000);
        }

        function stopTimer() {
          if (timerInterval) {
            clearInterval(timerInterval);
            timerInterval = null;
          }
          timerRunning = false;
          timerDirection = 'up';
          timerSeconds = 0;
          updateTimerDisplay();
        }

        function toggleTimer() {
          if (timerRunning) {
            stopTimer();
          } else {
            startRestTimer();
          }
        }

        // Request notification permission
        if ('Notification' in window && Notification.permission === 'default') {
          Notification.requestPermission();
        }

        // Initialize set counters
        exercisesData.forEach(ex => {
          setCounters[ex.exercise_id] = ex.templateSets.length;
        });

        // Adjust input value with +/- buttons
        window.adjustInput = function(btn, delta) {
          const spinner = btn.closest('.input-spinner');
          const input = spinner.querySelector('input');
          const currentVal = parseFloat(input.value) || 0;
          const step = Math.abs(delta);
          const newVal = Math.max(0, currentVal + delta);
          input.value = step === 2.5 ? newVal.toFixed(1) : Math.round(newVal);
          saveProgress();
        };

        window.toggleTimer = function() {
          if (timerRunning) {
            stopTimer();
          } else {
            startRestTimer();
          }
        };

        // Exercise modal functions
        window.openExerciseModal = async function() {
          document.getElementById('exercise-modal').classList.add('active');
          document.getElementById('exercise-search').value = '';

          // Load exercises if not already loaded
          if (!allExercises) {
            const res = await fetch('/api/exercises');
            allExercises = await res.json();
            renderExerciseList();
          }
          window.filterExercises('');
        };

        window.closeExerciseModal = function() {
          document.getElementById('exercise-modal').classList.remove('active');
        };

        function renderExerciseList() {
          const container = document.getElementById('exercise-list');
          const grouped = {};
          allExercises.forEach(ex => {
            if (!grouped[ex.muscle_group]) grouped[ex.muscle_group] = [];
            grouped[ex.muscle_group].push(ex);
          });

          container.innerHTML = Object.entries(grouped).map(([muscle, exs]) => \`
            <div class="muscle-section" data-muscle="\${muscle}">
              <div class="muscle-section-title">\${muscle.replace('_', ' ')}</div>
              <div class="exercise-gallery">
                \${exs.map(ex => \`
                  <button type="button" class="exercise-chip exercise-option"
                          data-id="\${ex.id}" data-name="\${ex.name}" data-muscle="\${ex.muscle_group}"
                          onclick="addExerciseToWorkout(\${ex.id}, '\${ex.name.replace(/'/g, "\\\\'")}', '\${ex.muscle_group}')">
                    \${ex.name}
                  </button>
                \`).join('')}
              </div>
            </div>
          \`).join('');
        }

        window.filterExercises = function(query) {
          const q = query.toLowerCase();
          document.querySelectorAll('.exercise-option').forEach(el => {
            const name = el.dataset.name.toLowerCase();
            const muscle = el.dataset.muscle.toLowerCase();
            el.style.display = (name.includes(q) || muscle.includes(q)) ? 'inline-block' : 'none';
          });
          document.querySelectorAll('.muscle-section').forEach(section => {
            const visible = section.querySelectorAll('.exercise-option[style="display: inline-block;"], .exercise-option:not([style])');
            section.style.display = visible.length > 0 ? 'block' : 'none';
          });
        };

        window.addExerciseToWorkout = function(id, name, muscle) {
          // Check if already added
          if (exercisesData.find(e => e.exercise_id === id)) {
            window.closeExerciseModal();
            return;
          }

          // Add to exercisesData
          const newEx = {
            exercise_id: id,
            exercise_name: name,
            lastSets: [],
            templateSets: [{ reps: 10, weight: 20 }, { reps: 10, weight: 20 }, { reps: 10, weight: 20 }]
          };
          exercisesData.push(newEx);
          setCounters[id] = 3;

          // Add card to DOM
          const container = document.getElementById('exercises-container');
          const card = document.createElement('div');
          card.className = 'card';
          card.style.marginBottom = '16px';
          card.dataset.exerciseCard = id;
          card.innerHTML = \`
            <div class="card-title">\${name}</div>
            <div class="sets-container" data-exercise="\${id}" style="margin-top: 12px;">
              \${newEx.templateSets.map((set, i) => \`
                <div class="set-row" data-set-index="\${i}">
                  <span class="set-number">\${i + 1}</span>
                  <div class="input-spinner">
                    <button type="button" class="spinner-btn" onclick="adjustInput(this, -1)">−</button>
                    <input type="number" name="reps_\${id}_\${i}" value="\${set.reps}" onfocus="this.select()" oninput="saveProgress()">
                    <button type="button" class="spinner-btn" onclick="adjustInput(this, 1)">+</button>
                  </div>
                  <span class="set-x">×</span>
                  <div class="input-spinner">
                    <button type="button" class="spinner-btn" onclick="adjustInput(this, -2.5)">−</button>
                    <input type="number" name="weight_\${id}_\${i}" value="\${set.weight}" step="2.5" onfocus="this.select()" oninput="saveProgress()">
                    <button type="button" class="spinner-btn" onclick="adjustInput(this, 2.5)">+</button>
                  </div>
                  <span class="set-unit">kg</span>
                  <button type="button" class="set-check" onclick="toggleSetComplete(this)"></button>
                </div>
              \`).join('')}
            </div>
            <button type="button" class="btn btn-secondary btn-sm" style="margin-top: 8px;"
                    onclick="addSetToExercise(\${id})">
              + Add Set
            </button>
          \`;
          container.appendChild(card);

          window.closeExerciseModal();
          saveProgress();
        };

        // Restore from localStorage on load
        function restoreProgress() {
          const saved = localStorage.getItem(STORAGE_KEY);
          if (!saved) return;

          try {
            const data = JSON.parse(saved);

            // Restore input values
            Object.entries(data.inputs || {}).forEach(([name, value]) => {
              const input = document.querySelector(\`[name="\${name}"]\`);
              if (input) input.value = value;
            });

            // Restore completed sets
            (data.completedSets || []).forEach(selector => {
              const btn = document.querySelector(selector);
              if (btn) btn.classList.add('completed');
            });

            // Restore added sets
            if (data.addedSets) {
              Object.entries(data.addedSets).forEach(([exerciseId, sets]) => {
                const container = document.querySelector(\`.sets-container[data-exercise="\${exerciseId}"]\`);
                if (!container) return;

                sets.forEach((set, i) => {
                  const setNum = setCounters[exerciseId]++;
                  const setRow = document.createElement('div');
                  setRow.className = 'set-row';
                  setRow.dataset.setIndex = setNum;
                  setRow.innerHTML = \`
                    <span class="set-number">\${setNum + 1}</span>
                    <div class="input-spinner">
                      <button type="button" class="spinner-btn" onclick="adjustInput(this, -1)">−</button>
                      <input type="number" name="reps_\${exerciseId}_\${setNum}"
                             value="\${set.reps || ''}" onfocus="this.select()" oninput="saveProgress()">
                      <button type="button" class="spinner-btn" onclick="adjustInput(this, 1)">+</button>
                    </div>
                    <span class="set-x">×</span>
                    <div class="input-spinner">
                      <button type="button" class="spinner-btn" onclick="adjustInput(this, -2.5)">−</button>
                      <input type="number" name="weight_\${exerciseId}_\${setNum}"
                             value="\${set.weight || ''}" step="2.5" onfocus="this.select()" oninput="saveProgress()">
                      <button type="button" class="spinner-btn" onclick="adjustInput(this, 2.5)">+</button>
                    </div>
                    <span class="set-unit">kg</span>
                    <button type="button" class="set-check \${set.completed ? 'completed' : ''}" onclick="toggleSetComplete(this)"></button>
                  \`;
                  container.appendChild(setRow);
                });
              });
            }
          } catch (e) {
            console.error('Error restoring workout progress:', e);
          }
        }

        // Save progress to localStorage
        window.saveProgress = function() {
          const form = document.getElementById('workout-form');
          const formData = new FormData(form);
          const inputs = {};

          for (const [key, value] of formData.entries()) {
            if (key !== 'template_id') {
              inputs[key] = value;
            }
          }

          // Track completed sets
          const completedSets = [];
          document.querySelectorAll('.set-check.completed').forEach(btn => {
            const row = btn.closest('.set-row');
            const container = row.closest('.sets-container');
            const exerciseId = container.dataset.exercise;
            const setIndex = row.dataset.setIndex;
            completedSets.push(\`.sets-container[data-exercise="\${exerciseId}"] .set-row[data-set-index="\${setIndex}"] .set-check\`);
          });

          // Track added sets (sets beyond template defaults)
          const addedSets = {};
          exercisesData.forEach(ex => {
            const container = document.querySelector(\`.sets-container[data-exercise="\${ex.exercise_id}"]\`);
            const rows = container.querySelectorAll('.set-row');
            if (rows.length > ex.templateSets.length) {
              addedSets[ex.exercise_id] = [];
              for (let i = ex.templateSets.length; i < rows.length; i++) {
                const row = rows[i];
                const repsInput = row.querySelector(\`[name^="reps_"]\`);
                const weightInput = row.querySelector(\`[name^="weight_"]\`);
                const checkBtn = row.querySelector('.set-check');
                addedSets[ex.exercise_id].push({
                  reps: repsInput?.value || '',
                  weight: weightInput?.value || '',
                  completed: checkBtn?.classList.contains('completed') || false
                });
              }
            }
          });

          localStorage.setItem(STORAGE_KEY, JSON.stringify({
            inputs,
            completedSets,
            addedSets,
            savedAt: Date.now()
          }));
        }

        window.toggleSetComplete = function(btn) {
          btn.classList.toggle('completed');
          saveProgress();

          // Start rest timer when completing a set
          if (btn.classList.contains('completed')) {
            startRestTimer();
          }
        };

        window.addSetToExercise = function(exerciseId) {
          const container = document.querySelector(\`.sets-container[data-exercise="\${exerciseId}"]\`);
          if (!setCounters[exerciseId]) setCounters[exerciseId] = 0;
          const setNum = setCounters[exerciseId]++;
          const ex = exercisesData.find(e => e.exercise_id === exerciseId);
          const defaultReps = ex?.templateSets?.[0]?.reps || 10;

          const setRow = document.createElement('div');
          setRow.className = 'set-row';
          setRow.dataset.setIndex = setNum;
          setRow.innerHTML = \`
            <span class="set-number">\${setNum + 1}</span>
            <div class="input-spinner">
              <button type="button" class="spinner-btn" onclick="adjustInput(this, -1)">−</button>
              <input type="number" name="reps_\${exerciseId}_\${setNum}"
                     placeholder="\${defaultReps}" onfocus="this.select()" oninput="saveProgress()">
              <button type="button" class="spinner-btn" onclick="adjustInput(this, 1)">+</button>
            </div>
            <span class="set-x">×</span>
            <div class="input-spinner">
              <button type="button" class="spinner-btn" onclick="adjustInput(this, -2.5)">−</button>
              <input type="number" name="weight_\${exerciseId}_\${setNum}"
                     placeholder="0" step="2.5" onfocus="this.select()" oninput="saveProgress()">
              <button type="button" class="spinner-btn" onclick="adjustInput(this, 2.5)">+</button>
            </div>
            <span class="set-unit">kg</span>
            <button type="button" class="set-check" onclick="toggleSetComplete(this)"></button>
          \`;
          container.appendChild(setRow);
          saveProgress();
        };

        window.cancelWorkout = function() {
          if (confirm('Are you sure you want to cancel this workout? Progress will be lost.')) {
            stopTimer();
            localStorage.removeItem(STORAGE_KEY);
            htmx.ajax('GET', '/pages/workouts', { target: '#content', swap: 'innerHTML transition:true' });
          }
        };

        window.finishWorkout = async function() {
          stopTimer();

          // First create a workout record
          const createRes = await fetch('/api/workouts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ template_id: templateId })
          });

          if (!createRes.ok) {
            alert('Failed to save workout');
            return;
          }

          const { workout_id: workoutId } = await createRes.json();

          const form = document.getElementById('workout-form');
          const formData = new FormData(form);
          const sets = [];

          // Parse form data into sets
          for (const [key, value] of formData.entries()) {
            if (key.startsWith('reps_') && value) {
              const parts = key.split('_');
              const exerciseId = parseInt(parts[1]);
              const setNum = parseInt(parts[2]);
              const weight = formData.get(\`weight_\${exerciseId}_\${setNum}\`);

              if (weight) {
                sets.push({
                  exercise_id: exerciseId,
                  set_number: setNum + 1,
                  weight: parseFloat(weight),
                  reps: parseInt(value)
                });
              }
            }
          }

          const response = await fetch('/api/workouts/' + workoutId + '/complete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sets })
          });

          if (response.ok) {
            localStorage.removeItem(STORAGE_KEY);
            htmx.ajax('GET', '/pages/home', { target: '#content', swap: 'innerHTML transition:true' });
            document.querySelector('[data-page="home"]').click();
          }
        };

        // Restore on page load
        restoreProgress();
        })();
      </script>
    </div>
  `);
});

// ============== API ROUTES ==============

// Get all exercises
app.get("/api/exercises", (c) => {
  const exercises = db
    .query("SELECT * FROM exercises ORDER BY muscle_group, name")
    .all();
  return c.json(exercises);
});

// Create workout
app.post("/api/workouts", async (c) => {
  const user = requireAuthApi(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const { template_id } = (await c.req.json()) as { template_id: number };

  const result = db
    .prepare("INSERT INTO workouts (user_id, template_id) VALUES (?, ?)")
    .run(user.id, template_id);

  return c.json({ workout_id: result.lastInsertRowid });
});

// Create template
app.post("/api/templates", async (c) => {
  const user = requireAuthApi(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const formData = await c.req.formData();
  const name = formData.get("name") as string;
  const restTime = parseInt((formData.get("rest_time") as string) || "180");
  const days = formData.getAll("days").map((d) => parseInt(d as string));
  const exercisesJson = formData.get("exercises") as string;
  const exercises = JSON.parse(exercisesJson || "[]") as {
    id: number;
    sets: { reps: number; weight: number }[];
    increment?: number;
  }[];

  if (!name) {
    return c.html(
      `<div class="page"><div class="empty-state">Name is required</div></div>`,
      400,
    );
  }

  // Create template
  const result = db
    .prepare(
      "INSERT INTO templates (user_id, name, rest_time) VALUES (?, ?, ?)",
    )
    .run(user.id, name, restTime);
  const templateId = result.lastInsertRowid;

  // Add exercises with sets data (JSON array of {reps, weight}) and increment
  const insertExercise = db.prepare(
    "INSERT INTO template_exercises (template_id, exercise_id, sort_order, sets_data, increment) VALUES (?, ?, ?, ?, ?)",
  );
  exercises.forEach((ex, index) => {
    const setsData = JSON.stringify(ex.sets || [{ reps: 10, weight: 20 }]);
    const increment = ex.increment || 2.5;
    insertExercise.run(templateId, ex.id, index, setsData, increment);
  });

  // Set schedule
  const deleteSchedule = db.prepare(
    "DELETE FROM schedule WHERE user_id = ? AND template_id = ?",
  );
  deleteSchedule.run(user.id, templateId);

  const insertSchedule = db.prepare(
    "INSERT OR REPLACE INTO schedule (user_id, day_of_week, template_id) VALUES (?, ?, ?)",
  );
  days.forEach((day) => {
    insertSchedule.run(user.id, day, templateId);
  });

  // Redirect to workouts page
  return c.redirect("/pages/workouts", 303);
});

// Update template
app.put("/api/templates/:id", async (c) => {
  const user = requireAuthApi(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const id = parseInt(c.req.param("id"));
  const formData = await c.req.formData();
  const name = formData.get("name") as string;
  const restTime = parseInt((formData.get("rest_time") as string) || "180");
  const days = formData.getAll("days").map((d) => parseInt(d as string));
  const exercisesJson = formData.get("exercises") as string;
  const exercises = JSON.parse(exercisesJson || "[]") as {
    id: number;
    sets: { reps: number; weight: number }[];
    increment?: number;
  }[];

  if (!name) {
    return c.html(
      `<div class="page"><div class="empty-state">Name is required</div></div>`,
      400,
    );
  }

  // Update template name and rest time
  db.prepare(
    "UPDATE templates SET name = ?, rest_time = ? WHERE id = ? AND user_id = ?",
  ).run(name, restTime, id, user.id);

  // Delete existing exercises and re-add them
  db.prepare("DELETE FROM template_exercises WHERE template_id = ?").run(id);

  const insertExercise = db.prepare(
    "INSERT INTO template_exercises (template_id, exercise_id, sort_order, sets_data, increment) VALUES (?, ?, ?, ?, ?)",
  );
  exercises.forEach((ex, index) => {
    const setsData = JSON.stringify(ex.sets || [{ reps: 10, weight: 20 }]);
    const increment = ex.increment || 2.5;
    insertExercise.run(id, ex.id, index, setsData, increment);
  });

  // Update schedule - clear old entries for this template
  db.prepare("DELETE FROM schedule WHERE user_id = ? AND template_id = ?").run(
    user.id,
    id,
  );

  // Also clear any schedule entries for days we're about to set (to avoid conflicts)
  const insertSchedule = db.prepare(
    "INSERT OR REPLACE INTO schedule (user_id, day_of_week, template_id) VALUES (?, ?, ?)",
  );
  days.forEach((day) => {
    insertSchedule.run(user.id, day, id);
  });

  // Redirect to workouts page
  return c.redirect("/pages/workouts", 303);
});

// Delete template
app.delete("/api/templates/:id", (c) => {
  const user = requireAuthApi(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const id = parseInt(c.req.param("id"));

  // Delete schedule entries
  db.prepare("DELETE FROM schedule WHERE template_id = ?").run(id);

  // Delete template (cascade will delete exercises)
  db.prepare("DELETE FROM templates WHERE id = ? AND user_id = ?").run(
    id,
    user.id,
  );

  return c.redirect("/pages/workouts", 303);
});

// Complete workout
app.post("/api/workouts/:id/complete", async (c) => {
  const workoutId = parseInt(c.req.param("id"));
  const { sets } = (await c.req.json()) as {
    sets: {
      exercise_id: number;
      set_number: number;
      weight: number;
      reps: number;
    }[];
  };

  // Insert all sets
  const insertSet = db.prepare(
    "INSERT INTO sets (workout_id, exercise_id, set_number, weight, reps) VALUES (?, ?, ?, ?, ?)",
  );

  for (const set of sets) {
    insertSet.run(
      workoutId,
      set.exercise_id,
      set.set_number,
      set.weight,
      set.reps,
    );
  }

  // Mark workout as completed
  db.prepare(
    "UPDATE workouts SET completed_at = CURRENT_TIMESTAMP WHERE id = ?",
  ).run(workoutId);

  return c.json({ success: true });
});

// Update settings
app.post("/api/settings/units", async (c) => {
  const user = requireAuthApi(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const formData = await c.req.formData();
  const units = formData.get("units") as string;

  db.prepare("UPDATE users SET units = ? WHERE id = ?").run(units, user.id);

  return c.json({ success: true });
});

// =====================
// AUTH ROUTES
// =====================

// Login/Register page (public)
app.get("/login", (c) => {
  const sessionId = getCookie(c, "session");
  const user = getUserFromSession(sessionId);

  // Already logged in, redirect to home
  if (user) {
    return c.redirect("/");
  }

  return c.html(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
      <title>GymLog - Login</title>
      <link rel="stylesheet" href="/styles.css">
      <script src="https://unpkg.com/htmx.org@1.9.10"></script>
    </head>
    <body>
      <div class="app">
        <div class="content" style="display: flex; flex-direction: column; justify-content: center; padding-bottom: 0;">
          <div class="auth-container">
            <div class="auth-header">
              <h1 class="auth-title">GymLog</h1>
              <p class="auth-subtitle">Track your gains</p>
            </div>

            <div id="auth-form-container">
              <form hx-post="/api/auth/login" hx-target="#auth-form-container" hx-swap="innerHTML">
                <div class="form-group">
                  <label class="form-label">Username</label>
                  <input type="text" name="username" class="form-input" placeholder="Enter username" required autofocus>
                </div>

                <div class="form-group">
                  <label class="form-label">Password</label>
                  <input type="password" name="password" class="form-input" placeholder="Enter password" required>
                </div>

                <button type="submit" class="btn btn-primary btn-full" style="margin-top: 8px;">
                  Login
                </button>
              </form>

              <div class="auth-switch">
                <span>Don't have an account?</span>
                <button type="button" class="auth-switch-btn" onclick="showRegister()">Register</button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <script>
        function showRegister() {
          document.getElementById('auth-form-container').innerHTML = \`
            <form hx-post="/api/auth/register" hx-target="#auth-form-container" hx-swap="innerHTML">
              <div class="form-group">
                <label class="form-label">Username</label>
                <input type="text" name="username" class="form-input" placeholder="Choose a username" required autofocus>
              </div>

              <div class="form-group">
                <label class="form-label">Password</label>
                <input type="password" name="password" class="form-input" placeholder="Choose a password" required>
              </div>

              <button type="submit" class="btn btn-primary btn-full" style="margin-top: 8px;">
                Create Account
              </button>
            </form>

            <div class="auth-switch">
              <span>Already have an account?</span>
              <button type="button" class="auth-switch-btn" onclick="showLogin()">Login</button>
            </div>
          \`;
          htmx.process(document.getElementById('auth-form-container'));
        }

        function showLogin() {
          document.getElementById('auth-form-container').innerHTML = \`
            <form hx-post="/api/auth/login" hx-target="#auth-form-container" hx-swap="innerHTML">
              <div class="form-group">
                <label class="form-label">Username</label>
                <input type="text" name="username" class="form-input" placeholder="Enter username" required autofocus>
              </div>

              <div class="form-group">
                <label class="form-label">Password</label>
                <input type="password" name="password" class="form-input" placeholder="Enter password" required>
              </div>

              <button type="submit" class="btn btn-primary btn-full" style="margin-top: 8px;">
                Login
              </button>
            </form>

            <div class="auth-switch">
              <span>Don't have an account?</span>
              <button type="button" class="auth-switch-btn" onclick="showRegister()">Register</button>
            </div>
          \`;
          htmx.process(document.getElementById('auth-form-container'));
        }
      </script>
    </body>
    </html>
  `);
});

// Register API
app.post("/api/auth/register", async (c) => {
  const formData = await c.req.formData();
  const username = ((formData.get("username") as string) || "").trim();
  const password = (formData.get("password") as string) || "";

  if (!username || !password) {
    return c.html(`
      <div class="auth-error">Username and password are required</div>
      <form hx-post="/api/auth/register" hx-target="#auth-form-container" hx-swap="innerHTML">
        <div class="form-group">
          <label class="form-label">Username</label>
          <input type="text" name="username" class="form-input" placeholder="Choose a username" value="${username}" required autofocus>
        </div>
        <div class="form-group">
          <label class="form-label">Password</label>
          <input type="password" name="password" class="form-input" placeholder="Choose a password" required>
        </div>
        <button type="submit" class="btn btn-primary btn-full" style="margin-top: 8px;">Create Account</button>
      </form>
      <div class="auth-switch">
        <span>Already have an account?</span>
        <button type="button" class="auth-switch-btn" onclick="showLogin()">Login</button>
      </div>
    `);
  }

  // Check if username already exists
  const existingUser = db
    .query("SELECT id FROM users WHERE username = ?")
    .get(username);
  if (existingUser) {
    return c.html(`
      <div class="auth-error">Username already taken</div>
      <form hx-post="/api/auth/register" hx-target="#auth-form-container" hx-swap="innerHTML">
        <div class="form-group">
          <label class="form-label">Username</label>
          <input type="text" name="username" class="form-input" placeholder="Choose a username" required autofocus>
        </div>
        <div class="form-group">
          <label class="form-label">Password</label>
          <input type="password" name="password" class="form-input" placeholder="Choose a password" required>
        </div>
        <button type="submit" class="btn btn-primary btn-full" style="margin-top: 8px;">Create Account</button>
      </form>
      <div class="auth-switch">
        <span>Already have an account?</span>
        <button type="button" class="auth-switch-btn" onclick="showLogin()">Login</button>
      </div>
    `);
  }

  // Create user
  const passwordHash = await hashPassword(password);
  const result = db
    .prepare(
      "INSERT INTO users (username, password_hash, name) VALUES (?, ?, ?)",
    )
    .run(username, passwordHash, username);

  const userId = result.lastInsertRowid as number;

  // Create session
  const sessionId = createSession(userId);

  // Set cookie and redirect
  setCookie(c, "session", sessionId, {
    httpOnly: true,
    secure: false, // Set to true in production with HTTPS
    sameSite: "Lax",
    maxAge: SESSION_DURATION_MS / 1000,
    path: "/",
  });

  c.header("HX-Redirect", "/");
  return c.text("Success");
});

// Login API
app.post("/api/auth/login", async (c) => {
  const formData = await c.req.formData();
  const username = ((formData.get("username") as string) || "").trim();
  const password = (formData.get("password") as string) || "";

  if (!username || !password) {
    return c.html(`
      <div class="auth-error">Username and password are required</div>
      <form hx-post="/api/auth/login" hx-target="#auth-form-container" hx-swap="innerHTML">
        <div class="form-group">
          <label class="form-label">Username</label>
          <input type="text" name="username" class="form-input" placeholder="Enter username" value="${username}" required autofocus>
        </div>
        <div class="form-group">
          <label class="form-label">Password</label>
          <input type="password" name="password" class="form-input" placeholder="Enter password" required>
        </div>
        <button type="submit" class="btn btn-primary btn-full" style="margin-top: 8px;">Login</button>
      </form>
      <div class="auth-switch">
        <span>Don't have an account?</span>
        <button type="button" class="auth-switch-btn" onclick="showRegister()">Register</button>
      </div>
    `);
  }

  // Find user
  const user = db
    .query("SELECT id, password_hash FROM users WHERE username = ?")
    .get(username) as { id: number; password_hash: string } | null;

  if (!user) {
    return c.html(`
      <div class="auth-error">Invalid username or password</div>
      <form hx-post="/api/auth/login" hx-target="#auth-form-container" hx-swap="innerHTML">
        <div class="form-group">
          <label class="form-label">Username</label>
          <input type="text" name="username" class="form-input" placeholder="Enter username" value="${username}" required autofocus>
        </div>
        <div class="form-group">
          <label class="form-label">Password</label>
          <input type="password" name="password" class="form-input" placeholder="Enter password" required>
        </div>
        <button type="submit" class="btn btn-primary btn-full" style="margin-top: 8px;">Login</button>
      </form>
      <div class="auth-switch">
        <span>Don't have an account?</span>
        <button type="button" class="auth-switch-btn" onclick="showRegister()">Register</button>
      </div>
    `);
  }

  // Verify password
  const valid = await verifyPassword(password, user.password_hash);
  if (!valid) {
    return c.html(`
      <div class="auth-error">Invalid username or password</div>
      <form hx-post="/api/auth/login" hx-target="#auth-form-container" hx-swap="innerHTML">
        <div class="form-group">
          <label class="form-label">Username</label>
          <input type="text" name="username" class="form-input" placeholder="Enter username" value="${username}" required autofocus>
        </div>
        <div class="form-group">
          <label class="form-label">Password</label>
          <input type="password" name="password" class="form-input" placeholder="Enter password" required>
        </div>
        <button type="submit" class="btn btn-primary btn-full" style="margin-top: 8px;">Login</button>
      </form>
      <div class="auth-switch">
        <span>Don't have an account?</span>
        <button type="button" class="auth-switch-btn" onclick="showRegister()">Register</button>
      </div>
    `);
  }

  // Create session
  const sessionId = createSession(user.id);

  // Set cookie and redirect
  setCookie(c, "session", sessionId, {
    httpOnly: true,
    secure: false, // Set to true in production with HTTPS
    sameSite: "Lax",
    maxAge: SESSION_DURATION_MS / 1000,
    path: "/",
  });

  c.header("HX-Redirect", "/");
  return c.text("Success");
});

// Logout API
app.post("/api/auth/logout", (c) => {
  const sessionId = getCookie(c, "session");

  if (sessionId) {
    db.prepare("DELETE FROM sessions WHERE id = ?").run(sessionId);
  }

  deleteCookie(c, "session", { path: "/" });
  c.header("HX-Redirect", "/login");
  return c.text("Logged out");
});

// =====================
// SERVE STATIC & APP
// =====================

// Serve static files
app.use("/styles.css", serveStatic({ path: "./public/styles.css" }));

// Auth check middleware for SPA routes
const protectedRoutes = [
  "/",
  "/workouts",
  "/workouts/new",
  "/workouts/:id",
  "/workouts/:id/active",
  "/stats",
  "/account",
];

// Cache the index.html content
const indexHtml = await Bun.file("./public/index.html").text();

// Protected SPA routes - check auth and serve index.html or redirect to login
app.get("/", (c) => {
  const sessionId = getCookie(c, "session");
  const user = getUserFromSession(sessionId);
  if (!user) return c.redirect("/login");
  return c.html(indexHtml);
});

app.get("/workouts", (c) => {
  const sessionId = getCookie(c, "session");
  const user = getUserFromSession(sessionId);
  if (!user) return c.redirect("/login");
  return c.html(indexHtml);
});

app.get("/workouts/new", (c) => {
  const sessionId = getCookie(c, "session");
  const user = getUserFromSession(sessionId);
  if (!user) return c.redirect("/login");
  return c.html(indexHtml);
});

app.get("/workouts/:id", (c) => {
  const sessionId = getCookie(c, "session");
  const user = getUserFromSession(sessionId);
  if (!user) return c.redirect("/login");
  return c.html(indexHtml);
});

app.get("/workouts/:id/active", (c) => {
  const sessionId = getCookie(c, "session");
  const user = getUserFromSession(sessionId);
  if (!user) return c.redirect("/login");
  return c.html(indexHtml);
});

app.get("/stats", (c) => {
  const sessionId = getCookie(c, "session");
  const user = getUserFromSession(sessionId);
  if (!user) return c.redirect("/login");
  return c.html(indexHtml);
});

app.get("/account", (c) => {
  const sessionId = getCookie(c, "session");
  const user = getUserFromSession(sessionId);
  if (!user) return c.redirect("/login");
  return c.html(indexHtml);
});

export default {
  port: 3000,
  fetch: app.fetch,
};

console.log("Server running at http://localhost:3000");
