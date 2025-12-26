<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { getTemplatesWithDetails, type TemplateWithExercises } from '$lib/db';
	import { user } from '$lib/stores/auth';
	import { formatScheduledDays, getTodayDayOfWeek } from '$lib/utils/date';
	import WorkoutCard from '$lib/components/WorkoutCard.svelte';
	import LoadingState from '$lib/components/LoadingState.svelte';

	let templates: TemplateWithExercises[] = [];
	let loading = true;
	let todayDow = getTodayDayOfWeek();

	$: todayTemplate = templates.find((t) => t.scheduledDays.includes(todayDow));
	$: otherTemplates = templates.filter((t) => !t.scheduledDays.includes(todayDow));

	onMount(async () => {
		await loadTemplates();
	});

	async function loadTemplates() {
		loading = true;
		try {
			const userId = $user?.id;
			if (!userId) return;

			// Use batch loading helper (no N+1 queries)
			templates = await getTemplatesWithDetails(userId);
		} catch (err) {
			console.error('Failed to load templates:', err);
		} finally {
			loading = false;
		}
	}

	function getExerciseNames(template: TemplateWithExercises): string {
		return template.exercises.map((e) => e.exercise_name).slice(0, 3).join(', ');
	}

	function getScheduledDayNames(template: TemplateWithExercises): string {
		return formatScheduledDays(template.scheduledDays);
	}
</script>

<div class="page">
	<h1 class="section-title">Workouts</h1>

	{#if loading}
		<LoadingState message="Loading templates..." />
	{:else}
		<!-- Today's Workout -->
		{#if todayTemplate}
			<h2 class="section-subtitle">Today's Workout</h2>
			<WorkoutCard
				id={todayTemplate.id}
				name={todayTemplate.name}
				exercises={getExerciseNames(todayTemplate)}
				scheduledDays={getScheduledDayNames(todayTemplate)}
				highlighted={true}
				showStart={true}
			/>
		{/if}

		<!-- Other Templates -->
		{#if otherTemplates.length > 0}
			<h2 class="section-subtitle">{todayTemplate ? 'Other Templates' : 'Your Templates'}</h2>
			{#each otherTemplates as template}
				<WorkoutCard
					id={template.id}
					name={template.name}
					exercises={getExerciseNames(template)}
					scheduledDays={getScheduledDayNames(template)}
					showStart={true}
					secondary={true}
				/>
			{/each}
		{/if}

		<!-- Empty State -->
		{#if templates.length === 0}
			<div class="empty-state">
				<div class="empty-state-title">No Templates Yet</div>
				<div class="empty-state-text">Create your first workout template to get started</div>
			</div>
		{/if}
	{/if}

	<!-- Create New Button - always visible -->
	<button class="btn btn-primary btn-full" on:click={() => goto('/workouts/new')} style="margin-top: 16px;">
		+ Create Template
	</button>
</div>
