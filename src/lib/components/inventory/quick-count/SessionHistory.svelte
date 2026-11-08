<script lang="ts">
	import type { HistoryItem } from './quick-count';

	/** Solo los últimos 3 visibles; el resto detrás de "Ver todos". */
	const VISIBLE_COUNT = 3;

	let { items }: { items: HistoryItem[] } = $props();

	let showAll = $state(false);
	const visible = $derived(showAll ? items : items.slice(0, VISIBLE_COUNT));
</script>

{#if items.length > 0}
	<div class="space-y-2">
		<div class="flex items-center justify-between">
			<h3 class="font-semibold">Registrados en esta sesión</h3>
			<span class="text-xs text-zinc-500">{items.length} hoy</span>
		</div>
		{#each visible as item (item.label)}
			<p
				class={`rounded-xl border p-3 text-sm ${item.kind === 'unmatched' ? 'border-amber-500' : 'border-zinc-200 dark:border-zinc-800'}`}
			>
				{item.label}
			</p>
		{/each}
		{#if items.length > VISIBLE_COUNT}
			<button
				type="button"
				class="min-h-9 rounded-xl border border-zinc-300 px-3 text-sm dark:border-zinc-700"
				onclick={() => (showAll = !showAll)}
			>
				{showAll ? 'Ver menos' : `Ver todos (${items.length})`}
			</button>
		{/if}
	</div>
{/if}
