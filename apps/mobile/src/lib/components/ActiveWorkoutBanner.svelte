<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import { db, getActiveWorkout, type ActiveWorkoutState } from '$lib/db';

	let activeWorkout: ActiveWorkoutState | null = null;
	let templateName = '';

	$: currentPath = $page.url.pathname;
	$: isOnActivePage = currentPath.includes('/active');

	onMount(() => {
		checkActiveWorkout();
	});

	async function checkActiveWorkout() {
		const workout = await getActiveWorkout();
		if (workout) {
			activeWorkout = workout;
			// Get template name
			const template = await db.templates.get(workout.template_id);
			templateName = template?.name || 'Workout';
		} else {
			activeWorkout = null;
		}
	}

	// Re-check when navigating
	$: if (currentPath) {
		checkActiveWorkout();
	}
</script>

{#if activeWorkout && !isOnActivePage}
	<a href="/workouts/{activeWorkout.template_id}/active" class="banner">
		<div class="banner-content">
			<span class="banner-icon">
				<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<polygon points="5 3 19 12 5 21 5 3"></polygon>
				</svg>
			</span>
			<div class="banner-text">
				<span class="banner-title">Continue {templateName}</span>
				<span class="banner-subtitle">Workout in progress</span>
			</div>
		</div>
		<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
			<polyline points="9 18 15 12 9 6"></polyline>
		</svg>
	</a>
{/if}

<style>
	.banner {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 12px 16px;
		background: var(--accent, #e2f163);
		color: var(--bg-primary, #1c1c1e);
		text-decoration: none;
		margin: -16px -16px 16px -16px;
	}

	.banner-content {
		display: flex;
		align-items: center;
		gap: 12px;
	}

	.banner-icon {
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.banner-text {
		display: flex;
		flex-direction: column;
	}

	.banner-title {
		font-size: 15px;
		font-weight: 600;
	}

	.banner-subtitle {
		font-size: 12px;
		opacity: 0.8;
	}
</style>
