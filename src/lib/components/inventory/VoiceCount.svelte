<!--
  Dictado por voz para MATRE Inventario (prototipo probado con el usuario).

  INTEGRACIÓN — 1 línea en `src/lib/components/inventory/InventoryView.svelte`,
  justo después de `<ProductSearch {app} />`:
      <VoiceCount {app} />

  No modifica archivos existentes: solo agrega este componente y
  `src/lib/voice-count.ts`. Todo el análisis es local (Web Speech API del
  navegador + `parseVoiceCount` en JavaScript): no usa Muse, no hay red
  ni tokens.

  HOOKS AL CONTROLADOR (ya existen, no se inventó nada nuevo):
  - Contar: `app.countDraft = cantidad; await app.saveCount(producto)`.
    A propósito NO se usa `app.applySelection`, porque esa función alterna
    (si el producto ya estaba seleccionado, lo deselecciona). `saveCount`
    solo lee `app.countDraft`, así que basta con asignarlo.
  - Artículo no encontrado: `await app.saveUnmatched(draft)` con un
    `UnmatchedDraft` (`reviewStatus: 'pending'`). El controlador lo guarda
    con `saveUnmatchedArticle` y lo deja separado del conteo oficial, sin
    modificar el catálogo SICAR, igual que `UnmatchedArticleForm.svelte`.
  - Alternativa sin código nuevo: `app.startUnmatchedRegistration()` abre el
    formulario que ya existe, con la descripción prellenada desde `app.query`.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import { Mic, Volume2, Check, Plus, Minus } from 'lucide-svelte';
	import { parseVoiceCount, EXAMPLE_PHRASES, type VoiceInterpretation } from '$lib/voice-count';
	import type { UnmatchedDraft } from '$lib/unmatched-articles';
	import type { Product } from '$lib/inventory';
	import type { InventoryController } from './inventory-controller.svelte';

	let { app }: { app: InventoryController } = $props();

	interface SpeechRecognitionResultLike {
		transcript: string;
	}
	interface SpeechRecognitionEventLike {
		results: ArrayLike<ArrayLike<SpeechRecognitionResultLike>>;
	}
	interface SpeechRecognitionLike {
		lang: string;
		continuous: boolean;
		interimResults: boolean;
		start(): void;
		stop(): void;
		onresult: ((event: SpeechRecognitionEventLike) => void) | null;
		onerror: ((event: { error?: string }) => void) | null;
		onend: (() => void) | null;
	}
	type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

	function getSpeechRecognitionConstructor(): SpeechRecognitionConstructor | null {
		if (typeof window === 'undefined') return null;
		const w = window as unknown as {
			SpeechRecognition?: SpeechRecognitionConstructor;
			webkitSpeechRecognition?: SpeechRecognitionConstructor;
		};
		return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
	}

	let transcript = $state('');
	let interpretation = $state<VoiceInterpretation | null>(null);
	let selectedProductId = $state<string | null>(null);
	let quantityDraft = $state<number | undefined>(undefined);
	let listening = $state(false);
	let supported = $state(true);
	let error = $state('');
	let savedNote = $state('');
	let typedText = $state('');
	let unmatchedLocation = $state('');
	let history = $state<{ label: string; kind: 'count' | 'unmatched' }[]>([]);
	let recognition: SpeechRecognitionLike | null = null;

	onMount(() => {
		supported = getSpeechRecognitionConstructor() !== null;
	});

	function interpret(text: string) {
		transcript = text;
		interpretation = parseVoiceCount(text, app.products);
		quantityDraft = interpretation.quantity;
		selectedProductId =
			interpretation.exact && interpretation.product ? interpretation.product.id : null;
		error = '';
		savedNote = '';
	}

	function startListening() {
		const Ctor = getSpeechRecognitionConstructor();
		if (!Ctor) {
			supported = false;
			error = 'Este navegador no soporta dictado por voz. Usa el cuadro de texto o las frases de ejemplo.';
			return;
		}
		recognition = new Ctor();
		recognition.lang = 'es-MX';
		recognition.continuous = false;
		recognition.interimResults = false;
		recognition.onresult = (event) => {
			const text = event.results[0]?.[0]?.transcript ?? '';
			if (text.trim()) interpret(text);
		};
		recognition.onerror = (event) => {
			listening = false;
			error = `No se pudo escuchar (${event.error ?? 'error del micrófono'}). Prueba con el cuadro de texto.`;
		};
		recognition.onend = () => {
			listening = false;
		};
		listening = true;
		error = '';
		try {
			recognition.start();
		} catch {
			listening = false;
		}
	}

	function stopListening() {
		recognition?.stop();
		listening = false;
	}

	function speak(text: string) {
		if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
		window.speechSynthesis.cancel();
		const utterance = new SpeechSynthesisUtterance(text);
		utterance.lang = 'es-MX';
		window.speechSynthesis.speak(utterance);
	}

	function clearInterpretation() {
		transcript = '';
		interpretation = null;
		selectedProductId = null;
		quantityDraft = undefined;
		typedText = '';
		unmatchedLocation = '';
	}

	function selectCandidate(product: Product) {
		// El usuario elige a mano un parecido: eso sí es una confirmación explícita.
		selectedProductId = product.id;
	}

	async function confirmCount() {
		const product = app.products.find((item) => item.id === selectedProductId);
		if (!product || quantityDraft === undefined) return;
		if (!app.canCount) {
			error = 'Comienza o reanuda la sesión para contar.';
			return;
		}
		error = '';
		app.countDraft = quantityDraft;
		await app.saveCount(product);
		if (app.unmatchedError) {
			error = app.unmatchedError;
			return;
		}
		history = [
			{ label: `${product.name}: ${quantityDraft} piezas guardadas.`, kind: 'count' },
			...history
		];
		savedNote = app.message;
		clearInterpretation();
	}

	async function registerUnmatched() {
		if (!interpretation || quantityDraft === undefined) return;
		if (!app.canCount) {
			error = 'Comienza o reanuda la sesión para registrar hallazgos.';
			return;
		}
		const description = interpretation.description || interpretation.transcript;
		const draft: UnmatchedDraft = {
			description,
			quantity: quantityDraft,
			key: '',
			alternateKey: '',
			location: unmatchedLocation.trim(),
			notes: `Dictado por voz: «${interpretation.transcript}»`,
			reviewStatus: 'pending',
			linkedProductKey: ''
		};
		await app.saveUnmatched(draft);
		if (app.unmatchedError) {
			error = app.unmatchedError;
			return;
		}
		history = [
			{
				label: `${description}: ${quantityDraft} registrado como no encontrado (Pendiente de revisar).`,
				kind: 'unmatched'
			},
			...history
		];
		savedNote = app.message;
		clearInterpretation();
	}
</script>

<section
	class="space-y-3 rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"
	aria-label="Dictado por voz"
>
	<div class="flex items-center justify-between gap-3">
		<div>
			<h2 class="font-semibold">Dictado por voz</h2>
			<p class="text-sm text-zinc-500">
				Di el producto y la cantidad. Nada se guarda hasta que confirmes.
			</p>
		</div>
		<button
			type="button"
			disabled={!supported}
			aria-label={listening ? 'Detener dictado' : 'Iniciar dictado por voz'}
			class={`flex min-h-11 min-w-11 items-center justify-center rounded-full text-white disabled:opacity-50 ${listening ? 'animate-pulse bg-zinc-700' : 'bg-red-600'}`}
			onclick={() => (listening ? stopListening() : startListening())}
		>
			<Mic size={20} />
		</button>
	</div>

	{#if !supported}
		<p class="rounded-xl border border-amber-500 bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-200">
			Este navegador no soporta dictado por voz. Usa el cuadro de texto o las frases de
			ejemplo de abajo.
		</p>
	{/if}
	{#if listening}
		<p class="text-sm font-medium text-red-600">Escuchando… di el producto y la cantidad.</p>
	{/if}

	<div class="flex gap-2">
		<input
			bind:value={typedText}
			aria-label="Escribir lo dictado para probar sin micrófono"
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
	{#if savedNote}
		<p class="rounded-xl border border-green-600 bg-green-50 p-3 text-sm text-green-800 dark:bg-green-950 dark:text-green-200">
			{savedNote}
		</p>
	{/if}

	{#if interpretation}
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
			<p class="text-sm text-zinc-500">
				Escuché: <strong class="text-zinc-900 dark:text-zinc-100">«{transcript}»</strong>
			</p>
			<button
				type="button"
				class="min-h-9 rounded-xl border border-zinc-300 px-3 text-sm dark:border-zinc-700"
				onclick={() =>
					speak(
						`Escuché ${transcript}. Cantidad detectada ${quantityDraft ?? 'sin cantidad'}. ${
							interpretation?.fraction
								? `Medida detectada ${interpretation.fraction.text} pulgadas.`
								: ''
						}`
					)}
			>
				<Volume2 size={16} class="mr-1 inline" /> Escuchar lectura
			</button>
			<p class="text-sm">
				Cantidad detectada:
				<strong>{quantityDraft ?? '—'}</strong>
				{#if interpretation.fraction}
					· Medida detectada: <strong>{interpretation.fraction.text}″</strong>
				{/if}
				{#if interpretation.conflict !== undefined}
					· <span class="text-red-600">Sin coincidencia exacta, pediste {interpretation.conflict}.</span>
				{/if}
			</p>

			{#if interpretation.product}
				{@const product = interpretation.product}
				<button
					type="button"
					aria-pressed={selectedProductId === product.id}
					class={`w-full rounded-xl border-2 p-3 text-left ${selectedProductId === product.id ? 'border-red-500 bg-red-50 dark:bg-red-950' : 'border-zinc-200 dark:border-zinc-700'}`}
					onclick={() => selectCandidate(product)}
				>
					<span class="flex items-center justify-between gap-2">
						<span class="font-medium">{product.name}</span>
						<span class="rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-800 dark:bg-green-950 dark:text-green-200">
							Coincide
						</span>
					</span>
					<span class="block text-xs text-zinc-500">
						{product.key} · Clave genérica: {product.alternateKey || product.category || '—'}
					</span>
				</button>
			{:else}
				<p class="rounded-xl border border-amber-500 bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-200">
					No encontré ese producto exacto en el catálogo. Puedes elegir un parecido de
					abajo o registrarlo como artículo no encontrado.
				</p>
			{/if}

			{#if interpretation.candidates.length > 0 && !interpretation.exact}
				<div class="space-y-2">
					<p class="text-sm font-medium">Parecidos (no exactos):</p>
					{#each interpretation.candidates as candidate (candidate.product.id)}
						<button
							type="button"
							aria-pressed={selectedProductId === candidate.product.id}
							class={`w-full rounded-xl border p-3 text-left ${selectedProductId === candidate.product.id ? 'border-red-500 bg-red-50 dark:bg-red-950' : 'border-zinc-200 dark:border-zinc-700'}`}
							onclick={() => selectCandidate(candidate.product)}
						>
							<span class="flex items-center justify-between gap-2">
								<span class="font-medium">{candidate.product.name}</span>
								<span class="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800 dark:bg-amber-950 dark:text-amber-200">
									Parecido · no exacto
								</span>
							</span>
							<span class="block text-xs text-zinc-500">
								{candidate.product.key} · Clave genérica: {candidate.product.alternateKey ||
									candidate.product.category ||
									'—'}
							</span>
						</button>
					{/each}
				</div>
			{/if}

			<div>
				<p class="text-sm font-medium">Cantidad contada:</p>
				<div class="mt-1 flex items-center gap-2">
					<button
						type="button"
						aria-label="Quitar una pieza"
						disabled={quantityDraft === undefined || quantityDraft <= 0}
						class="flex min-h-11 min-w-11 items-center justify-center rounded-xl border border-zinc-300 disabled:opacity-50 dark:border-zinc-700"
						onclick={() => (quantityDraft = Math.max(0, (quantityDraft ?? 0) - 1))}
					>
						<Minus size={18} />
					</button>
					<span class="min-w-16 text-center text-lg font-semibold">{quantityDraft ?? '—'}</span>
					<button
						type="button"
						aria-label="Agregar una pieza"
						disabled={quantityDraft === undefined}
						class="flex min-h-11 min-w-11 items-center justify-center rounded-xl border border-zinc-300 disabled:opacity-50 dark:border-zinc-700"
						onclick={() => (quantityDraft = (quantityDraft ?? 0) + 1)}
					>
						<Plus size={18} />
					</button>
					<span class="text-sm text-zinc-500">piezas</span>
				</div>
			</div>

			<button
				type="button"
				disabled={!selectedProductId || quantityDraft === undefined || !app.canCount}
				class="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-green-600 px-4 text-sm font-semibold text-white disabled:opacity-50"
				onclick={() => void confirmCount()}
			>
				<Check size={18} /> Confirmar conteo
			</button>
			<button
				type="button"
				class="min-h-11 w-full rounded-xl border border-zinc-300 px-4 text-sm dark:border-zinc-700"
				onclick={clearInterpretation}
			>
				Cancelar
			</button>

			{#if !interpretation.exact}
				<div class="space-y-2 rounded-xl border border-red-500 p-3">
					<p class="text-sm font-medium">¿No está en el catálogo?</p>
					<label class="block text-sm">
						Ubicación o sección (opcional)
						<input
							bind:value={unmatchedLocation}
							class="mt-1 min-h-11 w-full rounded-xl border border-zinc-300 bg-transparent px-3 text-base dark:border-zinc-700"
							placeholder="Ej. Pasillo 3, anaquel B"
						/>
					</label>
					<button
						type="button"
						disabled={quantityDraft === undefined || !app.canCount}
						class="min-h-11 w-full rounded-xl bg-red-600 px-4 text-sm font-medium text-white disabled:opacity-50"
						onclick={() => void registerUnmatched()}
					>
						Registrar como artículo no encontrado
					</button>
					<p class="text-xs text-zinc-500">
						Queda como Pendiente de revisar, separado del conteo oficial. No suma al
						avance ni modifica el catálogo SICAR.
					</p>
				</div>
			{/if}
		</div>
	{/if}

	{#if history.length > 0}
		<div class="space-y-2">
			<h3 class="font-semibold">Registrados en esta sesión</h3>
			{#each history as item (item.label)}
				<p
					class={`rounded-xl border p-3 text-sm ${item.kind === 'unmatched' ? 'border-amber-500' : 'border-zinc-200 dark:border-zinc-800'}`}
				>
					{item.label}
				</p>
			{/each}
		</div>
	{/if}
</section>
