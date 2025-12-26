import { writable, get } from 'svelte/store';
import { db, type Template, type TemplateExercise, type Schedule, type Programme } from '$lib/db';
import { API_BASE } from '$lib/api/config';
import { user } from './auth';

// Sync state
export const syncStatus = writable<'idle' | 'syncing' | 'error'>('idle');
export const lastSyncTime = writable<number | null>(null);
export const pendingChanges = writable<number>(0);
export const isOnline = writable<boolean>(typeof navigator !== 'undefined' ? navigator.onLine : true);

// Retry configuration
const MAX_RETRIES = 3;
const RETRY_DELAYS = [1000, 3000, 10000]; // Exponential backoff
const ERROR_RESET_DELAY = 10000; // Reset error state after 10 seconds

// Track retry state
let retryCount = 0;
let retryTimeout: ReturnType<typeof setTimeout> | null = null;
let errorResetTimeout: ReturnType<typeof setTimeout> | null = null;
let syncInProgress = false;

// ID generation for new records (negative IDs indicate local-only, will be replaced by server)
let localIdCounter = -1;
export function generateLocalId(): number {
	return localIdCounter--;
}

// Safe localStorage access
function safeGetItem(key: string): string | null {
	try {
		if (typeof localStorage !== 'undefined') {
			return localStorage.getItem(key);
		}
	} catch {
		// localStorage not available (private browsing, etc.)
	}
	return null;
}

function safeSetItem(key: string, value: string): boolean {
	try {
		if (typeof localStorage !== 'undefined') {
			localStorage.setItem(key, value);
			return true;
		}
	} catch {
		// localStorage not available
	}
	return false;
}

function safeRemoveItem(key: string): void {
	try {
		if (typeof localStorage !== 'undefined') {
			localStorage.removeItem(key);
		}
	} catch {
		// localStorage not available
	}
}

// Update pending count
async function updatePendingCount() {
	const count = await db.outbox.count();
	pendingChanges.set(count);
}

// Queue a change for sync
export async function queueChange(
	table: string,
	recordId: number,
	action: 'create' | 'update' | 'delete',
	data: unknown
) {
	await db.outbox.add({
		table,
		recordId,
		action,
		data,
		createdAt: Date.now()
	});
	await updatePendingCount();
	syncIfOnline();
}

// Save a record locally and queue for sync
export async function saveRecord<T extends { id: number; updated_at?: number }>(
	table: string,
	record: T,
	isNew = false
) {
	record.updated_at = Date.now();
	await db.table(table).put(record);
	await queueChange(table, record.id, isNew ? 'create' : 'update', record);
}

// Delete a record locally and queue for sync
export async function deleteRecord(table: string, id: number) {
	await db.table(table).delete(id);
	await queueChange(table, id, 'delete', null);
}

// Check if user is authenticated (not local-only)
function isAuthenticated(): boolean {
	const currentUser = get(user);
	return currentUser !== null && currentUser.isLocal !== true;
}

// Sync if online and authenticated
function syncIfOnline() {
	if (typeof navigator !== 'undefined' && navigator.onLine && isAuthenticated()) {
		sync();
	}
}

// Clear any pending retry
function clearRetry() {
	if (retryTimeout) {
		clearTimeout(retryTimeout);
		retryTimeout = null;
	}
}

// Clear error reset timeout
function clearErrorReset() {
	if (errorResetTimeout) {
		clearTimeout(errorResetTimeout);
		errorResetTimeout = null;
	}
}

// Schedule a retry
function scheduleRetry() {
	if (retryCount >= MAX_RETRIES) {
		console.error(`Sync failed after ${MAX_RETRIES} retries`);
		syncStatus.set('error');

		// Auto-reset error state after delay
		clearErrorReset();
		errorResetTimeout = setTimeout(() => {
			if (get(syncStatus) === 'error') {
				syncStatus.set('idle');
			}
		}, ERROR_RESET_DELAY);

		retryCount = 0;
		return;
	}

	const delay = RETRY_DELAYS[retryCount] || RETRY_DELAYS[RETRY_DELAYS.length - 1];
	retryCount++;

	console.log(`Sync retry ${retryCount}/${MAX_RETRIES} in ${delay}ms`);

	clearRetry();
	retryTimeout = setTimeout(() => {
		if (typeof navigator !== 'undefined' && navigator.onLine) {
			sync();
		}
	}, delay);
}

// Main sync function
export async function sync(): Promise<boolean> {
	// Skip sync if not authenticated
	if (!isAuthenticated()) {
		return false;
	}

	// Prevent concurrent syncs
	if (syncInProgress) {
		return false;
	}

	syncInProgress = true;
	syncStatus.set('syncing');
	clearErrorReset();

	try {
		// Push local changes
		const pending = await db.outbox.orderBy('createdAt').toArray();

		if (pending.length > 0) {
			const response = await fetch(`${API_BASE}/api/sync/push`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				credentials: 'include',
				body: JSON.stringify({ changes: pending })
			});

			if (response.ok) {
				// Clear synced items
				const ids = pending.map((p) => p.id).filter((id): id is number => id !== undefined);
				await db.outbox.bulkDelete(ids);
				await updatePendingCount();
			} else if (response.status === 401) {
				// Not authenticated, skip sync
				syncStatus.set('idle');
				syncInProgress = false;
				return false;
			} else {
				throw new Error(`Push failed with status ${response.status}`);
			}
		}

		// Pull server changes
		const lastSync = safeGetItem('lastSync') || '0';
		const pullResponse = await fetch(`${API_BASE}/api/sync/pull?since=${lastSync}`, {
			credentials: 'include'
		});

		if (pullResponse.ok) {
			const data = await pullResponse.json();

			// Bulk update each table
			for (const [tableName, records] of Object.entries(data.changes || {})) {
				if (Array.isArray(records) && records.length > 0) {
					await db.table(tableName).bulkPut(records);
				}
			}

			const now = Date.now();
			safeSetItem('lastSync', now.toString());
			lastSyncTime.set(now);
		} else if (pullResponse.status !== 401) {
			throw new Error(`Pull failed with status ${pullResponse.status}`);
		}

		// Success - reset retry count
		retryCount = 0;
		syncStatus.set('idle');
		syncInProgress = false;
		return true;
	} catch (error) {
		console.error('Sync error:', error);
		syncInProgress = false;
		scheduleRetry();
		return false;
	}
}

// Initial sync on app load (only call this when user is authenticated)
export async function initSync() {
	await updatePendingCount();

	// Listen for online/offline events
	if (typeof window !== 'undefined') {
		window.addEventListener('online', () => {
			isOnline.set(true);
			if (isAuthenticated()) {
				retryCount = 0; // Reset retry count when coming back online
				sync();
			}
		});

		window.addEventListener('offline', () => {
			isOnline.set(false);
			clearRetry();
		});

		// Try initial sync if authenticated
		if (navigator.onLine && isAuthenticated()) {
			sync();
		}
	}
}

// Force full sync (pull all data)
export async function fullSync(): Promise<boolean> {
	if (syncInProgress) {
		return false;
	}

	syncInProgress = true;
	syncStatus.set('syncing');

	try {
		const response = await fetch(`${API_BASE}/api/sync/full`, {
			credentials: 'include'
		});

		if (response.ok) {
			const data = await response.json();

			// Replace all local data
			for (const [tableName, records] of Object.entries(data)) {
				if (Array.isArray(records)) {
					await db.table(tableName).clear();
					if (records.length > 0) {
						await db.table(tableName).bulkPut(records);
					}
				}
			}

			const now = Date.now();
			safeSetItem('lastSync', now.toString());
			lastSyncTime.set(now);
			syncStatus.set('idle');
			syncInProgress = false;
			return true;
		} else {
			throw new Error(`Full sync failed with status ${response.status}`);
		}
	} catch (error) {
		console.error('Full sync error:', error);
		syncStatus.set('error');
		syncInProgress = false;

		// Auto-reset error state
		clearErrorReset();
		errorResetTimeout = setTimeout(() => {
			if (get(syncStatus) === 'error') {
				syncStatus.set('idle');
			}
		}, ERROR_RESET_DELAY);

		return false;
	}
}

// Clear local sync state (for logout)
export function clearSyncState() {
	safeRemoveItem('lastSync');
	lastSyncTime.set(null);
	retryCount = 0;
	clearRetry();
	clearErrorReset();
}

// ============================================
// High-level offline-first operations
// ============================================

// ============================================
// Programme operations
// ============================================

export interface ProgrammeFormData {
	name: string;
	is_active?: boolean;
}

/**
 * Save a programme (create or update).
 * Returns the programme ID.
 */
export async function saveProgramme(
	userId: number,
	programmeId: number | null,
	data: ProgrammeFormData
): Promise<number> {
	const now = Date.now();
	const isNew = programmeId === null || programmeId < 0;
	const id = programmeId ?? generateLocalId();

	// If setting as active, deactivate others first
	if (data.is_active) {
		const allProgrammes = await db.programmes.where('user_id').equals(userId).toArray();
		for (const prog of allProgrammes) {
			if (prog.is_active && prog.id !== id) {
				prog.is_active = 0;
				prog.updated_at = now;
				await db.programmes.put(prog);
				await queueChange('programmes', prog.id, 'update', prog);
			}
		}
	}

	const programme: Programme = {
		id,
		user_id: userId,
		name: data.name,
		is_active: data.is_active ? 1 : 0,
		created_at: new Date().toISOString(),
		updated_at: now
	};

	await db.programmes.put(programme);
	await queueChange('programmes', id, isNew ? 'create' : 'update', programme);

	return id;
}

/**
 * Activate a programme (deactivates all others).
 */
export async function activateProgramme(userId: number, programmeId: number): Promise<void> {
	const now = Date.now();

	// Deactivate all programmes for this user
	const allProgrammes = await db.programmes.where('user_id').equals(userId).toArray();
	for (const prog of allProgrammes) {
		const shouldBeActive = prog.id === programmeId;
		if (prog.is_active !== (shouldBeActive ? 1 : 0)) {
			prog.is_active = shouldBeActive ? 1 : 0;
			prog.updated_at = now;
			await db.programmes.put(prog);
			await queueChange('programmes', prog.id, 'update', prog);
		}
	}
}

/**
 * Delete a programme and all its templates.
 */
export async function deleteProgramme(programmeId: number): Promise<void> {
	// Get all templates in this programme
	const templates = await db.templates.where('programme_id').equals(programmeId).toArray();

	// Delete each template with its exercises and schedules
	for (const template of templates) {
		await deleteTemplateWithExercises(template.id);
	}

	// Delete the programme itself
	await db.programmes.delete(programmeId);
	await queueChange('programmes', programmeId, 'delete', null);
}

/**
 * Get the active programme for a user.
 */
export async function getActiveProgramme(userId: number): Promise<Programme | undefined> {
	return await db.programmes.where({ user_id: userId, is_active: 1 }).first();
}

// ============================================
// Template operations
// ============================================

export interface TemplateFormExercise {
	id: number;
	name: string;
	muscle: string;
	increment: number;
	sets: { reps: number; weight: number }[];
}

export interface TemplateFormData {
	name: string;
	rest_time: number;
	days: number[];
	exercises: TemplateFormExercise[];
	programme_id: number | null;
}

/**
 * Validate template data before saving
 */
export function validateTemplateData(data: TemplateFormData): { valid: boolean; errors: string[] } {
	const errors: string[] = [];

	if (!data.name.trim()) {
		errors.push('Template name is required');
	}

	if (data.rest_time < 0) {
		errors.push('Rest time must be positive');
	}

	if (data.exercises.length === 0) {
		errors.push('At least one exercise is required');
	}

	for (const ex of data.exercises) {
		if (ex.sets.length === 0) {
			errors.push(`Exercise "${ex.name}" must have at least one set`);
		}
	}

	return {
		valid: errors.length === 0,
		errors
	};
}

/**
 * Save a template with all its exercises and schedule.
 * Creates/updates the template, template exercises, and schedule entries.
 * Returns the template ID (may be a local negative ID for new templates).
 */
export async function saveTemplateWithExercises(
	userId: number,
	templateId: number | null,
	data: TemplateFormData
): Promise<number> {
	const now = Date.now();
	const isNew = templateId === null || templateId < 0;
	const id = templateId ?? generateLocalId();

	// 1. Save the template
	const template: Template = {
		id,
		user_id: userId,
		programme_id: data.programme_id,
		name: data.name,
		rest_time: data.rest_time,
		created_at: new Date().toISOString(),
		updated_at: now
	};
	await db.templates.put(template);
	await queueChange('templates', id, isNew ? 'create' : 'update', template);

	// 2. Delete old template exercises and add new ones
	// Use deleteMany for more robust deletion
	const oldExercises = await db.templateExercises.where('template_id').equals(id).toArray();
	if (oldExercises.length > 0) {
		const oldIds = oldExercises.map(e => e.id);
		await db.templateExercises.bulkDelete(oldIds);
		for (const old of oldExercises) {
			await queueChange('templateExercises', old.id, 'delete', null);
		}
	}

	// Add new template exercises
	for (let i = 0; i < data.exercises.length; i++) {
		const ex = data.exercises[i];
		const teId = generateLocalId();
		const templateExercise: TemplateExercise = {
			id: teId,
			template_id: id,
			exercise_id: ex.id,
			sort_order: i,
			sets_data: JSON.stringify(ex.sets),
			increment: ex.increment,
			updated_at: now
		};
		await db.templateExercises.put(templateExercise);
		await queueChange('templateExercises', teId, 'create', templateExercise);
	}

	// 3. Update schedule - remove old entries for this template, add new ones
	const allSchedules = await db.schedule.where('user_id').equals(userId).toArray();

	// Remove schedules for this template
	for (const sched of allSchedules) {
		if (sched.template_id === id) {
			await db.schedule.delete(sched.id);
			await queueChange('schedule', sched.id, 'delete', null);
		}
	}

	// Add new schedule entries
	for (const day of data.days) {
		const schedId = generateLocalId();
		const schedule: Schedule = {
			id: schedId,
			user_id: userId,
			day_of_week: day,
			template_id: id,
			updated_at: now
		};
		await db.schedule.put(schedule);
		await queueChange('schedule', schedId, 'create', schedule);
	}

	return id;
}

/**
 * Delete a template and all its associated data (exercises, schedule entries).
 */
export async function deleteTemplateWithExercises(templateId: number): Promise<void> {
	// Delete template exercises
	const exercises = await db.templateExercises.where('template_id').equals(templateId).toArray();
	for (const ex of exercises) {
		await db.templateExercises.delete(ex.id);
		await queueChange('templateExercises', ex.id, 'delete', null);
	}

	// Delete schedule entries
	const schedules = await db.schedule.where('template_id').equals(templateId).toArray();
	for (const sched of schedules) {
		await db.schedule.delete(sched.id);
		await queueChange('schedule', sched.id, 'delete', null);
	}

	// Delete the template itself
	await db.templates.delete(templateId);
	await queueChange('templates', templateId, 'delete', null);
}

/**
 * Create a workout record locally and queue for sync.
 * Returns a local workout ID.
 */
export async function createWorkoutLocal(
	userId: number,
	templateId: number
): Promise<number> {
	const now = Date.now();
	const workoutId = generateLocalId();

	const workout = {
		id: workoutId,
		user_id: userId,
		template_id: templateId,
		started_at: new Date().toISOString(),
		completed_at: null,
		updated_at: now
	};

	await db.workouts.put(workout);
	await queueChange('workouts', workoutId, 'create', workout);

	return workoutId;
}

/**
 * Complete a workout by saving all sets and marking it complete.
 */
export async function completeWorkoutLocal(
	workoutId: number,
	sets: { exercise_id: number; set_number: number; weight: number; reps: number }[]
): Promise<void> {
	const now = Date.now();
	const completedAt = new Date().toISOString();

	// Save all sets
	for (const set of sets) {
		const setId = generateLocalId();
		const workoutSet = {
			id: setId,
			workout_id: workoutId,
			exercise_id: set.exercise_id,
			set_number: set.set_number,
			weight: set.weight,
			reps: set.reps,
			completed_at: completedAt,
			updated_at: now
		};
		await db.sets.put(workoutSet);
		await queueChange('sets', setId, 'create', workoutSet);
	}

	// Update the workout as completed
	const workout = await db.workouts.get(workoutId);
	if (workout) {
		workout.completed_at = completedAt;
		workout.updated_at = now;
		await db.workouts.put(workout);
		await queueChange('workouts', workoutId, 'update', workout);
	}
}
