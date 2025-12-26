<script lang="ts">
	export let templateIds: number[] = [];
	export let completedIds: Set<number> = new Set();
	export let currentId: number | null = null;
</script>

<div class="cycle-indicator">
	{#each templateIds as id}
		<span
			class="cycle-dot"
			class:completed={completedIds.has(id)}
			class:current={id === currentId}
		>
			{#if id === currentId}
				<svg
					xmlns="http://www.w3.org/2000/svg"
					width="8"
					height="8"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="3"
					stroke-linecap="round"
					stroke-linejoin="round"
				>
					<polyline points="20 6 9 17 4 12"></polyline>
				</svg>
			{/if}
		</span>
	{/each}
</div>

<style>
	.cycle-indicator {
		display: flex;
		gap: 6px;
		align-items: center;
	}

	.cycle-dot {
		width: 12px;
		height: 12px;
		border-radius: 50%;
		background: var(--text-muted);
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.cycle-dot.completed {
		background: var(--accent);
	}

	.cycle-dot.current {
		background: var(--text-muted);
	}

	.cycle-dot.current svg {
		color: var(--bg);
	}
</style>
