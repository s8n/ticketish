<script lang="ts">
	// SPDX-FileCopyrightText: 2026 ave
	// SPDX-License-Identifier: MIT OR EUPL-1.2

	import '@fontsource/barlow/400.css';
	import '@fontsource/barlow/500.css';
	import '@fontsource/barlow-condensed/600.css';
	import '@fontsource/barlow-condensed/700.css';
	import '@fontsource/ibm-plex-mono/400.css';
	import '@fontsource/ibm-plex-mono/600.css';
	import '../lib/app.css';
	import favicon from '$lib/assets/favicon.svg';
	import { onMount } from 'svelte';
	import { credentials } from '../lib/wallet/credentials.svelte.ts';

	let { children } = $props();

	// Wallet signing credentials are the one thing that can outlive a session,
	// and only when the reader asked for that. Nothing else is restored here.
	onMount(() => {
		credentials.restore();
	});
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<link rel="manifest" href="/manifest.webmanifest" />
	<meta name="theme-color" content="#f0eae1" media="(prefers-color-scheme: light)" />
	<meta name="theme-color" content="#191c23" media="(prefers-color-scheme: dark)" />
	<link rel="apple-touch-icon" href="/icons/icon-192.png" />
</svelte:head>

{@render children()}
