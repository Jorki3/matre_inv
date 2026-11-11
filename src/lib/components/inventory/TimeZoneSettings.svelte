<script lang="ts">
	import type { InventoryController } from './inventory-controller.svelte';
	let { app }: { app: InventoryController } = $props();
	let zone = $state(Intl.DateTimeFormat().resolvedOptions().timeZone);
	let editZone = $state(false);
</script>

{#if app.session.inventoryTimeZone && !editZone}
	<p class="text-sm">Zona del inventario: <strong>{app.session.inventoryTimeZone}</strong></p>
	{#if !app.session.importedMovements?.length}<button
			type="button"
			disabled={app.busy}
			class="min-h-11 rounded-xl border px-3 text-sm"
			onclick={() => {
				zone = app.session.inventoryTimeZone!;
				editZone = true;
			}}>Cambiar zona horaria</button
		>{/if}
{:else}
	<form
		class="flex flex-wrap items-end gap-2"
		onsubmit={(event) => {
			event.preventDefault();
			void app.configureInventoryTimeZone(zone).then(() => {
				if (app.session.inventoryTimeZone === zone) editZone = false;
			});
		}}
	>
		<label class="flex-1 text-sm"
			>Zona horaria del inventario<input
				aria-label="Zona horaria del inventario"
				bind:value={zone}
				required
				class="mt-1 min-h-11 w-full rounded-xl border bg-transparent px-3"
				list="inventory-zones"
			/></label
		>
		<datalist id="inventory-zones"
			><option value="America/Mexico_City"></option><option value="America/Tijuana"></option><option
				value="America/Cancun"
			></option><option value="America/Hermosillo"></option><option value="America/New_York"
			></option></datalist
		>
		<button
			disabled={!app.hydrated || app.busy || app.session.status === 'completed'}
			class="min-h-11 rounded-xl bg-red-600 px-4 text-sm font-medium text-white disabled:opacity-50"
			>Confirmar zona horaria</button
		>
		<p class="w-full text-xs text-zinc-500">
			Verifica la zona de tu negocio. La sugerencia proviene del navegador; las fechas del Excel se
			interpretarán en la zona que confirmes.
		</p>
	</form>
{/if}
