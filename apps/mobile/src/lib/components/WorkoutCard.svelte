<script lang="ts">
	import { goto } from '$app/navigation';

	export let id: number;
	export let name: string;
	export let exercises = '';
	export let scheduledDays = '';
	export let highlighted = false;
	export let showStart = false;
	export let startLabel = 'Start';
	export let secondary = false;

	function handleCardClick() {
		goto(`/workouts/${id}`);
	}

	function handleStartClick(e: Event) {
		e.stopPropagation();
		goto(`/workouts/${id}/active`);
	}
</script>

<div
	class="workout-card"
	class:highlighted
	on:click={handleCardClick}
	on:keydown={(e) => e.key === 'Enter' && handleCardClick()}
	role="button"
	tabindex="0"
>
	<div class="workout-card-info">
		<div class="workout-card-name">{name}</div>
		{#if exercises}
			<div class="workout-card-meta">{exercises}</div>
		{/if}
		{#if scheduledDays}
			<div class="workout-card-days">{scheduledDays}</div>
		{/if}
	</div>
	{#if showStart}
		<button class="start-btn" class:secondary on:click={handleStartClick} type="button">
			{startLabel}
		</button>
	{/if}
</div>
