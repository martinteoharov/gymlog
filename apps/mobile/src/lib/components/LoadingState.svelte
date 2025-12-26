<script lang="ts">
	export let message: string = 'Loading...';
</script>

<div class="loading-state">
	<div class="loading-spinner"></div>
	<span class="loading-message">{message}</span>
</div>

<style>
	.loading-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		padding: 48px 24px;
		gap: 16px;
	}

	.loading-spinner {
		width: 32px;
		height: 32px;
		border: 3px solid var(--border-color, #333);
		border-top-color: var(--primary, #3b82f6);
		border-radius: 50%;
		animation: spin 0.8s linear infinite;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	.loading-message {
		color: var(--text-tertiary);
		font-size: 14px;
	}
</style>
