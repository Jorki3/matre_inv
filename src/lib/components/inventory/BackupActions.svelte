<script lang="ts">
	import type { InventoryController } from './inventory-controller.svelte';

	let { app }: { app: InventoryController } = $props();
</script>

<div class="space-y-2">
	<button
		type="button"
		class="min-h-11 w-full rounded-xl bg-red-600 px-4 py-3 text-left text-sm font-medium text-white disabled:opacity-50"
		disabled={!app.hydrated || app.busy}
		onclick={app.exportJsonBackup}>Exportar respaldo JSON</button
	>
	<label
		class="flex min-h-11 w-full cursor-pointer items-center rounded-xl border border-zinc-300 px-4 py-3 text-sm dark:border-zinc-700"
		>Importar respaldo JSON<input
			type="file"
			accept="application/json,.json"
			class="sr-only"
			onchange={app.restoreBackup}
			disabled={!app.hydrated || app.busy}
			aria-label="Importar respaldo JSON"
		/></label
	>
	<button
		type="button"
		class="min-h-11 w-full rounded-xl border border-zinc-300 px-4 py-3 text-left text-sm dark:border-zinc-700"
		onclick={app.exportPrevious}>Descargar respaldo local previo</button
	>
</div>
