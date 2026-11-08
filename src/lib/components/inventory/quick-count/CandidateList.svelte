<script lang="ts">
	import type { VoiceInterpretation } from '$lib/voice-count';
	import type { Product } from '$lib/inventory';
	import ProductCandidateButton from './ProductCandidateButton.svelte';

	/**
	 * El producto exacto (Coincide) o el aviso de no encontrado, más los
	 * parecidos (Parecido · no exacto) cuando no hay exacto.
	 */
	let {
		interpretation,
		selectedId,
		showNotFound = true,
		onselect
	}: {
		interpretation: VoiceInterpretation;
		selectedId: string | null;
		/** Si el exacto está fuera del filtro, el aviso lo da FilterNotice, no este texto. */
		showNotFound?: boolean;
		onselect: (product: Product) => void;
	} = $props();
</script>

{#if interpretation.product}
	<ProductCandidateButton
		product={interpretation.product}
		selected={selectedId === interpretation.product.id}
		badge="exact"
		{onselect}
	/>
{:else if showNotFound}
	<p class="rounded-xl border border-amber-500 bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-200">
		No encontré ese producto exacto en el catálogo. Puedes elegir un parecido de
		abajo o registrarlo como artículo no encontrado.
	</p>
{/if}

{#if interpretation.candidates.length > 0 && !interpretation.exact}
	<div class="space-y-2">
		<p class="text-sm font-medium">Parecidos (no exactos):</p>
		{#each interpretation.candidates as candidate (candidate.product.id)}
			<ProductCandidateButton
				product={candidate.product}
				selected={selectedId === candidate.product.id}
				badge="similar"
				{onselect}
			/>
		{/each}
	</div>
{/if}
