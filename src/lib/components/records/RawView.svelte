<script lang="ts">
	// SPDX-FileCopyrightText: 2026 ave
	// SPDX-License-Identifier: MIT OR EUPL-1.2

	import { hexDump } from '../../tickets/format.ts';

	let { raw, error }: { raw: Uint8Array; error?: string } = $props();
</script>

{#if error}
	<p class="error">Could not decode this record: {error}</p>
{/if}
<pre>{hexDump(raw)}</pre>

<style>
	.error {
		margin: 0 0 0.5rem;
		font-size: 0.85rem;
		color: var(--signal-red);
	}
	pre {
		margin: 0;
		font-family: var(--font-mono);
		font-size: 0.72rem;
		line-height: 1.5;
		overflow-x: auto;
		color: var(--ink);
	}
</style>
