<script lang="ts">
	import type { InventoryController } from './inventory-controller.svelte';
	import { navItems } from './inventory-ui';

	let { app }: { app: InventoryController } = $props();
</script>

<nav
	aria-label="Principal"
	class="mb-2 grid grid-cols-4 gap-1 rounded-xl border border-zinc-200 bg-white p-1 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
>
	{#each navItems as item (item.id)}
		<button
			type="button"
			class={`min-h-11 min-w-0 rounded-lg px-1 py-2 text-[11px] font-medium transition sm:text-sm ${
				app.activeView === item.id
					? 'bg-red-600 text-white shadow-sm'
					: 'text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800'
			}`}
			aria-current={app.activeView === item.id ? 'page' : undefined}
			onclick={() => (app.activeView = item.id)}
		>
			{item.label}
		</button>
	{/each}
</nav>
