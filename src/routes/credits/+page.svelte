<script lang="ts">
	// SPDX-FileCopyrightText: 2026 ave
	// SPDX-License-Identifier: MIT OR EUPL-1.2

	/**
	 * The credits, rendered from the one copy of them in `docs/credits.md`.
	 *
	 * Two of the tables this app bundles carry attribution conditions, and the
	 * built site is a copy of them like any other, so the notices have to travel
	 * with it rather than living only in the repo.
	 */
	import creditsMd from '../../../docs/credits.md?raw';
	import { renderMarkdown } from '../../lib/markdown.ts';

	const html = renderMarkdown(creditsMd);
</script>

<svelte:head>
	<title>ticketish - credits</title>
	<meta name="description" content="Where ticketish's format knowledge, keys and lookup tables come from." />
</svelte:head>

<div class="page">
	<p class="back"><a href="/">← back to ticketish</a></p>
	<article class="prose">{@html html}</article>
</div>

<style>
	.page {
		max-width: 760px;
		margin: 0 auto;
		padding: 1.5rem 1rem 3rem;
	}
	.back {
		margin: 0 0 1rem;
		font-size: 0.85rem;
	}
	.back a {
		color: var(--bg-text-soft);
	}
	/* The rendered markdown is injected, so it sits outside Svelte's scoping. */
	.prose :global(h1) {
		font-size: 2rem;
		font-weight: 700;
		letter-spacing: 0.02em;
		margin: 0 0 0.6rem;
	}
	.prose :global(h1::first-letter) {
		color: var(--signal-red);
	}
	.prose :global(h2) {
		font-family: var(--font-display);
		text-transform: uppercase;
		letter-spacing: 0.08em;
		font-size: 1rem;
		margin: 1.6rem 0 0.5rem;
		padding-top: 0.8rem;
		border-top: 1px solid var(--hairline);
	}
	.prose :global(p) {
		margin: 0 0 0.8rem;
		line-height: 1.5;
	}
	.prose :global(ul) {
		margin: 0 0 0.9rem;
		padding-left: 1.1rem;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}
	.prose :global(li) {
		line-height: 1.45;
	}
	.prose :global(code) {
		font-family: var(--font-mono);
		font-size: 0.85em;
		word-break: break-word;
	}
	.prose :global(a) {
		color: var(--link);
	}
</style>
