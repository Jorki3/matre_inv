<script lang="ts">
	import { reviewLabels, type UnmatchedArticle } from '$lib/unmatched-articles';
	import type { InventoryController } from './inventory-controller.svelte';
	let { app, article }: { app: InventoryController; article: UnmatchedArticle } = $props();
	const editable = $derived(app.canCount && article.sessionId === app.session.id);
</script>

<article
	data-testid="unmatched-card"
	class="space-y-2 rounded-xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900"
>
	<div class="flex items-start justify-between gap-3">
		<h3 class="min-w-0 font-medium break-words">{article.description}</h3>
		<span class="shrink-0 text-lg font-semibold">{article.quantity}</span>
	</div>
	<p class="text-sm text-red-600">{reviewLabels[article.reviewStatus]}</p>
	{#if article.key || article.alternateKey}<p class="text-xs break-words text-zinc-500">
			{article.key ? `Clave: ${article.key}` : ''}{article.key && article.alternateKey
				? ' · '
				: ''}{article.alternateKey ? `Clave alterna: ${article.alternateKey}` : ''}
		</p>{/if}
	{#if article.location}<p class="text-sm">Ubicación: {article.location}</p>{/if}
	{#if article.notes}<p class="text-sm break-words whitespace-pre-wrap text-zinc-500">
			{article.notes}
		</p>{/if}
	<p class="text-xs text-zinc-500">Registro: {new Date(article.createdAt).toLocaleString()}</p>
	{#if article.updatedAt}<p class="text-xs text-zinc-500">
			Última edición: {new Date(article.updatedAt).toLocaleString()}
		</p>{/if}
	{#if article.linkedProductKey}<p class="text-sm">
			Relacionado con el catálogo: {article.linkedProductKey}. Cantidad no incorporada al conteo
			oficial.
		</p>{/if}
	{#if editable}<div class="flex gap-2">
			<button
				type="button"
				class="min-h-11 rounded-xl border border-zinc-300 px-4 text-sm dark:border-zinc-700"
				disabled={app.unmatchedDraft !== null}
				onclick={() => app.startUnmatchedRegistration(article)}>Editar</button
			><button
				type="button"
				class="min-h-11 rounded-xl border border-red-600 px-4 text-sm text-red-600"
				disabled={app.unmatchedDraft !== null}
				onclick={() => app.deleteUnmatched(article)}>Eliminar</button
			>
		</div>{/if}
</article>
