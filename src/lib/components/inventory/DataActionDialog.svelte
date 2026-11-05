<script lang="ts">
	import type { InventoryController } from './inventory-controller.svelte';
	import { sessionLabels } from '$lib/inventory';

	let { app }: { app: InventoryController } = $props();
	function syncDialog(dialog: HTMLDialogElement) {
		if (app.dataAction) {
			if (!dialog.open) {
				dialog.showModal();
				queueMicrotask(() =>
					dialog.querySelector<HTMLButtonElement>('[data-cancel-action]')?.focus()
				);
			}
		} else if (dialog.open) dialog.close();
	}
</script>

<dialog
	{@attach syncDialog}
	aria-labelledby="data-action-title"
	oncancel={(event) => {
		event.preventDefault();
		app.cancelDataAction();
	}}
	class="m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-lg overflow-y-auto rounded-2xl border border-zinc-200 bg-white p-5 text-zinc-900 shadow-xl backdrop:bg-black/60 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
>
	{#if app.dataAction}
		<h2 id="data-action-title" class="text-xl font-semibold">{app.actionTitle}</h2>
		{#if app.dataAction.kind === 'restore' && app.restoreMetrics}
			<div
				class="my-3 space-y-1 rounded-xl bg-zinc-100 p-3 text-sm dark:bg-zinc-800"
				data-testid="backup-preview"
			>
				<p>
					Productos: {app.restoreMetrics.total} · Contados: {app.restoreMetrics.counted} · Pendientes:
					{app.restoreMetrics.pending}
				</p>
				<p>Fecha del respaldo: {new Date(app.dataAction.snapshot.exportedAt).toLocaleString()}</p>
				<p>
					Sesión: {app.dataAction.snapshot.session.name} · {sessionLabels[
						app.dataAction.snapshot.session.status
					]}
				</p>
				<p>Formato: {app.dataAction.snapshot.version}</p>
				<p>
					Hallazgos incluidos (todas las sesiones): {app.dataAction.snapshot.unmatchedArticles
						?.length ?? 0}
				</p>
			</div>
			<p class="mt-3 text-sm">
				{app.products.length || app.session.startedAt
					? `Se reemplazarán los datos locales, incluidos los hallazgos: ${app.products.length} productos y ${app.metrics.counted} conteos.`
					: 'No hay productos ni conteos locales. Se restaurará el trabajo del respaldo.'}
			</p>
		{:else}
			<p class="mt-3 text-sm">
				{app.dataAction.kind === 'new'
					? 'Se conservará la sesión finalizada en un respaldo local y se creará una sesión distinta Sin iniciar.'
					: 'Se limpiarán las cantidades y fechas de conteo de esta misma sesión y volverá a Sin iniciar.'}
			</p>
			<p class="mt-2 text-sm">
				Se conservarán los {app.products.length} productos con su clave, clave alterna, descripción y
				existencia SICAR. Se reiniciarán las estadísticas y el progreso. Los artículos no encontrados
				se conservarán asociados a su sesión original.
			</p>
		{/if}
		<p class="mt-3 text-sm text-zinc-600 dark:text-zinc-300">
			Antes de continuar, puedes descargar el inventario actual. También guardaremos una copia local
			previa sin borrar respaldos anteriores. El archivo JSON permite recuperarlo en otro
			dispositivo.
		</p>
		<button
			type="button"
			class="my-3 min-h-11 w-full rounded-xl border border-zinc-300 px-3 text-sm font-medium dark:border-zinc-600"
			disabled={app.busy}
			onclick={(event) =>
				app.downloadCurrentBackup(event.currentTarget.closest('dialog') ?? undefined)}
			>Descargar respaldo actual JSON</button
		>
		<label
			class="flex min-h-11 items-start gap-3 rounded-xl bg-zinc-100 p-3 text-sm dark:bg-zinc-800"
			><input
				type="checkbox"
				bind:checked={app.acknowledged}
				disabled={app.busy}
				class="mt-1 h-5 w-5 shrink-0 accent-red-600"
			/>Entiendo que los conteos actuales serán reemplazados; confirmo esta operación.</label
		>
		{#if app.actionError}<p role="alert" class="mt-3 text-sm text-red-600">
				{app.actionError}
			</p>{/if}
		<div class="mt-4 flex flex-col-reverse gap-2 sm:flex-row">
			<button
				data-cancel-action
				type="button"
				class="min-h-11 flex-1 rounded-xl border border-zinc-300 px-4 dark:border-zinc-600"
				disabled={app.busy}
				onclick={app.cancelDataAction}>Cancelar</button
			>
			<button
				type="button"
				disabled={!app.acknowledged || app.busy}
				class="min-h-11 flex-1 rounded-xl bg-red-600 px-4 font-medium text-white disabled:opacity-50"
				onclick={app.confirmDataAction}
				>{app.busy
					? 'Guardando…'
					: app.dataAction.kind === 'restore'
						? 'Confirmar restauración'
						: app.dataAction.kind === 'new'
							? 'Crear nuevo inventario'
							: 'Confirmar reinicio'}</button
			>
		</div>
	{/if}
</dialog>
