<script lang="ts">
	import type { InventoryController } from './inventory-controller.svelte';
	import UnmatchedArticleForm from './UnmatchedArticleForm.svelte';
	import UnmatchedArticleCard from './UnmatchedArticleCard.svelte';
	let { app }: { app: InventoryController } = $props();
</script>

<section aria-label="Artículos no encontrados" class="space-y-3">
	<div
		class="space-y-3 rounded-2xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900"
	>
		<h2 class="text-xl font-semibold">Artículos no encontrados</h2>
		<p class="text-sm text-zinc-500">
			Hallazgos separados del catálogo y del progreso oficial. Relacionarlos con una clave no
			registra ni suma cantidades en el catálogo.
		</p>
		<div class="flex flex-wrap gap-2">
			<button
				type="button"
				disabled={!app.canCount || app.unmatchedDraft !== null}
				class="min-h-11 rounded-xl bg-red-600 px-4 text-sm font-medium text-white disabled:opacity-50"
				onclick={() => app.startUnmatchedRegistration()}>Registrar artículo no encontrado</button
			><button
				type="button"
				disabled={!app.hydrated || app.busy || !app.selectedUnmatchedCount}
				class="min-h-11 rounded-xl border border-zinc-300 px-4 text-sm disabled:opacity-50 dark:border-zinc-700"
				onclick={app.exportUnmatched}>Exportar artículos no encontrados</button
			>
		</div>
		<label class="block text-sm"
			>Sesión de los hallazgos<select
				bind:value={app.unmatchedSessionId}
				disabled={app.busy || app.unmatchedDraft !== null}
				class="mt-1 min-h-11 w-full rounded-xl border border-zinc-300 bg-white px-3 dark:border-zinc-700 dark:bg-zinc-900"
				>{#each app.unmatchedSessions as session (session.id)}<option value={session.id}
						>{session.name} · {session.id === app.session.id
							? 'Sesión actual'
							: `Historial ${session.id.slice(-6)}`}</option
					>{/each}</select
			></label
		>
		<input
			aria-label="Buscar artículos no encontrados"
			bind:value={app.unmatchedQuery}
			placeholder="Descripción, clave, clave alterna o ubicación"
			class="min-h-11 w-full rounded-xl border border-zinc-300 bg-transparent px-3 text-base dark:border-zinc-700"
		/>
		<p class="text-sm text-zinc-500">
			{app.selectedUnmatchedCount} registros de esta sesión · {app.visibleUnmatched.length} visibles
		</p>
		{#if app.unmatchedSessionId !== app.session.id}<p class="text-sm text-zinc-500">
				Historial de otra sesión: solo consulta y exportación.
			</p>{:else if !app.canCount}<p class="text-sm text-zinc-500">
				{app.session.status === 'completed'
					? 'Sesión finalizada: solo consulta y exportación.'
					: 'Comienza o reanuda la sesión para registrar o editar hallazgos.'}
			</p>{/if}
	</div>
	{#if app.unmatchedDraft}{#key app.unmatchedDraft}<UnmatchedArticleForm
				{app}
				initial={app.unmatchedDraft}
			/>{/key}{/if}
	<div class="space-y-2">
		{#each app.visibleUnmatched as article (article.id)}<UnmatchedArticleCard
				{app}
				{article}
			/>{:else}<p
				class="rounded-xl border border-zinc-200 p-4 text-sm text-zinc-500 dark:border-zinc-800"
			>
				No hay artículos no encontrados que coincidan en esta sesión.
			</p>{/each}
	</div>
</section>
