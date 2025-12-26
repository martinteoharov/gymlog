<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { page } from '$app/stores';
	import { db, getScheduleConflicts } from '$lib/db';
	import { user } from '$lib/stores/auth';
	import { saveTemplateWithExercises, deleteTemplateWithExercises, validateTemplateData, type TemplateFormExercise } from '$lib/stores/sync';
	import { confirmDialog } from '$lib/stores/confirm';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import RestTimePicker from '$lib/components/RestTimePicker.svelte';
	import DayToggle from '$lib/components/DayToggle.svelte';
	import ExerciseModal from '$lib/components/ExerciseModal.svelte';
	import SaveStatus from '$lib/components/SaveStatus.svelte';
	import LoadingState from '$lib/components/LoadingState.svelte';

	$: templateId = parseInt($page.params.id);

	let name = '';
	let restTime = 180;
	let selectedDays: number[] = [];
	let selectedExercises: TemplateFormExercise[] = [];
	let takenDays: Map<number, string> = new Map();
	let modalOpen = false;
	let deleting = false;
	let loading = true;
	let initialized = false;
	let saveTimeout: ReturnType<typeof setTimeout> | null = null;
	let saveStatus: 'idle' | 'saving' | 'saved' | 'error' = 'idle';
	let hasUserEdited = false; // Only show save status after user makes a change

	// Programme info
	let programmeId: number | null = null;
	let programmeName: string | null = null;

	// Track original values to detect changes
	let originalName = '';
	let originalRestTime = 180;
	let originalDays: number[] = [];
	let originalExerciseCount = 0;

	// Handle page unload to save pending changes
	function handleBeforeUnload(event: BeforeUnloadEvent) {
		if (saveTimeout && checkForChanges()) {
			// Try to save synchronously isn't possible, but we can warn the user
			event.preventDefault();
			event.returnValue = 'You have unsaved changes. Are you sure you want to leave?';
			return event.returnValue;
		}
	}

	onMount(async () => {
		await loadTemplate();
		// Add beforeunload handler
		if (typeof window !== 'undefined') {
			window.addEventListener('beforeunload', handleBeforeUnload);
		}
	});

	onDestroy(() => {
		// Remove beforeunload handler
		if (typeof window !== 'undefined') {
			window.removeEventListener('beforeunload', handleBeforeUnload);
		}
		// Save immediately if there's a pending save and there are actual changes
		if (saveTimeout) {
			clearTimeout(saveTimeout);
			if (checkForChanges()) {
				doSave();
			}
		}
	});

	async function loadTemplate() {
		loading = true;
		try {
			const userId = $user?.id;
			if (!userId) return;

			// Load template and conflicts in parallel
			const [template, conflicts] = await Promise.all([
				db.templates.get(templateId),
				getScheduleConflicts(userId, templateId)
			]);

			if (!template) {
				history.back();
				return;
			}

			name = template.name;
			restTime = template.rest_time;
			programmeId = template.programme_id ?? null;
			takenDays = conflicts;

			// Load programme name if assigned
			if (programmeId) {
				const programme = await db.programmes.get(programmeId);
				programmeName = programme?.name ?? null;
			}

			// Load template exercises with exercise details (batch query)
			const templateExercises = await db.templateExercises
				.where('template_id')
				.equals(templateId)
				.sortBy('sort_order');

			const exerciseIds = templateExercises.map(te => te.exercise_id);
			const exercises = exerciseIds.length > 0
				? await db.exercises.where('id').anyOf(exerciseIds).toArray()
				: [];
			const exerciseMap = new Map(exercises.map(e => [e.id, e]));

			selectedExercises = templateExercises.map(te => {
				const exercise = exerciseMap.get(te.exercise_id);
				return {
					id: te.exercise_id,
					name: exercise?.name || 'Unknown',
					muscle: exercise?.muscle_group || '',
					increment: te.increment || 2.5,
					sets: JSON.parse(te.sets_data || '[]')
				};
			});

			// Load scheduled days for this template
			const schedules = await db.schedule
				.where('template_id')
				.equals(templateId)
				.toArray();
			selectedDays = schedules.map(s => s.day_of_week);

			// Store original values
			originalName = name;
			originalRestTime = restTime;
			originalDays = [...selectedDays];
			originalExerciseCount = selectedExercises.length;
		} catch (err) {
			console.error('Failed to load template:', err);
		} finally {
			loading = false;
			// Wait a tick before enabling auto-save to avoid saving on initial load
			setTimeout(() => {
				initialized = true;
			}, 100);
		}
	}

	// Check if there are actual changes
	function checkForChanges(): boolean {
		if (name !== originalName) return true;
		if (restTime !== originalRestTime) return true;
		if (selectedExercises.length !== originalExerciseCount) return true;
		if (selectedDays.length !== originalDays.length) return true;
		if (!selectedDays.every((d, i) => originalDays.includes(d))) return true;
		return false;
	}

	// Auto-save with debounce when any data changes
	$: if (initialized && !loading) {
		// Create a serializable representation to trigger reactivity
		void [name, restTime, selectedDays.length, selectedExercises.length];
		// Only schedule save if there are actual changes
		if (checkForChanges()) {
			hasUserEdited = true;
			scheduleAutoSave();
		}
	}

	function scheduleAutoSave() {
		if (saveTimeout) {
			clearTimeout(saveTimeout);
		}
		saveTimeout = setTimeout(() => {
			doSave();
		}, 500);
	}

	async function doSave() {
		if (!name.trim() || loading || !initialized) return;

		const userId = $user?.id;
		if (!userId) return;

		const data = {
			name: name.trim(),
			rest_time: restTime,
			days: selectedDays,
			exercises: selectedExercises,
			programme_id: programmeId
		};

		// Validate
		const validation = validateTemplateData(data);
		if (!validation.valid) {
			// Don't show errors during auto-save, just skip
			return;
		}

		saveStatus = 'saving';
		try {
			await saveTemplateWithExercises(userId, templateId, data);

			// Update original values after successful save
			originalName = name;
			originalRestTime = restTime;
			originalDays = [...selectedDays];
			originalExerciseCount = selectedExercises.length;

			saveStatus = 'saved';
			setTimeout(() => {
				saveStatus = 'idle';
			}, 1500);
		} catch (err) {
			console.error('Failed to auto-save template:', err);
			saveStatus = 'error';
		}
	}

	function handleExerciseSelect(event: CustomEvent<{ id: number; name: string; muscle: string }>) {
		const { id, name: exerciseName, muscle } = event.detail;
		if (selectedExercises.find((e) => e.id === id)) {
			return;
		}

		selectedExercises = [
			...selectedExercises,
			{
				id,
				name: exerciseName,
				muscle,
				increment: 2.5,
				sets: [
					{ reps: 10, weight: 20 },
					{ reps: 10, weight: 20 },
					{ reps: 10, weight: 20 }
				]
			}
		];
	}

	function removeExercise(id: number) {
		selectedExercises = selectedExercises.filter((e) => e.id !== id);
	}

	function addSet(exerciseId: number) {
		selectedExercises = selectedExercises.map((ex) => {
			if (ex.id === exerciseId) {
				const lastSet = ex.sets[ex.sets.length - 1] || { reps: 10, weight: 20 };
				return { ...ex, sets: [...ex.sets, { ...lastSet }] };
			}
			return ex;
		});
	}

	function removeSet(exerciseId: number, setIndex: number) {
		selectedExercises = selectedExercises.map((ex) => {
			if (ex.id === exerciseId && ex.sets.length > 1) {
				return { ...ex, sets: ex.sets.filter((_, i) => i !== setIndex) };
			}
			return ex;
		});
	}

	function updateSet(exerciseId: number, setIndex: number, field: 'reps' | 'weight', value: number) {
		selectedExercises = selectedExercises.map((ex) => {
			if (ex.id === exerciseId) {
				const newSets = [...ex.sets];
				newSets[setIndex] = { ...newSets[setIndex], [field]: value };
				return { ...ex, sets: newSets };
			}
			return ex;
		});
	}

	function updateIncrement(exerciseId: number, value: number) {
		selectedExercises = selectedExercises.map((ex) => {
			if (ex.id === exerciseId) {
				return { ...ex, increment: value };
			}
			return ex;
		});
	}

	async function handleDelete() {
		const confirmed = await confirmDialog.confirm({
			title: 'Delete Template?',
			message: 'Are you sure you want to delete this template? This cannot be undone.',
			confirmText: 'Delete',
			cancelText: 'Cancel',
			variant: 'danger'
		});
		if (!confirmed) return;

		deleting = true;
		try {
			await deleteTemplateWithExercises(templateId);
			history.back();
		} catch (err) {
			console.error('Failed to delete template:', err);
		} finally {
			deleting = false;
		}
	}
</script>

<div class="page">
	<PageHeader title={loading ? 'Loading...' : name || 'Edit Template'}>
		<span slot="right">
			{#if hasUserEdited}
				<SaveStatus status={saveStatus} />
			{/if}
		</span>
	</PageHeader>

	{#if loading}
		<LoadingState message="Loading template..." />
	{:else}
		<div class="form-group">
			<label for="name" class="form-label">Workout Name</label>
			<input
				type="text"
				id="name"
				class="form-input"
				bind:value={name}
				placeholder="e.g., Push Day, Leg Day"
			/>
		</div>

		<div class="form-group">
			<label class="form-label">Rest Time Between Sets</label>
			<RestTimePicker bind:value={restTime} />
		</div>

		<div class="form-group">
			<label class="form-label">Schedule Days</label>
			<DayToggle bind:selected={selectedDays} taken={takenDays} />
		</div>

		<div class="form-group">
			<label class="form-label">Exercises</label>

			{#each selectedExercises as exercise}
				<div class="exercise-item-card">
					<div class="exercise-item-header">
						<span class="exercise-item-grip">⋮⋮</span>
						<span class="exercise-item-name">{exercise.name}</span>
						<button
							type="button"
							class="exercise-item-remove"
							on:click={() => removeExercise(exercise.id)}
						>
							✕
						</button>
					</div>

					<div class="exercise-sets-header">
						<span class="set-col-label">Set</span>
						<span class="set-col-label">Reps</span>
						<span class="set-col-label">Weight</span>
						<span></span>
					</div>

					<div class="exercise-sets">
						{#each exercise.sets as set, setIndex}
							<div class="exercise-set-row">
								<span class="set-number">{setIndex + 1}</span>
								<input
									type="number"
									value={set.reps}
									on:change={(e) =>
										updateSet(exercise.id, setIndex, 'reps', parseInt(e.currentTarget.value) || 0)}
								/>
								<input
									type="number"
									step="0.5"
									value={set.weight}
									on:change={(e) =>
										updateSet(
											exercise.id,
											setIndex,
											'weight',
											parseFloat(e.currentTarget.value) || 0
										)}
								/>
								<button
									type="button"
									class="set-remove-btn"
									on:click={() => removeSet(exercise.id, setIndex)}
									disabled={exercise.sets.length <= 1}
								>
									✕
								</button>
							</div>
						{/each}
					</div>

					<button type="button" class="add-set-btn" on:click={() => addSet(exercise.id)}>
						+ Add Set
					</button>

					<div class="increment-row">
						<span class="increment-label">Auto-increment</span>
						<div class="increment-input">
							<input
								type="number"
								step="0.5"
								value={exercise.increment}
								on:change={(e) =>
									updateIncrement(exercise.id, parseFloat(e.currentTarget.value) || 2.5)}
							/>
							<span>kg</span>
						</div>
					</div>
				</div>
			{/each}

			<button type="button" class="btn btn-secondary btn-full" on:click={() => (modalOpen = true)}>
				+ Add Exercise
			</button>
		</div>

		<button
			type="button"
			class="btn btn-danger btn-full"
			on:click={handleDelete}
			disabled={deleting}
			style="margin-bottom: 100px;"
		>
			{deleting ? 'Deleting...' : 'Delete Template'}
		</button>

		<ExerciseModal bind:open={modalOpen} on:select={handleExerciseSelect} />
	{/if}
</div>
