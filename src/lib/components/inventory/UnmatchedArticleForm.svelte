<script lang="ts">
	import { untrack } from 'svelte';
	import { reviewLabels, type UnmatchedDraft } from '$lib/unmatched-articles';
	import type { InventoryController } from './inventory-controller.svelte';
	let { app, initial }: { app: InventoryController; initial: UnmatchedDraft } = $props();
	let draft = $state(untrack(() => ({ ...initial })));
</script>

<form
	aria-label="Registro de artículo no encontrado"
	class="space-y-3 rounded-2xl border border-red-500 bg-white p-4 dark:bg-zinc-900"
	onsubmit={(event) => {
		event.preventDefault();
		void app.saveUnmatched(draft);
	}}
>
	<h3 class="font-semibold">
		{draft.id ? 'Editar artículo no encontrado' : 'Registrar artículo no encontrado'}
	</h3>
	<p class="text-sm text-zinc-500">
		Registro independiente. No se suma al conteo oficial ni modifica el catálogo SICAR.
	</p>
	<fieldset disabled={!app.canCount} class="grid gap-3 sm:grid-cols-2">
		<label class="text-sm sm:col-span-2"
			>Descripción del producto<input
				aria-label="Descripción del producto"
				required
				bind:value={draft.description}
				class="mt-1 min-h-11 w-full rounded-xl border border-zinc-300 bg-transparent px-3 text-base dark:border-zinc-700"
			/></label
		>
		<label class="text-sm"
			>Cantidad física encontrada<input
				aria-label="Cantidad física encontrada"
				type="number"
				inputmode="decimal"
				step="any"
				min="0"
				required
				bind:value={draft.quantity}
				class="mt-1 min-h-11 w-full rounded-xl border border-zinc-300 bg-transparent px-3 text-base dark:border-zinc-700"
			/></label
		>
		<label class="text-sm"
			>Ubicación o sección (opcional)<input
				bind:value={draft.location}
				class="mt-1 min-h-11 w-full rounded-xl border border-zinc-300 bg-transparent px-3 text-base dark:border-zinc-700"
			/></label
		>
		<label class="text-sm"
			>Clave (opcional)<input
				bind:value={draft.key}
				class="mt-1 min-h-11 w-full rounded-xl border border-zinc-300 bg-transparent px-3 text-base dark:border-zinc-700"
			/></label
		>
		<label class="text-sm"
			>Clave alterna (opcional)<input
				bind:value={draft.alternateKey}
				class="mt-1 min-h-11 w-full rounded-xl border border-zinc-300 bg-transparent px-3 text-base dark:border-zinc-700"
			/></label
		>
		<label class="text-sm sm:col-span-2"
			>Observaciones (opcional)<textarea
				bind:value={draft.notes}
				rows="2"
				class="mt-1 w-full rounded-xl border border-zinc-300 bg-transparent px-3 py-2 text-base dark:border-zinc-700"
			></textarea></label
		>
		{#if draft.id}
			<label class="text-sm"
				>Estado de revisión<select
					bind:value={draft.reviewStatus}
					class="mt-1 min-h-11 w-full rounded-xl border border-zinc-300 bg-white px-3 dark:border-zinc-700 dark:bg-zinc-900"
					>{#each Object.entries(reviewLabels) as [status, label] (status)}<option value={status}
							>{label}</option
						>{/each}</select
				></label
			>
			{#if draft.reviewStatus === 'identified'}<label class="text-sm"
					>Clave principal SICAR relacionada<input
						aria-label="Clave principal SICAR relacionada"
						required
						bind:value={draft.linkedProductKey}
						list="unmatched-catalog-keys"
						class="mt-1 min-h-11 w-full rounded-xl border border-zinc-300 bg-transparent px-3 text-base dark:border-zinc-700"
					/><datalist id="unmatched-catalog-keys"
						>{#each app.products as product (product.id)}<option value={product.key}
								>{product.name}</option
							>{/each}</datalist
					></label
				>{/if}
		{/if}
	</fieldset>
	{#if app.unmatchedError}<p role="alert" class="text-sm text-red-600">{app.unmatchedError}</p>{/if}
	<div class="flex flex-wrap gap-2">
		<button
			type="submit"
			disabled={!app.canCount}
			class="min-h-11 rounded-xl bg-red-600 px-4 text-sm font-medium text-white disabled:opacity-50"
			>Guardar artículo</button
		><button
			type="button"
			disabled={app.busy}
			class="min-h-11 rounded-xl border border-zinc-300 px-4 text-sm dark:border-zinc-700"
			onclick={app.cancelUnmatchedRegistration}>Cancelar</button
		>
	</div>
</form>
