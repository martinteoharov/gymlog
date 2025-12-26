<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import {
		Chart,
		LineController,
		LineElement,
		PointElement,
		LinearScale,
		CategoryScale,
		Filler,
		Tooltip
	} from 'chart.js';

	// Register Chart.js components
	Chart.register(
		LineController,
		LineElement,
		PointElement,
		LinearScale,
		CategoryScale,
		Filler,
		Tooltip
	);

	export let labels: string[] = [];
	export let data: number[] = [];
	export let label = 'Value';
	export let yAxisLabel = '';
	export let minY: number | undefined = undefined;
	export let maxY: number | undefined = undefined;
	export let fill = true;
	export let showPoints = true;
	export let formatTooltip: ((value: number) => string) | undefined = undefined;

	let canvas: HTMLCanvasElement;
	let chart: Chart | null = null;

	// Theme colors matching app design
	const colors = {
		accent: '#e2f163',
		accentFaded: 'rgba(226, 241, 99, 0.2)',
		gridColor: 'rgba(58, 58, 60, 0.5)',
		textColor: '#8e8e93',
		bgSecondary: '#2c2c2e'
	};

	function createChart() {
		if (!canvas) return;

		const ctx = canvas.getContext('2d');
		if (!ctx) return;

		chart = new Chart(ctx, {
			type: 'line',
			data: {
				labels,
				datasets: [
					{
						label,
						data,
						borderColor: colors.accent,
						backgroundColor: fill ? colors.accentFaded : 'transparent',
						borderWidth: 2,
						fill,
						tension: 0.3,
						pointRadius: showPoints ? 4 : 0,
						pointHoverRadius: 6,
						pointBackgroundColor: colors.accent,
						pointBorderColor: colors.bgSecondary,
						pointBorderWidth: 2
					}
				]
			},
			options: {
				responsive: true,
				maintainAspectRatio: false,
				interaction: {
					intersect: false,
					mode: 'index'
				},
				plugins: {
					tooltip: {
						backgroundColor: colors.bgSecondary,
						titleColor: '#ffffff',
						bodyColor: colors.textColor,
						borderColor: colors.accent,
						borderWidth: 1,
						padding: 10,
						displayColors: false,
						callbacks: {
							label: (context) => {
								const value = context.parsed.y;
								if (formatTooltip && value !== null) {
									return formatTooltip(value);
								}
								return `${label}: ${value ?? 0}`;
							}
						}
					},
					legend: {
						display: false
					}
				},
				scales: {
					x: {
						border: {
							display: false
						},
						grid: {
							color: colors.gridColor
						},
						ticks: {
							color: colors.textColor,
							font: {
								size: 11
							},
							maxRotation: 0,
							autoSkip: true,
							maxTicksLimit: 6
						}
					},
					y: {
						min: minY,
						max: maxY,
						border: {
							display: false
						},
						grid: {
							color: colors.gridColor
						},
						ticks: {
							color: colors.textColor,
							font: {
								size: 11
							}
						},
						title: yAxisLabel
							? {
									display: true,
									text: yAxisLabel,
									color: colors.textColor,
									font: {
										size: 11
									}
								}
							: undefined
					}
				}
			}
		});
	}

	function updateChart() {
		if (!chart) return;

		chart.data.labels = labels;
		chart.data.datasets[0].data = data;
		chart.update('none');
	}

	onMount(() => {
		createChart();
	});

	onDestroy(() => {
		if (chart) {
			chart.destroy();
			chart = null;
		}
	});

	// React to data changes
	$: if (chart && (labels || data)) {
		updateChart();
	}
</script>

<div class="chart-container">
	<canvas bind:this={canvas}></canvas>
</div>

<style>
	.chart-container {
		position: relative;
		width: 100%;
		height: 200px;
	}
</style>
