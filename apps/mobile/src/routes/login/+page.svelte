<script lang="ts">
	import { goto } from '$app/navigation';
	import { login, register } from '$lib/stores/auth';

	let mode: 'login' | 'register' = 'login';
	let username = '';
	let password = '';
	let error = '';
	let loading = false;

	async function handleSubmit(e: Event) {
		e.preventDefault();
		error = '';
		loading = true;

		try {
			if (mode === 'login') {
				await login(username, password);
			} else {
				await register(username, password);
			}
			goto('/');
		} catch (err: any) {
			error = err.message || 'An error occurred';
		} finally {
			loading = false;
		}
	}

	function switchMode() {
		mode = mode === 'login' ? 'register' : 'login';
		error = '';
	}
</script>

<div class="page">
	<div class="auth-container">
		<div class="auth-header">
			<h1 class="auth-title">GymLog</h1>
			<p class="auth-subtitle">Track your workouts</p>
		</div>

		{#if error}
			<div class="auth-error">{error}</div>
		{/if}

		<form on:submit={handleSubmit}>
			<div class="form-group">
				<label for="username" class="form-label">Username</label>
				<input
					type="text"
					id="username"
					class="form-input"
					bind:value={username}
					placeholder="Enter username"
					required
					autocomplete="username"
				/>
			</div>

			<div class="form-group">
				<label for="password" class="form-label">Password</label>
				<input
					type="password"
					id="password"
					class="form-input"
					bind:value={password}
					placeholder="Enter password"
					required
					autocomplete={mode === 'login' ? 'current-password' : 'new-password'}
				/>
			</div>

			<button type="submit" class="btn btn-primary btn-full" disabled={loading}>
				{#if loading}
					Loading...
				{:else}
					{mode === 'login' ? 'Sign In' : 'Create Account'}
				{/if}
			</button>
		</form>

		<div class="auth-switch">
			<span>{mode === 'login' ? "Don't have an account?" : 'Already have an account?'}</span>
			<button type="button" class="auth-switch-btn" on:click={switchMode}>
				{mode === 'login' ? 'Sign Up' : 'Sign In'}
			</button>
		</div>
	</div>
</div>
