<script lang="ts">
	import type { InventoryController } from './inventory-controller.svelte';
	let { app }: { app: InventoryController } = $props();
</script>

<section class="space-y-4">
	<section
		class="space-y-3 rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"
		aria-labelledby="data-admin-heading"
	>
		<h2 id="data-admin-heading" class="text-xl font-semibold">Administración de datos</h2>
		<p class="text-sm text-zinc-500">
			Reiniciar conteo limpia la sesión actual. Nuevo inventario abre otra sesión después de
			finalizar. Ambas acciones conservan el catálogo.
		</p>
		<button
			type="button"
			disabled={!app.hydrated || app.busy || app.session.status === 'completed'}
			class="min-h-11 w-full rounded-xl border border-red-600 px-4 text-left text-sm font-medium text-red-600 disabled:opacity-50"
			onclick={() => app.openDataAction({ kind: 'reset' })}>Reiniciar conteo</button
		>
		{#if app.session.status === 'completed'}<button
				type="button"
				disabled={app.busy}
				class="min-h-11 w-full rounded-xl bg-red-600 px-4 text-left text-sm font-medium text-white"
				onclick={() => app.openDataAction({ kind: 'new' })}>Nuevo inventario</button
			>
			<p class="text-sm text-zinc-500">
				La sesión finalizada es de solo lectura; prepara un nuevo inventario para volver a contar.
			</p>{/if}
	</section>
	<div
		class="space-y-2 rounded-2xl border border-zinc-200 bg-white p-4 text-sm dark:border-zinc-800 dark:bg-zinc-900"
	>
		<h3 class="font-semibold">Información almacenada</h3>
		<p>
			Productos: {app.products.length} · Operaciones manuales: {app.session.operations?.length ?? 0} ·
			Movimientos importados: {app.session.importedMovements?.length ?? 0}
		</p>
		<p class="break-all">Sesión: {app.session.id}</p>
		<p class="break-all">Instancia de trabajo: {app.instanceId}</p>
		<p>Almacenamiento local: IndexedDB. Funcionamiento sin conexión disponible.</p>
	</div>
	<details
		class="rounded-2xl border border-zinc-200 bg-white p-4 text-sm dark:border-zinc-800 dark:bg-zinc-900"
	>
		<summary>Historial administrativo de fusiones ({app.session.mergeHistory?.length ?? 0})</summary
		>
		<ul class="mt-2 space-y-2">
			{#each app.session.mergeHistory ?? [] as entry (entry.id)}<li>
					{entry.at} · {entry.sourceIds.length} archivos · {entry.adoptedProductIds.length} productos
					integrados · {entry.conflictProductIds.length} conflictos · {entry.duplicateOperations} operaciones
					duplicadas omitidas.
				</li>{/each}
		</ul>
	</details>
</section>
