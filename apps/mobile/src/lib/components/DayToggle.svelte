<script lang="ts">
	const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

	export let selected: number[] = [];
	export let taken: Map<number, string> = new Map();

	function toggleDay(day: number) {
		if (taken.has(day)) return;

		if (selected.includes(day)) {
			selected = selected.filter((d) => d !== day);
		} else {
			selected = [...selected, day];
		}
	}

	function isSelected(day: number): boolean {
		return selected.includes(day);
	}

	function isTaken(day: number): boolean {
		return taken.has(day);
	}
</script>

<div class="day-toggle">
	{#each DAY_NAMES as dayName, index}<input
			type="checkbox"
			id="day-{index}"
			class="day-checkbox"
			checked={isSelected(index)}
			disabled={isTaken(index)}
			on:change={() => toggleDay(index)}
		/><label
			for="day-{index}"
			class="day-label"
			class:taken={isTaken(index)}
			title={isTaken(index) ? taken.get(index) : ''}
		>{dayName}</label>{/each}
</div>
