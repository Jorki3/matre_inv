<script lang="ts">
	import type { InventoryController } from './inventory-controller.svelte';
	import BackupActions from './BackupActions.svelte';
	import MergePanel from './MergePanel.svelte';

	let { app }: { app: InventoryController } = $props();
</script>

<section class="space-y-6">
	<div class="grid gap-4 lg:grid-cols-2">
		<div
			class="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
		>
			<h2 class="mb-3 text-xl font-semibold">Respaldos</h2>
			<BackupActions {app} />
		</div>

		<div
			class="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
		>
			<h3 class="mb-3 text-lg font-semibold">Estado</h3>
			<div class="space-y-3 text-sm text-zinc-600 dark:text-zinc-300">
				<div class="flex justify-between rounded-xl bg-zinc-100 p-3 dark:bg-zinc-800">
					<span>Último respaldo</span><span
						>{app.lastBackupAt
							? new Date(app.lastBackupAt).toLocaleString()
							: 'No disponible'}</span
					>
				</div>
				<div class="flex justify-between rounded-xl bg-zinc-100 p-3 dark:bg-zinc-800">
					<span>Versión del respaldo</span><span>5 (compatible con 1–4)</span>
				</div>
			</div>
		</div>
	</div>
	<MergePanel {app} />
</section>
