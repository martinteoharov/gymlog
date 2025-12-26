<script lang="ts">
	import { onMount } from 'svelte';
	import { getWorkoutStats } from '$lib/db';
	import { user } from '$lib/stores/auth';
	import StatCard from '$lib/components/StatCard.svelte';
	import LoadingState from '$lib/components/LoadingState.svelte';

	let totalWorkouts = 0;
	let thisWeekWorkouts = 0;
	let thisMonthWorkouts = 0;
	let loading = true;

	onMount(async () => {
		await loadStats();
	});

	async function loadStats() {
		loading = true;
		try {
			const userId = $user?.id;
			if (!userId) return;

			// Use the helper function
			const stats = await getWorkoutStats(userId);
			totalWorkouts = stats.total;
			thisWeekWorkouts = stats.thisWeek;
			thisMonthWorkouts = stats.thisMonth;
		} catch (err) {
			console.error('Failed to load stats:', err);
		} finally {
			loading = false;
		}
	}
</script>

<div class="page">
	<h1 class="section-title">Stats</h1>

	{#if loading}
		<LoadingState message="Loading stats..." />
	{:else}
		<div class="stats-grid">
			<StatCard value={totalWorkouts} label="Total Workouts" />
			<StatCard value={thisWeekWorkouts} label="This Week" />
			<StatCard value={thisMonthWorkouts} label="This Month" />
		</div>

		{#if totalWorkouts === 0}
			<div class="empty-state" style="margin-top: 32px;">
				<div class="empty-state-title">No Workouts Yet</div>
				<div class="empty-state-text">Complete your first workout to see stats here</div>
			</div>
		{/if}
	{/if}
</div>
