<!--
  Dictado por voz, como panel desplegable debajo de la barra de búsqueda
  (se abre con el micrófono junto a la caja). Análisis local (Web Speech
  API + `parseVoiceCount`): no usa Muse, no hay red ni tokens. El cuadro
  de texto es solo para escribir el dictado cuando no hay micrófono o
  para probar: no es un modo aparte. Nada se guarda hasta Confirmar
  conteo; al confirmar o cancelar, el panel se cierra.
-->
<script lang="ts">
	import { onDestroy } from 'svelte';
	import { Mic } from 'lucide-svelte';
	import { EXAMPLE_PHRASES, type VoiceInterpretation } from '$lib/voice-count';
	import type { Product } from '$lib/inventory';
	import type { InventoryController } from '../inventory-controller.svelte';
	import CountConfirmCard from './CountConfirmCard.svelte';
	import CandidateList from './CandidateList.svelte';
	import FilterNotice from './FilterNotice.svelte';
	import PanelHeader from './PanelHeader.svelte';
	import UnmatchedForm from './UnmatchedForm.svelte';
	import VoiceHeardLine from './VoiceHeardLine.svelte';
	import { VoiceRecognition, speakText } from './voice-recognition.svelte';
	import {
		filterLabel,
		interpretScoped,
		saveCounted,
		saveUnmatchedItem,
		showAll,
		voiceUnmatchedDraft,
		type HistoryItem
	} from './quick-count';

	let {
		app,
		onDone,
		onRegistered
	}: {
		app: InventoryController;
		onDone: () => void;
		onRegistered: (item: HistoryItem) => void;
	} = $props();

	let transcript = $state('');
	let interpretation = $state<VoiceInterpretation | null>(null);
	let filterExcludedProduct = $state<Product | null>(null);
	let selectedProductId = $state<string | null>(null);
	let quantityDraft = $state<number | undefined>(undefined);
	let error = $state('');
	let typedText = $state('');
	let unmatchedLocation = $state('');

	const voice = new VoiceRecognition({
		onTranscript: (text) => interpret(text),
		onError: (message) => {
			error = message;
		}
	});

	// Si el panel se cierra (o cambia a Código) mientras escucha, se
	// detiene el reconocimiento para no seguir oyendo en segundo plano.
	onDestroy(() => voice.stop());

	function interpret(text: string): void {
		transcript = text;
		// Solo entre los productos del filtro activo (ver quick-count.ts).
		const result = interpretScoped(app, text);
		interpretation = result.interpretation;
		filterExcludedProduct = result.filterExcludedProduct;
		quantityDraft = interpretation.quantity;
		selectedProductId =
			interpretation.exact && interpretation.product ? interpretation.product.id : null;
		error = '';
	}

	/** Quita el filtro y vuelve a interpretar lo dictado, ya con todo el catálogo. */
	function showAllAndRetry(): void {
		showAll(app);
		interpret(transcript);
	}

	function clearInterpretation(): void {
		transcript = '';
		interpretation = null;
		filterExcludedProduct = null;
		selectedProductId = null;
		quantityDraft = undefined;
		typedText = '';
		unmatchedLocation = '';
	}

	function cancel(): void {
		clearInterpretation();
		onDone();
	}

	async function confirmCount(): Promise<void> {
		const product = app.products.find((item) => item.id === selectedProductId);
		if (!product || quantityDraft === undefined) return;
		const result = await saveCounted(app, product, quantityDraft);
		if (!result.ok) {
			error = result.error;
			return;
		}
		onRegistered({ label: `${product.name}: ${quantityDraft} piezas guardadas.`, kind: 'count' });
		clearInterpretation();
		onDone();
	}

	async function registerUnmatched(): Promise<void> {
		if (!interpretation || quantityDraft === undefined) return;
		const draft = voiceUnmatchedDraft(interpretation, quantityDraft, unmatchedLocation);
		const result = await saveUnmatchedItem(app, draft);
		if (!result.ok) {
			error = result.error;
			return;
		}
		onRegistered({
			label: `${draft.description}: ${quantityDraft} registrado como no encontrado (Pendiente de revisar).`,
			kind: 'unmatched'
		});
		clearInterpretation();
		onDone();
	}
</script>

<div class="space-y-3">
	<PanelHeader
		title="Dictado por voz"
		subtitle="Di el producto y la cantidad. Nada se guarda hasta que confirmes."
		actionLabel={voice.listening ? 'Detener dictado' : 'Iniciar dictado por voz'}
		actionActive={voice.listening}
		actionDisabled={!voice.supported}
		onAction={() => (voice.listening ? voice.stop() : voice.start())}
	>
		{#snippet icon()}
			<Mic size={20} />
		{/snippet}
	</PanelHeader>

	{#if !voice.supported}
		<p class="rounded-xl border border-amber-500 bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-200">
			Este navegador no soporta dictado por voz. Usa el cuadro de texto o las frases de
			ejemplo de abajo.
		</p>
	{/if}
	{#if voice.listening}
		<p class="text-sm font-medium text-red-600">Escuchando… di el producto y la cantidad.</p>
	{/if}

	<div class="flex gap-2">
		<input
			bind:value={typedText}
			aria-label="Texto dictado para probar sin micrófono"
			placeholder='Ej. "Rondana plana de 5 16, 100 piezas"'
			class="min-h-11 flex-1 rounded-xl border border-zinc-300 bg-transparent px-3 text-base dark:border-zinc-700"
		/>
		<button
			type="button"
			disabled={!typedText.trim()}
			class="min-h-11 rounded-xl bg-red-600 px-4 text-sm font-medium text-white disabled:opacity-50"
			onclick={() => interpret(typedText)}
		>
			Interpretar
		</button>
	</div>
	<div class="flex flex-wrap gap-1">
		{#each EXAMPLE_PHRASES as phrase (phrase)}
			<button
				type="button"
				class="min-h-9 rounded-full border border-zinc-300 px-3 text-xs dark:border-zinc-700"
				onclick={() => interpret(phrase)}>{phrase}</button
			>
		{/each}
	</div>

	{#if error}
		<p role="alert" class="text-sm text-red-600">{error}</p>
	{/if}

	{#if interpretation}
		{#snippet heard()}
			<VoiceHeardLine
				{transcript}
				quantity={quantityDraft}
				fraction={interpretation?.fraction}
				conflict={interpretation?.conflict}
				onSpeak={() =>
					speakText(
						`Escuché ${transcript}. Cantidad detectada ${quantityDraft ?? 'sin cantidad'}. ${
							interpretation?.fraction
								? `Medida detectada ${interpretation.fraction.text} pulgadas.`
								: ''
						}`
					)}
			/>
		{/snippet}

		{#snippet product()}
			{#if filterExcludedProduct}
				<FilterNotice
					productName={filterExcludedProduct.name}
					filterLabel={filterLabel(app)}
					onShowAll={showAllAndRetry}
				/>
			{/if}
			{#if interpretation}
				<CandidateList
					{interpretation}
					selectedId={selectedProductId}
					showNotFound={!filterExcludedProduct}
					onselect={(p) => (selectedProductId = p.id)}
				/>
			{/if}
		{/snippet}

		{#snippet unmatched()}
			{#if interpretation && !interpretation.exact && !filterExcludedProduct}
				<UnmatchedForm
					bind:location={unmatchedLocation}
					registerDisabled={quantityDraft === undefined || !app.canCount}
					onRegister={() => void registerUnmatched()}
				/>
			{/if}
		{/snippet}

		<CountConfirmCard
			bind:quantity={quantityDraft}
			{heard}
			{product}
			{unmatched}
			confirmDisabled={!selectedProductId || quantityDraft === undefined || !app.canCount}
			onConfirm={() => void confirmCount()}
			onCancel={cancel}
		/>
	{/if}
</div>
