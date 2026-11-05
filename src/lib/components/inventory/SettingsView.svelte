<script lang="ts">
	import type { InventoryController } from './inventory-controller.svelte';
	import BackupActions from './BackupActions.svelte';
	import { PackageCheck } from 'lucide-svelte';
	import { sessionLabels } from '$lib/inventory';

	let { app }: { app: InventoryController } = $props();
</script>

<section class="space-y-6">
	<div class="grid gap-4 lg:grid-cols-2">
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
		<section
			class="space-y-3 rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"
			aria-labelledby="settings-backup-heading"
		>
			<h2 id="settings-backup-heading" class="text-xl font-semibold">Respaldos</h2>
			<BackupActions {app} />
		</section>
	</div>

	<div class="grid gap-4 lg:grid-cols-2">
		<div
			class="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
		>
			<h2 class="mb-3 text-xl font-semibold">Configuración</h2>
			<div class="space-y-3 text-sm">
				<div class="flex items-center justify-between rounded-xl bg-zinc-100 p-3 dark:bg-zinc-800">
					<span>Tema</span>
					<div class="flex gap-2">
						<button
							type="button"
							class={`rounded-lg px-3 py-1.5 ${app.theme === 'light' ? 'bg-red-600 text-white' : 'bg-zinc-200 dark:bg-zinc-700'}`}
							onclick={() => {
								app.setTheme('light');
							}}>Claro</button
						>
						<button
							type="button"
							class={`rounded-lg px-3 py-1.5 ${app.theme === 'dark' ? 'bg-red-600 text-white' : 'bg-zinc-200 dark:bg-zinc-700'}`}
							onclick={() => {
								app.setTheme('dark');
							}}>Oscuro</button
						>
						<button
							type="button"
							class={`rounded-lg px-3 py-1.5 ${app.theme === 'system' ? 'bg-red-600 text-white' : 'bg-zinc-200 dark:bg-zinc-700'}`}
							onclick={() => {
								app.setTheme('system');
							}}>Sistema</button
						>
					</div>
				</div>
				<div class="flex items-center justify-between rounded-xl bg-zinc-100 p-3 dark:bg-zinc-800">
					<span>Modo PWA</span>
					<span class="inline-flex items-center gap-1 text-emerald-600"
						><PackageCheck size={16} /> Activado</span
					>
				</div>
			</div>
		</div>

		<div
			class="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
		>
			<h3 class="mb-3 text-lg font-semibold">Estado operativo</h3>
			<div class="space-y-3 text-sm text-zinc-600 dark:text-zinc-300">
				<div class="flex justify-between rounded-xl bg-zinc-100 p-3 dark:bg-zinc-800">
					<span>Sin conexión</span><span class="text-emerald-600">Soportado</span>
				</div>
				<div class="flex justify-between rounded-xl bg-zinc-100 p-3 dark:bg-zinc-800">
					<span>Almacenamiento</span><span>IndexedDB</span>
				</div>
				<div class="flex justify-between rounded-xl bg-zinc-100 p-3 dark:bg-zinc-800">
					<span>Estado</span><span>{sessionLabels[app.session.status]}</span>
				</div>
			</div>
		</div>
	</div>
</section>
