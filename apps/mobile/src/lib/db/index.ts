import Dexie, { type Table } from 'dexie';

// Types matching SQLite schema
export interface Exercise {
	id: number;
	name: string;
	muscle_group: string;
	created_at: string;
	updated_at?: number;
}

export interface Programme {
	id: number;
	user_id: number;
	name: string;
	is_active: number; // 0 or 1
	created_at: string;
	updated_at?: number;
}

export interface Template {
	id: number;
	user_id: number;
	programme_id: number | null;
	name: string;
	rest_time: number;
	created_at: string;
	updated_at?: number;
}

export interface TemplateExercise {
	id: number;
	template_id: number;
	exercise_id: number;
	sort_order: number;
	sets_data: string; // JSON: [{"reps":10,"weight":20}, ...]
	increment: number;
	updated_at?: number;
}

export interface Schedule {
	id: number;
	user_id: number;
	day_of_week: number; // 0-6, 0=Sunday
	template_id: number | null;
	updated_at?: number;
}

export interface Workout {
	id: number;
	user_id: number;
	template_id: number | null;
	started_at: string;
	completed_at: string | null;
	updated_at?: number;
}

export interface WorkoutSet {
	id: number;
	workout_id: number;
	exercise_id: number;
	set_number: number;
	weight: number | null;
	reps: number | null;
	completed_at: string;
	updated_at?: number;
}

export interface Progression {
	id: number;
	user_id: number;
	exercise_id: number;
	increment: number;
	updated_at?: number;
}

// Sync outbox for offline changes
export interface OutboxItem {
	id?: number;
	table: string;
	recordId: number;
	action: 'create' | 'update' | 'delete';
	data: unknown;
	createdAt: number;
}

// Active workout state (replaces localStorage)
export interface ActiveWorkoutState {
	id?: number;
	template_id: number;
	workout_id: number | null; // Track the workout record ID
	inputs: Record<string, Record<string, { reps: number; weight: number }>>; // exerciseId -> setIndex -> values
	completedSets: string[]; // Selectors of completed sets
	addedSets: Record<number, number>; // exerciseId -> count of added sets
	timerEndTime: number | null; // Timestamp when timer should end (for persistence)
	startedAt: number;
	updated_at: number;
}

class GymLogDatabase extends Dexie {
	exercises!: Table<Exercise, number>;
	programmes!: Table<Programme, number>;
	templates!: Table<Template, number>;
	templateExercises!: Table<TemplateExercise, number>;
	schedule!: Table<Schedule, number>;
	workouts!: Table<Workout, number>;
	sets!: Table<WorkoutSet, number>;
	progression!: Table<Progression, number>;
	outbox!: Table<OutboxItem, number>;
	activeWorkout!: Table<ActiveWorkoutState, number>;

	constructor() {
		super('gymlog');

		this.version(1).stores({
			// Primary key, then indexed fields
			exercises: 'id, muscle_group, updated_at',
			templates: 'id, user_id, updated_at',
			templateExercises: 'id, template_id, exercise_id, updated_at',
			schedule: 'id, user_id, day_of_week, template_id, updated_at',
			workouts: 'id, user_id, template_id, started_at, updated_at',
			sets: 'id, workout_id, exercise_id, updated_at',
			progression: 'id, user_id, exercise_id, updated_at',
			outbox: '++id, table, recordId, createdAt',
			activeWorkout: '++id, template_id'
		});

		// Version 2: Add programmes table and programme_id to templates
		this.version(2).stores({
			exercises: 'id, muscle_group, updated_at',
			programmes: 'id, user_id, is_active, updated_at',
			templates: 'id, user_id, programme_id, updated_at',
			templateExercises: 'id, template_id, exercise_id, updated_at',
			schedule: 'id, user_id, day_of_week, template_id, updated_at',
			workouts: 'id, user_id, template_id, started_at, updated_at',
			sets: 'id, workout_id, exercise_id, updated_at',
			progression: 'id, user_id, exercise_id, updated_at',
			outbox: '++id, table, recordId, createdAt',
			activeWorkout: '++id, template_id'
		});
	}
}

export const db = new GymLogDatabase();

// Helper to get template with its exercises
export async function getTemplateWithExercises(templateId: number) {
	const template = await db.templates.get(templateId);
	if (!template) return null;

	const templateExercises = await db.templateExercises
		.where('template_id')
		.equals(templateId)
		.sortBy('sort_order');

	const exerciseIds = templateExercises.map((te) => te.exercise_id);
	const exercises = await db.exercises.where('id').anyOf(exerciseIds).toArray();
	const exerciseMap = new Map(exercises.map((e) => [e.id, e]));

	return {
		...template,
		exercises: templateExercises.map((te) => ({
			...te,
			exercise: exerciseMap.get(te.exercise_id)
		}))
	};
}

// Helper to get today's schedule
export async function getTodaySchedule(userId: number, dayOfWeek: number) {
	return db.schedule
		.where(['user_id', 'day_of_week'])
		.equals([userId, dayOfWeek])
		.first();
}

// Helper to get user's templates with scheduled days
export async function getUserTemplates(userId: number) {
	const templates = await db.templates.where('user_id').equals(userId).toArray();
	const schedules = await db.schedule.where('user_id').equals(userId).toArray();

	const scheduleMap = new Map<number, number[]>();
	for (const s of schedules) {
		if (s.template_id) {
			const days = scheduleMap.get(s.template_id) || [];
			days.push(s.day_of_week);
			scheduleMap.set(s.template_id, days);
		}
	}

	return templates.map((t) => ({
		...t,
		scheduledDays: scheduleMap.get(t.id) || []
	}));
}

// Helper to get last workout sets for an exercise
export async function getLastSetsForExercise(userId: number, exerciseId: number) {
	// Find the most recent completed workout that includes this exercise
	const recentWorkouts = await db.workouts
		.where('user_id')
		.equals(userId)
		.filter((w) => w.completed_at !== null)
		.reverse()
		.sortBy('completed_at');

	for (const workout of recentWorkouts) {
		const sets = await db.sets
			.where('workout_id')
			.equals(workout.id)
			.filter((s) => s.exercise_id === exerciseId)
			.sortBy('set_number');

		if (sets.length > 0) {
			return sets;
		}
	}

	return [];
}

// ============================================
// Workout Stats Helpers
// ============================================

export interface WorkoutStats {
	total: number;
	thisWeek: number;
	thisMonth: number;
}

/**
 * Get all completed workouts for a user
 */
export async function getCompletedWorkouts(userId: number): Promise<Workout[]> {
	return db.workouts
		.where('user_id')
		.equals(userId)
		.filter((w) => w.completed_at !== null)
		.toArray();
}

/**
 * Get workout statistics for a user
 */
export async function getWorkoutStats(userId: number): Promise<WorkoutStats> {
	const allWorkouts = await getCompletedWorkouts(userId);

	const today = new Date();
	const todayDow = today.getDay();

	// Start of week (Sunday)
	const startOfWeek = new Date(today);
	startOfWeek.setDate(today.getDate() - todayDow);
	startOfWeek.setHours(0, 0, 0, 0);

	// Start of month
	const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

	let thisWeek = 0;
	let thisMonth = 0;

	for (const workout of allWorkouts) {
		const completedAt = new Date(workout.completed_at!);
		if (completedAt >= startOfWeek) thisWeek++;
		if (completedAt >= startOfMonth) thisMonth++;
	}

	return {
		total: allWorkouts.length,
		thisWeek,
		thisMonth
	};
}

/**
 * Get recent completed workouts with template names
 */
export async function getRecentWorkouts(
	userId: number,
	limit?: number
): Promise<Array<{ id: number; template_id: number | null; template_name: string; started_at: string; completed_at: string; duration_minutes: number }>> {
	const workouts = await getCompletedWorkouts(userId);

	// Sort by completed_at descending
	let recent = workouts
		.sort((a, b) => new Date(b.completed_at!).getTime() - new Date(a.completed_at!).getTime());

	// Apply limit if specified
	if (limit !== undefined) {
		recent = recent.slice(0, limit);
	}

	// Get template names
	const templateIds = [...new Set(recent.map(w => w.template_id).filter(Boolean))] as number[];
	const templates = templateIds.length > 0
		? await db.templates.where('id').anyOf(templateIds).toArray()
		: [];
	const templateMap = new Map(templates.map(t => [t.id, t.name]));

	return recent.map(w => {
		const startTime = new Date(w.started_at).getTime();
		const endTime = new Date(w.completed_at!).getTime();
		const durationMinutes = Math.round((endTime - startTime) / 60000);

		return {
			id: w.id,
			template_id: w.template_id,
			template_name: w.template_id ? templateMap.get(w.template_id) || 'Workout' : 'Workout',
			started_at: w.started_at,
			completed_at: w.completed_at!,
			duration_minutes: durationMinutes
		};
	});
}

/**
 * Get active workout state if exists
 */
export async function getActiveWorkout(): Promise<ActiveWorkoutState | undefined> {
	return db.activeWorkout.toCollection().first();
}

/**
 * Check if there's an active workout in progress
 */
export async function hasActiveWorkout(): Promise<boolean> {
	const count = await db.activeWorkout.count();
	return count > 0;
}

// ============================================
// Template Helpers (Batch Loading)
// ============================================

export interface TemplateWithExercises {
	id: number;
	user_id: number;
	programme_id: number | null;
	name: string;
	rest_time: number;
	created_at: string;
	updated_at?: number;
	exercises: Array<{
		exercise_id: number;
		exercise_name: string;
		muscle_group: string;
		sort_order: number;
		sets_data: string;
		increment: number;
	}>;
	scheduledDays: number[];
}

/**
 * Get all templates for a user with exercises and scheduled days (batch loaded)
 */
export async function getTemplatesWithDetails(userId: number): Promise<TemplateWithExercises[]> {
	// Load templates first to get their IDs
	const templates = await db.templates.where('user_id').equals(userId).toArray();
	const templateIds = templates.map(t => t.id);

	// Load related data in parallel, filtering template exercises by user's templates
	const [schedules, allTemplateExercises, exercises] = await Promise.all([
		db.schedule.where('user_id').equals(userId).toArray(),
		templateIds.length > 0
			? db.templateExercises.where('template_id').anyOf(templateIds).toArray()
			: Promise.resolve([]),
		db.exercises.toArray()
	]);

	// Build lookup maps
	const exerciseMap = new Map(exercises.map(e => [e.id, e]));

	const scheduleMap = new Map<number, number[]>();
	for (const s of schedules) {
		if (s.template_id) {
			const days = scheduleMap.get(s.template_id) || [];
			days.push(s.day_of_week);
			scheduleMap.set(s.template_id, days);
		}
	}

	// Group template exercises by template_id
	const templateExerciseMap = new Map<number, typeof allTemplateExercises>();
	for (const te of allTemplateExercises) {
		const list = templateExerciseMap.get(te.template_id) || [];
		list.push(te);
		templateExerciseMap.set(te.template_id, list);
	}

	// Build final result
	return templates.map(t => {
		const templateExs = (templateExerciseMap.get(t.id) || [])
			.sort((a, b) => a.sort_order - b.sort_order);

		return {
			...t,
			exercises: templateExs.map(te => {
				const exercise = exerciseMap.get(te.exercise_id);
				return {
					exercise_id: te.exercise_id,
					exercise_name: exercise?.name || 'Unknown',
					muscle_group: exercise?.muscle_group || '',
					sort_order: te.sort_order,
					sets_data: te.sets_data,
					increment: te.increment
				};
			}),
			scheduledDays: scheduleMap.get(t.id) || []
		};
	});
}

/**
 * Get schedule conflicts (days taken by other templates)
 */
export async function getScheduleConflicts(
	userId: number,
	excludeTemplateId?: number
): Promise<Map<number, string>> {
	const [schedules, templates] = await Promise.all([
		db.schedule.where('user_id').equals(userId).toArray(),
		db.templates.where('user_id').equals(userId).toArray()
	]);

	const templateMap = new Map(templates.map(t => [t.id, t.name]));
	const conflicts = new Map<number, string>();

	for (const s of schedules) {
		if (s.template_id && s.template_id !== excludeTemplateId) {
			const templateName = templateMap.get(s.template_id);
			if (templateName) {
				conflicts.set(s.day_of_week, templateName);
			}
		}
	}

	return conflicts;
}

// ============================================
// Programme Helpers
// ============================================

/**
 * Get the active programme for a user
 */
export async function getActiveProgramme(userId: number): Promise<Programme | undefined> {
	return db.programmes
		.where('user_id')
		.equals(userId)
		.filter(p => p.is_active === 1)
		.first();
}

/**
 * Get all programmes for a user
 */
export async function getUserProgrammes(userId: number): Promise<Programme[]> {
	return db.programmes.where('user_id').equals(userId).toArray();
}

/**
 * Get a programme with its templates
 */
export async function getProgrammeWithTemplates(programmeId: number): Promise<{
	programme: Programme;
	templates: Template[];
} | null> {
	const programme = await db.programmes.get(programmeId);
	if (!programme) return null;

	const templates = await db.templates
		.where('programme_id')
		.equals(programmeId)
		.toArray();

	return { programme, templates };
}

/**
 * Get templates for a programme with full details
 */
export async function getProgrammeTemplatesWithDetails(
	programmeId: number
): Promise<TemplateWithExercises[]> {
	const templates = await db.templates
		.where('programme_id')
		.equals(programmeId)
		.toArray();

	if (templates.length === 0) return [];

	const templateIds = templates.map(t => t.id);

	const [schedules, allTemplateExercises, exercises] = await Promise.all([
		db.schedule.toArray(),
		db.templateExercises.where('template_id').anyOf(templateIds).toArray(),
		db.exercises.toArray()
	]);

	const exerciseMap = new Map(exercises.map(e => [e.id, e]));

	const scheduleMap = new Map<number, number[]>();
	for (const s of schedules) {
		if (s.template_id && templateIds.includes(s.template_id)) {
			const days = scheduleMap.get(s.template_id) || [];
			days.push(s.day_of_week);
			scheduleMap.set(s.template_id, days);
		}
	}

	const templateExerciseMap = new Map<number, TemplateExercise[]>();
	for (const te of allTemplateExercises) {
		const list = templateExerciseMap.get(te.template_id) || [];
		list.push(te);
		templateExerciseMap.set(te.template_id, list);
	}

	return templates.map(t => {
		const templateExs = (templateExerciseMap.get(t.id) || [])
			.sort((a, b) => a.sort_order - b.sort_order);

		return {
			...t,
			exercises: templateExs.map(te => {
				const exercise = exerciseMap.get(te.exercise_id);
				return {
					exercise_id: te.exercise_id,
					exercise_name: exercise?.name || 'Unknown',
					muscle_group: exercise?.muscle_group || '',
					sort_order: te.sort_order,
					sets_data: te.sets_data,
					increment: te.increment
				};
			}),
			scheduledDays: scheduleMap.get(t.id) || []
		};
	});
}
