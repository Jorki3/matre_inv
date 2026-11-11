<script lang="ts">
	import type { InventoryController } from './inventory-controller.svelte';
	let { app }: { app: InventoryController } = $props();
	const labels = {
		new: 'Producto nuevo',
		adopt: 'Conteo compatible',
		same: 'Sin cambios',
		conflict: 'Pendiente de revisión'
	};
</script>

<section
	class="space-y-3 rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"
	aria-label="Fusionar inventarios"
>
	<h3 class="text-lg font-semibold">Fusionar inventarios</h3>
	<p class="text-sm text-zinc-500">
		Combina el trabajo de dispositivos que recibieron un mismo respaldo de la sesión. Fusionar
		conserva los registros locales y detecta conflictos; Restaurar reemplaza el estado tras tu
		confirmación.
	</p>
	<label
		class="inline-flex min-h-11 cursor-pointer items-center rounded-xl border border-red-600 px-4 text-sm font-medium text-red-600"
		>Seleccionar inventarios JSON<input
			type="file"
			multiple
			accept=".json,application/json"
			aria-label="Fusionar inventarios JSON"
			class="sr-only"
			disabled={!app.hydrated || app.busy}
			onchange={app.handleMergeFiles}
		/></label
	>
	{#if app.mergeError}<p role="alert" class="text-sm text-red-600">{app.mergeError}</p>{/if}
	{#if app.mergePreview}
		{@const preview = app.mergePreview}
		<section
			class="space-y-3 rounded-xl border-2 border-amber-500 p-3"
			aria-label="Vista previa de fusión"
		>
			<h4 class="font-semibold">Revisa la fusión · Nada se ha guardado</h4>
			<ul class="space-y-1 text-sm">
				{#each preview.files as file, i (i)}<li class="break-words">
						{file.filename} · {file.sessionName} · Sesión {file.sessionId}
					</li>{/each}
			</ul>
			<p class="text-sm">
				{preview.rows.filter((r) => r.action === 'adopt').length} compatibles · {preview.rows.filter(
					(r) => r.action === 'new'
				).length} nuevos · {preview.rows.filter((r) => r.action === 'same').length} sin cambios · {preview.rows.filter(
					(r) => r.action === 'conflict'
				).length} en conflicto · {preview.duplicateOperations} operaciones duplicadas omitidas
			</p>
			{#if preview.duplicateFiles.length}<p class="text-sm">
					Respaldos ya integrados: {preview.duplicateFiles.join(', ')}. No se duplicarán sus
					registros.
				</p>{/if}
			{#if preview.errors.length}<div role="alert" class="text-sm text-red-600">
					<p>No se puede confirmar esta fusión:</p>
					<ul class="list-inside list-disc">
						{#each preview.errors as error, i (i)}<li>{error}</li>{/each}
					</ul>
				</div>{/if}
			<div class="space-y-2">
				{#each preview.rows as row, i (i)}<details
						class="rounded-lg border border-zinc-200 p-2 text-sm dark:border-zinc-700"
					>
						<summary class="break-words">{row.key} · {row.name} · {labels[row.action]}</summary>
						<div class="mt-2 space-y-1">
							<p>
								{row.filename}: {row.incoming ?? 'Sin conteo'} · Local: {row.local ?? 'Sin conteo'}
							</p>
							<p>{row.reason}</p>
							<p>
								Resultado previsto: <strong
									>{preview.next.session.products.find((p) => p.id === row.productId)
										?.mergeConflictId
										? 'Pendiente de revisión'
										: preview.next.session.products.find((p) => p.id === row.productId)?.countedAt
											? preview.next.session.products.find((p) => p.id === row.productId)?.physical
											: 'Sin conteo'}</strong
								>
							</p>
							{#if row.action === 'conflict'}<p>
									No se sumarán ni se elegirá la cantidad más reciente. Después de fusionar, abre
									este producto en Inventario y registra un nuevo recuento físico.
								</p>{/if}
						</div>
					</details>{/each}
			</div>
			{#if !app.canCount}<p class="text-sm">
					Comienza o reanuda la sesión en Inventario para confirmar.
				</p>{/if}
			<div class="flex flex-wrap gap-2">
				<button
					type="button"
					class="min-h-11 rounded-xl bg-red-600 px-4 text-sm font-medium text-white disabled:opacity-50"
					disabled={!app.canCount || !!preview.errors.length}
					onclick={app.confirmMerge}>Confirmar fusión</button
				><button
					type="button"
					class="min-h-11 rounded-xl border px-4 text-sm"
					disabled={app.busy}
					onclick={app.cancelMerge}>Cancelar</button
				>
			</div>
		</section>
	{/if}
</section>
