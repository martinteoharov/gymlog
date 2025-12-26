<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { user } from '$lib/stores/auth';
	import { saveTemplateWithExercises, validateTemplateData, type TemplateFormExercise } from '$lib/stores/sync';
	import { toasts } from '$lib/stores/toast';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import RestTimePicker from '$lib/components/RestTimePicker.svelte';
	import DayToggle from '$lib/components/DayToggle.svelte';
	import ExerciseModal from '$lib/components/ExerciseModal.svelte';
	import SaveStatus from '$lib/components/SaveStatus.svelte';

	let name = '';
	let restTime = 180;
	let selectedDays: number[] = [];
	let selectedExercises: TemplateFormExercise[] = [];
	let modalOpen = false;

	// Auto-save state
	let templateId: number | null = null;
	let initialized = false;
	let saveTimeout: ReturnType<typeof setTimeout> | null = null;
	let saveStatus: 'idle' | 'saving' | 'saved' | 'error' = 'idle';

	onMount(() => {
		// Enable auto-save after initial load
		setTimeout(() => {
			initialized = true;
		}, 100);
	});

	onDestroy(() => {
		// Save immediately if there's a pending save
		if (saveTimeout) {
			clearTimeout(saveTimeout);
			doSave();
		}
	});

	// Auto-save with debounce when any data changes
	$: if (initialized) {
		void [name, restTime, selectedDays.length, selectedExercises.length];
		scheduleAutoSave();
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
		// Need at least a name to save
		if (!name.trim()) return;

		const userId = $user?.id;
		if (!userId) return;

		const data = {
			name: name.trim(),
			rest_time: restTime,
			days: selectedDays,
			exercises: selectedExercises
		};

		// Validate (but don't block save for missing exercises during creation)
		const validation = validateTemplateData(data);
		if (!validation.valid && selectedExercises.length > 0) {
			return;
		}

		saveStatus = 'saving';
		try {
			const id = await saveTemplateWithExercises(userId, templateId, data);

			if (templateId === null) {
				templateId = id;
				// Update URL without navigation to reflect the new template
				history.replaceState({}, '', `/workouts/${templateId}`);
			}

			saveStatus = 'saved';
			setTimeout(() => {
				saveStatus = 'idle';
			}, 1500);
		} catch (err) {
			console.error('Failed to save template:', err);
			saveStatus = 'error';
			toasts.error('Failed to save template');
		}
	}

	function handleExerciseSelect(event: CustomEvent<{ id: number; name: string; muscle: string }>) {
		const { id, name: exerciseName, muscle } = event.detail;
		if (selectedExercises.find((e) => e.id === id)) {
			toasts.warning('Exercise already added');
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
		toasts.success(`Added ${exerciseName}`);
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
</script>

<div class="page">
	<PageHeader title="New Template">
		<span slot="right">
			<SaveStatus status={saveStatus} />
		</span>
	</PageHeader>

	<div class="form-group">
		<label for="name" class="form-label">Template Name</label>
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
		<DayToggle bind:selected={selectedDays} />
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

		<button type="button" class="btn btn-secondary btn-full" on:click={() => (modalOpen = true)} style="margin-bottom: 100px;">
			+ Add Exercise
		</button>
	</div>

	<ExerciseModal bind:open={modalOpen} on:select={handleExerciseSelect} />
</div>
