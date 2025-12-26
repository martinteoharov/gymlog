<script lang="ts">
	import { createEventDispatcher, onMount } from 'svelte';
	import { db } from '$lib/db';

	interface Exercise {
		id: number;
		name: string;
		muscle_group: string;
	}

	export let open = false;

	const dispatch = createEventDispatcher<{
		select: { id: number; name: string; muscle: string };
	}>();

	let searchQuery = '';
	let allExercises: Exercise[] = [];
	let exercises: Exercise[] = [];
	let loading = false;

	// Load all exercises once on mount
	onMount(async () => {
		await loadAllExercises();
	});

	// Filter exercises when modal opens or query changes
	$: if (open) {
		filterExercises(searchQuery);
	}

	async function loadAllExercises() {
		loading = true;
		try {
			// Read from Dexie (offline-first)
			allExercises = await db.exercises.toArray();
			exercises = allExercises;
		} catch (err) {
			console.error('Failed to load exercises:', err);
		} finally {
			loading = false;
		}
	}

	function filterExercises(query: string) {
		if (!query.trim()) {
			exercises = allExercises;
		} else {
			const lowerQuery = query.toLowerCase();
			exercises = allExercises.filter(
				ex =>
					ex.name.toLowerCase().includes(lowerQuery) ||
					ex.muscle_group.toLowerCase().includes(lowerQuery)
			);
		}
	}

	// Group exercises by muscle group
	$: grouped = (() => {
		const groups: Record<string, Exercise[]> = {};
		for (const ex of exercises) {
			if (!groups[ex.muscle_group]) {
				groups[ex.muscle_group] = [];
			}
			groups[ex.muscle_group].push(ex);
		}
		return groups;
	})();

	function close() {
		open = false;
		searchQuery = '';
	}

	function handleSelect(ex: Exercise) {
		dispatch('select', { id: ex.id, name: ex.name, muscle: ex.muscle_group });
		close();
	}

	function handleOverlayClick(e: Event) {
		if ((e.target as HTMLElement).classList.contains('modal-overlay')) {
			close();
		}
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') close();
	}
</script>

<svelte:window on:keydown={handleKeydown} />

<div
	class="modal-overlay"
	class:active={open}
	on:click={handleOverlayClick}
	role="dialog"
	aria-modal="true"
	tabindex="-1"
>
	<div class="modal">
		<div class="modal-header">
			<h2 class="modal-title">Add Exercise</h2>
			<button class="modal-close" on:click={close} type="button">
				<svg
					xmlns="http://www.w3.org/2000/svg"
					width="24"
					height="24"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
				>
					<line x1="18" y1="6" x2="6" y2="18"></line>
					<line x1="6" y1="6" x2="18" y2="18"></line>
				</svg>
			</button>
		</div>

		<div class="modal-search">
			<input
				type="text"
				class="form-input"
				placeholder="Search exercises..."
				bind:value={searchQuery}
			/>
		</div>

		<div class="modal-body">
			{#if loading && exercises.length === 0}
				<div class="loading">Loading...</div>
			{:else if Object.keys(grouped).length === 0}
				<div class="empty-state">No exercises found</div>
			{:else}
				{#each Object.entries(grouped) as [muscleGroup, groupExercises]}
					<div class="muscle-section">
						<div class="muscle-section-title">{muscleGroup}</div>
						<div class="exercise-gallery">
							{#each groupExercises as ex}
								<button
									class="exercise-chip"
									on:click={() => handleSelect(ex)}
									type="button"
								>
									{ex.name}
								</button>
							{/each}
						</div>
					</div>
				{/each}
			{/if}
		</div>
	</div>
</div>

<style>
	.empty-state {
		text-align: center;
		color: var(--text-tertiary);
		padding: 24px;
	}
</style>
