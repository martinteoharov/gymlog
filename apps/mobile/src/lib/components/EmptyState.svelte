<script lang="ts">
	export let title = '';
	export let text = '';
</script>

<div class="empty-state">
	<slot name="icon" />
	{#if title}
		<div class="empty-state-title">{title}</div>
	{/if}
	{#if text}
		<div class="empty-state-text">{text}</div>
	{/if}
</div>
