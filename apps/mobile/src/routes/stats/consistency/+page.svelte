<script lang="ts">
	import { onMount } from 'svelte';
	import { getConsistencyData, getWorkoutStats } from '$lib/db';
	import { user } from '$lib/stores/auth';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import LoadingState from '$lib/components/LoadingState.svelte';
	import LineChart from '$lib/components/LineChart.svelte';

	let loading = true;
	let scheduledPerWeek = 0;
	let totalWorkouts = 0;
	let currentStreak = 0;
	let avgConsistency = 0;
	let chartLabels: string[] = [];
	let chartData: number[] = [];

	interface WeekData {
		week: string;
		completed: number;
		scheduled: number;
		consistency: number;
	}
	let weeklyData: WeekData[] = [];

	onMount(async () => {
		await loadData();
	});

	async function loadData() {
		loading = true;
		try {
			const userId = $user?.id;
			if (!userId) return;

			const [consistency, stats] = await Promise.all([
				getConsistencyData(userId, 12),
				getWorkoutStats(userId)
			]);

			scheduledPerWeek = consistency.scheduledPerWeek;
			totalWorkouts = stats.total;
			weeklyData = consistency.weeks;

			// Calculate average consistency
			if (weeklyData.length > 0) {
				avgConsistency = weeklyData.reduce((sum, w) => sum + w.consistency, 0) / weeklyData.length;
			}

			// Calculate current streak (consecutive weeks with 100% consistency from most recent)
			currentStreak = 0;
			for (let i = weeklyData.length - 1; i >= 0; i--) {
				if (weeklyData[i].consistency >= 1) {
					currentStreak++;
				} else {
					break;
				}
			}

			// Prepare chart data
			chartLabels = weeklyData.map((w) => formatWeekLabel(w.week));
			chartData = weeklyData.map((w) => w.consistency);
		} catch (err) {
			console.error('Failed to load consistency data:', err);
		} finally {
			loading = false;
		}
	}

	function formatWeekLabel(weekStart: string): string {
		const date = new Date(weekStart);
		return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
	}

	function formatConsistency(value: number): string {
		return `${Math.round(value * 100)}%`;
	}

	function formatPercent(value: number): string {
		return `${Math.round(value * 100)}%`;
	}
</script>

<div class="page">
	<PageHeader title="Consistency" />

	{#if loading}
		<LoadingState message="Loading data..." />
	{:else}
		<div class="summary-cards">
			<div class="summary-card">
				<div class="summary-value">{formatPercent(avgConsistency)}</div>
				<div class="summary-label">Avg Consistency</div>
			</div>
			<div class="summary-card">
				<div class="summary-value">{currentStreak}</div>
				<div class="summary-label">Week Streak</div>
			</div>
			<div class="summary-card">
				<div class="summary-value">{totalWorkouts}</div>
				<div class="summary-label">Total Workouts</div>
			</div>
		</div>

		<div class="info-box">
			<div class="info-text">
				You have <strong>{scheduledPerWeek}</strong> workout{scheduledPerWeek !== 1 ? 's' : ''} scheduled per week.
				Consistency measures how many of those you complete.
			</div>
		</div>

		<div class="chart-section">
			<h2 class="chart-title">Weekly Consistency</h2>
			{#if chartData.length > 0}
				<LineChart
					labels={chartLabels}
					data={chartData}
					label="Consistency"
					minY={0}
					maxY={1}
					formatTooltip={formatConsistency}
				/>
			{:else}
				<div class="chart-empty">Not enough data yet</div>
			{/if}
		</div>

		{#if weeklyData.length > 0}
			<div class="weekly-breakdown">
				<h2 class="section-subtitle">Weekly Breakdown</h2>
				<div class="week-list">
					{#each [...weeklyData].reverse() as week}
						<div class="week-row">
							<div class="week-date">{formatWeekLabel(week.week)}</div>
							<div class="week-stats">
								<span class="week-count">{week.completed}/{week.scheduled}</span>
								<span class="week-percent" class:perfect={week.consistency >= 1} class:low={week.consistency < 0.5}>
									{formatPercent(week.consistency)}
								</span>
							</div>
						</div>
					{/each}
				</div>
			</div>
		{/if}
	{/if}
</div>

<style>
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

	.weekly-breakdown {
		margin-top: 8px;
	}

	.section-subtitle {
		font-size: 16px;
		font-weight: 600;
		color: var(--text-primary);
		margin: 0 0 12px 0;
	}

	.week-list {
		background: var(--bg-secondary);
		border-radius: 12px;
		overflow: hidden;
	}

	.week-row {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 14px 16px;
		border-bottom: 1px solid var(--border-color);
	}

	.week-row:last-child {
		border-bottom: none;
	}

	.week-date {
		font-size: 14px;
		color: var(--text-primary);
	}

	.week-stats {
		display: flex;
		align-items: center;
		gap: 12px;
	}

	.week-count {
		font-size: 13px;
		color: var(--text-secondary);
	}

	.week-percent {
		font-size: 14px;
		font-weight: 600;
		color: var(--text-primary);
		min-width: 45px;
		text-align: right;
	}

	.week-percent.perfect {
		color: var(--accent);
	}

	.week-percent.low {
		color: #ff6b6b;
	}
</style>
