<script lang="ts">
	import type { InventoryController } from './inventory-controller.svelte';
	import TimeZoneSettings from './TimeZoneSettings.svelte';
	import { version } from '../../../../package.json';
	let { app }: { app: InventoryController } = $props();
</script>

<section class="space-y-4">
	<div
		class="space-y-3 rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"
	>
		<h2 class="text-xl font-semibold">General</h2>
		<h3 class="text-sm font-medium">Apariencia</h3>
		<div class="flex flex-wrap gap-2" role="group" aria-label="Apariencia">
			{#each [['light', 'Claro'], ['dark', 'Oscuro'], ['system', 'Sistema']] as [value, label] (value)}<button
					type="button"
					aria-pressed={app.theme === value}
					class="min-h-11 rounded-xl border px-3 text-sm aria-pressed:bg-red-600 aria-pressed:text-white"
					onclick={() => app.setTheme(value as 'light' | 'dark' | 'system')}>{label}</button
				>{/each}
		</div>
	</div>
	<div
		class="space-y-3 rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"
	>
		<h3 class="font-semibold">Zona horaria del inventario</h3>
		<TimeZoneSettings {app} />{#if app.movementError}<p role="alert" class="text-sm text-red-600">
				{app.movementError}
			</p>{/if}
	</div>
	<div
		class="rounded-2xl border border-zinc-200 bg-white p-4 text-sm dark:border-zinc-800 dark:bg-zinc-900"
	>
		<h3 class="font-semibold">MATRE Inventario · v{version}</h3>
		<p class="mt-2">
			PWA · Disponible sin conexión. Los datos se guardan en este dispositivo. Exporta respaldos
			para conservar y compartir el inventario.
		</p>
	</div>
</section>
