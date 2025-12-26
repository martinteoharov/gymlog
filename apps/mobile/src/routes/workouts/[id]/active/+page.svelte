<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { db, getLastSetsForExercise, type ActiveWorkoutState, type Programme } from '$lib/db';
	import { user } from '$lib/stores/auth';
	import { createWorkoutLocal, completeWorkoutLocal } from '$lib/stores/sync';
	import { confirmDialog } from '$lib/stores/confirm';
	import { calculateCycleProgress, calculateTemplateDisplayWeights, type CycleProgress, type DisplayWeightResult } from '$lib/utils/cycle';
	import ExerciseModal from '$lib/components/ExerciseModal.svelte';
	import LoadingState from '$lib/components/LoadingState.svelte';
	import CycleProgressIndicator from '$lib/components/CycleProgressIndicator.svelte';

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
	let loading = true;
	let workoutId: number | null = null;
	let activeWorkoutId: number | undefined = undefined; // Dexie record ID for updates
	let startedAt: number = Date.now(); // Preserve original start time
	let modalOpen = false;

	// Programme and cycle state
	let activeProgramme: Programme | null = null;
	let cycleProgress: CycleProgress | null = null;
	let programmeTemplateIds: number[] = [];

	// Rest timer state
	let timerRunning = false;
	let timerSeconds = 0;
	let timerInterval: ReturnType<typeof setInterval> | null = null;
	let timerEndTime: number | null = null;

	$: timerWarning = timerRunning && timerSeconds < 0;

	// Workout duration timer
	let workoutDuration = 0;
	let durationInterval: ReturnType<typeof setInterval> | null = null;

	// Audio context for beep
	let audioContext: AudioContext | null = null;
	let hasPlayedBeep = false;

	onMount(async () => {
		await loadWorkoutData();
		startDurationTimer();
	});

	onDestroy(() => {
		if (timerInterval) clearInterval(timerInterval);
		if (durationInterval) clearInterval(durationInterval);
	});

	function startDurationTimer() {
		// Update duration every second
		updateDuration();
		durationInterval = setInterval(updateDuration, 1000);
	}

	function updateDuration() {
		workoutDuration = Math.floor((Date.now() - startedAt) / 1000);
	}

	function formatWorkoutDuration(seconds: number): string {
		const hours = Math.floor(seconds / 3600);
		const mins = Math.floor((seconds % 3600) / 60);
		const secs = seconds % 60;

		if (hours > 0) {
			return `${hours}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
		}
		return `${mins}:${secs.toString().padStart(2, '0')}`;
	}

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
				goto('/workouts');
				return;
			}

			templateName = template.name;
			restTimeSeconds = template.rest_time;

			// Load programme and cycle progress if template belongs to one
			if (template.programme_id) {
				activeProgramme = await db.programmes.get(template.programme_id) || null;
				if (activeProgramme) {
					const programmeTemplates = await db.templates.where('programme_id').equals(activeProgramme.id).toArray();
					programmeTemplateIds = programmeTemplates.map(t => t.id);
					cycleProgress = await calculateCycleProgress(userId, activeProgramme.id);
				}
			}

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

			// Calculate dynamic weights if part of a programme
			let displayWeights: Map<number, DisplayWeightResult> | null = null;
			if (activeProgramme && cycleProgress) {
				displayWeights = await calculateTemplateDisplayWeights(userId, activeProgramme.id, templateId, templateExercises);
			}

			// Build exercise state with last workout data
			const exerciseStates: ExerciseState[] = [];

			for (const te of templateExercises) {
				const exercise = exerciseDetailsMap.get(te.exercise_id);
				if (!exercise) continue;

				const templateSets = JSON.parse(te.sets_data || '[]') as { reps: number; weight: number }[];
				const lastSets = await getLastSetsForExercise(userId, te.exercise_id);

				// Get dynamic weight if available (cycle-based progression)
				const dynamicWeight = displayWeights?.get(te.exercise_id);

				// Build sets - use dynamic weight, last workout values, or template values
				const sets: SetInput[] = templateSets.map((ts, idx) => {
					const lastSet = lastSets[idx];
					// Priority: dynamic weight (if cycle complete) > last workout > template
					let weight = ts.weight;
					if (dynamicWeight) {
						weight = dynamicWeight.weight;
					} else if (lastSet?.weight != null) {
						weight = lastSet.weight;
					}
					return {
						reps: lastSet?.reps ?? ts.reps,
						weight,
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

			// Restore state from existing active workout or create new
			if (existingState) {
				activeWorkoutId = existingState.id;
				workoutId = existingState.workout_id;
				startedAt = existingState.startedAt;
				restoreState(existingState);
			} else {
				// Create new workout record
				workoutId = await createWorkoutLocal(userId, templateId);
				await saveProgress();
			}
		} catch (err) {
			console.error('Failed to load workout:', err);
		} finally {
			loading = false;
		}
	}

	function restoreState(saved: ActiveWorkoutState) {
		// Restore input values - using exercise index as key
		for (const [exIndexStr, setsData] of Object.entries(saved.inputs || {})) {
			const exIndex = parseInt(exIndexStr);
			const ex = exercises[exIndex];
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
				const exIndex = parseInt(match[1]);
				const setIdx = parseInt(match[2]);
				const ex = exercises[exIndex];
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

	// Save progress to Dexie - using exercise index as key
	async function saveProgress() {
		const inputs: Record<string, Record<string, { reps: number; weight: number }>> = {};
		const completedSets: string[] = [];

		exercises.forEach((ex, exIndex) => {
			inputs[exIndex] = {};
			ex.sets.forEach((set, setIdx) => {
				inputs[exIndex][setIdx] = { reps: set.reps, weight: set.weight };
				if (set.completed) {
					completedSets.push(`ex-${exIndex}-set-${setIdx}`);
				}
			});
		});

		const record: ActiveWorkoutState = {
			template_id: templateId,
			workout_id: workoutId,
			inputs,
			completedSets,
			addedSets: {},
			timerEndTime,
			startedAt,
			updated_at: Date.now()
		};

		// Include id if we have one (for updates), otherwise let Dexie auto-generate
		if (activeWorkoutId !== undefined) {
			record.id = activeWorkoutId;
		}

		const newId = await db.activeWorkout.put(record);
		// Store the ID for subsequent saves
		if (activeWorkoutId === undefined) {
			activeWorkoutId = newId;
		}
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
	function areAllSetsCompleted(exIndex: number): boolean {
		const ex = exercises[exIndex];
		if (!ex) return false;
		return ex.sets.every(s => s.completed);
	}

	// Apply auto-increment to an exercise
	function applyAutoIncrement(exIndex: number) {
		const ex = exercises[exIndex];
		if (!ex) return;

		exercises = exercises.map((e, i) => {
			if (i === exIndex) {
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
	}

	// Set completion
	async function toggleSetComplete(exIndex: number, setIndex: number) {
		const ex = exercises[exIndex];
		if (!ex) return;

		const wasCompleted = ex.sets[setIndex].completed;
		ex.sets[setIndex].completed = !wasCompleted;

		// Trigger reactivity
		exercises = [...exercises];

		if (!wasCompleted) {
			// Set was just completed - restart timer
			stopTimer();
			startTimer();
		}

		saveProgress();
	}

	// Input adjustment
	function adjustInput(exIndex: number, setIndex: number, field: 'reps' | 'weight', delta: number) {
		const ex = exercises[exIndex];
		if (!ex) return;

		if (field === 'reps') {
			ex.sets[setIndex].reps = Math.max(0, ex.sets[setIndex].reps + delta);
		} else {
			ex.sets[setIndex].weight = Math.max(0, ex.sets[setIndex].weight + delta);
		}

		exercises = [...exercises];
		saveProgress();
	}

	// Add exercise from modal
	function handleExerciseSelect(event: CustomEvent<{ id: number; name: string; muscle: string }>) {
		const { id, name } = event.detail;

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
		saveProgress();
	}

	// Add set to exercise
	function addSetToExercise(exIndex: number) {
		const ex = exercises[exIndex];
		if (!ex) return;

		const lastSet = ex.sets[ex.sets.length - 1] || { reps: 10, weight: 20 };
		ex.sets = [...ex.sets, { reps: lastSet.reps, weight: lastSet.weight, completed: false }];

		exercises = [...exercises];
		saveProgress();
	}

	// Cancel workout
	async function cancelWorkout() {
		const confirmed = await confirmDialog.confirm({
			title: 'Cancel Workout?',
			message: 'Are you sure you want to cancel this workout? Progress will be lost.',
			confirmText: 'Cancel Workout',
			cancelText: 'Keep Going',
			variant: 'danger'
		});
		if (!confirmed) return;

		await db.activeWorkout.where('template_id').equals(templateId).delete();
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
			return;
		}

		try {
			await completeWorkoutLocal(workoutId, completedSetsData);
			await db.activeWorkout.where('template_id').equals(templateId).delete();
			goto('/');
		} catch (err) {
			console.error('Failed to complete workout:', err);
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
				<div>
					<h1 class="page-title" style="margin-bottom: 2px;">{templateName}</h1>
					<div class="workout-meta">
						<span class="workout-duration">{formatWorkoutDuration(workoutDuration)}</span>
						{#if cycleProgress && programmeTemplateIds.length > 0}
							<span class="meta-separator">·</span>
							<CycleProgressIndicator
								templateIds={programmeTemplateIds}
								completedIds={cycleProgress.completedIds}
								currentId={templateId}
							/>
						{/if}
					</div>
				</div>
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
		{#each exercises as exercise, exIndex (exIndex)}
			<div class="card" style="margin-bottom: 16px;">
				<div class="card-title">{exercise.exercise_name}</div>

				{#each exercise.sets as set, setIndex}
					<div class="set-row" class:completed={set.completed}>
						<span class="set-number">Set {setIndex + 1}</span>

						<div class="input-spinner">
							<button type="button" class="spinner-btn" on:click={() => adjustInput(exIndex, setIndex, 'reps', -1)}>−</button>
							<input
								type="number"
								bind:value={set.reps}
								on:change={() => saveProgress()}
							/>
							<button type="button" class="spinner-btn" on:click={() => adjustInput(exIndex, setIndex, 'reps', 1)}>+</button>
						</div>

						<span class="set-unit">×</span>

						<div class="input-spinner">
							<button type="button" class="spinner-btn" on:click={() => adjustInput(exIndex, setIndex, 'weight', -2.5)}>−</button>
							<input
								type="number"
								step="0.5"
								bind:value={set.weight}
								on:change={() => saveProgress()}
							/>
							<button type="button" class="spinner-btn" on:click={() => adjustInput(exIndex, setIndex, 'weight', 2.5)}>+</button>
						</div>

						<span class="set-unit">kg</span>

						<button
							type="button"
							class="set-check"
							class:completed={set.completed}
							on:click={() => toggleSetComplete(exIndex, setIndex)}
						></button>
					</div>
				{/each}

				<button
					type="button"
					class="add-set-btn"
					on:click={() => addSetToExercise(exIndex)}
				>
					+ Add Set
				</button>
			</div>
		{/each}

		<!-- Add Exercise Button -->
		<button type="button" class="btn btn-secondary btn-full" on:click={() => (modalOpen = true)} style="margin-bottom: 120px;">
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
