<script lang="ts">
	export let status: 'idle' | 'saving' | 'saved' | 'error' = 'idle';
</script>

<span
	class="save-status"
	class:saving={status === 'saving'}
	class:saved={status === 'saved'}
	class:error={status === 'error'}
>
	{#if status === 'saving'}
		Saving...
	{:else if status === 'saved'}
		Saved
	{:else if status === 'error'}
		Error saving
	{/if}
</span>

<style>
	.save-status {
		font-size: 12px;
		color: var(--text-tertiary);
		opacity: 0;
		transition: opacity 0.2s ease;
	}

	.save-status.saving,
	.save-status.saved,
	.save-status.error {
		opacity: 1;
	}

	.save-status.saved {
		color: var(--success);
	}

	.save-status.error {
		color: var(--danger);
	}
</style>
