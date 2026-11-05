<script lang="ts">
	import type { InventoryController } from './inventory-controller.svelte';
	import { sessionLabels } from '$lib/inventory';

	let { app }: { app: InventoryController } = $props();
</script>

<div
	class="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900"
>
	<div>
		<h2 class="font-semibold">{app.session.name}</h2>
		<p class="text-sm" data-testid="session-status">
			{sessionLabels[app.session.status]} · {app.metrics.counted}/{app.metrics.total} contados
		</p>
	</div>
	<div class="flex flex-wrap gap-2">
		{#if app.session.status === 'not_started' || app.session.status === 'paused'}
			<button
				class="min-h-11 rounded-xl bg-red-600 px-4 text-sm font-medium text-white disabled:opacity-50"
				disabled={!app.hydrated || app.busy}
				onclick={() => app.cycleSession('active')}
				>{app.session.status === 'not_started' ? 'Comenzar' : 'Reanudar'}</button
			>
		{/if}
		{#if app.session.status === 'active'}<button
				class="min-h-11 rounded-xl border border-zinc-300 px-3 text-sm dark:border-zinc-700"
				disabled={app.busy}
				onclick={() => app.cycleSession('paused')}>Pausar</button
			>{/if}
		{#if app.session.status === 'completed'}
			<button
				type="button"
				disabled={!app.hydrated || app.busy}
				class="min-h-11 rounded-xl bg-red-600 px-4 text-sm font-medium text-white disabled:opacity-50"
				onclick={() => app.openDataAction({ kind: 'new' })}>Nuevo inventario</button
			>
			<button
				type="button"
				class="min-h-11 rounded-xl border border-zinc-300 px-3 text-sm dark:border-zinc-700"
				onclick={app.exportExcel}>Exportar Excel</button
			>
			<button
				type="button"
				class="min-h-11 rounded-xl border border-zinc-300 px-3 text-sm dark:border-zinc-700"
				onclick={app.exportJsonBackup}>Exportar respaldo JSON</button
			>
		{/if}
		{#if app.session.status === 'active' || app.session.status === 'paused'}<button
				class="min-h-11 rounded-xl border border-zinc-300 px-3 text-sm dark:border-zinc-700"
				disabled={app.busy}
				onclick={() => app.cycleSession('completed')}>Finalizar</button
			>{/if}
	</div>
	{#if app.session.finishedAt}<p class="w-full text-xs text-zinc-500">
			Finalizado: {new Date(app.session.finishedAt).toLocaleString()}
		</p>{/if}
</div>
