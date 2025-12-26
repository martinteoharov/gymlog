<script lang="ts">
	export let value: number | string;
	export let label: string;
</script>

<div class="stat-card">
	<div class="stat-value">{value}</div>
	<div class="stat-label">{label}</div>
</div>
