<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { db, getTemplatesWithDetails, type TemplateWithExercises, type Programme } from '$lib/db';
	import { user } from '$lib/stores/auth';
	import { activateProgramme } from '$lib/stores/sync';
	import { formatScheduledDays, getTodayDayOfWeek } from '$lib/utils/date';
	import { calculateCycleProgress, type CycleProgress } from '$lib/utils/cycle';
	import WorkoutCard from '$lib/components/WorkoutCard.svelte';
	import LoadingState from '$lib/components/LoadingState.svelte';
	import CycleProgressIndicator from '$lib/components/CycleProgressIndicator.svelte';

	let allTemplates: TemplateWithExercises[] = [];
	let programmes: Programme[] = [];
	let activeProgramme: Programme | null = null;
	let cycleProgress: CycleProgress | null = null;
	let programmeTemplateIds: number[] = [];
	let showProgrammeSelector = false;
	let loading = true;
	let todayDow = getTodayDayOfWeek();

	$: filteredTemplates = activeProgramme
		? allTemplates.filter(t => t.programme_id === activeProgramme!.id)
		: allTemplates;

	$: todayTemplateId = filteredTemplates.find((t) => t.scheduledDays.includes(todayDow))?.id;

	onMount(async () => {
		await loadData();
	});

	async function loadData() {
		loading = true;
		try {
			const userId = $user?.id;
			if (!userId) return;

			// Load programmes and templates in parallel
			const [loadedTemplates, loadedProgrammes] = await Promise.all([
				getTemplatesWithDetails(userId),
				db.programmes.where('user_id').equals(userId).toArray()
			]);

			allTemplates = loadedTemplates;
			programmes = loadedProgrammes.sort((a, b) => a.name.localeCompare(b.name));

			// Find active programme and calculate cycle progress
			activeProgramme = loadedProgrammes.find(p => p.is_active) || null;

			if (activeProgramme) {
				const programmeTemplates = allTemplates.filter(t => t.programme_id === activeProgramme!.id);
				programmeTemplateIds = programmeTemplates.map(t => t.id);
				cycleProgress = await calculateCycleProgress(userId, activeProgramme.id);
			} else {
				programmeTemplateIds = [];
				cycleProgress = null;
			}
		} catch (err) {
			console.error('Failed to load data:', err);
		} finally {
			loading = false;
		}
	}

	function toggleProgrammeSelector() {
		showProgrammeSelector = !showProgrammeSelector;
	}

	function closeProgrammeSelector() {
		showProgrammeSelector = false;
	}

	async function selectProgramme(programme: Programme) {
		if (!$user) return;
		showProgrammeSelector = false;

		if (programme.id === activeProgramme?.id) return;

		await activateProgramme($user.id, programme.id);
		await loadData();
	}

	function getExerciseNames(template: TemplateWithExercises): string {
		return template.exercises.map((e) => e.exercise_name).slice(0, 3).join(', ');
	}

	function getScheduledDayNames(template: TemplateWithExercises): string {
		return formatScheduledDays(template.scheduledDays);
	}
</script>

<svelte:window on:click={closeProgrammeSelector} />

<div class="page">
	<h1 class="section-title">Workouts</h1>

	{#if loading}
		<LoadingState message="Loading workouts..." />
	{:else}
		<!-- Programme Selector Card -->
		{#if programmes.length > 0}
			<div class="programme-selector-wrapper">
				<button
					class="programme-selector-card"
					on:click|stopPropagation={toggleProgrammeSelector}
					type="button"
				>
					<div class="programme-selector-info">
						<span class="programme-selector-label">Current Programme</span>
						<span class="programme-selector-name">
							{activeProgramme?.name || 'None selected'}
							<svg
								class="dropdown-arrow"
								class:open={showProgrammeSelector}
								xmlns="http://www.w3.org/2000/svg"
								width="14"
								height="14"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="2"
							>
								<polyline points="6 9 12 15 18 9"></polyline>
							</svg>
						</span>
					</div>
					{#if activeProgramme && cycleProgress && programmeTemplateIds.length > 0}
						<div class="programme-selector-cycle">
							<span class="cycle-label">Cycle {cycleProgress.currentCycle}</span>
							<CycleProgressIndicator
								templateIds={programmeTemplateIds}
								completedIds={cycleProgress.completedIds}
								currentId={null}
							/>
						</div>
					{/if}
				</button>

				{#if showProgrammeSelector}
					<div class="programme-dropdown" on:click|stopPropagation>
						{#each programmes as programme}
							<button
								class="dropdown-item"
								class:selected={programme.id === activeProgramme?.id}
								on:click={() => selectProgramme(programme)}
								type="button"
							>
								{programme.name}
								{#if programme.id === activeProgramme?.id}
									<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
										<polyline points="20 6 9 17 4 12"></polyline>
									</svg>
								{/if}
							</button>
						{/each}
					</div>
				{/if}
			</div>
		{/if}

		<!-- Workouts List -->
		{#each filteredTemplates as template}
			<WorkoutCard
				id={template.id}
				name={template.name}
				exercises={getExerciseNames(template)}
				scheduledDays={getScheduledDayNames(template)}
				highlighted={template.id === todayTemplateId}
				showStart={true}
			/>
		{/each}

		<!-- Empty State -->
		{#if filteredTemplates.length === 0}
			<div class="empty-state">
				<div class="empty-state-title">No Workouts Yet</div>
				<div class="empty-state-text">Create your first workout to get started</div>
			</div>
		{/if}
	{/if}

	<!-- Create New Button - always visible -->
	<button class="btn btn-primary btn-full" on:click={() => goto('/workouts/new')} style="margin-top: 16px;">
		+ Create Workout
	</button>
</div>

<style>
	.programme-selector-wrapper {
		position: relative;
		margin-bottom: 20px;
	}

	.programme-selector-card {
		display: flex;
		align-items: center;
		justify-content: space-between;
		width: 100%;
		padding: 12px 16px;
		background: var(--bg-secondary);
		border: none;
		border-radius: var(--border-radius);
		cursor: pointer;
		text-align: left;
		transition: background var(--transition);
	}

	.programme-selector-card:hover {
		background: var(--bg-tertiary);
	}

	.programme-selector-info {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.programme-selector-label {
		font-size: 12px;
		color: var(--text-muted);
	}

	.programme-selector-name {
		display: flex;
		align-items: center;
		gap: 6px;
		font-size: 16px;
		font-weight: 600;
		color: var(--text-primary);
	}

	.dropdown-arrow {
		transition: transform 0.2s;
	}

	.dropdown-arrow.open {
		transform: rotate(180deg);
	}

	.programme-selector-cycle {
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.cycle-label {
		font-size: 13px;
		color: var(--text-muted);
	}

	.programme-dropdown {
		position: absolute;
		top: calc(100% + 4px);
		left: 0;
		right: 0;
		background: var(--bg-secondary);
		border-radius: var(--border-radius);
		overflow: hidden;
		z-index: 100;
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
	}

	.dropdown-item {
		display: flex;
		align-items: center;
		justify-content: space-between;
		width: 100%;
		padding: 12px 16px;
		background: none;
		border: none;
		color: var(--text-primary);
		font-size: 15px;
		text-align: left;
		cursor: pointer;
		transition: background var(--transition);
	}

	.dropdown-item:hover {
		background: var(--bg-tertiary);
	}

	.dropdown-item.selected {
		color: var(--accent);
	}
</style>
