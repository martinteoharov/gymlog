import { Hono, type Context } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { cors } from "hono/cors";
import { db } from "./db";

const app = new Hono();

// Environment detection
const isProduction = process.env.NODE_ENV === "production";

// Enable CORS for mobile app
app.use(
  "*",
  cors({
    origin: (origin) => {
      // Allow requests from these origins
      const allowed = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:4173",
        "http://127.0.0.1:4173",
        "capacitor://localhost",
        "ionic://localhost",
      ];
      // Return the origin if allowed, or first allowed origin for requests without origin
      return allowed.includes(origin) ? origin : allowed[0];
    },
    credentials: true,
  }),
);

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

// Set session cookie with proper security settings
function setSessionCookie(c: Context, sessionId: string): void {
  setCookie(c, "session", sessionId, {
    httpOnly: true,
    secure: isProduction,
    sameSite: "Lax",
    maxAge: SESSION_DURATION_MS / 1000,
    path: "/",
  });
}

// Deactivate all programmes for a user except one
function deactivateOtherProgrammes(userId: number, exceptId?: number): void {
  if (exceptId !== undefined) {
    db.prepare("UPDATE programmes SET is_active = 0 WHERE user_id = ? AND id != ?").run(userId, exceptId);
  } else {
    db.prepare("UPDATE programmes SET is_active = 0 WHERE user_id = ?").run(userId);
  }
}

// Insert template exercises
function insertTemplateExercises(
  templateId: number,
  exercises: { id: number; sets?: { reps: number; weight: number }[]; increment?: number }[]
): void {
  const stmt = db.prepare(
    "INSERT INTO template_exercises (template_id, exercise_id, sort_order, sets_data, increment) VALUES (?, ?, ?, ?, ?)"
  );
  exercises.forEach((ex, index) => {
    const setsData = JSON.stringify(ex.sets || [{ reps: 10, weight: 20 }]);
    const increment = ex.increment || 2.5;
    stmt.run(templateId, ex.id, index, setsData, increment);
  });
}

// Update schedule for a template
function updateTemplateSchedule(userId: number, templateId: number, days: number[]): void {
  db.prepare("DELETE FROM schedule WHERE user_id = ? AND template_id = ?").run(userId, templateId);
  const stmt = db.prepare("INSERT OR REPLACE INTO schedule (user_id, day_of_week, template_id) VALUES (?, ?, ?)");
  days.forEach((day) => {
    stmt.run(userId, day, templateId);
  });
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

// Helper to require auth for API routes - returns user or null
function requireAuth(
  c: any,
): { id: number; username: string; name: string } | null {
  const sessionId = getCookie(c, "session");
  return getUserFromSession(sessionId);
}

// Constants
const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// Types
interface Template {
  id: number;
  user_id: number;
  name: string;
  rest_time: number;
  created_at: string;
  updated_at?: number;
}

interface TemplateExercise {
  id: number;
  template_id: number;
  exercise_id: number;
  sort_order: number;
  sets_data: string;
  increment: number;
  exercise_name?: string;
  muscle_group?: string;
}

interface Exercise {
  id: number;
  name: string;
  muscle_group: string;
  created_at: string;
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

// ============== AUTH ROUTES ==============

// Get current user
app.get("/api/auth/user", (c) => {
  const user = requireAuth(c);
  if (!user) return c.json(null);
  return c.json({ id: user.id, username: user.username, name: user.name });
});

// Register
app.post("/api/auth/register", async (c) => {
  const body = await c.req.json();
  const username = (body.username || "").trim();
  const password = body.password || "";
  const name = body.name || username;

  if (!username || !password) {
    return c.json({ error: "Username and password are required" }, 400);
  }

  const existingUser = db
    .query("SELECT id FROM users WHERE username = ?")
    .get(username);

  if (existingUser) {
    return c.json({ error: "Username already taken" }, 400);
  }

  const passwordHash = await hashPassword(password);
  const result = db
    .prepare(
      "INSERT INTO users (username, password_hash, name) VALUES (?, ?, ?)",
    )
    .run(username, passwordHash, name);

  const userId = result.lastInsertRowid as number;
  const sessionId = createSession(userId);
  setSessionCookie(c, sessionId);

  return c.json({
    success: true,
    user: { id: userId, username, name },
  });
});

// Login
app.post("/api/auth/login", async (c) => {
  const body = await c.req.json();
  const username = (body.username || "").trim();
  const password = body.password || "";

  if (!username || !password) {
    return c.json({ error: "Username and password are required" }, 400);
  }

  const user = db
    .query(
      "SELECT id, username, name, password_hash FROM users WHERE username = ?",
    )
    .get(username) as {
    id: number;
    username: string;
    name: string;
    password_hash: string;
  } | null;

  if (!user) {
    return c.json({ error: "Invalid username or password" }, 401);
  }

  const valid = await verifyPassword(password, user.password_hash);
  if (!valid) {
    return c.json({ error: "Invalid username or password" }, 401);
  }

  const sessionId = createSession(user.id);
  setSessionCookie(c, sessionId);

  return c.json({
    success: true,
    user: { id: user.id, username: user.username, name: user.name },
  });
});

// Logout
app.post("/api/auth/logout", (c) => {
  const sessionId = getCookie(c, "session");

  if (sessionId) {
    db.prepare("DELETE FROM sessions WHERE id = ?").run(sessionId);
  }

  deleteCookie(c, "session", { path: "/" });
  return c.json({ success: true });
});

// ============== EXERCISES ==============

app.get("/api/exercises", (c) => {
  const query = c.req.query("q")?.trim();

  if (query) {
    // Fuzzy search using LIKE with wildcards between each character
    // e.g., "bp" becomes "%b%p%" to match "Bench Press"
    const fuzzyPattern = "%" + query.split("").join("%") + "%";
    const exercises = db
      .query(`
        SELECT * FROM exercises
        WHERE LOWER(name) LIKE LOWER(?)
        ORDER BY
          CASE
            WHEN LOWER(name) LIKE LOWER(?) THEN 0
            WHEN LOWER(name) LIKE LOWER(?) THEN 1
            ELSE 2
          END,
          muscle_group, name
        LIMIT 50
      `)
      .all(fuzzyPattern, query + "%", "%" + query + "%") as Exercise[];
    return c.json(exercises);
  }

  const exercises = db
    .query("SELECT * FROM exercises ORDER BY muscle_group, name")
    .all() as Exercise[];
  return c.json(exercises);
});

// ============== TEMPLATES ==============

// Get all templates for user
app.get("/api/templates", (c) => {
  const user = requireAuth(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const templates = db
    .query(`SELECT * FROM templates WHERE user_id = ? ORDER BY name`)
    .all(user.id) as Template[];

  const result = templates.map((template) => {
    const exercises = db
      .query(
        `SELECT te.exercise_id, e.name as exercise_name FROM template_exercises te
         JOIN exercises e ON te.exercise_id = e.id
         WHERE te.template_id = ? ORDER BY te.sort_order`,
      )
      .all(template.id) as { exercise_id: number; exercise_name: string }[];

    const scheduledDays = db
      .query(
        `SELECT day_of_week FROM schedule WHERE user_id = ? AND template_id = ?`,
      )
      .all(user.id, template.id) as { day_of_week: number }[];

    return {
      ...template,
      exercises: exercises.map((e) => ({
        exercise_id: e.exercise_id,
        exercise_name: e.exercise_name,
      })),
      scheduledDays: scheduledDays.map((s) => s.day_of_week),
    };
  });

  return c.json(result);
});

// Get single template with full details
app.get("/api/templates/:id", (c) => {
  const user = requireAuth(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const id = parseInt(c.req.param("id"));

  const template = db
    .query("SELECT * FROM templates WHERE id = ? AND user_id = ?")
    .get(id, user.id) as Template | null;

  if (!template) {
    return c.json({ error: "Template not found" }, 404);
  }

  const exercises = db
    .query(
      `SELECT te.*, e.name as exercise_name, e.muscle_group
       FROM template_exercises te JOIN exercises e ON te.exercise_id = e.id
       WHERE te.template_id = ? ORDER BY te.sort_order`,
    )
    .all(id) as TemplateExercise[];

  const scheduledDays = db
    .query(
      `SELECT day_of_week FROM schedule WHERE user_id = ? AND template_id = ?`,
    )
    .all(user.id, id) as { day_of_week: number }[];

  return c.json({
    ...template,
    exercises: exercises.map((ex) => ({
      id: ex.id,
      exercise_id: ex.exercise_id,
      exercise_name: ex.exercise_name,
      muscle_group: ex.muscle_group,
      sort_order: ex.sort_order,
      sets_data: ex.sets_data,
      increment: ex.increment,
    })),
    scheduledDays: scheduledDays.map((s) => s.day_of_week),
  });
});

// Get template for active workout (with history and progressive overload)
app.get("/api/templates/:id/active", (c) => {
  const user = requireAuth(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const templateId = parseInt(c.req.param("id"));

  const template = db
    .query("SELECT * FROM templates WHERE id = ? AND user_id = ?")
    .get(templateId, user.id) as Template | null;

  if (!template) {
    return c.json({ error: "Template not found" }, 404);
  }

  const exercises = db
    .query(
      `SELECT te.*, e.name as exercise_name, e.muscle_group
       FROM template_exercises te JOIN exercises e ON te.exercise_id = e.id
       WHERE te.template_id = ? ORDER BY te.sort_order`,
    )
    .all(templateId) as TemplateExercise[];

  const exercisesWithHistory = exercises.map((ex) => {
    // Get last completed workout with this exercise
    const lastWorkout = db
      .query(
        `SELECT w.id, w.completed_at FROM workouts w
         JOIN sets s ON s.workout_id = w.id
         WHERE w.user_id = ? AND s.exercise_id = ? AND w.completed_at IS NOT NULL
         ORDER BY w.completed_at DESC LIMIT 1`,
      )
      .get(user.id, ex.exercise_id) as {
      id: number;
      completed_at: string;
    } | null;

    let lastSets: { weight: number; reps: number }[] = [];
    if (lastWorkout) {
      lastSets = db
        .query(
          `SELECT weight, reps FROM sets
           WHERE workout_id = ? AND exercise_id = ? ORDER BY set_number`,
        )
        .all(lastWorkout.id, ex.exercise_id) as {
        weight: number;
        reps: number;
      }[];
    }

    const templateSets = JSON.parse(ex.sets_data || "[]") as {
      reps: number;
      weight: number;
    }[];

    // Apply progressive overload per set
    const increment = ex.increment || 2.5;
    const adjustedSets = templateSets.map((set, i) => {
      const lastSet = lastSets[i];
      const targetReps = set.reps;
      const setCompleted = lastSet && lastSet.reps >= targetReps;
      return {
        reps: set.reps,
        weight: setCompleted ? set.weight + increment : set.weight,
      };
    });

    return {
      exercise_id: ex.exercise_id,
      exercise_name: ex.exercise_name,
      muscle_group: ex.muscle_group,
      increment: ex.increment,
      lastSets,
      templateSets: adjustedSets,
    };
  });

  return c.json({
    template: {
      id: template.id,
      name: template.name,
      rest_time: template.rest_time,
    },
    exercises: exercisesWithHistory,
  });
});

// Create template
app.post("/api/templates", async (c) => {
  const user = requireAuth(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const body = await c.req.json();
  const { name, rest_time = 180, days = [], exercises = [] } = body;

  if (!name) {
    return c.json({ error: "Name is required" }, 400);
  }

  const result = db
    .prepare(
      "INSERT INTO templates (user_id, name, rest_time) VALUES (?, ?, ?)",
    )
    .run(user.id, name, rest_time);
  const templateId = result.lastInsertRowid as number;

  insertTemplateExercises(templateId, exercises);
  updateTemplateSchedule(user.id, templateId, days);

  return c.json({ id: templateId });
});

// Update template
app.put("/api/templates/:id", async (c) => {
  const user = requireAuth(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const id = parseInt(c.req.param("id"));
  const body = await c.req.json();
  const { name, rest_time = 180, days = [], exercises = [] } = body;

  if (!name) {
    return c.json({ error: "Name is required" }, 400);
  }

  // Verify ownership
  const existing = db
    .query("SELECT id FROM templates WHERE id = ? AND user_id = ?")
    .get(id, user.id);
  if (!existing) {
    return c.json({ error: "Template not found" }, 404);
  }

  db.prepare("UPDATE templates SET name = ?, rest_time = ? WHERE id = ?").run(
    name,
    rest_time,
    id,
  );

  // Replace exercises
  db.prepare("DELETE FROM template_exercises WHERE template_id = ?").run(id);
  insertTemplateExercises(id, exercises);
  updateTemplateSchedule(user.id, id, days);

  return c.json({ success: true });
});

// Delete template
app.delete("/api/templates/:id", (c) => {
  const user = requireAuth(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const id = parseInt(c.req.param("id"));

  db.prepare("DELETE FROM schedule WHERE template_id = ?").run(id);
  db.prepare("DELETE FROM templates WHERE id = ? AND user_id = ?").run(
    id,
    user.id,
  );

  return c.json({ success: true });
});

// ============== PROGRAMMES ==============

interface Programme {
  id: number;
  user_id: number;
  name: string;
  is_active: number;
  created_at: string;
}

// Get all programmes for user
app.get("/api/programmes", (c) => {
  const user = requireAuth(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const programmes = db
    .query(`SELECT * FROM programmes WHERE user_id = ? ORDER BY is_active DESC, name`)
    .all(user.id) as Programme[];

  // Include template count for each programme
  const result = programmes.map((prog) => {
    const templateCount = db
      .query(`SELECT COUNT(*) as count FROM templates WHERE programme_id = ?`)
      .get(prog.id) as { count: number };
    return {
      ...prog,
      template_count: templateCount.count,
    };
  });

  return c.json(result);
});

// Get single programme with templates
app.get("/api/programmes/:id", (c) => {
  const user = requireAuth(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const id = parseInt(c.req.param("id"));

  const programme = db
    .query("SELECT * FROM programmes WHERE id = ? AND user_id = ?")
    .get(id, user.id) as Programme | null;

  if (!programme) {
    return c.json({ error: "Programme not found" }, 404);
  }

  const templates = db
    .query(`SELECT * FROM templates WHERE programme_id = ? ORDER BY name`)
    .all(id) as Template[];

  // Get exercises for each template
  const templatesWithExercises = templates.map((template) => {
    const exercises = db
      .query(
        `SELECT te.exercise_id, e.name as exercise_name FROM template_exercises te
         JOIN exercises e ON te.exercise_id = e.id
         WHERE te.template_id = ? ORDER BY te.sort_order`,
      )
      .all(template.id) as { exercise_id: number; exercise_name: string }[];

    return {
      ...template,
      exercises: exercises.map((e) => ({
        exercise_id: e.exercise_id,
        exercise_name: e.exercise_name,
      })),
    };
  });

  return c.json({
    ...programme,
    templates: templatesWithExercises,
  });
});

// Create programme
app.post("/api/programmes", async (c) => {
  const user = requireAuth(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const body = await c.req.json();
  const { name, is_active = 0 } = body;

  if (!name) {
    return c.json({ error: "Name is required" }, 400);
  }

  // If setting as active, deactivate others first
  if (is_active) {
    deactivateOtherProgrammes(user.id);
  }

  const result = db
    .prepare(
      "INSERT INTO programmes (user_id, name, is_active) VALUES (?, ?, ?)",
    )
    .run(user.id, name, is_active ? 1 : 0);

  return c.json({ id: result.lastInsertRowid });
});

// Update programme
app.put("/api/programmes/:id", async (c) => {
  const user = requireAuth(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const id = parseInt(c.req.param("id"));
  const body = await c.req.json();
  const { name } = body;

  if (!name) {
    return c.json({ error: "Name is required" }, 400);
  }

  // Verify ownership
  const existing = db
    .query("SELECT id FROM programmes WHERE id = ? AND user_id = ?")
    .get(id, user.id);
  if (!existing) {
    return c.json({ error: "Programme not found" }, 404);
  }

  db.prepare("UPDATE programmes SET name = ? WHERE id = ?").run(name, id);

  return c.json({ success: true });
});

// Delete programme (and its templates)
app.delete("/api/programmes/:id", (c) => {
  const user = requireAuth(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const id = parseInt(c.req.param("id"));

  // Verify ownership
  const existing = db
    .query("SELECT id FROM programmes WHERE id = ? AND user_id = ?")
    .get(id, user.id);
  if (!existing) {
    return c.json({ error: "Programme not found" }, 404);
  }

  // Get template IDs to clean up related data
  const templates = db
    .query("SELECT id FROM templates WHERE programme_id = ?")
    .all(id) as { id: number }[];

  for (const template of templates) {
    db.prepare("DELETE FROM schedule WHERE template_id = ?").run(template.id);
    db.prepare("DELETE FROM template_exercises WHERE template_id = ?").run(template.id);
  }

  db.prepare("DELETE FROM templates WHERE programme_id = ?").run(id);
  db.prepare("DELETE FROM programmes WHERE id = ? AND user_id = ?").run(id, user.id);

  return c.json({ success: true });
});

// Activate programme
app.post("/api/programmes/:id/activate", (c) => {
  const user = requireAuth(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const id = parseInt(c.req.param("id"));

  // Verify ownership
  const existing = db
    .query("SELECT id FROM programmes WHERE id = ? AND user_id = ?")
    .get(id, user.id);
  if (!existing) {
    return c.json({ error: "Programme not found" }, 404);
  }

  // Deactivate all others, then activate this one
  deactivateOtherProgrammes(user.id, id);
  db.prepare("UPDATE programmes SET is_active = 1 WHERE id = ?").run(id);

  return c.json({ success: true });
});

// ============== SCHEDULE ==============

app.get("/api/schedule", (c) => {
  const user = requireAuth(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const schedule = db
    .query(
      `SELECT s.day_of_week, s.template_id, t.name as template_name
       FROM schedule s LEFT JOIN templates t ON s.template_id = t.id
       WHERE s.user_id = ? ORDER BY s.day_of_week`,
    )
    .all(user.id) as {
    day_of_week: number;
    template_id: number | null;
    template_name: string | null;
  }[];

  return c.json(schedule);
});

// ============== WORKOUTS ==============

// Create workout
app.post("/api/workouts", async (c) => {
  const user = requireAuth(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const { template_id } = await c.req.json();

  const result = db
    .prepare("INSERT INTO workouts (user_id, template_id) VALUES (?, ?)")
    .run(user.id, template_id);

  return c.json({ workout_id: result.lastInsertRowid });
});

// Complete workout
app.post("/api/workouts/:id/complete", async (c) => {
  const user = requireAuth(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const workoutId = parseInt(c.req.param("id"));
  const { sets } = await c.req.json();

  // Verify ownership
  const workout = db
    .query("SELECT id FROM workouts WHERE id = ? AND user_id = ?")
    .get(workoutId, user.id);
  if (!workout) {
    return c.json({ error: "Workout not found" }, 404);
  }

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

  db.prepare(
    "UPDATE workouts SET completed_at = CURRENT_TIMESTAMP WHERE id = ?",
  ).run(workoutId);

  return c.json({ success: true });
});

// Get workout history
app.get("/api/workouts", (c) => {
  const user = requireAuth(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const limit = parseInt(c.req.query("limit") || "10");

  const workouts = db
    .query(
      `SELECT w.*, t.name as template_name FROM workouts w
       LEFT JOIN templates t ON w.template_id = t.id
       WHERE w.user_id = ? AND w.completed_at IS NOT NULL
       ORDER BY w.started_at DESC LIMIT ?`,
    )
    .all(user.id, limit) as Workout[];

  return c.json(workouts);
});

// ============== STATS ==============

app.get("/api/stats", (c) => {
  const user = requireAuth(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const totalWorkouts = db
    .query(
      "SELECT COUNT(*) as count FROM workouts WHERE user_id = ? AND completed_at IS NOT NULL",
    )
    .get(user.id) as { count: number };

  const thisWeekWorkouts = db
    .query(
      `SELECT COUNT(*) as count FROM workouts
       WHERE user_id = ? AND completed_at IS NOT NULL
       AND date(started_at) >= date('now', '-7 days')`,
    )
    .get(user.id) as { count: number };

  return c.json({
    totalWorkouts: totalWorkouts.count,
    thisWeekWorkouts: thisWeekWorkouts.count,
  });
});

// Get weekly consistency data (last 12 weeks)
// Consistency = completed workouts / scheduled workouts per week
app.get("/api/stats/consistency", (c) => {
  const user = requireAuth(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const weeks = parseInt(c.req.query("weeks") || "12");

  // Get scheduled days count (how many days per week user has workouts scheduled)
  const scheduledDays = db
    .query(
      `SELECT COUNT(*) as count FROM schedule
       WHERE user_id = ? AND template_id IS NOT NULL`,
    )
    .get(user.id) as { count: number };

  const scheduledPerWeek = scheduledDays.count || 1; // Avoid division by zero

  // Get completed workouts grouped by week for the last N weeks
  const weeklyData = db
    .query(
      `SELECT
        strftime('%Y-%W', completed_at) as week,
        strftime('%Y-%m-%d', date(completed_at, 'weekday 0', '-6 days')) as week_start,
        COUNT(*) as completed
       FROM workouts
       WHERE user_id = ?
         AND completed_at IS NOT NULL
         AND completed_at >= date('now', '-' || ? || ' weeks')
       GROUP BY week
       ORDER BY week ASC`,
    )
    .all(user.id, weeks) as { week: string; week_start: string; completed: number }[];

  // Build response with consistency scores
  const data = weeklyData.map((w) => ({
    week: w.week_start,
    completed: w.completed,
    scheduled: scheduledPerWeek,
    consistency: Math.min(1, w.completed / scheduledPerWeek), // Cap at 1.0
  }));

  return c.json({
    scheduledPerWeek,
    weeks: data,
  });
});

// Get strength progression for exercises (max weight over time)
app.get("/api/stats/strength", (c) => {
  const user = requireAuth(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const exerciseId = c.req.query("exercise_id");
  const weeks = parseInt(c.req.query("weeks") || "12");

  if (exerciseId) {
    // Get progression for a specific exercise
    const progression = db
      .query(
        `SELECT
          date(w.completed_at) as date,
          MAX(s.weight) as max_weight,
          MAX(s.weight * s.reps) as max_volume
         FROM sets s
         JOIN workouts w ON s.workout_id = w.id
         WHERE w.user_id = ?
           AND s.exercise_id = ?
           AND w.completed_at IS NOT NULL
           AND w.completed_at >= date('now', '-' || ? || ' weeks')
         GROUP BY date(w.completed_at)
         ORDER BY date ASC`,
      )
      .all(user.id, parseInt(exerciseId), weeks) as {
      date: string;
      max_weight: number;
      max_volume: number;
    }[];

    // Get exercise name
    const exercise = db
      .query("SELECT name FROM exercises WHERE id = ?")
      .get(parseInt(exerciseId)) as { name: string } | null;

    return c.json({
      exercise_id: parseInt(exerciseId),
      exercise_name: exercise?.name || "Unknown",
      data: progression,
    });
  }

  // Get list of exercises user has done with their latest max weight
  const exerciseSummary = db
    .query(
      `SELECT
        s.exercise_id,
        e.name as exercise_name,
        e.muscle_group,
        MAX(s.weight) as max_weight,
        COUNT(DISTINCT w.id) as workout_count
       FROM sets s
       JOIN workouts w ON s.workout_id = w.id
       JOIN exercises e ON s.exercise_id = e.id
       WHERE w.user_id = ? AND w.completed_at IS NOT NULL
       GROUP BY s.exercise_id
       HAVING workout_count >= 2
       ORDER BY workout_count DESC
       LIMIT 20`,
    )
    .all(user.id) as {
    exercise_id: number;
    exercise_name: string;
    muscle_group: string;
    max_weight: number;
    workout_count: number;
  }[];

  return c.json({ exercises: exerciseSummary });
});

// Get overall strength trend (estimated 1RM or total volume over time)
app.get("/api/stats/strength-trend", (c) => {
  const user = requireAuth(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const weeks = parseInt(c.req.query("weeks") || "12");

  // Calculate weekly total volume (weight * reps across all exercises)
  const weeklyVolume = db
    .query(
      `SELECT
        strftime('%Y-%W', w.completed_at) as week,
        strftime('%Y-%m-%d', date(w.completed_at, 'weekday 0', '-6 days')) as week_start,
        SUM(s.weight * s.reps) as total_volume,
        COUNT(DISTINCT w.id) as workouts
       FROM sets s
       JOIN workouts w ON s.workout_id = w.id
       WHERE w.user_id = ?
         AND w.completed_at IS NOT NULL
         AND w.completed_at >= date('now', '-' || ? || ' weeks')
       GROUP BY week
       ORDER BY week ASC`,
    )
    .all(user.id, weeks) as {
    week: string;
    week_start: string;
    total_volume: number;
    workouts: number;
  }[];

  // Normalize volume per workout for fair comparison
  const data = weeklyVolume.map((w) => ({
    week: w.week_start,
    totalVolume: w.total_volume,
    workouts: w.workouts,
    avgVolumePerWorkout: w.workouts > 0 ? Math.round(w.total_volume / w.workouts) : 0,
  }));

  return c.json({ weeks: data });
});

// ============== HOME DATA ==============

app.get("/api/home", (c) => {
  const user = requireAuth(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const dayOfWeek = parseInt(c.req.query("dow") || String(new Date().getDay()));

  // Today's schedule
  const todaySchedule = db
    .query(
      `SELECT s.*, t.name as template_name FROM schedule s
       LEFT JOIN templates t ON s.template_id = t.id
       WHERE s.user_id = ? AND s.day_of_week = ?`,
    )
    .get(user.id, dayOfWeek) as Schedule | null;

  // Exercises for today's template
  let exerciseList = "";
  if (todaySchedule?.template_id) {
    const exercises = db
      .query(
        `SELECT e.name FROM template_exercises te
         JOIN exercises e ON te.exercise_id = e.id
         WHERE te.template_id = ? ORDER BY te.sort_order`,
      )
      .all(todaySchedule.template_id) as { name: string }[];
    exerciseList = exercises.map((e) => e.name).join(", ");
  }

  // Stats
  const totalWorkouts = db
    .query(
      "SELECT COUNT(*) as count FROM workouts WHERE user_id = ? AND completed_at IS NOT NULL",
    )
    .get(user.id) as { count: number };

  const thisWeekWorkouts = db
    .query(
      `SELECT COUNT(*) as count FROM workouts
       WHERE user_id = ? AND completed_at IS NOT NULL
       AND date(started_at) >= date('now', '-7 days')`,
    )
    .get(user.id) as { count: number };

  // Recent workouts
  const recentWorkouts = db
    .query(
      `SELECT w.*, t.name as template_name FROM workouts w
       LEFT JOIN templates t ON w.template_id = t.id
       WHERE w.user_id = ? AND w.completed_at IS NOT NULL
       ORDER BY w.started_at DESC LIMIT 5`,
    )
    .all(user.id) as Workout[];

  // Calendar days (3 before, today, 3 after)
  const today = new Date();
  const calendarDays = [];
  for (let i = -3; i <= 3; i++) {
    const date = new Date(today);
    date.setDate(today.getDate() + i);
    const dow = date.getDay();
    const schedule = db
      .query(
        `SELECT template_id FROM schedule WHERE user_id = ? AND day_of_week = ?`,
      )
      .get(user.id, dow) as { template_id: number | null } | null;

    calendarDays.push({
      dayName: DAY_NAMES[dow],
      dayNumber: date.getDate(),
      isToday: i === 0,
      hasWorkout: schedule?.template_id != null,
    });
  }

  return c.json({
    todaySchedule,
    exerciseList,
    totalWorkouts: totalWorkouts.count,
    thisWeekWorkouts: thisWeekWorkouts.count,
    recentWorkouts,
    calendarDays,
  });
});

// ============== SYNC ENDPOINTS ==============

app.post("/api/sync/push", async (c) => {
  const user = requireAuth(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const { changes } = await c.req.json();

  // Process each change
  for (const change of changes) {
    const { table, recordId, action, data } = change;

    // Only allow syncing user's own data
    if (data && data.user_id && data.user_id !== user.id) {
      continue;
    }

    try {
      switch (action) {
        case "create":
        case "update":
          // Upsert logic based on table
          if (table === "programmes") {
            // If setting as active, deactivate others first
            if (data.is_active) {
              deactivateOtherProgrammes(user.id, data.id);
            }
            db.prepare(
              `INSERT OR REPLACE INTO programmes (id, user_id, name, is_active, created_at)
               VALUES (?, ?, ?, ?, ?)`,
            ).run(
              data.id,
              user.id,
              data.name,
              data.is_active || 0,
              data.created_at || new Date().toISOString(),
            );
          } else if (table === "templates") {
            db.prepare(
              `INSERT OR REPLACE INTO templates (id, user_id, programme_id, name, rest_time, created_at)
               VALUES (?, ?, ?, ?, ?, ?)`,
            ).run(
              data.id,
              user.id,
              data.programme_id,
              data.name,
              data.rest_time,
              data.created_at || new Date().toISOString(),
            );
          } else if (table === "templateExercises") {
            db.prepare(
              `INSERT OR REPLACE INTO template_exercises (id, template_id, exercise_id, sort_order, sets_data, increment)
               VALUES (?, ?, ?, ?, ?, ?)`,
            ).run(
              data.id,
              data.template_id,
              data.exercise_id,
              data.sort_order,
              data.sets_data,
              data.increment,
            );
          } else if (table === "schedule") {
            db.prepare(
              `INSERT OR REPLACE INTO schedule (id, user_id, day_of_week, template_id)
               VALUES (?, ?, ?, ?)`,
            ).run(data.id, user.id, data.day_of_week, data.template_id);
          } else if (table === "workouts") {
            db.prepare(
              `INSERT OR REPLACE INTO workouts (id, user_id, template_id, started_at, completed_at)
               VALUES (?, ?, ?, ?, ?)`,
            ).run(
              data.id,
              user.id,
              data.template_id,
              data.started_at,
              data.completed_at,
            );
          } else if (table === "sets") {
            db.prepare(
              `INSERT OR REPLACE INTO sets (id, workout_id, exercise_id, set_number, weight, reps, completed_at)
               VALUES (?, ?, ?, ?, ?, ?, ?)`,
            ).run(
              data.id,
              data.workout_id,
              data.exercise_id,
              data.set_number,
              data.weight,
              data.reps,
              data.completed_at,
            );
          }
          break;

        case "delete":
          if (table === "programmes") {
            // Get template IDs to clean up related data
            const templates = db
              .query("SELECT id FROM templates WHERE programme_id = ?")
              .all(recordId) as { id: number }[];
            for (const template of templates) {
              db.prepare("DELETE FROM schedule WHERE template_id = ?").run(template.id);
              db.prepare("DELETE FROM template_exercises WHERE template_id = ?").run(template.id);
            }
            db.prepare("DELETE FROM templates WHERE programme_id = ?").run(recordId);
            db.prepare(
              "DELETE FROM programmes WHERE id = ? AND user_id = ?",
            ).run(recordId, user.id);
          } else if (table === "templates") {
            db.prepare(
              "DELETE FROM templates WHERE id = ? AND user_id = ?",
            ).run(recordId, user.id);
          } else if (table === "templateExercises") {
            db.prepare("DELETE FROM template_exercises WHERE id = ?").run(
              recordId,
            );
          } else if (table === "schedule") {
            db.prepare("DELETE FROM schedule WHERE id = ? AND user_id = ?").run(
              recordId,
              user.id,
            );
          } else if (table === "workouts") {
            db.prepare("DELETE FROM workouts WHERE id = ? AND user_id = ?").run(
              recordId,
              user.id,
            );
          } else if (table === "sets") {
            db.prepare("DELETE FROM sets WHERE id = ?").run(recordId);
          }
          break;
      }
    } catch (err) {
      console.error("Sync error for change:", change, err);
    }
  }

  return c.json({ ok: true });
});

app.get("/api/sync/pull", (c) => {
  const user = requireAuth(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const since = parseInt(c.req.query("since") || "0");

  // For now, return all user data (can optimize with updated_at later)
  const programmes = db
    .query("SELECT * FROM programmes WHERE user_id = ?")
    .all(user.id);
  const templates = db
    .query("SELECT * FROM templates WHERE user_id = ?")
    .all(user.id);
  const templateIds = templates.map((t: any) => t.id);

  let templateExercises: any[] = [];
  if (templateIds.length > 0) {
    // Use parameterized query to prevent SQL injection
    const placeholders = templateIds.map(() => "?").join(",");
    templateExercises = db
      .query(
        `SELECT * FROM template_exercises WHERE template_id IN (${placeholders})`,
      )
      .all(...templateIds);
  }

  const schedule = db
    .query("SELECT * FROM schedule WHERE user_id = ?")
    .all(user.id);
  const workouts = db
    .query("SELECT * FROM workouts WHERE user_id = ?")
    .all(user.id);

  const workoutIds = workouts.map((w: any) => w.id);
  let sets: any[] = [];
  if (workoutIds.length > 0) {
    // Use parameterized query to prevent SQL injection
    const placeholders = workoutIds.map(() => "?").join(",");
    sets = db
      .query(`SELECT * FROM sets WHERE workout_id IN (${placeholders})`)
      .all(...workoutIds);
  }

  return c.json({
    changes: {
      programmes,
      templates,
      templateExercises,
      schedule,
      workouts,
      sets,
    },
  });
});

app.get("/api/sync/full", (c) => {
  const user = requireAuth(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  // Get all exercises (global)
  const exercises = db.query("SELECT * FROM exercises").all();

  // Get user's data
  const programmes = db
    .query("SELECT * FROM programmes WHERE user_id = ?")
    .all(user.id);
  const templates = db
    .query("SELECT * FROM templates WHERE user_id = ?")
    .all(user.id);
  const templateIds = templates.map((t: any) => t.id);

  let templateExercises: any[] = [];
  if (templateIds.length > 0) {
    // Use parameterized query to prevent SQL injection
    const placeholders = templateIds.map(() => "?").join(",");
    templateExercises = db
      .query(
        `SELECT * FROM template_exercises WHERE template_id IN (${placeholders})`,
      )
      .all(...templateIds);
  }

  const schedule = db
    .query("SELECT * FROM schedule WHERE user_id = ?")
    .all(user.id);
  const workouts = db
    .query("SELECT * FROM workouts WHERE user_id = ?")
    .all(user.id);

  const workoutIds = workouts.map((w: any) => w.id);
  let sets: any[] = [];
  if (workoutIds.length > 0) {
    // Use parameterized query to prevent SQL injection
    const placeholders = workoutIds.map(() => "?").join(",");
    sets = db
      .query(`SELECT * FROM sets WHERE workout_id IN (${placeholders})`)
      .all(...workoutIds);
  }

  return c.json({
    exercises,
    programmes,
    templates,
    templateExercises,
    schedule,
    workouts,
    sets,
  });
});

// ============== HEALTH CHECK ==============

app.get("/api/health", (c) => {
  return c.json({ status: "ok", timestamp: Date.now() });
});

export default {
  port: 3000,
  fetch: app.fetch,
};

console.log("API server running at http://localhost:3000");
