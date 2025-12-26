<script lang="ts">
	import { toasts } from '$lib/stores/toast';
	import { fly } from 'svelte/transition';
</script>

<div class="toast-container">
	{#each $toasts as toast (toast.id)}
		<div
			class="toast toast-{toast.type}"
			transition:fly={{ y: -20, duration: 200 }}
			role="alert"
		>
			<span class="toast-message">{toast.message}</span>
			<button
				type="button"
				class="toast-close"
				on:click={() => toasts.remove(toast.id)}
				aria-label="Dismiss"
			>
				<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<line x1="18" y1="6" x2="6" y2="18"></line>
					<line x1="6" y1="6" x2="18" y2="18"></line>
				</svg>
			</button>
		</div>
	{/each}
</div>

<style>
	.toast-container {
		position: fixed;
		top: 16px;
		left: 16px;
		right: 16px;
		max-width: 448px;
		margin: 0 auto;
		z-index: 1000;
		display: flex;
		flex-direction: column;
		gap: 8px;
		pointer-events: none;
	}

	.toast {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		padding: 14px 16px;
		border-radius: var(--border-radius-sm, 8px);
		background: var(--accent, #e2f163);
		color: var(--bg-primary, #1c1c1e);
		box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
		pointer-events: auto;
	}

	.toast-message {
		flex: 1;
		font-size: 14px;
		font-weight: 600;
		color: var(--bg-primary, #1c1c1e);
	}

	.toast-close {
		display: flex;
		align-items: center;
		justify-content: center;
		background: none;
		border: none;
		color: var(--bg-primary, #1c1c1e);
		cursor: pointer;
		padding: 4px;
		flex-shrink: 0;
		opacity: 0.6;
		transition: opacity 0.15s;
	}

	.toast-close:hover {
		opacity: 1;
	}
</style>
