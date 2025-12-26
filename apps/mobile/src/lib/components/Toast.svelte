<script lang="ts">
	import { toasts } from '$lib/stores/toast';
	import { fly } from 'svelte/transition';
</script>

<div class="toast-container">
	{#each $toasts as toast (toast.id)}
		<div
			class="toast toast-{toast.type}"
			transition:fly={{ y: 50, duration: 200 }}
			role="alert"
		>
			<span class="toast-icon">
				{#if toast.type === 'success'}
					✓
				{:else if toast.type === 'error'}
					✕
				{:else if toast.type === 'warning'}
					⚠
				{:else}
					ℹ
				{/if}
			</span>
			<span class="toast-message">{toast.message}</span>
			<button
				type="button"
				class="toast-close"
				on:click={() => toasts.remove(toast.id)}
				aria-label="Dismiss"
			>
				✕
			</button>
		</div>
	{/each}
</div>

<style>
	.toast-container {
		position: fixed;
		bottom: 80px;
		left: 16px;
		right: 16px;
		z-index: 1000;
		display: flex;
		flex-direction: column;
		gap: 8px;
		pointer-events: none;
	}

	.toast {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 12px 16px;
		border-radius: 8px;
		background: var(--card-bg);
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
		pointer-events: auto;
	}

	.toast-success {
		border-left: 4px solid var(--success, #22c55e);
	}

	.toast-error {
		border-left: 4px solid var(--danger, #ef4444);
	}

	.toast-warning {
		border-left: 4px solid var(--warning, #f59e0b);
	}

	.toast-info {
		border-left: 4px solid var(--primary, #3b82f6);
	}

	.toast-icon {
		font-size: 16px;
		flex-shrink: 0;
	}

	.toast-success .toast-icon {
		color: var(--success, #22c55e);
	}

	.toast-error .toast-icon {
		color: var(--danger, #ef4444);
	}

	.toast-warning .toast-icon {
		color: var(--warning, #f59e0b);
	}

	.toast-info .toast-icon {
		color: var(--primary, #3b82f6);
	}

	.toast-message {
		flex: 1;
		font-size: 14px;
		color: var(--text-primary);
	}

	.toast-close {
		background: none;
		border: none;
		color: var(--text-tertiary);
		cursor: pointer;
		padding: 4px;
		font-size: 12px;
		opacity: 0.7;
		transition: opacity 0.15s;
	}

	.toast-close:hover {
		opacity: 1;
	}
</style>
