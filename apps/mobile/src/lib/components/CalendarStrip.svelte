<script lang="ts">
	interface CalendarDay {
		dayName: string;
		dayNumber: number;
		isToday: boolean;
		hasWorkout: boolean;
	}

	export let days: CalendarDay[] = [];
</script>

<div class="calendar-strip">
	{#each days as day}
		<div class="calendar-day" class:today={day.isToday} class:has-workout={day.hasWorkout}>
			<span class="calendar-day-name">{day.dayName}</span>
			<span class="calendar-day-number">{day.dayNumber}</span>
		</div>
	{/each}
</div>
