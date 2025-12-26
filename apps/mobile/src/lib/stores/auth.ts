import { writable } from 'svelte/store';
import { api } from '$lib/api/client';
import { db } from '$lib/db';
import { fullSync, clearSyncState } from './sync';

export interface User {
	id: number;
	username: string;
	name: string | null;
}

export const user = writable<User | null>(null);
export const authLoading = writable(true);

export async function checkAuth() {
	authLoading.set(true);
	try {
		const userData = await api.getUser();
		user.set(userData);
		if (userData) {
			// Sync data on successful auth check
			await fullSync();
		}
	} catch {
		user.set(null);
	} finally {
		authLoading.set(false);
	}
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
	await api.logout();
	user.set(null);

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
