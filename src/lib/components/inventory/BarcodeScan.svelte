<!--
  Escaneo de código de barras por cámara para MATRE Inventario.

  INTEGRACIÓN — 2 líneas en `src/lib/components/inventory/InventoryView.svelte`,
  justo después de `<VoiceCount {app} />`:
      import BarcodeScan from './BarcodeScan.svelte';
      <BarcodeScan {app} />

  Solo agrega este componente y `src/lib/barcode-scan.ts`. No modifica
  archivos existentes y no agrega dependencias nuevas: usa la API
  nativa BarcodeDetector del navegador (Chrome en Android) y, si el
  navegador no la tiene, deja escribir el código a mano.

  HOOKS AL CONTROLADOR (ya existen, no se inventó nada nuevo):
  - Contar: `app.countDraft = cantidad; await app.saveCount(producto)`.
    A propósito NO se usa `app.applySelection`, porque esa función alterna
    (si el producto ya estaba seleccionado, lo deselecciona). `saveCount`
    solo lee `app.countDraft`, así que basta con asignarlo.
  - Código no encontrado: `await app.saveUnmatched(draft)` con un
    `UnmatchedDraft` (`reviewStatus: 'pending'`), con el código guardado
    en `alternateKey` para identificarlo después. El controlador lo guarda
    con `saveUnmatchedArticle` y lo deja separado del conteo oficial, sin
    modificar el catálogo SICAR, igual que `UnmatchedArticleForm.svelte`.
  - El código de barras NO trae cantidad: la cantidad arranca en 1 y el
    usuario la ajusta con + / - antes de confirmar. Nada se guarda hasta
    tocar "Confirmar conteo".
-->
<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import { Barcode, Camera, Check, Minus, Plus, X } from 'lucide-svelte';
	import {
		BARCODE_FORMATS,
		findProductByBarcode,
		normalizeBarcode
	} from '$lib/barcode-scan';
	import type { UnmatchedDraft } from '$lib/unmatched-articles';
	import type { Product } from '$lib/inventory';
	import type { InventoryController } from './inventory-controller.svelte';

	let { app }: { app: InventoryController } = $props();

	interface BarcodeDetectorResultLike {
		rawValue: string;
		format: string;
	}
	interface BarcodeDetectorLike {
		detect(source: ImageBitmapSource): Promise<BarcodeDetectorResultLike[]>;
	}
	interface BarcodeDetectorConstructorLike {
		new (options?: { formats?: readonly string[] }): BarcodeDetectorLike;
		getSupportedFormats?: () => Promise<string[]>;
	}

	function getBarcodeDetectorConstructor(): BarcodeDetectorConstructorLike | null {
		if (typeof window === 'undefined') return null;
		const w = window as unknown as {
			BarcodeDetector?: BarcodeDetectorConstructorLike;
		};
		return w.BarcodeDetector ?? null;
	}

	let videoEl: HTMLVideoElement | undefined = $state();
	let scanning = $state(false);
	let detectorSupported = $state(true);
	let cameraError = $state('');
	let error = $state('');
	let savedNote = $state('');
	let scannedCode = $state('');
	let foundProduct = $state<Product | null>(null);
	let quantityDraft = $state<number | undefined>(undefined);
	let typedCode = $state('');
	let unmatchedLocation = $state('');
	let history = $state<{ label: string; kind: 'count' | 'unmatched' }[]>([]);
	let stream: MediaStream | null = null;
	let detector: BarcodeDetectorLike | null = null;
	let rafId: number | undefined;
	let lastDetectAt = 0;

	onMount(() => {
		detectorSupported = getBarcodeDetectorConstructor() !== null;
	});

	onDestroy(() => {
		stopCamera();
	});

	function stopCamera() {
		if (rafId !== undefined) {
			cancelAnimationFrame(rafId);
			rafId = undefined;
		}
		if (stream) {
			for (const track of stream.getTracks()) track.stop();
			stream = null;
		}
		if (videoEl) videoEl.srcObject = null;
		scanning = false;
	}

	function handleCode(rawCode: string) {
		const code = normalizeBarcode(rawCode);
		stopCamera();
		if (!code) {
			error = 'No se leyó ningún código. Intenta de nuevo o escríbelo a mano.';
			return;
		}
		scannedCode = code;
		foundProduct = findProductByBarcode(app.products, code);
		// El código no trae cantidad: arranca en 1 y se ajusta con + / -.
		quantityDraft = 1;
		error = '';
		savedNote = '';
	}

	function scanLoop() {
		if (!scanning || !videoEl || !detector) return;
		const now = Date.now();
		if (now - lastDetectAt >= 300) {
			lastDetectAt = now;
			detector
				.detect(videoEl)
				.then((results) => {
					const value = results[0]?.rawValue?.trim();
					if (value) handleCode(value);
				})
				.catch(() => {
					// Un cuadro fallido no detiene el escaneo; el siguiente lo intenta.
				});
		}
		if (scanning) rafId = requestAnimationFrame(scanLoop);
	}

	async function startScanning() {
		const Ctor = getBarcodeDetectorConstructor();
		if (!Ctor) {
			detectorSupported = false;
			error =
				'Este navegador no detecta códigos con la cámara. Usa el cuadro para escribir el código a mano.';
			return;
		}
		if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
			error = 'Este navegador no permite usar la cámara. Escribe el código a mano.';
			return;
		}
		clearScan();
		cameraError = '';
		error = '';
		savedNote = '';
		try {
			detector = new Ctor({ formats: [...BARCODE_FORMATS] });
		} catch {
			detector = new Ctor();
		}
		try {
			stream = await navigator.mediaDevices.getUserMedia({
				video: { facingMode: 'environment' },
				audio: false
			});
		} catch (err) {
			const name = err instanceof Error ? err.name : '';
			cameraError =
				name === 'NotAllowedError'
					? 'Permiso de cámara denegado. Actívalo para este sitio en los ajustes del navegador y vuelve a intentar, o escribe el código a mano.'
					: name === 'NotFoundError'
						? 'No se encontró cámara en este teléfono. Escribe el código a mano.'
						: 'No se pudo abrir la cámara. Escribe el código a mano.';
			return;
		}
		if (!videoEl) {
			stopCamera();
			return;
		}
		videoEl.srcObject = stream;
		try {
			await videoEl.play();
		} catch {
			// Si el video no arranca, el cuadro de error de abajo lo explica.
			stopCamera();
			error = 'No se pudo abrir la cámara. Escribe el código a mano.';
			return;
		}
		scanning = true;
		lastDetectAt = 0;
		rafId = requestAnimationFrame(scanLoop);
	}

	function searchTyped() {
		if (!typedCode.trim()) return;
		handleCode(typedCode);
	}

	function clearScan() {
		scannedCode = '';
		foundProduct = null;
		quantityDraft = undefined;
		typedCode = '';
		unmatchedLocation = '';
	}

	async function confirmCount() {
		if (!foundProduct || quantityDraft === undefined) return;
		if (!app.canCount) {
			error = 'Comienza o reanuda la sesión para contar.';
			return;
		}
		error = '';
		app.countDraft = quantityDraft;
		await app.saveCount(foundProduct);
		if (app.unmatchedError) {
			error = app.unmatchedError;
			return;
		}
		history = [
			{ label: `${foundProduct.name}: ${quantityDraft} piezas guardadas.`, kind: 'count' },
			...history
		];
		savedNote = app.message;
		clearScan();
	}

	async function registerUnmatched() {
		if (!scannedCode || quantityDraft === undefined) return;
		if (!app.canCount) {
			error = 'Comienza o reanuda la sesión para registrar hallazgos.';
			return;
		}
		const draft: UnmatchedDraft = {
			description: `Código de barras ${scannedCode} (sin producto en catálogo)`,
			quantity: quantityDraft,
			key: '',
			alternateKey: scannedCode,
			location: unmatchedLocation.trim(),
			notes: `Escaneo por cámara: código ${scannedCode}`,
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
				label: `Código ${scannedCode}: ${quantityDraft} registrado como no encontrado (Pendiente de revisar).`,
				kind: 'unmatched'
			},
			...history
		];
		savedNote = app.message;
		clearScan();
	}
</script>

<section
	class="space-y-3 rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"
	aria-label="Escanear código de barras"
>
	<div class="flex items-center justify-between gap-3">
		<div>
			<h2 class="font-semibold">Escanear código de barras</h2>
			<p class="text-sm text-zinc-500">
				Apunta la cámara al código del empaque. Nada se guarda hasta que confirmes.
			</p>
		</div>
		<button
			type="button"
			disabled={!detectorSupported}
			aria-label={scanning ? 'Detener escaneo' : 'Escanear con la cámara'}
			class={`flex min-h-11 min-w-11 items-center justify-center rounded-full text-white disabled:opacity-50 ${scanning ? 'animate-pulse bg-zinc-700' : 'bg-red-600'}`}
			onclick={() => (scanning ? stopCamera() : void startScanning())}
		>
			<Barcode size={20} />
		</button>
	</div>

	{#if !detectorSupported}
		<p
			class="rounded-xl border border-amber-500 bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-200"
		>
			Este navegador no detecta códigos con la cámara. Usa el cuadro de abajo para
			escribir el código a mano.
		</p>
	{/if}

	{#if scanning}
		<video
			bind:this={videoEl}
			playsinline
			muted
			autoplay
			class="aspect-video w-full rounded-xl bg-black object-cover"
			aria-label="Vista de la cámara para escanear el código de barras"
		></video>
		<p class="text-sm font-medium text-red-600">
			Escaneando… apunta al código, con buena luz y que se vea completo.
		</p>
		<button
			type="button"
			class="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-zinc-300 px-4 text-sm dark:border-zinc-700"
			onclick={() => stopCamera()}
		>
			<Camera size={16} /> Detener cámara
		</button>
	{/if}

	{#if cameraError}
		<p role="alert" class="text-sm text-red-600">{cameraError}</p>
	{/if}

	<div class="flex gap-2">
		<input
			bind:value={typedCode}
			inputmode="numeric"
			aria-label="Escribir el código de barras a mano"
			placeholder="Ej. 7502293080002"
			class="min-h-11 flex-1 rounded-xl border border-zinc-300 bg-transparent px-3 text-base dark:border-zinc-700"
		/>
		<button
			type="button"
			disabled={!typedCode.trim()}
			class="min-h-11 rounded-xl bg-red-600 px-4 text-sm font-medium text-white disabled:opacity-50"
			onclick={searchTyped}
		>
			Buscar
		</button>
	</div>

	{#if error}
		<p role="alert" class="text-sm text-red-600">{error}</p>
	{/if}
	{#if savedNote}
		<p
			class="rounded-xl border border-green-600 bg-green-50 p-3 text-sm text-green-800 dark:bg-green-950 dark:text-green-200"
		>
			{savedNote}
		</p>
	{/if}

	{#if scannedCode}
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
				Código escaneado:
				<strong class="text-zinc-900 dark:text-zinc-100">{scannedCode}</strong>
			</p>

			{#if foundProduct}
				<div
					class="w-full rounded-xl border-2 border-red-500 bg-red-50 p-3 text-left dark:bg-red-950"
				>
					<span class="flex items-center justify-between gap-2">
						<span class="font-medium">{foundProduct.name}</span>
						<span
							class="rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-800 dark:bg-green-950 dark:text-green-200"
						>
							Coincide
						</span>
					</span>
					<span class="block text-xs text-zinc-500">
						{foundProduct.key} · Clave genérica: {foundProduct.alternateKey ??
							foundProduct.barcode ??
							foundProduct.category ??
							'—'}
					</span>
				</div>
			{:else}
				<p
					class="rounded-xl border border-amber-500 bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-200"
				>
					No encontré ese código en el catálogo. Puede ser un producto sin
					código registrado o un código nuevo: regístralo como artículo no
					encontrado y se revisa después.
				</p>
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
				disabled={!foundProduct || quantityDraft === undefined || !app.canCount}
				class="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-green-600 px-4 text-sm font-semibold text-white disabled:opacity-50"
				onclick={() => void confirmCount()}
			>
				<Check size={18} /> Confirmar conteo
			</button>
			<button
				type="button"
				class="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-zinc-300 px-4 text-sm dark:border-zinc-700"
				onclick={() => {
					clearScan();
					void startScanning();
				}}
			>
				<Barcode size={16} /> Escanear otro código
			</button>
			<button
				type="button"
				class="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-zinc-300 px-4 text-sm dark:border-zinc-700"
				onclick={() => {
					stopCamera();
					clearScan();
				}}
			>
				<X size={16} /> Cancelar
			</button>

			{#if !foundProduct}
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
						Queda como Pendiente de revisar, con el código guardado para
						identificarlo después. No suma al avance ni modifica el catálogo SICAR.
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
