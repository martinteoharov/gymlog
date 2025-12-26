<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { db, getWorkoutStats, getRecentWorkouts, getActiveWorkout } from '$lib/db';
	import { user } from '$lib/stores/auth';
	import { buildCalendarWeek, formatWorkoutDate } from '$lib/utils/date';
	import CalendarStrip from '$lib/components/CalendarStrip.svelte';
	import StatCard from '$lib/components/StatCard.svelte';
	import LoadingState from '$lib/components/LoadingState.svelte';

	interface CalendarDay {
		dayName: string;
		dayNumber: number;
		isToday: boolean;
		hasWorkout: boolean;
	}

	interface WorkoutHistory {
		id: number;
		template_id: number | null;
		template_name: string;
		started_at: string;
		completed_at: string;
		duration_minutes: number;
	}

	let calendarDays: CalendarDay[] = [];
	let todaySchedule: { template_id: number; template_name: string } | null = null;
	let exerciseList = '';
	let totalWorkouts = 0;
	let thisWeekWorkouts = 0;
	let workoutHistory: WorkoutHistory[] = [];
	let activeWorkout: { template_id: number; template_name: string } | null = null;
	let loading = true;

	onMount(async () => {
		await loadHomeData();
	});

	async function loadHomeData() {
		loading = true;
		try {
			const userId = $user?.id;
			if (!userId) return;

			const today = new Date();
			const todayDow = today.getDay();

			// Load data in parallel where possible
			const [schedules, stats, history, activeState] = await Promise.all([
				db.schedule.where('user_id').equals(userId).toArray(),
				getWorkoutStats(userId),
				getRecentWorkouts(userId), // No limit - get full history
				getActiveWorkout()
			]);

			// Build calendar days
			const scheduledDays = new Set(schedules.filter(s => s.template_id).map(s => s.day_of_week));
			calendarDays = buildCalendarWeek(scheduledDays, today);

			// Set stats
			totalWorkouts = stats.total;
			thisWeekWorkouts = stats.thisWeek;
			workoutHistory = history;

			// Get today's schedule
			const todaySched = schedules.find(s => s.day_of_week === todayDow && s.template_id);
			if (todaySched && todaySched.template_id) {
				const template = await db.templates.get(todaySched.template_id);
				if (template) {
					todaySchedule = {
						template_id: template.id,
						template_name: template.name
					};

					// Get exercise names for today's workout
					const templateExercises = await db.templateExercises
						.where('template_id')
						.equals(template.id)
						.sortBy('sort_order');
					const exerciseIds = templateExercises.map(te => te.exercise_id);
					const exercises = exerciseIds.length > 0
						? await db.exercises.where('id').anyOf(exerciseIds).toArray()
						: [];

					const exerciseNames = exercises.map(e => e.name).slice(0, 3);
					exerciseList = exerciseNames.join(', ');
					if (exercises.length > 3) {
						exerciseList += ` +${exercises.length - 3} more`;
					}
				}
			} else {
				todaySchedule = null;
				exerciseList = '';
			}

			// Check for active workout to resume
			if (activeState) {
				const template = await db.templates.get(activeState.template_id);
				if (template) {
					activeWorkout = {
						template_id: template.id,
						template_name: template.name
					};
				}
			} else {
				activeWorkout = null;
			}
		} catch (err) {
			console.error('Failed to load home data:', err);
		} finally {
			loading = false;
		}
	}

	function startWorkout() {
		if (todaySchedule?.template_id) {
			goto(`/workouts/${todaySchedule.template_id}/active`);
		}
	}

	function resumeWorkout() {
		if (activeWorkout?.template_id) {
			goto(`/workouts/${activeWorkout.template_id}/active`);
		}
	}

	function viewWorkout(workout: WorkoutHistory) {
		if (workout.template_id) {
			goto(`/workouts/${workout.template_id}/active`);
		}
	}

	function formatTime(dateStr: string): string {
		const date = new Date(dateStr);
		return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
	}

	function formatDuration(minutes: number): string {
		if (minutes < 60) {
			return `${minutes}m`;
		}
		const hours = Math.floor(minutes / 60);
		const mins = minutes % 60;
		return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
	}
</script>

<div class="page">
	{#if loading}
		<LoadingState message="Loading..." />
	{:else}
		<!-- Active Workout Banner -->
		{#if activeWorkout}
			<div
				class="active-workout-banner"
				on:click={resumeWorkout}
				on:keydown={(e) => e.key === 'Enter' && resumeWorkout()}
				role="button"
				tabindex="0"
			>
				<div class="active-workout-icon">▶</div>
				<div class="active-workout-info">
					<div class="active-workout-label">Workout in progress</div>
					<div class="active-workout-name">{activeWorkout.template_name}</div>
				</div>
				<div class="active-workout-action">Resume</div>
			</div>
		{/if}

		<!-- Calendar Strip -->
		<CalendarStrip days={calendarDays} />

		<!-- Today's Workout -->
		{#if todaySchedule?.template_id}
			<div
				class="today-workout-card"
				on:click={startWorkout}
				on:keydown={(e) => e.key === 'Enter' && startWorkout()}
				role="button"
				tabindex="0"
			>
				<div class="today-workout-label">Today's Workout</div>
				<div class="today-workout-name">{todaySchedule.template_name}</div>
				<div class="today-workout-meta">{exerciseList}</div>
				<button type="button" class="start-btn-large">Start Workout</button>
			</div>
		{:else}
			<div class="no-workout-today">
				<p class="no-workout-text">No workout scheduled for today</p>
			</div>
		{/if}

		<!-- Stats -->
		<h2 class="section-title">Your Stats</h2>
		<div class="stats-grid">
			<StatCard value={totalWorkouts} label="Total Workouts" />
			<StatCard value={thisWeekWorkouts} label="This Week" />
		</div>

		<!-- Workout History -->
		{#if workoutHistory.length > 0}
			<h2 class="section-title">Workout History</h2>
			{#each workoutHistory as workout}
				{@const formatted = formatWorkoutDate(workout.started_at)}
				<div
					class="recent-workout"
					on:click={() => viewWorkout(workout)}
					on:keydown={(e) => e.key === 'Enter' && viewWorkout(workout)}
					role="button"
					tabindex="0"
				>
					<div class="recent-workout-date">
						<span class="recent-workout-day">{formatted.day}</span>
						<span class="recent-workout-num">{formatted.num}</span>
					</div>
					<div class="recent-workout-info">
						<div class="recent-workout-name">{workout.template_name || 'Workout'}</div>
						<div class="recent-workout-meta">
							{formatTime(workout.started_at)} · {formatDuration(workout.duration_minutes)}
						</div>
					</div>
					<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="color: var(--text-muted);">
						<polyline points="9 18 15 12 9 6"></polyline>
					</svg>
				</div>
			{/each}
		{/if}
	{/if}
</div>

<style>
	.active-workout-banner {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 12px 16px;
		margin-bottom: 16px;
		background: var(--primary);
		border-radius: 12px;
		cursor: pointer;
		transition: opacity 0.15s;
	}

	.active-workout-banner:hover {
		opacity: 0.9;
	}

	.active-workout-icon {
		font-size: 18px;
	}

	.active-workout-info {
		flex: 1;
	}

	.active-workout-label {
		font-size: 11px;
		text-transform: uppercase;
		letter-spacing: 0.5px;
		opacity: 0.8;
	}

	.active-workout-name {
		font-size: 16px;
		font-weight: 600;
	}

	.active-workout-action {
		font-size: 14px;
		font-weight: 500;
		padding: 6px 12px;
		background: rgba(255, 255, 255, 0.2);
		border-radius: 6px;
	}
</style>
