<script lang="ts">
	import { confirmDialog } from '$lib/stores/confirm';
	import { fade, scale } from 'svelte/transition';
</script>

{#if $confirmDialog.open}
	<div class="overlay" transition:fade={{ duration: 150 }}>
		<div class="dialog" transition:scale={{ duration: 150, start: 0.95 }}>
			{#if $confirmDialog.title}
				<h3 class="dialog-title">{$confirmDialog.title}</h3>
			{/if}
			<p class="dialog-message">{$confirmDialog.message}</p>
			<div class="dialog-actions">
				<button
					type="button"
					class="dialog-btn cancel"
					on:click={() => confirmDialog.respond(false)}
				>
					{$confirmDialog.cancelText}
				</button>
				<button
					type="button"
					class="dialog-btn confirm {$confirmDialog.variant}"
					on:click={() => confirmDialog.respond(true)}
				>
					{$confirmDialog.confirmText}
				</button>
			</div>
		</div>
	</div>
{/if}

<style>
	.overlay {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.7);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 1100;
		padding: 24px;
	}

	.dialog {
		background: var(--bg-secondary, #2c2c2e);
		border-radius: var(--border-radius, 12px);
		padding: 24px;
		max-width: 320px;
		width: 100%;
	}

	.dialog-title {
		font-size: 18px;
		font-weight: 600;
		color: var(--text-primary, #ffffff);
		margin: 0 0 8px 0;
	}

	.dialog-message {
		font-size: 15px;
		color: var(--text-secondary, #8e8e93);
		margin: 0 0 24px 0;
		line-height: 1.5;
	}

	.dialog-actions {
		display: flex;
		gap: 12px;
	}

	.dialog-btn {
		flex: 1;
		padding: 12px 16px;
		font-size: 15px;
		font-weight: 600;
		border: none;
		border-radius: var(--border-radius-sm, 8px);
		cursor: pointer;
		transition: all 0.15s;
	}

	.dialog-btn.cancel {
		background: var(--bg-tertiary, #3a3a3c);
		color: var(--text-primary, #ffffff);
	}

	.dialog-btn.cancel:hover {
		background: var(--bg-primary, #1c1c1e);
	}

	.dialog-btn.confirm.primary {
		background: var(--accent, #e2f163);
		color: var(--bg-primary, #1c1c1e);
	}

	.dialog-btn.confirm.primary:hover {
		background: var(--accent-dark, #c9d856);
	}

	.dialog-btn.confirm.danger {
		background: var(--danger, #ff453a);
		color: #ffffff;
	}

	.dialog-btn.confirm.danger:hover {
		opacity: 0.9;
	}
</style>
