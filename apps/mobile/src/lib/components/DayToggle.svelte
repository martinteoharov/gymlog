<script lang="ts">
	// Days ordered Monday-first, but values still use JS convention (0=Sun, 1=Mon, etc)
	const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0]; // Mon, Tue, Wed, Thu, Fri, Sat, Sun
	const DAY_NAMES: Record<number, string> = {
		0: 'Sun', 1: 'Mon', 2: 'Tue', 3: 'Wed', 4: 'Thu', 5: 'Fri', 6: 'Sat'
	};

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
	{#each DAY_ORDER as dayIndex}<input
			type="checkbox"
			id="day-{dayIndex}"
			class="day-checkbox"
			checked={isSelected(dayIndex)}
			disabled={isTaken(dayIndex)}
			on:change={() => toggleDay(dayIndex)}
		/><label
			for="day-{dayIndex}"
			class="day-label"
			class:taken={isTaken(dayIndex)}
			title={isTaken(dayIndex) ? taken.get(dayIndex) : ''}
		>{DAY_NAMES[dayIndex]}</label>{/each}
</div>
