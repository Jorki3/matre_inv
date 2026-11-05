<script lang="ts">
	import type { InventoryController } from './inventory-controller.svelte';

	let { app }: { app: InventoryController } = $props();
</script>

{#if app.loadFailed}<div role="alert" class="mb-3 rounded-xl border border-red-500 p-3 text-sm">
		No se modificaron los datos almacenados. Exporta los originales antes de solicitar una
		reparación. <button class="min-h-11 underline" onclick={app.exportRaw}
			>Descargar datos originales</button
		>
	</div>{/if}
