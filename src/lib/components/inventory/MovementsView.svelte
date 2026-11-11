<script lang="ts">
	import TimeZoneSettings from './TimeZoneSettings.svelte';
	import type { InventoryController } from './inventory-controller.svelte';
	import { getProductStatus } from '$lib/inventory';
	import type { ReturnDecision } from '$lib/imported-movements';
	import { statusLabels } from './inventory-ui';
	let { app }: { app: InventoryController } = $props();
	let pendingOnly = $state(false);
	let search = $state('');
	const records = $derived(
		(app.session.importedMovements ?? [])
			.filter(
				(m) =>
					(!pendingOnly || m.status === 'review' || m.status === 'pending') &&
					`${m.folio} ${m.key}`.includes(search)
			)
			.slice()
			.sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
	);
	const actionLabels = {
		subtract: 'Restar',
		add: 'Sumar',
		omit: 'Omitir ajuste',
		review: 'Revisar',
		duplicate: 'Duplicado'
	};
	const stateLabels = {
		applied: 'Aplicado',
		included: 'Reflejado en recuento',
		pending: 'Producto Pendiente',
		review: 'Pendiente de revisión',
		no_return: 'Sin reingreso físico'
	};
	const typeLabel = (type: string) => (type === 'sale' ? 'Venta' : 'Nota de crédito');
</script>

<section class="space-y-4" aria-label="Movimientos de inventario">
	<div
		class="space-y-3 rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"
	>
		<h2 class="text-xl font-semibold">Movimientos</h2>
		<p class="text-sm text-zinc-500">
			Importa ventas o notas de crédito. Revisa la conciliación antes de confirmar; ninguna
			devolución aumenta existencias sin confirmar el reingreso físico.
		</p>
		<TimeZoneSettings {app} />
		<div class="flex flex-wrap gap-2">
			{#each [['sale', 'Importar ventas'], ['credit', 'Importar notas de crédito']] as [type, label] (type)}
				<label
					class="flex min-h-11 cursor-pointer items-center rounded-xl border border-red-600 px-4 text-sm font-medium text-red-600"
					>{label}<input
						type="file"
						accept=".xlsx"
						aria-label={label}
						disabled={!app.canCount || !app.session.inventoryTimeZone}
						class="sr-only"
						onchange={(event) => app.handleMovementImport(event, type as 'sale' | 'credit')}
					/></label
				>
			{/each}
		</div>
		<p class="text-xs text-zinc-500">
			Una hoja .xlsx con las columnas Folio, Clave, Fecha (DD/MM/AAAA), Hora (HH:mm:ss) y Cantidad.
			Usa texto para conservar los ceros de folios y claves.
		</p>
		{#if !app.canCount}<p class="text-sm">
				Comienza o reanuda la sesión en Inventario para importar o revisar movimientos.
			</p>{/if}
	</div>
	{#if app.movementError}<p
			role="alert"
			class="rounded-xl border border-red-500 p-3 text-sm text-red-600"
		>
			{app.movementError}
		</p>{/if}
	{#if app.movementFile}
		<section
			class="space-y-3 rounded-2xl border-2 border-amber-500 bg-white p-4 dark:bg-zinc-900"
			aria-label="Vista previa de movimientos"
		>
			<h3 class="font-semibold">Vista previa · {app.movementFile}</h3>
			<p class="text-sm">
				Nada se ha guardado. Las existencias resultantes muestran el total final por producto
				después de reconstruir toda su cronología.
			</p>
			{#if app.movementBlankRows.length}<p class="text-sm">
					Filas vacías omitidas: {app.movementBlankRows.join(', ')}.
				</p>{/if}
			{#if app.movementPreview.errors.length}
				<div role="alert" class="text-sm text-red-600">
					<p>Corrige el Excel y vuelve a seleccionarlo. No se guardará ninguna fila.</p>
					<ul class="list-inside list-disc">
						{#each app.movementPreview.errors as error, i (i)}<li>{error}</li>{/each}
					</ul>
				</div>
			{/if}
			<div class="grid gap-3 md:grid-cols-2">
				{#each app.movementPreview.rows as row, i (i)}
					<article
						class="space-y-2 rounded-xl border border-zinc-200 p-3 text-sm dark:border-zinc-700"
					>
						<p class="font-semibold">
							{typeLabel(row.candidate.type)} · Folio {row.candidate.folio || '—'} · {row.action ===
							'duplicate'
								? 'Duplicado'
								: actionLabels[row.action]}
						</p>
						<p>
							Clave: {row.candidate.key || '—'} · {row.product?.name ?? 'Producto no encontrado'}
						</p>
						<p>
							Fila {row.candidate.row} · {row.candidate.date || 'Sin fecha'} · {row.candidate
								.time || 'Sin hora'} · Cantidad: {row.candidate.quantity ?? 'Inválida'}
						</p>
						<p>
							Estado: {row.product ? statusLabels[getProductStatus(row.product)] : 'Revisar'} · Existencia
							actual: {row.current ?? 'Sin conteo'} → Resultado:
							<strong>{row.result ?? 'Sin cambio'}</strong>
						</p>
						<p>{row.reason}</p>
						{#if row.candidate.type === 'credit' && row.action !== 'duplicate'}
							<label class="block"
								>Reingreso físico<select
									aria-label={`Reingreso físico ${row.candidate.folio} ${row.candidate.key}`}
									class="mt-1 min-h-11 w-full rounded-xl border bg-transparent px-2"
									value={app.movementDecisions[row.id] ?? 'unconfirmed'}
									onchange={(event) =>
										app.setMovementDecision(row.id, event.currentTarget.value as ReturnDecision)}
									><option value="unconfirmed">Pendiente de confirmar</option><option
										value="confirmed">Confirmo que reingresó la mercancía</option
									><option value="not_returned">No hubo reingreso físico</option></select
								></label
							>
						{/if}
					</article>
				{/each}
			</div>
			{#if app.movementPreview.revisedRecords.length}
				<div class="rounded-xl border border-amber-500 p-3 text-sm">
					<p class="font-medium">Reevaluación de movimientos registrados</p>
					<ul class="mt-1 space-y-1">
						{#each app.movementPreview.revisedRecords as record (record.id)}<li>
								{typeLabel(record.type)} · {record.folio} · {record.key}: {stateLabels[
									record.status
								]}. {record.reason}
							</li>{/each}
					</ul>
				</div>
			{/if}
			{#if app.movementPreview.changes.length}
				<div class="rounded-xl bg-zinc-100 p-3 text-sm dark:bg-zinc-800">
					<p class="font-medium">Cambios totales al confirmar</p>
					<ul>
						{#each app.movementPreview.changes as change (change.productId)}<li>
								{change.name}: {change.previous} → <strong>{change.result}</strong>
							</li>{/each}
					</ul>
					<p class="mt-1 text-xs">
						Incluyen la reevaluación de movimientos ya registrados cuando llegan movimientos
						atrasados.
					</p>
				</div>
			{/if}
			<div class="flex flex-wrap gap-2">
				<button
					type="button"
					disabled={!app.canCount ||
						!app.movementPreview.rows.length ||
						!!app.movementPreview.errors.length}
					onclick={() => app.confirmImportedMovements()}
					class="min-h-11 rounded-xl bg-red-600 px-4 text-sm font-medium text-white disabled:opacity-50"
					>Confirmar importación</button
				><button
					type="button"
					disabled={app.busy}
					onclick={() => app.cancelMovementImport()}
					class="min-h-11 rounded-xl border px-4 text-sm">Cancelar</button
				>
			</div>
		</section>
	{/if}
	<section
		class="space-y-3 rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"
		aria-label="Movimientos registrados"
	>
		<h3 class="font-semibold">
			Movimientos registrados ({app.session.importedMovements?.length ?? 0})
		</h3>
		<div class="flex flex-wrap items-center gap-3">
			<input
				aria-label="Buscar folio o clave"
				bind:value={search}
				placeholder="Buscar folio o clave"
				class="min-h-11 flex-1 rounded-xl border bg-transparent px-3 text-sm"
			/><label class="text-sm"
				><input type="checkbox" bind:checked={pendingOnly} /> Solo pendientes de revisión</label
			>
		</div>
		{#each records as record (record.id)}
			<details class="rounded-xl border border-zinc-200 p-3 text-sm dark:border-zinc-700">
				<summary
					>{typeLabel(record.type)} · {record.folio} · {record.key} · {stateLabels[
						record.status
					]}</summary
				>
				<div class="mt-2 space-y-2">
					<p>{record.date} · {record.time} ({record.timeZone}) · Cantidad: {record.quantity}</p>
					<p>{record.reason}</p>
					<p>Importado: {record.importedAt}</p>
					{#if record.reference}<p>
							Referencia física: {record.reference.occurredAt} · Cantidad original: {record
								.reference.quantity}
						</p>{/if}<button
						type="button"
						disabled={!app.canCount}
						class="min-h-11 rounded-xl border px-3 disabled:opacity-50"
						onclick={() => app.reviewImportedMovement(record.id)}>Revisar conciliación</button
					>
					<p class="text-xs text-zinc-500">
						Los conflictos de orden o historial se resuelven verificando el inventario y registrando
						un nuevo recuento físico cuando corresponda.
					</p>
				</div>
			</details>
		{:else}<p class="text-sm text-zinc-500">No hay movimientos para mostrar.</p>{/each}
	</section>
</section>
