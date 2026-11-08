<script lang="ts">
	import type { InventoryController } from './inventory-controller.svelte';
	import { Moon, SunMedium } from 'lucide-svelte';

	let { app }: { app: InventoryController } = $props();
</script>

<header
	class="mb-3 rounded-2xl border border-zinc-200 bg-white/80 p-3 shadow-sm backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/80"
>
	<div class="flex items-center justify-between gap-3">
		<div>
			<p class="text-xs font-medium tracking-[0.2em] text-zinc-500 uppercase">MATRE Ferretería</p>
			<h1 class="text-xl font-semibold">MATRE Inventario <span class="align-middle text-xs font-medium text-zinc-400">v0.5.0</span></h1>
			<!-- Versión de la app: actualizar junto con package.json -->
		</div>
		<div class="flex items-center gap-2">
			<button
				aria-label="Cambiar tema"
				type="button"
				class="min-h-11 min-w-11 rounded-full border border-zinc-200 bg-zinc-100 p-2 text-zinc-700 transition hover:bg-zinc-200 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
				onclick={() => {
					app.setTheme(app.theme === 'dark' ? 'light' : 'dark');
				}}
			>
				{#if app.theme === 'dark'}
					<SunMedium size={18} />
				{:else}
					<Moon size={18} />
				{/if}
			</button>
		</div>
	</div>
</header>
