<script lang="ts">
	import type { InventoryController } from './inventory-controller.svelte';
	let { app }: { app: InventoryController } = $props();
</script>

<div class="mb-4 space-y-2 rounded-xl border border-zinc-200 p-3 dark:border-zinc-700">
	<button
		type="button"
		class="min-h-11 w-full rounded-xl bg-red-600 px-4 py-2 text-left text-sm font-medium text-white disabled:opacity-50"
		disabled={!app.hydrated || app.busy || !app.metrics.counted}
		onclick={app.exportCounts}>Exportar conteos</button
	>
	<p class="text-sm text-zinc-500">
		Excel con solo Clave principal y Cantidad física de los productos contados, incluidos los ceros
		registrados. Los pendientes no se incluyen en este archivo.
	</p>
	{#if app.metrics.pending}<p class="text-sm text-red-600">
			Quedan {app.metrics.pending} productos pendientes: no se incluirán en este archivo.
		</p>{/if}
	{#if !app.metrics.counted}<p class="text-sm text-zinc-500">
			Registra al menos un conteo para exportar.
		</p>{/if}
</div>
