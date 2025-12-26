<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { db, getLastSetsForExercise, type ActiveWorkoutState } from '$lib/db';
	import { user } from '$lib/stores/auth';
	import { createWorkoutLocal, completeWorkoutLocal } from '$lib/stores/sync';
	import { toasts } from '$lib/stores/toast';
	import ExerciseModal from '$lib/components/ExerciseModal.svelte';
	import LoadingState from '$lib/components/LoadingState.svelte';

	interface SetInput {
		reps: number;
		weight: number;
		completed: boolean;
	}

	interface ExerciseState {
		exercise_id: number;
		exercise_name: string;
		increment: number;
		sets: SetInput[];
	}

	$: templateId = parseInt($page.params.id);

	let templateName = '';
	let restTimeSeconds = 180;
	let exercises: ExerciseState[] = [];
	let exerciseMap: Map<number, ExerciseState> = new Map();
	let loading = true;
	let workoutId: number | null = null;
	let modalOpen = false;

	// Timer state
	let timerRunning = false;
	let timerSeconds = 0;
	let timerInterval: ReturnType<typeof setInterval> | null = null;
	let timerEndTime: number | null = null;

	$: timerWarning = timerRunning && timerSeconds < 0;

	// Audio context for beep
	let audioContext: AudioContext | null = null;
	let hasPlayedBeep = false;

	onMount(async () => {
		await loadWorkoutData();
	});

	onDestroy(() => {
		if (timerInterval) clearInterval(timerInterval);
	});

	async function loadWorkoutData() {
		loading = true;
		try {
			const userId = $user?.id;
			if (!userId) return;

			// Check for existing active workout first
			const existingState = await db.activeWorkout.where('template_id').equals(templateId).first();

			// Load template from Dexie
			const template = await db.templates.get(templateId);
			if (!template) {
				toasts.error('Template not found');
				goto('/workouts');
				return;
			}

			templateName = template.name;
			restTimeSeconds = template.rest_time;

			// Load template exercises and exercise details in parallel
			const templateExercises = await db.templateExercises
				.where('template_id')
				.equals(templateId)
				.sortBy('sort_order');

			const exerciseIds = templateExercises.map(te => te.exercise_id);
			const exerciseRecords = exerciseIds.length > 0
				? await db.exercises.where('id').anyOf(exerciseIds).toArray()
				: [];
			const exerciseDetailsMap = new Map(exerciseRecords.map(e => [e.id, e]));

			// Build exercise state with last workout data
			const exerciseStates: ExerciseState[] = [];

			for (const te of templateExercises) {
				const exercise = exerciseDetailsMap.get(te.exercise_id);
				if (!exercise) continue;

				const templateSets = JSON.parse(te.sets_data || '[]') as { reps: number; weight: number }[];
				const lastSets = await getLastSetsForExercise(userId, te.exercise_id);

				// Build sets - use last workout values if available, otherwise template values
				const sets: SetInput[] = templateSets.map((ts, idx) => {
					const lastSet = lastSets[idx];
					return {
						reps: lastSet?.reps ?? ts.reps,
						weight: lastSet?.weight ?? ts.weight,
						completed: false
					};
				});

				exerciseStates.push({
					exercise_id: te.exercise_id,
					exercise_name: exercise.name,
					increment: te.increment || 2.5,
					sets
				});
			}

			exercises = exerciseStates;
			rebuildExerciseMap();

			// Restore state from existing active workout or create new
			if (existingState) {
				workoutId = existingState.workout_id;
				restoreState(existingState);
			} else {
				// Create new workout record
				workoutId = await createWorkoutLocal(userId, templateId);
				await saveProgress();
			}
		} catch (err) {
			console.error('Failed to load workout:', err);
			toasts.error('Failed to load workout');
		} finally {
			loading = false;
		}
	}

	function rebuildExerciseMap() {
		exerciseMap = new Map(exercises.map(e => [e.exercise_id, e]));
	}

	function restoreState(saved: ActiveWorkoutState) {
		// Restore input values
		for (const [exIdStr, setsData] of Object.entries(saved.inputs || {})) {
			const exId = parseInt(exIdStr);
			const ex = exerciseMap.get(exId);
			if (ex && typeof setsData === 'object') {
				for (const [setIdxStr, values] of Object.entries(setsData)) {
					const setIdx = parseInt(setIdxStr);
					if (ex.sets[setIdx] && values) {
						if (typeof values.reps === 'number') ex.sets[setIdx].reps = values.reps;
						if (typeof values.weight === 'number') ex.sets[setIdx].weight = values.weight;
					}
				}
			}
		}

		// Restore completed sets
		for (const selector of saved.completedSets || []) {
			const match = selector.match(/ex-(\d+)-set-(\d+)/);
			if (match) {
				const exId = parseInt(match[1]);
				const setIdx = parseInt(match[2]);
				const ex = exerciseMap.get(exId);
				if (ex?.sets[setIdx]) {
					ex.sets[setIdx].completed = true;
				}
			}
		}

		// Restore timer state
		if (saved.timerEndTime && saved.timerEndTime > Date.now()) {
			timerEndTime = saved.timerEndTime;
			const remaining = Math.ceil((timerEndTime - Date.now()) / 1000);
			if (remaining > 0) {
				timerSeconds = remaining;
				startTimerInterval();
			}
		}

		exercises = [...exercises]; // Trigger reactivity
	}

	// Save progress to Dexie
	async function saveProgress() {
		const inputs: Record<string, Record<string, { reps: number; weight: number }>> = {};
		const completedSets: string[] = [];

		for (const ex of exercises) {
			inputs[ex.exercise_id] = {};
			ex.sets.forEach((set, idx) => {
				inputs[ex.exercise_id][idx] = { reps: set.reps, weight: set.weight };
				if (set.completed) {
					completedSets.push(`ex-${ex.exercise_id}-set-${idx}`);
				}
			});
		}

		await db.activeWorkout.put({
			template_id: templateId,
			workout_id: workoutId,
			inputs,
			completedSets,
			addedSets: {},
			timerEndTime,
			startedAt: Date.now(),
			updated_at: Date.now()
		});
	}

	// Timer functions
	function startTimerInterval() {
		timerRunning = true;
		hasPlayedBeep = false;

		if (timerInterval) clearInterval(timerInterval);

		timerInterval = setInterval(() => {
			if (timerEndTime) {
				timerSeconds = Math.ceil((timerEndTime - Date.now()) / 1000);

				// Play beep when timer reaches 0
				if (timerSeconds <= 0 && !hasPlayedBeep) {
					playBeep();
					hasPlayedBeep = true;
				}
			}
		}, 100);
	}

	function startTimer() {
		timerEndTime = Date.now() + (restTimeSeconds * 1000);
		timerSeconds = restTimeSeconds;
		startTimerInterval();
		saveProgress();
	}

	function stopTimer() {
		if (timerInterval) {
			clearInterval(timerInterval);
			timerInterval = null;
		}
		timerRunning = false;
		timerSeconds = 0;
		timerEndTime = null;
		saveProgress();
	}

	function toggleTimer() {
		if (timerRunning) {
			stopTimer();
		} else {
			startTimer();
		}
	}

	function playBeep() {
		try {
			if (!audioContext) {
				audioContext = new AudioContext();
			}
			const oscillator = audioContext.createOscillator();
			const gainNode = audioContext.createGain();
			oscillator.connect(gainNode);
			gainNode.connect(audioContext.destination);
			oscillator.frequency.value = 800;
			oscillator.type = 'sine';
			gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
			gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);
			oscillator.start(audioContext.currentTime);
			oscillator.stop(audioContext.currentTime + 0.5);
		} catch (e) {
			console.error('Audio error:', e);
		}
	}

	function formatTimer(seconds: number): string {
		const absSeconds = Math.abs(seconds);
		const mins = Math.floor(absSeconds / 60);
		const secs = absSeconds % 60;
		const sign = seconds < 0 ? '-' : '';
		return `${sign}${mins}:${secs.toString().padStart(2, '0')}`;
	}

	// Check if all sets for an exercise are completed
	function areAllSetsCompleted(exerciseId: number): boolean {
		const ex = exerciseMap.get(exerciseId);
		if (!ex) return false;
		return ex.sets.every(s => s.completed);
	}

	// Apply auto-increment to an exercise
	function applyAutoIncrement(exerciseId: number) {
		const ex = exerciseMap.get(exerciseId);
		if (!ex) return;

		exercises = exercises.map(e => {
			if (e.exercise_id === exerciseId) {
				return {
					...e,
					sets: e.sets.map(set => ({
						...set,
						weight: set.weight + e.increment
					}))
				};
			}
			return e;
		});
		rebuildExerciseMap();
		toasts.success(`Weight increased by ${ex.increment}kg for next time`);
	}

	// Set completion
	function toggleSetComplete(exerciseId: number, setIndex: number) {
		const ex = exerciseMap.get(exerciseId);
		if (!ex) return;

		const wasCompleted = ex.sets[setIndex].completed;
		ex.sets[setIndex].completed = !wasCompleted;

		// Trigger reactivity
		exercises = [...exercises];
		rebuildExerciseMap();

		if (!wasCompleted) {
			// Set was just completed - restart timer
			stopTimer();
			startTimer();

			// Check if all sets for this exercise are now completed
			if (areAllSetsCompleted(exerciseId)) {
				// Offer to apply auto-increment
				setTimeout(() => {
					if (confirm(`All sets completed! Increase weight by ${ex.increment}kg for next workout?`)) {
						applyAutoIncrement(exerciseId);
					}
				}, 500);
			}
		}

		saveProgress();
	}

	// Input adjustment
	function adjustInput(exerciseId: number, setIndex: number, field: 'reps' | 'weight', delta: number) {
		const ex = exerciseMap.get(exerciseId);
		if (!ex) return;

		if (field === 'reps') {
			ex.sets[setIndex].reps = Math.max(0, ex.sets[setIndex].reps + delta);
		} else {
			ex.sets[setIndex].weight = Math.max(0, ex.sets[setIndex].weight + delta);
		}

		exercises = [...exercises];
		rebuildExerciseMap();
		saveProgress();
	}

	// Add exercise from modal
	function handleExerciseSelect(event: CustomEvent<{ id: number; name: string; muscle: string }>) {
		const { id, name } = event.detail;
		if (exerciseMap.has(id)) {
			toasts.warning('Exercise already in workout');
			return;
		}

		exercises = [
			...exercises,
			{
				exercise_id: id,
				exercise_name: name,
				increment: 2.5,
				sets: [
					{ reps: 10, weight: 20, completed: false },
					{ reps: 10, weight: 20, completed: false },
					{ reps: 10, weight: 20, completed: false }
				]
			}
		];
		rebuildExerciseMap();
		toasts.success(`Added ${name}`);
		saveProgress();
	}

	// Add set to exercise
	function addSetToExercise(exerciseId: number) {
		const ex = exerciseMap.get(exerciseId);
		if (!ex) return;

		const lastSet = ex.sets[ex.sets.length - 1] || { reps: 10, weight: 20 };
		ex.sets = [...ex.sets, { reps: lastSet.reps, weight: lastSet.weight, completed: false }];

		exercises = [...exercises];
		rebuildExerciseMap();
		saveProgress();
	}

	// Cancel workout
	async function cancelWorkout() {
		if (!confirm('Are you sure you want to cancel this workout? Progress will be lost.')) return;

		await db.activeWorkout.where('template_id').equals(templateId).delete();
		toasts.info('Workout cancelled');
		goto('/');
	}

	// Finish workout
	async function finishWorkout() {
		if (!workoutId) return;

		const completedSetsData: { exercise_id: number; set_number: number; weight: number; reps: number }[] = [];
		let hasCompletedSets = false;

		for (const ex of exercises) {
			ex.sets.forEach((set, idx) => {
				if (set.completed) {
					hasCompletedSets = true;
					completedSetsData.push({
						exercise_id: ex.exercise_id,
						set_number: idx + 1,
						weight: set.weight,
						reps: set.reps
					});
				}
			});
		}

		if (!hasCompletedSets) {
			toasts.warning('Complete at least one set before finishing');
			return;
		}

		try {
			await completeWorkoutLocal(workoutId, completedSetsData);
			await db.activeWorkout.where('template_id').equals(templateId).delete();
			toasts.success('Workout completed!');
			goto('/');
		} catch (err) {
			console.error('Failed to complete workout:', err);
			toasts.error('Failed to complete workout');
		}
	}
</script>

<div class="page">
	{#if loading}
		<LoadingState message="Loading workout..." />
	{:else}
		<!-- Header with timer -->
		<div class="page-header" style="justify-content: space-between;">
			<div style="display: flex; align-items: center; gap: 12px;">
				<button class="back-btn" on:click={cancelWorkout} type="button">
					<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<line x1="18" y1="6" x2="6" y2="18"></line>
						<line x1="6" y1="6" x2="18" y2="18"></line>
					</svg>
				</button>
				<h1 class="page-title">{templateName}</h1>
			</div>

			<button
				class="workout-timer"
				class:active={timerRunning && !timerWarning}
				class:warning={timerWarning}
				on:click={toggleTimer}
				type="button"
			>
				<svg class="timer-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<circle cx="12" cy="12" r="10"></circle>
					<polyline points="12 6 12 12 16 14"></polyline>
				</svg>
				<span class="timer-display">{formatTimer(timerRunning ? timerSeconds : restTimeSeconds)}</span>
			</button>
		</div>

		<!-- Exercises -->
		{#each exercises as exercise (exercise.exercise_id)}
			<div class="card" style="margin-bottom: 16px;">
				<div class="card-title">{exercise.exercise_name}</div>

				{#each exercise.sets as set, setIndex}
					<div class="set-row" class:completed={set.completed}>
						<span class="set-number">Set {setIndex + 1}</span>

						<div class="input-spinner">
							<button type="button" class="spinner-btn" on:click={() => adjustInput(exercise.exercise_id, setIndex, 'reps', -1)}>−</button>
							<input
								type="number"
								bind:value={set.reps}
								on:change={() => saveProgress()}
							/>
							<button type="button" class="spinner-btn" on:click={() => adjustInput(exercise.exercise_id, setIndex, 'reps', 1)}>+</button>
						</div>

						<span class="set-unit">×</span>

						<div class="input-spinner">
							<button type="button" class="spinner-btn" on:click={() => adjustInput(exercise.exercise_id, setIndex, 'weight', -2.5)}>−</button>
							<input
								type="number"
								step="0.5"
								bind:value={set.weight}
								on:change={() => saveProgress()}
							/>
							<button type="button" class="spinner-btn" on:click={() => adjustInput(exercise.exercise_id, setIndex, 'weight', 2.5)}>+</button>
						</div>

						<span class="set-unit">kg</span>

						<button
							type="button"
							class="set-check"
							class:completed={set.completed}
							on:click={() => toggleSetComplete(exercise.exercise_id, setIndex)}
						></button>
					</div>
				{/each}

				<button
					type="button"
					class="add-set-btn"
					on:click={() => addSetToExercise(exercise.exercise_id)}
				>
					+ Add Set
				</button>
			</div>
		{/each}

		<!-- Add Exercise Button -->
		<button type="button" class="btn btn-secondary btn-full" on:click={() => (modalOpen = true)} style="margin-bottom: 16px;">
			+ Add Exercise
		</button>

		<!-- Finish Button -->
		<div class="sticky-bottom">
			<button type="button" class="btn btn-primary btn-full" on:click={finishWorkout}>
				Complete Workout
			</button>
		</div>

		<ExerciseModal bind:open={modalOpen} on:select={handleExerciseSelect} />
	{/if}
</div>
