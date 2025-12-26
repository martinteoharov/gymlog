import { writable, get } from 'svelte/store';
import { api } from '$lib/api/client';
import { db } from '$lib/db';
import { fullSync, clearSyncState } from './sync';

export interface User {
	id: number;
	username: string;
	name: string | null;
	isLocal?: boolean; // true for anonymous local-only user
}

// Local anonymous user (used when not logged in)
const LOCAL_USER: User = {
	id: -1,
	username: 'local',
	name: null,
	isLocal: true
};

export const user = writable<User | null>(null);
export const authLoading = writable(true);

// Check if user is authenticated with the server
export async function checkAuth() {
	authLoading.set(true);
	try {
		const userData = await api.getUser();
		if (userData) {
			user.set(userData);
			// Sync data on successful auth check
			await fullSync();
		} else {
			// No server auth - use local anonymous user
			user.set(LOCAL_USER);
		}
	} catch {
		// API call failed (no server, offline, etc.) - use local anonymous user
		user.set(LOCAL_USER);
	} finally {
		authLoading.set(false);
	}
}

// Check if currently using local anonymous user
export function isLocalUser(): boolean {
	const currentUser = get(user);
	return currentUser?.isLocal === true;
}

export async function login(username: string, password: string) {
	const result = await api.login(username, password);
	user.set(result.user);
	await fullSync();
	return result;
}

export async function register(username: string, password: string, name?: string) {
	const result = await api.register(username, password, name);
	user.set(result.user);
	await fullSync();
	return result;
}

export async function logout() {
	const currentUser = get(user);

	// If logged in to server, call logout API
	if (currentUser && !currentUser.isLocal) {
		try {
			await api.logout();
		} catch {
			// Ignore logout API errors
		}
	}

	// Switch back to local user
	user.set(LOCAL_USER);

	// Clear sync state
	clearSyncState();

	// Clear all local data on logout
	try {
		await db.templates.clear();
		await db.templateExercises.clear();
		await db.schedule.clear();
		await db.workouts.clear();
		await db.sets.clear();
		await db.progression.clear();
		await db.outbox.clear();
		await db.activeWorkout.clear();
		// Note: exercises are shared/read-only, so we keep them
	} catch (error) {
		console.error('Failed to clear local data:', error);
	}
}
