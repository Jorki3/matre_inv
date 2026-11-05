<script lang="ts">
	import type { InventoryController } from './inventory-controller.svelte';
	import { Search } from 'lucide-svelte';
	import { filters } from './inventory-ui';

	let { app }: { app: InventoryController } = $props();
</script>

<div class="rounded-xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
	<div class="relative">
		<Search size={18} class="pointer-events-none absolute top-3.5 left-3 text-zinc-400" /><input
			bind:value={app.query}
			aria-label="Buscar productos"
			class="min-h-11 w-full rounded-xl border border-zinc-300 bg-transparent pr-3 pl-10 text-base dark:border-zinc-700"
			placeholder="Descripción, clave o clave alterna"
		/>
	</div>
	<div class="mt-2 flex flex-wrap gap-1">
		{#each filters as item (item.id)}<button
				aria-pressed={app.filter === item.id}
				class={`min-h-11 rounded-xl px-3 text-sm ${app.filter === item.id ? 'bg-red-600 text-white' : 'bg-zinc-100 dark:bg-zinc-800'}`}
				onclick={() => (app.filter = item.id)}>{item.label}</button
			>{/each}
	</div>
</div>
