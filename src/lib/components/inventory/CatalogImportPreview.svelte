<script lang="ts">
	import type { InventoryController } from './inventory-controller.svelte';
	import { importFields } from '$lib/catalog-import';

	let { app }: { app: InventoryController } = $props();
</script>

{#if app.importFile}
	<div
		class="space-y-4 rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"
		aria-label="Vista previa de importación"
	>
		<h3 class="font-semibold">Vista previa: {app.importFile}</h3>
		<p class="text-sm text-zinc-500">
			Primera hoja, encabezados en la primera fila. Revisa las columnas detectadas o asígnalas
			manualmente. Asigna columnas únicas. Los errores y duplicados se omiten; no se generan claves
			ni existencias faltantes.
		</p>
		<div class="grid gap-3 sm:grid-cols-2">
			{#each importFields as field (field.id)}<label class="text-sm"
					>{field.label}<select
						value={app.mapping[field.id] ?? ''}
						onchange={(event) => app.setMappingColumn(field.id, event.currentTarget.value)}
						class="mt-1 min-h-11 w-full rounded-xl border border-zinc-300 bg-white px-3 dark:border-zinc-700 dark:bg-zinc-900"
						><option value="">Sin asignar</option
						>{#each app.headers as header, index (index)}<option value={String(index)}
								>{index + 1}. {header || '(sin encabezado)'}</option
							>{/each}</select
					></label
				>{/each}
		</div>
		<label class="block text-sm"
			>Destino del catálogo<select
				bind:value={app.importMode}
				class="mt-1 min-h-11 w-full rounded-xl border border-zinc-300 bg-white px-3 dark:border-zinc-700 dark:bg-zinc-900"
				><option value="append" disabled={app.hasDemo}
					>Agregar solo claves nuevas (conservar conteos)</option
				><option value="update" disabled={app.hasDemo}
					>Actualizar catálogo conservando conteos</option
				><option value="replace">Reemplazar catálogo y conteos (con confirmación)</option></select
			></label
		>
		{#if app.hasDemo}<p class="text-sm text-red-600">
				Se detectaron artículos de demostración. El reemplazo requiere confirmación para no
				mezclarlos con tu catálogo real.
			</p>{/if}
		{#if !app.preview.mappingValid}<p class="text-sm text-red-600">
				Asigna Clave, Descripción y Existencia SICAR a columnas diferentes.
			</p>{/if}
		{#if app.session.status === 'active' || app.session.status === 'paused'}<p
				role="note"
				class="text-sm text-red-600"
			>
				Hay una sesión abierta. Confirma cómo se aplicará el catálogo antes de importar.
			</p>{/if}
		{#if app.importMode === 'update'}<p class="text-sm text-zinc-500">
				Se actualizan descripción y existencia SICAR por clave; se conservan cantidades, fechas y
				productos ausentes del archivo. Los campos opcionales sin asignar conservan sus datos
				actuales. Las diferencias se recalculan con la nueva existencia.
			</p>{/if}
		<p class="text-sm" data-testid="import-summary">
			{app.preview.products.length} válidos · {app.preview.duplicates.length} duplicados · {app
				.preview.errors.length} errores
		</p>
		<p class="text-sm text-zinc-500">
			{app.preview.additions} nuevos · {app.preview.updates} actualizaciones
		</p>
		{#if app.preview.products.length}<div class="overflow-x-auto">
				<table class="w-full text-left text-sm">
					<caption class="mb-2 text-left text-zinc-500"
						>Muestra de los primeros 5 registros válidos; se importan todos.</caption
					><thead
						><tr
							><th class="p-2">Clave</th><th class="p-2">Clave alterna</th><th class="p-2"
								>Descripción</th
							><th class="p-2">Existencia actual</th><th class="p-2">Categoría / Departamento</th
							><th class="p-2">Unidad de medida</th></tr
						></thead
					><tbody
						>{#each app.preview.products.slice(0, 5) as product (product.id)}<tr
								class="border-t border-zinc-200 dark:border-zinc-800"
								><td class="p-2">{product.key}</td><td class="p-2">{product.alternateKey || '—'}</td
								><td class="p-2">{product.name}</td><td class="p-2">{product.expected}</td><td
									class="p-2">{product.category || '—'}</td
								><td class="p-2">{product.unit || '—'}</td></tr
							>{/each}</tbody
					>
				</table>
			</div>{/if}
		{#if app.preview.errors.length || app.preview.duplicates.length}<details class="text-sm">
				<summary class="min-h-11 cursor-pointer py-3"
					>Ver incidencias (primeras 50 de cada tipo)</summary
				>{#each app.preview.errors.slice(0, 50) as error (error.row)}<p>
						Fila {error.row}: {error.message}
					</p>{/each}{#each app.preview.duplicates.slice(0, 50) as duplicate (duplicate.row)}<p>
						Fila {duplicate.row}: clave duplicada {duplicate.key}.
					</p>{/each}
			</details>{/if}
		<div class="flex flex-wrap gap-2">
			<button
				disabled={!app.preview.mappingValid ||
					!app.preview.products.length ||
					app.busy ||
					app.session.status === 'completed'}
				class="min-h-11 rounded-xl bg-red-600 px-4 text-sm font-medium text-white disabled:opacity-50"
				onclick={app.confirmImport}>Confirmar importación</button
			><button
				class="min-h-11 rounded-xl border border-zinc-300 px-4 text-sm dark:border-zinc-700"
				onclick={app.cancelCatalogImport}>Cancelar</button
			>
		</div>
	</div>
{/if}
