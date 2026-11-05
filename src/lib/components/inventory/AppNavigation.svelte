<script lang="ts">
	import type { InventoryController } from './inventory-controller.svelte';
	import { navItems } from './inventory-ui';

	let { app }: { app: InventoryController } = $props();
</script>

<nav
	class="mb-3 grid grid-cols-3 gap-2 rounded-2xl border border-zinc-200 bg-white p-2 shadow-sm sm:grid-cols-5 dark:border-zinc-800 dark:bg-zinc-900"
>
	{#each navItems as item (item.id)}
		<button
			type="button"
			class={`min-h-11 rounded-xl px-3 py-2 text-sm font-medium transition ${
				app.activeView === item.id
					? 'bg-red-600 text-white shadow-sm'
					: 'text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800'
			}`}
			onclick={() => (app.activeView = item.id)}
		>
			{item.label}
		</button>
	{/each}
</nav>
