<script lang="ts">
	export let value = 180;

	// Format seconds as M:SS
	$: display = (() => {
		const minutes = Math.floor(value / 60);
		const seconds = value % 60;
		return `${minutes}:${seconds.toString().padStart(2, '0')}`;
	})();

	function adjust(delta: number) {
		const newValue = value + delta;
		if (newValue >= 15 && newValue <= 600) {
			value = newValue;
		}
	}
</script>

<div class="rest-time-picker">
	<div class="time-spinner">
		<button type="button" class="spinner-btn" on:click={() => adjust(-15)}>−</button>
		<div class="time-display">{display}</div>
		<button type="button" class="spinner-btn" on:click={() => adjust(15)}>+</button>
	</div>
</div>
