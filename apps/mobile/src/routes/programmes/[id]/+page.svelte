<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { db, type Programme, type Template } from '$lib/db';
	import { user } from '$lib/stores/auth';
	import { saveProgramme, activateProgramme, deleteProgramme, queueChange } from '$lib/stores/sync';
	import { confirmDialog } from '$lib/stores/confirm';
	import { calculateCycleProgress, type CycleProgress } from '$lib/utils/cycle';
	import CycleProgressIndicator from '$lib/components/CycleProgressIndicator.svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import LoadingState from '$lib/components/LoadingState.svelte';

	interface TemplateWithExercises extends Template {
		exercises: { exercise_id: number; exercise_name: string }[];
	}

	let programme: Programme | null = null;
	let templates: TemplateWithExercises[] = [];
	let cycleProgress: CycleProgress | null = null;
	let loading = true;
	let editing = false;
	let editName = '';

	$: programmeId = parseInt($page.params.id);
	$: templateIds = templates.map(t => t.id);

	async function loadProgramme() {
		if (!$user) return;

		programme = await db.programmes.get(programmeId) || null;
		if (!programme) {
			goto('/programmes');
			return;
		}

		editName = programme.name;

		const rawTemplates = await db.templates.where('programme_id').equals(programmeId).toArray();
		templates = await Promise.all(
			rawTemplates.map(async (template) => {
				const templateExercises = await db.templateExercises
					.where('template_id')
					.equals(template.id)
					.sortBy('sort_order');

				const exercises = await Promise.all(
					templateExercises.map(async (te) => {
						const exercise = await db.exercises.get(te.exercise_id);
						return {
							exercise_id: te.exercise_id,
							exercise_name: exercise?.name || 'Unknown'
						};
					})
				);

				return { ...template, exercises };
			})
		);

		if (programme.is_active && templates.length > 0) {
			cycleProgress = await calculateCycleProgress($user.id, programmeId);
		}

		loading = false;
	}

	async function handleSave() {
		if (!$user || !programme || !editName.trim()) return;

		await saveProgramme($user.id, programme.id, {
			name: editName.trim(),
			is_active: !!programme.is_active
		});

		programme.name = editName.trim();
		editing = false;
	}

	async function handleActivate() {
		if (!$user || !programme || programme.is_active) return;

		await activateProgramme($user.id, programme.id);
		programme.is_active = 1;
		if (templates.length > 0) {
			cycleProgress = await calculateCycleProgress($user.id, programmeId);
		}
	}

	async function handleDelete() {
		if (!$user || !programme) return;

		const confirmed = await confirmDialog.confirm({
			title: 'Delete Programme',
			message: `Delete "${programme.name}" and all its ${templates.length} template(s)? This cannot be undone.`,
			confirmText: 'Delete',
			cancelText: 'Cancel',
			variant: 'danger'
		});

		if (confirmed) {
			await deleteProgramme(programme.id);
			goto('/programmes');
		}
	}

	async function toggleCycleComplete(e: Event, template: TemplateWithExercises) {
		e.stopPropagation();
		if (!$user || !cycleProgress) return;

		const isCompleted = cycleProgress.completedIds.has(template.id);

		if (isCompleted) {
			// Remove from completed - delete the most recent workout for this template
			const workouts = await db.workouts
				.where('user_id')
				.equals($user.id)
				.filter(w => w.template_id === template.id && w.completed_at !== null)
				.toArray();

			if (workouts.length > 0) {
				// Sort to get most recent
				workouts.sort((a, b) =>
					new Date(b.completed_at!).getTime() - new Date(a.completed_at!).getTime()
				);
				const mostRecent = workouts[0];

				// Delete sets first
				const sets = await db.sets.where('workout_id').equals(mostRecent.id).toArray();
				for (const set of sets) {
					await db.sets.delete(set.id);
					await queueChange('sets', set.id, 'delete', null);
				}

				// Delete workout
				await db.workouts.delete(mostRecent.id);
				await queueChange('workouts', mostRecent.id, 'delete', null);
			}
		} else {
			// Mark as completed - create a minimal workout record
			const now = new Date().toISOString();
			const workoutId = -Date.now(); // Negative ID for local

			const workout = {
				id: workoutId,
				user_id: $user.id,
				template_id: template.id,
				started_at: now,
				completed_at: now,
				updated_at: Date.now()
			};

			await db.workouts.put(workout);
			await queueChange('workouts', workoutId, 'create', workout);
		}

		// Recalculate cycle progress
		cycleProgress = await calculateCycleProgress($user.id, programmeId);
	}

	function handleTemplateClick(template: TemplateWithExercises) {
		goto(`/workouts/${template.id}`);
	}

	function handleStartWorkout(e: Event, template: TemplateWithExercises) {
		e.stopPropagation();
		goto(`/workouts/${template.id}/active`);
	}

	function getExerciseNames(template: TemplateWithExercises): string {
		const names = template.exercises.map(e => e.exercise_name).slice(0, 3);
		if (template.exercises.length > 3) {
			return names.join(', ') + ` +${template.exercises.length - 3} more`;
		}
		return names.join(', ') || 'No exercises';
	}

	onMount(() => {
		loadProgramme();
	});
</script>

<div class="page">
	{#if loading}
		<LoadingState message="Loading programme..." />
	{:else if programme}
		<PageHeader title={editing ? '' : programme.name}>
			<span slot="right">
				{#if !editing}
					<button class="icon-btn" on:click={() => editing = true} type="button">
						<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
							<path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>
						</svg>
					</button>
				{/if}
			</span>
		</PageHeader>

		{#if editing}
			<div class="form-group">
				<label for="name" class="form-label">Programme Name</label>
				<input
					type="text"
					id="name"
					class="form-input"
					bind:value={editName}
					on:keydown={(e) => e.key === 'Enter' && handleSave()}
				/>
			</div>
			<div style="display: flex; gap: 12px; margin-bottom: 24px;">
				<button class="btn btn-primary" on:click={handleSave} type="button">Save</button>
				<button class="btn btn-secondary" on:click={() => { editing = false; editName = programme?.name || ''; }} type="button">Cancel</button>
			</div>
		{/if}

		<!-- Status Section -->
		<div class="status-section">
			{#if programme.is_active}
				<div class="status-badge active">Active Programme</div>
				{#if cycleProgress && templateIds.length > 0}
					<div class="cycle-status">
						<span class="cycle-label">Cycle {cycleProgress.currentCycle}</span>
						<CycleProgressIndicator
							{templateIds}
							completedIds={cycleProgress.completedIds}
							currentId={null}
						/>
					</div>
				{/if}
			{:else}
				<button class="btn btn-primary" on:click={handleActivate} type="button">
					Set as Active Programme
				</button>
			{/if}
		</div>

		<!-- Templates Section -->
		<h2 class="section-subtitle">Templates</h2>

		{#if templates.length === 0}
			<div class="empty-state">
				<div class="empty-state-title">No Templates</div>
				<div class="empty-state-text">Add templates to this programme</div>
			</div>
		{:else}
			{#each templates as template}
				<div
					class="workout-card"
					on:click={() => handleTemplateClick(template)}
					on:keydown={(e) => e.key === 'Enter' && handleTemplateClick(template)}
					role="button"
					tabindex="0"
				>
					{#if programme.is_active && cycleProgress}
						<button
							class="cycle-toggle"
							class:completed={cycleProgress.completedIds.has(template.id)}
							on:click={(e) => toggleCycleComplete(e, template)}
							type="button"
							aria-label={cycleProgress.completedIds.has(template.id) ? 'Mark as incomplete' : 'Mark as complete'}
						></button>
					{/if}
					<div class="workout-card-info">
						<div class="workout-card-name">{template.name}</div>
						<div class="workout-card-meta">{getExerciseNames(template)}</div>
					</div>
					<button class="start-btn" on:click={(e) => handleStartWorkout(e, template)} type="button">
						Start
					</button>
				</div>
			{/each}
		{/if}

		<button class="btn btn-secondary btn-full" on:click={() => goto(`/workouts/new?programme=${programmeId}`)} style="margin-top: 8px;">
			+ Create Workout
		</button>

		<!-- Danger Zone -->
		<div class="danger-zone">
			<button class="btn btn-danger btn-full" on:click={handleDelete} type="button">
				Delete Programme
			</button>
		</div>
	{/if}
</div>

<style>
	.status-section {
		display: flex;
		align-items: center;
		gap: 16px;
		flex-wrap: wrap;
		margin-bottom: 24px;
	}

	.status-badge {
		display: inline-flex;
		align-items: center;
		padding: 6px 12px;
		border-radius: 20px;
		font-size: 13px;
		font-weight: 600;
	}

	.status-badge.active {
		background: var(--accent);
		color: var(--bg-primary);
	}

	.cycle-status {
		display: flex;
		align-items: center;
		gap: 10px;
	}

	.cycle-label {
		font-size: 14px;
		color: var(--text-secondary);
	}

	.icon-btn {
		background: none;
		border: none;
		color: var(--text-secondary);
		padding: 4px;
		cursor: pointer;
	}

	.icon-btn:hover {
		color: var(--text-primary);
	}

	.cycle-toggle {
		width: 20px;
		height: 20px;
		min-width: 20px;
		border-radius: 50%;
		border: 2px solid var(--text-muted);
		background: transparent;
		cursor: pointer;
		margin-right: 12px;
		transition: all 0.15s;
	}

	.cycle-toggle:hover {
		border-color: var(--accent);
	}

	.cycle-toggle.completed {
		background: var(--accent);
		border-color: var(--accent);
	}

	.danger-zone {
		margin-top: 32px;
		padding-top: 24px;
		border-top: 1px solid var(--bg-tertiary);
	}
</style>
