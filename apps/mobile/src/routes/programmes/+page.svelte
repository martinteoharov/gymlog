<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { db, type Programme } from '$lib/db';
	import { user } from '$lib/stores/auth';
	import { activateProgramme, deleteProgramme } from '$lib/stores/sync';
	import { confirmDialog } from '$lib/stores/confirm';
	import { calculateCycleProgress, type CycleProgress } from '$lib/utils/cycle';
	import CycleProgressIndicator from '$lib/components/CycleProgressIndicator.svelte';
	import LoadingState from '$lib/components/LoadingState.svelte';

	interface ProgrammeWithDetails extends Programme {
		template_count: number;
		templateIds: number[];
		cycleProgress: CycleProgress | null;
	}

	let programmes: ProgrammeWithDetails[] = [];
	let loading = true;

	async function loadProgrammes() {
		if (!$user) return;
		loading = true;

		const allProgrammes = await db.programmes.where('user_id').equals($user.id).toArray();

		programmes = await Promise.all(
			allProgrammes.map(async (prog) => {
				const templates = await db.templates.where('programme_id').equals(prog.id).toArray();
				const templateIds = templates.map(t => t.id);

				let cycleProgress: CycleProgress | null = null;
				if (prog.is_active && templateIds.length > 0) {
					cycleProgress = await calculateCycleProgress($user!.id, prog.id);
				}

				return {
					...prog,
					template_count: templates.length,
					templateIds,
					cycleProgress
				};
			})
		);

		// Sort alphabetically only, don't reorder by active status
		programmes.sort((a, b) => a.name.localeCompare(b.name));

		loading = false;
	}

	async function handleActivate(e: Event, prog: ProgrammeWithDetails) {
		e.stopPropagation();
		if (!$user || prog.is_active) return;

		await activateProgramme($user.id, prog.id);
		await loadProgrammes();
	}

	async function handleDelete(e: Event, prog: ProgrammeWithDetails) {
		e.stopPropagation();
		if (!$user) return;

		const confirmed = await confirmDialog.confirm({
			title: 'Delete Programme',
			message: `Delete "${prog.name}" and all its ${prog.template_count} template(s)? This cannot be undone.`,
			confirmText: 'Delete',
			cancelText: 'Cancel',
			variant: 'danger'
		});

		if (confirmed) {
			await deleteProgramme(prog.id);
			await loadProgrammes();
		}
	}

	function handleCardClick(prog: ProgrammeWithDetails) {
		goto(`/programmes/${prog.id}`);
	}

	onMount(() => {
		loadProgrammes();
	});
</script>

<div class="page">
	<h1 class="section-title">Programmes</h1>

	{#if loading}
		<LoadingState message="Loading programmes..." />
	{:else}
		{#if programmes.length > 0}
			{#each programmes as prog}
				<div
					class="workout-card"
					class:highlighted={prog.is_active}
					on:click={() => handleCardClick(prog)}
					on:keydown={(e) => e.key === 'Enter' && handleCardClick(prog)}
					role="button"
					tabindex="0"
				>
					<div class="workout-card-info">
						<div class="workout-card-name">
							{prog.name}
							{#if prog.is_active}
								<span class="active-badge">Active</span>
							{/if}
						</div>
						<div class="workout-card-meta">
							{prog.template_count} workout{prog.template_count !== 1 ? 's' : ''}
						</div>
						{#if prog.is_active && prog.cycleProgress && prog.templateIds.length > 0}
							<div class="workout-card-days" style="display: flex; align-items: center; gap: 8px; margin-top: 8px;">
								<span>Cycle {prog.cycleProgress.currentCycle}:</span>
								<CycleProgressIndicator
									templateIds={prog.templateIds}
									completedIds={prog.cycleProgress.completedIds}
									currentId={null}
								/>
							</div>
						{/if}
					</div>
					{#if !prog.is_active}
						<button class="start-btn secondary" on:click={(e) => handleActivate(e, prog)} type="button">
							Set Active
						</button>
					{/if}
				</div>
			{/each}
		{:else}
			<div class="empty-state">
				<div class="empty-state-title">No Programmes Yet</div>
				<div class="empty-state-text">Create a programme to group your workout templates together</div>
			</div>
		{/if}
	{/if}

	<button class="btn btn-primary btn-full" on:click={() => goto('/programmes/new')} style="margin-top: 16px;">
		+ Create Programme
	</button>
</div>

<style>
	.active-badge {
		display: inline-block;
		font-size: 11px;
		font-weight: 600;
		padding: 2px 6px;
		margin-left: 8px;
		background: var(--accent);
		color: var(--bg-primary);
		border-radius: 4px;
		vertical-align: middle;
	}
</style>
