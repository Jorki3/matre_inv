<script lang="ts">
	import { Check } from 'lucide-svelte';
	import type { Snippet } from 'svelte';
	import QuantityStepper from './QuantityStepper.svelte';

	/**
	 * Tarjeta compartida de "Revisa y confirma" para voz y código de
	 * barras. Nada se guarda hasta tocar Confirmar conteo. Lo que cambia
	 * entre un método y otro (qué se escuchó/escaneó, el producto y el
	 * registro de no encontrado) llega como snippets del panel.
	 */
	let {
		quantity = $bindable(),
		heard,
		product,
		candidates,
		unmatched,
		confirmDisabled = false,
		onConfirm,
		onCancel
	}: {
		quantity: number | undefined;
		heard: Snippet;
		product: Snippet;
		candidates?: Snippet;
		unmatched?: Snippet;
		confirmDisabled?: boolean;
		onConfirm: () => void;
		onCancel: () => void;
	} = $props();
</script>

<div
	class="space-y-3 rounded-2xl border-2 border-amber-500 bg-white p-4 dark:bg-zinc-900"
	aria-label="Revisa y confirma"
>
	<p
		class="inline-block rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800 dark:bg-amber-950 dark:text-amber-200"
	>
		⚠ NADA SE HA GUARDADO TODAVÍA
	</p>
	<h3 class="text-lg font-semibold">Revisa y confirma</h3>
	{@render heard()}
	{@render product()}
	{@render candidates?.()}

	<QuantityStepper bind:quantity />

	<button
		type="button"
		disabled={confirmDisabled}
		class="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-green-600 px-4 text-sm font-semibold text-white disabled:opacity-50"
		onclick={onConfirm}
	>
		<Check size={18} /> Confirmar conteo
	</button>
	<button
		type="button"
		class="min-h-11 w-full rounded-xl border border-zinc-300 px-4 text-sm dark:border-zinc-700"
		onclick={onCancel}
	>
		Cancelar
	</button>

	{@render unmatched?.()}
</div>
