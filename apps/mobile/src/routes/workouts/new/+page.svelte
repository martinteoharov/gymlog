<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { page } from '$app/stores';
	import { db } from '$lib/db';
	import { user } from '$lib/stores/auth';
	import { saveTemplateWithExercises, validateTemplateData, getActiveProgramme, type TemplateFormExercise } from '$lib/stores/sync';
	import { confirmDialog } from '$lib/stores/confirm';
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
	let programmeId: number | null = null;
	let programmeName: string | null = null;

	// Auto-save state
	let templateId: number | null = null;
	let initialized = false;
	let saveTimeout: ReturnType<typeof setTimeout> | null = null;
	let saveStatus: 'idle' | 'saving' | 'saved' | 'error' = 'idle';

	onMount(async () => {
		// Check for programme query param or use active programme
		const queryProgrammeId = $page.url.searchParams.get('programme');
		if (queryProgrammeId) {
			const prog = await db.programmes.get(parseInt(queryProgrammeId));
			if (prog) {
				programmeId = prog.id;
				programmeName = prog.name;
			}
		} else if ($user) {
			// Auto-assign to active programme
			const activeProg = await getActiveProgramme($user.id);
			if (activeProg) {
				programmeId = activeProg.id;
				programmeName = activeProg.name;
			}
		}

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
			exercises: selectedExercises,
			programme_id: programmeId
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

	async function handleBack() {
		// If template has been saved (has an ID), just go back
		if (templateId !== null) {
			history.back();
			return;
		}

		// If there's unsaved data (exercises added but no name), warn the user
		if (selectedExercises.length > 0 && !name.trim()) {
			const confirmed = await confirmDialog.confirm({
				title: 'Unsaved Template',
				message: 'You have added exercises but haven\'t given this template a name. If you leave now, your changes will be lost.',
				confirmText: 'Leave Anyway',
				cancelText: 'Stay',
				variant: 'danger'
			});
			if (!confirmed) return;
		}

		history.back();
	}
</script>

<div class="page">
	<PageHeader title="New Workout" customBack on:back={handleBack}>
		<span slot="right">
			<SaveStatus status={saveStatus} />
		</span>
	</PageHeader>

	{#if programmeName}
		<div class="programme-badge">
			<span class="programme-badge-label">Programme:</span>
			<span class="programme-badge-name">{programmeName}</span>
		</div>
	{/if}

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
