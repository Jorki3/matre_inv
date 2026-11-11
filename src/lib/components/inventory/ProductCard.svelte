<script lang="ts">
	import type { InventoryController } from './inventory-controller.svelte';
	import {
		calculateDifference,
		getProductStatus,
		previewCount,
		type CountOperationType,
		type Product
	} from '$lib/inventory';
	import { statusLabels } from './inventory-ui';

	let { app, product }: { app: InventoryController; product: Product } = $props();
	let operation = $state<CountOperationType>('recount');
	const result = $derived.by(() => {
		if (app.countDraft === undefined) return { quantity: undefined, error: '' };
		try {
			return { quantity: previewCount(product, app.countDraft, operation), error: '' };
		} catch (error) {
			return { quantity: undefined, error: (error as Error).message };
		}
	});
	const history = $derived(
		(app.session.operations ?? [])
			.filter((item) => item.productId === product.id)
			.slice()
			.reverse()
	);
</script>

<article
	class={`overflow-hidden rounded-xl border bg-white dark:bg-zinc-900 ${app.selectedProductId === product.id ? 'border-red-500' : 'border-zinc-200 dark:border-zinc-800'}`}
	data-testid="product-card"
>
	<button
		class="flex min-h-16 w-full items-center justify-between gap-3 p-3 text-left"
		aria-expanded={app.selectedProductId === product.id}
		aria-controls={`count-${product.id}`}
		onclick={() => {
			operation = 'recount';
			app.applySelection(product);
		}}
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
				if (!result.error) void app.saveCount(product, operation);
			}}
		>
			<div class="mb-3 flex flex-wrap gap-x-6 gap-y-1 text-sm">
				{#if product.category}<span>Categoría: {product.category}</span>{/if}
				{#if product.unit}<span>Unidad: {product.unit}</span>{/if}
				<span>Existencia: <strong>{product.expected}</strong></span><span
					>Diferencia: <strong
						>{product.countedAt
							? calculateDifference(product.physical, product.expected)
							: '—'}</strong
					></span
				>
			</div>
			<div class="mb-3 flex gap-2" role="group" aria-label="Operación">
				{#each [['add', 'Sumar (+)'], ['recount', 'Recontar'], ['subtract', 'Restar (−)']] as [value, label] (value)}
					<button
						type="button"
						aria-pressed={operation === value}
						disabled={!app.canCount || (value !== 'recount' && !product.countedAt)}
						class="min-h-11 rounded-xl border px-3 text-sm disabled:opacity-50 aria-pressed:bg-red-600 aria-pressed:text-white"
						onclick={() => {
							operation = value as CountOperationType;
							app.countDraft = undefined;
						}}>{label}</button
					>
				{/each}
			</div>
			<p class="mb-2 text-sm">
				{operation === 'recount'
					? 'Esto es lo que tengo físicamente ahora.'
					: 'Movimiento manual sobre la cantidad registrada.'}
			</p>
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
					disabled={!app.canCount || result.quantity === undefined || !!result.error}
					class="min-h-11 rounded-xl bg-red-600 px-4 text-sm font-medium text-white disabled:opacity-50"
					>Confirmar operación</button
				>
			</div>
			<p class="mt-2 text-sm" aria-live="polite">
				Resultado: <strong>{result.quantity ?? '—'}</strong>
			</p>
			{#if result.error}<p role="alert" class="mt-2 text-sm text-red-600">{result.error}</p>{/if}
		</form>
	{/if}
	{#if history.length}
		<details class="border-t border-zinc-200 p-3 text-sm dark:border-zinc-800">
			<summary>Historial ({history.length})</summary>
			<ul class="mt-2 space-y-2">
				{#each history as item (item.id)}
					<li>
						{new Date(item.occurredAt).toLocaleString()} · {{
							add: 'Sumar',
							recount: 'Recontar',
							subtract: 'Restar',
							sale: 'Venta'
						}[item.type]} · {item.previousQuantity ?? 'Sin conteo'} → {item.resultingQuantity} (cantidad:
						{item.enteredQuantity}; {item.source === 'manual' ? 'manual' : 'importación'})
					</li>
				{/each}
			</ul>
		</details>
	{/if}
	{#if app.session.importedMovements?.some((m) => m.key === product.key)}
		<details class="border-t border-zinc-200 p-3 text-sm dark:border-zinc-800">
			<summary>Movimientos importados e historial de conciliación</summary>
			<ul class="mt-2 space-y-2">
				{#each (app.session.importedMovements ?? [])
					.filter((m) => m.key === product.key)
					.slice()
					.sort((a, b) => a.occurredAt.localeCompare(b.occurredAt)) as movement (movement.id)}
					<li>
						{movement.date} · {movement.time} ({movement.timeZone}) · {movement.type === 'sale'
							? 'Venta'
							: 'Nota de crédito'} · Folio {movement.folio} · Cantidad: {movement.quantity}. {movement.reason}
					</li>
				{/each}
			</ul>
			<ul class="mt-3 space-y-2">
				{#each (app.session.reconciliationLog ?? []).filter((entry) => entry.productId === product.id) as entry (entry.id)}
					<li>
						Conciliación {entry.at}: {entry.previousQuantity} → {entry.resultingQuantity}. {entry
							.outcomes.length} movimientos evaluados.
					</li>
				{/each}
			</ul>
		</details>
	{/if}
</article>
