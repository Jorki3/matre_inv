<script lang="ts">
	import type { InventoryController } from './inventory-controller.svelte';

	let { app }: { app: InventoryController } = $props();
</script>

<section class="space-y-6">
	<div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
		<div
			class="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
		>
			<p class="text-sm text-zinc-500">Total de productos</p>
			<p class="mt-3 text-3xl font-semibold">{app.metrics.total}</p>
		</div>
		<div
			class="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
		>
			<p class="text-sm text-zinc-500">Productos contados</p>
			<p class="mt-3 text-3xl font-semibold text-red-600">{app.metrics.counted}</p>
		</div>
		<div
			class="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
		>
			<p class="text-sm text-zinc-500">Productos pendientes</p>
			<p class="mt-3 text-3xl font-semibold">{app.metrics.pending}</p>
		</div>
		<div
			class="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
		>
			<p class="text-sm text-zinc-500">Avance</p>
			<p class="mt-3 text-3xl font-semibold">{app.metrics.progress}%</p>
		</div>
	</div>

	<button
		type="button"
		class="w-full rounded-2xl border border-zinc-200 bg-white p-4 text-left shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
		onclick={() => (app.activeView = 'unmatched')}
	>
		<span class="block text-sm text-zinc-500">Artículos no encontrados</span><span
			class="mt-2 block text-3xl font-semibold">{app.unmatchedMetrics.total}</span
		><span class="text-sm text-zinc-500"
			>{app.unmatchedMetrics.pending} pendientes de revisar · sesión actual</span
		>
	</button>
	<div
		class="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
	>
		<div class="mb-2 flex items-center justify-between text-sm text-zinc-500">
			<span>Progreso del inventario</span>
			<span>{app.metrics.progress}%</span>
		</div>
		<div class="h-3 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
			<div
				class="h-full rounded-full bg-red-600 transition-all"
				style={`width: ${app.metrics.progress}%`}
			></div>
		</div>
	</div>

	<div class="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
		<div
			class="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
		>
			<div class="mb-4 flex items-center justify-between">
				<h2 class="text-lg font-semibold">Resumen del inventario</h2>
				<button
					type="button"
					class="rounded-xl bg-red-600 px-3 py-2 text-sm font-medium text-white"
					onclick={() => (app.activeView = 'inventory')}
				>
					Ver inventario
				</button>
			</div>
			<div class="space-y-3 text-sm text-zinc-600 dark:text-zinc-300">
				<div class="flex items-center justify-between rounded-xl bg-zinc-100 p-3 dark:bg-zinc-800">
					<span>Inicio</span>
					<span
						>{app.session.startedAt
							? new Date(app.session.startedAt).toLocaleString()
							: 'Sin iniciar'}</span
					>
				</div>
				<div class="flex items-center justify-between rounded-xl bg-zinc-100 p-3 dark:bg-zinc-800">
					<span>Productos con diferencias</span>
					<span>{app.metrics.differences}</span>
				</div>
				<div class="flex items-center justify-between rounded-xl bg-zinc-100 p-3 dark:bg-zinc-800">
					<span>Sin diferencias</span>
					<span>{app.metrics.exact}</span>
				</div>
				<div class="flex items-center justify-between rounded-xl bg-zinc-100 p-3 dark:bg-zinc-800">
					<span>Último respaldo</span>
					<span
						>{app.lastBackupAt
							? new Date(app.lastBackupAt).toLocaleDateString()
							: 'Sin respaldo'}</span
					>
				</div>
			</div>
		</div>

		<div
			class="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
		>
			<h2 class="mb-3 text-lg font-semibold">Logros</h2>
			<div class="space-y-3">
				{#each app.achievements as achievement (achievement.id)}
					<div class="rounded-xl border border-zinc-200 p-3 dark:border-zinc-800">
						<div class="mb-1 flex items-center justify-between text-sm">
							<span class="font-medium">{achievement.name}</span>
							<span
								>{achievement.unlocked
									? 'Desbloqueado'
									: `${achievement.progress}/${achievement.target}`}</span
							>
						</div>
						<div class="h-2 rounded-full bg-zinc-200 dark:bg-zinc-800">
							<div
								class="h-full rounded-full bg-red-600 transition-all"
								style={`width: ${(achievement.progress / achievement.target) * 100}%`}
							></div>
						</div>
					</div>
				{/each}
			</div>
		</div>
	</div>
</section>
