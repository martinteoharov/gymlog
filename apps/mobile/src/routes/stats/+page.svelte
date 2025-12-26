<script lang="ts">
	import { goto } from '$app/navigation';
</script>

<div class="page">
	<h1 class="section-title">Stats</h1>

	<div class="stats-list">
		<button class="stat-card" on:click={() => goto('/stats/consistency')}>
			<div class="stat-icon">
				<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
					<polyline points="22 4 12 14.01 9 11.01" />
				</svg>
			</div>
			<div class="stat-info">
				<div class="stat-title">Consistency</div>
				<div class="stat-desc">Track how often you complete scheduled workouts</div>
			</div>
			<div class="stat-arrow">
				<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<polyline points="9 18 15 12 9 6" />
				</svg>
			</div>
		</button>

		<button class="stat-card" on:click={() => goto('/stats/volume')}>
			<div class="stat-icon">
				<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<path d="M3 3v18h18" />
					<path d="M18 17V9" />
					<path d="M13 17V5" />
					<path d="M8 17v-3" />
				</svg>
			</div>
			<div class="stat-info">
				<div class="stat-title">Volume</div>
				<div class="stat-desc">Weekly total weight lifted over time</div>
			</div>
			<div class="stat-arrow">
				<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<polyline points="9 18 15 12 9 6" />
				</svg>
			</div>
		</button>

		<button class="stat-card" on:click={() => goto('/stats/strength')}>
			<div class="stat-icon">
				<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<path d="M6.5 6.5h11" />
					<path d="M6.5 17.5h11" />
					<path d="M4 6.5a2.5 2.5 0 0 1 0 5v1a2.5 2.5 0 0 1 0 5" />
					<path d="M20 6.5a2.5 2.5 0 0 0 0 5v1a2.5 2.5 0 0 0 0 5" />
					<path d="M12 6.5v11" />
				</svg>
			</div>
			<div class="stat-info">
				<div class="stat-title">Strength</div>
				<div class="stat-desc">Max weight progression per exercise</div>
			</div>
			<div class="stat-arrow">
				<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<polyline points="9 18 15 12 9 6" />
				</svg>
			</div>
		</button>

		<button class="stat-card disabled" disabled>
			<div class="stat-icon">
				<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<path d="M12 2a10 10 0 1 0 10 10" />
					<path d="M12 12V6" />
					<path d="M12 2v4" />
					<circle cx="12" cy="12" r="2" />
				</svg>
			</div>
			<div class="stat-info">
				<div class="stat-title">Body Weight</div>
				<div class="stat-desc">Coming soon</div>
			</div>
			<div class="stat-arrow">
				<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<polyline points="9 18 15 12 9 6" />
				</svg>
			</div>
		</button>
	</div>
</div>

<style>
	.stats-list {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	.stat-card {
		display: flex;
		align-items: center;
		gap: 16px;
		width: 100%;
		padding: 16px;
		background: var(--bg-secondary);
		border: none;
		border-radius: 12px;
		text-align: left;
		cursor: pointer;
		transition: background 0.2s;
	}

	.stat-card:active:not(.disabled) {
		background: var(--bg-tertiary);
	}

	.stat-card.disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.stat-icon {
		width: 48px;
		height: 48px;
		display: flex;
		align-items: center;
		justify-content: center;
		background: rgba(226, 241, 99, 0.15);
		border-radius: 12px;
		color: var(--accent);
		flex-shrink: 0;
	}

	.stat-info {
		flex: 1;
		min-width: 0;
	}

	.stat-title {
		font-size: 16px;
		font-weight: 600;
		color: var(--text-primary);
		margin-bottom: 4px;
	}

	.stat-desc {
		font-size: 13px;
		color: var(--text-secondary);
	}

	.stat-arrow {
		color: var(--text-secondary);
		flex-shrink: 0;
	}
</style>
