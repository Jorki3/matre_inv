<script lang="ts">
	import type { Product } from '$lib/inventory';

	let {
		product,
		selected,
		badge,
		onselect
	}: {
		product: Product;
		selected: boolean;
		badge: 'exact' | 'similar';
		onselect: (product: Product) => void;
	} = $props();
</script>

<button
	type="button"
	aria-pressed={selected}
	class={`w-full rounded-xl border p-3 text-left ${selected ? 'border-red-500 bg-red-50 dark:bg-red-950' : 'border-zinc-200 dark:border-zinc-700'} ${badge === 'exact' ? 'border-2' : ''}`}
	onclick={() => onselect(product)}
>
	<span class="flex items-center justify-between gap-2">
		<span class="font-medium">{product.name}</span>
		{#if badge === 'exact'}
			<span
				class="rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-800 dark:bg-green-950 dark:text-green-200"
			>
				Coincide
			</span>
		{:else}
			<span
				class="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800 dark:bg-amber-950 dark:text-amber-200"
			>
				Parecido · no exacto
			</span>
		{/if}
	</span>
	<span class="block text-xs text-zinc-500">
		{product.key} · Clave genérica: {product.alternateKey || product.category || '—'}
	</span>
</button>
