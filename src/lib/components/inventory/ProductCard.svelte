<script lang="ts">
	import type { InventoryController } from './inventory-controller.svelte';
	import { calculateDifference, getProductStatus, type Product } from '$lib/inventory';
	import { statusLabels } from './inventory-ui';

	let { app, product }: { app: InventoryController; product: Product } = $props();
</script>

<article
	class={`overflow-hidden rounded-xl border bg-white dark:bg-zinc-900 ${app.selectedProductId === product.id ? 'border-red-500' : 'border-zinc-200 dark:border-zinc-800'}`}
	data-testid="product-card"
>
	<button
		class="flex min-h-16 w-full items-center justify-between gap-3 p-3 text-left"
		aria-expanded={app.selectedProductId === product.id}
		aria-controls={`count-${product.id}`}
		onclick={() => app.applySelection(product)}
	>
		<div class="min-w-0">
			<h3 class="font-medium">{product.name}</h3>
			<p class="text-xs break-words text-zinc-500">
				Clave: {product.key} · Alterna: {product.alternateKey || '—'}
			</p>
		</div>
		<div class="shrink-0 text-right text-sm">
			<span class="block font-semibold">{product.countedAt ? product.physical : '—'}</span><span
				class={[
					'text-xs text-zinc-500',
					{ 'text-red-600': getProductStatus(product) === 'difference' }
				]}>{statusLabels[getProductStatus(product)]}</span
			>
		</div>
	</button>
	{#if app.selectedProductId === product.id}
		<form
			id={`count-${product.id}`}
			class="border-t border-zinc-200 p-3 dark:border-zinc-800"
			onsubmit={(event) => {
				event.preventDefault();
				void app.saveCount(product);
			}}
		>
			<div class="mb-3 flex flex-wrap gap-x-6 gap-y-1 text-sm">
				<span>Existencia SICAR: <strong>{product.expected}</strong></span><span
					>Diferencia: <strong
						>{product.countedAt
							? calculateDifference(product.physical, product.expected)
							: '—'}</strong
					></span
				>
			</div>
			<div class="flex flex-wrap items-end gap-2">
				<label class="min-w-32 flex-1 text-sm"
					>Cantidad física<input
						aria-label="Cantidad física"
						bind:value={app.countDraft}
						disabled={!app.canCount}
						required
						type="number"
						min="0"
						step="any"
						inputmode="decimal"
						class="mt-1 min-h-11 w-full rounded-xl border border-zinc-300 bg-transparent px-3 text-base disabled:opacity-60 dark:border-zinc-700"
					/></label
				><button
					type="submit"
					disabled={!app.canCount || app.countDraft === undefined}
					class="min-h-11 rounded-xl bg-red-600 px-4 text-sm font-medium text-white disabled:opacity-50"
					>Guardar cantidad</button
				>
			</div>
		</form>
	{/if}
</article>
