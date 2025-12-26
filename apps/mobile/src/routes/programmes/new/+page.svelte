<script lang="ts">
	import { goto } from '$app/navigation';
	import { user } from '$lib/stores/auth';
	import { saveProgramme } from '$lib/stores/sync';
	import PageHeader from '$lib/components/PageHeader.svelte';

	let name = '';
	let setAsActive = true;
	let saving = false;

	async function handleSubmit() {
		if (!$user || !name.trim()) return;

		saving = true;

		try {
			const programmeId = await saveProgramme($user.id, null, {
				name: name.trim(),
				is_active: setAsActive
			});

			goto(`/programmes/${programmeId}`);
		} catch (error) {
			console.error('Failed to create programme:', error);
			saving = false;
		}
	}
</script>

<div class="page">
	<PageHeader title="New Programme" />

	<form on:submit|preventDefault={handleSubmit}>
		<div class="form-group">
			<label for="name" class="form-label">Programme Name</label>
			<input
				type="text"
				id="name"
				class="form-input"
				bind:value={name}
				placeholder="e.g., PPL Split, 5/3/1, Upper/Lower"
				required
			/>
		</div>

		<div class="form-group">
			<label class="checkbox-label">
				<input type="checkbox" bind:checked={setAsActive} />
				<span>Set as active programme</span>
			</label>
		</div>

		<button type="submit" class="btn btn-primary btn-full" disabled={saving || !name.trim()}>
			{saving ? 'Creating...' : 'Create Programme'}
		</button>
	</form>
</div>

<style>
	form {
		display: flex;
		flex-direction: column;
		gap: 16px;
	}

	.checkbox-label {
		display: flex;
		align-items: center;
		gap: 10px;
		cursor: pointer;
		font-size: 15px;
	}

	.checkbox-label input[type="checkbox"] {
		width: 20px;
		height: 20px;
		accent-color: var(--accent);
	}
</style>
