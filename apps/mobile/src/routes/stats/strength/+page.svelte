<script lang="ts">
	import { onMount } from 'svelte';
	import { getExercisesWithStrengthData, getStrengthProgression } from '$lib/db';
	import { user } from '$lib/stores/auth';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import LoadingState from '$lib/components/LoadingState.svelte';
	import LineChart from '$lib/components/LineChart.svelte';

	let loading = true;
	let loadingChart = false;

	interface ExerciseSummary {
		exercise_id: number;
		exercise_name: string;
		muscle_group: string;
		max_weight: number;
		workout_count: number;
	}
	let exercises: ExerciseSummary[] = [];
	let selectedExerciseId: number | null = null;
	let selectedExerciseName = '';

	let chartLabels: string[] = [];
	let chartData: number[] = [];
	let firstWeight = 0;
	let currentWeight = 0;
	let improvement = 0;

	onMount(async () => {
		await loadData();
	});

	async function loadData() {
		loading = true;
		try {
			const userId = $user?.id;
			if (!userId) return;

			exercises = await getExercisesWithStrengthData(userId);
		} catch (err) {
			console.error('Failed to load strength data:', err);
		} finally {
			loading = false;
		}
	}

	async function selectExercise(exerciseId: number, exerciseName: string) {
		const userId = $user?.id;
		if (!userId) return;

		selectedExerciseId = exerciseId;
		selectedExerciseName = exerciseName;
		loadingChart = true;

		try {
			const data = await getStrengthProgression(userId, exerciseId, 12);
			chartLabels = data.data.map((d) => formatDateLabel(d.date));
			chartData = data.data.map((d) => d.max_weight);

			if (data.data.length > 0) {
				firstWeight = data.data[0].max_weight;
				currentWeight = data.data[data.data.length - 1].max_weight;
				improvement = currentWeight - firstWeight;
			} else {
				firstWeight = 0;
				currentWeight = 0;
				improvement = 0;
			}
		} catch (err) {
			console.error('Failed to load exercise progression:', err);
		} finally {
			loadingChart = false;
		}
	}

	function clearSelection() {
		selectedExerciseId = null;
		selectedExerciseName = '';
		chartLabels = [];
		chartData = [];
	}

	function formatDateLabel(dateStr: string): string {
		const date = new Date(dateStr);
		return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
	}

	function formatWeight(value: number): string {
		return `${value} kg`;
	}

	function groupByMuscle(exercises: ExerciseSummary[]): Map<string, ExerciseSummary[]> {
		const groups = new Map<string, ExerciseSummary[]>();
		for (const ex of exercises) {
			const group = ex.muscle_group || 'Other';
			if (!groups.has(group)) {
				groups.set(group, []);
			}
			groups.get(group)!.push(ex);
		}
		return groups;
	}

	function capitalizeFirst(str: string): string {
		return str.charAt(0).toUpperCase() + str.slice(1);
	}

	$: muscleGroups = groupByMuscle(exercises);
</script>

<div class="page">
	{#if selectedExerciseId}
		<div class="custom-header">
			<button class="back-btn" on:click={clearSelection}>
				<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<polyline points="15 18 9 12 15 6" />
				</svg>
			</button>
			<h1 class="page-title">{selectedExerciseName}</h1>
		</div>

		{#if loadingChart}
			<LoadingState message="Loading progression..." />
		{:else}
			<div class="summary-cards">
				<div class="summary-card">
					<div class="summary-value">{firstWeight}</div>
					<div class="summary-label">First (kg)</div>
				</div>
				<div class="summary-card">
					<div class="summary-value">{currentWeight}</div>
					<div class="summary-label">Current (kg)</div>
				</div>
				<div class="summary-card">
					<div class="summary-value" class:positive={improvement > 0} class:negative={improvement < 0}>
						{improvement > 0 ? '+' : ''}{improvement}
					</div>
					<div class="summary-label">Change (kg)</div>
				</div>
			</div>

			<div class="chart-section">
				<h3 class="chart-title">Max Weight Over Time</h3>
				{#if chartData.length > 1}
					<LineChart
						labels={chartLabels}
						data={chartData}
						label="Max Weight"
						yAxisLabel="kg"
						formatTooltip={formatWeight}
					/>
				{:else if chartData.length === 1}
					<div class="chart-empty">Only one data point - keep training!</div>
				{:else}
					<div class="chart-empty">No data for this exercise</div>
				{/if}
			</div>

			<div class="info-box">
				<div class="info-text">
					This shows your <strong>max weight</strong> per session for this exercise.
					Consistent increases indicate strength gains.
				</div>
			</div>
		{/if}
	{:else}
		<PageHeader title="Strength" />

		{#if loading}
			<LoadingState message="Loading data..." />
		{:else}
			<div class="info-box">
			<div class="info-text">
				Select an exercise to view your <strong>strength progression</strong> over time.
			</div>
		</div>

		{#if exercises.length === 0}
			<div class="empty-state">
				<div class="empty-state-title">No Data Yet</div>
				<div class="empty-state-text">Complete workouts to track strength progress</div>
			</div>
		{:else}
			{#each [...muscleGroups.entries()] as [muscle, exList]}
				<div class="muscle-group">
					<h3 class="muscle-title">{capitalizeFirst(muscle)}</h3>
					<div class="exercise-list">
						{#each exList as ex}
							<button class="exercise-row" on:click={() => selectExercise(ex.exercise_id, ex.exercise_name)}>
								<div class="exercise-info">
									<div class="exercise-name">{ex.exercise_name}</div>
									<div class="exercise-meta">{ex.workout_count} workout{ex.workout_count !== 1 ? 's' : ''}</div>
								</div>
								<div class="exercise-weight">
									<span class="weight-value">{ex.max_weight}</span>
									<span class="weight-unit">kg</span>
								</div>
								<div class="exercise-arrow">
									<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
										<polyline points="9 18 15 12 9 6" />
									</svg>
								</div>
							</button>
						{/each}
					</div>
				</div>
			{/each}
		{/if}
		{/if}
	{/if}
</div>

<style>
	.custom-header {
		display: flex;
		align-items: center;
		gap: 12px;
		margin-bottom: 20px;
	}

	.custom-header .back-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		background: none;
		border: none;
		color: var(--text-primary);
		padding: 0;
		cursor: pointer;
	}

	.custom-header .page-title {
		font-size: 20px;
		font-weight: 700;
		color: var(--text-primary);
		margin: 0;
	}

	.summary-cards {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 12px;
		margin-bottom: 20px;
	}

	.summary-card {
		background: var(--bg-secondary);
		border-radius: 12px;
		padding: 16px 12px;
		text-align: center;
	}

	.summary-value {
		font-size: 24px;
		font-weight: 700;
		color: var(--accent);
		margin-bottom: 4px;
	}

	.summary-value.positive {
		color: #4ade80;
	}

	.summary-value.negative {
		color: #ff6b6b;
	}

	.summary-label {
		font-size: 11px;
		color: var(--text-secondary);
		text-transform: uppercase;
		letter-spacing: 0.5px;
	}

	.info-box {
		background: rgba(226, 241, 99, 0.1);
		border-radius: 12px;
		padding: 14px 16px;
		margin-bottom: 20px;
	}

	.info-text {
		font-size: 14px;
		color: var(--text-secondary);
		line-height: 1.5;
	}

	.info-text strong {
		color: var(--accent);
	}

	.chart-section {
		background: var(--bg-secondary);
		border-radius: 12px;
		padding: 16px;
		margin-bottom: 20px;
	}

	.chart-title {
		font-size: 16px;
		font-weight: 600;
		color: var(--text-primary);
		margin: 0 0 16px 0;
	}

	.chart-empty {
		height: 120px;
		display: flex;
		align-items: center;
		justify-content: center;
		color: var(--text-secondary);
		font-size: 14px;
	}

	.empty-state {
		text-align: center;
		padding: 48px 24px;
	}

	.empty-state-title {
		font-size: 18px;
		font-weight: 600;
		color: var(--text-primary);
		margin-bottom: 8px;
	}

	.empty-state-text {
		font-size: 14px;
		color: var(--text-secondary);
	}

	.muscle-group {
		margin-bottom: 24px;
	}

	.muscle-title {
		font-size: 13px;
		font-weight: 600;
		color: var(--text-secondary);
		text-transform: uppercase;
		letter-spacing: 0.5px;
		margin: 0 0 10px 4px;
	}

	.exercise-list {
		background: var(--bg-secondary);
		border-radius: 12px;
		overflow: hidden;
	}

	.exercise-row {
		display: flex;
		align-items: center;
		width: 100%;
		padding: 14px 16px;
		background: none;
		border: none;
		border-bottom: 1px solid var(--border-color);
		text-align: left;
		cursor: pointer;
	}

	.exercise-row:last-child {
		border-bottom: none;
	}

	.exercise-row:active {
		background: var(--bg-tertiary);
	}

	.exercise-info {
		flex: 1;
		min-width: 0;
	}

	.exercise-name {
		font-size: 15px;
		color: var(--text-primary);
		margin-bottom: 2px;
	}

	.exercise-meta {
		font-size: 12px;
		color: var(--text-secondary);
	}

	.exercise-weight {
		margin-right: 8px;
	}

	.weight-value {
		font-size: 16px;
		font-weight: 600;
		color: var(--accent);
	}

	.weight-unit {
		font-size: 12px;
		color: var(--text-secondary);
		margin-left: 2px;
	}

	.exercise-arrow {
		color: var(--text-secondary);
	}
</style>
