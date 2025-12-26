<script lang="ts">
	import { goto } from '$app/navigation';
	import { user, logout } from '$lib/stores/auth';
	import { syncStatus, pendingChanges, sync } from '$lib/stores/sync';
	import PageHeader from '$lib/components/PageHeader.svelte';

	let loggingOut = false;

	async function handleLogout() {
		loggingOut = true;
		try {
			await logout();
			goto('/login');
		} catch (err) {
			console.error('Logout failed:', err);
		} finally {
			loggingOut = false;
		}
	}

	async function handleSync() {
		await sync();
	}
</script>

<div class="page">
	<PageHeader title="Account" showBack={false} />

	{#if $user}
		<div class="card">
			<div class="card-title">Profile</div>
			<div class="list-item" style="background: transparent; padding: 8px 0;">
				<div>
					<div class="list-item-title">{$user.name || $user.username}</div>
					<div class="list-item-subtitle">@{$user.username}</div>
				</div>
			</div>
		</div>

		<div class="card">
			<div class="card-title">Sync Status</div>
			<div class="list-item" style="background: transparent; padding: 8px 0;">
				<div>
					<div class="list-item-title">
						{#if $syncStatus === 'syncing'}
							Syncing...
						{:else if $syncStatus === 'error'}
							Sync Error
						{:else}
							Synced
						{/if}
					</div>
					<div class="list-item-subtitle">
						{$pendingChanges} pending {$pendingChanges === 1 ? 'change' : 'changes'}
					</div>
				</div>
				<button type="button" class="btn btn-sm btn-secondary" on:click={handleSync} disabled={$syncStatus === 'syncing'}>
					Sync Now
				</button>
			</div>
		</div>

		<button
			type="button"
			class="btn btn-danger btn-full"
			on:click={handleLogout}
			disabled={loggingOut}
			style="margin-top: 24px;"
		>
			{loggingOut ? 'Logging out...' : 'Log Out'}
		</button>
	{/if}
</div>
