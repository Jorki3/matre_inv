<script lang="ts">
	import type { InventoryController } from './inventory-controller.svelte';
	import { Archive, Download, FileSpreadsheet, Upload } from 'lucide-svelte';
	import CatalogImportPreview from './CatalogImportPreview.svelte';

	let { app }: { app: InventoryController } = $props();
</script>

<section class="space-y-6">
	<div
		class="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
	>
		<div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
			<h2 class="text-xl font-semibold">Importación y catálogo</h2>
			<label
				class="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-red-600 px-3 py-2 text-sm font-medium text-white"
			>
				<Upload size={16} /> Importar catálogo
				<input
					type="file"
					accept=".xlsx,.xls,.csv"
					class="hidden"
					onchange={app.handleCatalogImport}
					disabled={!app.hydrated || app.busy || app.session.status === 'completed'}
					aria-label="Importar catálogo"
				/>
			</label>
		</div>
		<p class="mt-2 text-sm text-zinc-500">
			Importa Excel (.xls o .xlsx) o CSV. Revisa y asigna las columnas antes de confirmar. No hay
			una plantilla oficial de SICAR validada; verifica claves y existencias con tu archivo
			original.
		</p>
	</div>

	<CatalogImportPreview {app} />

	<div class="grid gap-4 lg:grid-cols-2">
		<div
			class="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
		>
			<h3 class="mb-3 text-lg font-semibold">Estado del catálogo</h3>
			<div class="space-y-3 text-sm text-zinc-600 dark:text-zinc-300">
				<div class="flex justify-between rounded-xl bg-zinc-100 p-3 dark:bg-zinc-800">
					<span>Productos cargados</span><span>{app.products.length}</span>
				</div>
				<div class="flex justify-between rounded-xl bg-zinc-100 p-3 dark:bg-zinc-800">
					<span>Sin contar</span><span>{app.metrics.pending}</span>
				</div>
				<div class="flex justify-between rounded-xl bg-zinc-100 p-3 dark:bg-zinc-800">
					<span>Diferencias</span><span>{app.metrics.differences}</span>
				</div>
			</div>
		</div>

		<div
			class="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
		>
			<h3 class="mb-3 text-lg font-semibold">Acciones</h3>
			<div class="space-y-2">
				<button
					type="button"
					class="flex w-full items-center justify-between rounded-xl bg-zinc-100 p-3 text-left text-sm dark:bg-zinc-800"
					onclick={app.exportExcel}
				>
					<span class="flex items-center gap-2"><FileSpreadsheet size={16} /> Exportar Excel</span>
					<Download size={16} />
				</button>
				<button
					type="button"
					class="flex w-full items-center justify-between rounded-xl bg-zinc-100 p-3 text-left text-sm dark:bg-zinc-800"
					onclick={app.exportJsonBackup}
				>
					<span class="flex items-center gap-2"><Archive size={16} /> Exportar respaldo JSON</span>
					<Download size={16} />
				</button>
			</div>
		</div>
	</div>
</section>
