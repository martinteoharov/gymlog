<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { user, authLoading, checkAuth } from '$lib/stores/auth';
	import { initSync } from '$lib/stores/sync';
	import Toast from '$lib/components/Toast.svelte';

	$: currentPath = $page.url.pathname;

	// Reactive active states
	$: homeActive = currentPath === '/';
	$: workoutsActive = currentPath === '/workouts' || currentPath.startsWith('/workouts/');
	$: statsActive = currentPath === '/stats';
	$: accountActive = currentPath === '/account';

	onMount(async () => {
		await checkAuth();
		await initSync();
	});

	// Redirect to login if not authenticated
	$: if (!$authLoading && !$user && currentPath !== '/login') {
		goto('/login');
	}
</script>

{#if $authLoading}
	<div class="app">
		<div class="content">
			<div class="loading">Loading...</div>
		</div>
	</div>
{:else if !$user && currentPath !== '/login'}
	<!-- Redirecting to login -->
{:else}
	<div class="app">
		<main id="content" class="content">
			<slot />
		</main>
		<Toast />

		{#if currentPath !== '/login'}
			<nav class="navbar">
				<a
					href="/"
					class="nav-item"
					class:active={homeActive}
				>
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
						<path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
						<polyline points="9 22 9 12 15 12 15 22"></polyline>
					</svg>
					Home
				</a>
				<a
					href="/workouts"
					class="nav-item"
					class:active={workoutsActive}
				>
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
						<path
							d="M14.4 14.4 9.6 9.6M18 4v16M6 4v16M14.4 9.6l-4.8 4.8M4 6h4M4 18h4M16 18h4M16 6h4"
						></path>
					</svg>
					Workouts
				</a>
				<a
					href="/stats"
					class="nav-item"
					class:active={statsActive}
				>
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
						<path d="M3 3v18h18"></path>
						<path d="m19 9-5 5-4-4-3 3"></path>
					</svg>
					Stats
				</a>
				<a
					href="/account"
					class="nav-item"
					class:active={accountActive}
				>
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
						<circle cx="12" cy="8" r="5"></circle>
						<path d="M20 21a8 8 0 1 0-16 0"></path>
					</svg>
					Account
				</a>
			</nav>
		{/if}
	</div>
{/if}
