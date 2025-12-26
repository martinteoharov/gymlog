<script lang="ts">
	import { onMount } from 'svelte';
	import { getWeeklyVolumeTrend } from '$lib/db';
	import { user } from '$lib/stores/auth';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import LoadingState from '$lib/components/LoadingState.svelte';
	import LineChart from '$lib/components/LineChart.svelte';

	let loading = true;
	let totalVolume = 0;
	let avgWeeklyVolume = 0;
	let peakVolume = 0;
	let peakWeek = '';
	let chartLabels: string[] = [];
	let chartData: number[] = [];

	interface WeekData {
		week: string;
		totalVolume: number;
		workouts: number;
		avgVolumePerWorkout: number;
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

			weeklyData = await getWeeklyVolumeTrend(userId, 12);

			// Calculate totals
			totalVolume = weeklyData.reduce((sum, w) => sum + w.totalVolume, 0);

			if (weeklyData.length > 0) {
				avgWeeklyVolume = totalVolume / weeklyData.length;

				// Find peak week
				let peak = weeklyData[0];
				for (const w of weeklyData) {
					if (w.totalVolume > peak.totalVolume) {
						peak = w;
					}
				}
				peakVolume = peak.totalVolume;
				peakWeek = formatWeekLabel(peak.week);
			}

			// Prepare chart data
			chartLabels = weeklyData.map((w) => formatWeekLabel(w.week));
			chartData = weeklyData.map((w) => w.totalVolume);
		} catch (err) {
			console.error('Failed to load volume data:', err);
		} finally {
			loading = false;
		}
	}

	function formatWeekLabel(weekStart: string): string {
		const date = new Date(weekStart);
		return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
	}

	function formatVolume(value: number): string {
		if (value >= 1000) {
			return `${(value / 1000).toFixed(1)}k kg`;
		}
		return `${Math.round(value)} kg`;
	}

	function formatVolumeShort(value: number): string {
		if (value >= 1000000) {
			return `${(value / 1000000).toFixed(1)}M`;
		}
		if (value >= 1000) {
			return `${(value / 1000).toFixed(1)}k`;
		}
		return Math.round(value).toString();
	}
</script>

<div class="page">
	<PageHeader title="Volume" />

	{#if loading}
		<LoadingState message="Loading data..." />
	{:else}
		<div class="summary-cards">
			<div class="summary-card">
				<div class="summary-value">{formatVolumeShort(totalVolume)}</div>
				<div class="summary-label">Total (kg)</div>
			</div>
			<div class="summary-card">
				<div class="summary-value">{formatVolumeShort(avgWeeklyVolume)}</div>
				<div class="summary-label">Avg/Week (kg)</div>
			</div>
			<div class="summary-card">
				<div class="summary-value">{formatVolumeShort(peakVolume)}</div>
				<div class="summary-label">Peak Week</div>
			</div>
		</div>

		<div class="info-box">
			<div class="info-text">
				Volume is calculated as <strong>weight × reps</strong> for all sets.
				Higher volume generally means more muscle stimulus.
			</div>
		</div>

		<div class="chart-section">
			<h2 class="chart-title">Weekly Volume</h2>
			{#if chartData.length > 0}
				<LineChart
					labels={chartLabels}
					data={chartData}
					label="Volume"
					formatTooltip={formatVolume}
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
							<div class="week-info">
								<div class="week-date">{formatWeekLabel(week.week)}</div>
								<div class="week-workouts">{week.workouts} workout{week.workouts !== 1 ? 's' : ''}</div>
							</div>
							<div class="week-volume">
								{formatVolume(week.totalVolume)}
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

	.week-info {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.week-date {
		font-size: 14px;
		color: var(--text-primary);
	}

	.week-workouts {
		font-size: 12px;
		color: var(--text-secondary);
	}

	.week-volume {
		font-size: 14px;
		font-weight: 600;
		color: var(--accent);
	}
</style>
