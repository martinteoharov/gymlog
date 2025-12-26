<script lang="ts">
	export let title: string;
	export let showBack = true;

	function goBack() {
		history.back();
	}
</script>

<div class="page-header">
	{#if showBack}
		<button class="back-btn" on:click={goBack} type="button">
			<svg
				xmlns="http://www.w3.org/2000/svg"
				width="24"
				height="24"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
				stroke-linecap="round"
				stroke-linejoin="round"
			>
				<path d="m15 18-6-6 6-6"></path>
			</svg>
		</button>
	{/if}
	<h1 class="page-title">{title}</h1>
	<slot name="right" />
</div>
