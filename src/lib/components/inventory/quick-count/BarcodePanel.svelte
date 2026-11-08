<!--
  Escaneo de código de barras por cámara, como panel desplegable debajo
  de la barra de búsqueda. API nativa BarcodeDetector (Chrome en Android),
  sin dependencias nuevas. El código no trae cantidad: arranca en 1 y se
  ajusta con + / -. Nada se guarda hasta Confirmar conteo.
-->
<script lang="ts">
	import { onDestroy } from 'svelte';
	import { Barcode, Camera } from 'lucide-svelte';
	import { normalizeBarcode } from '$lib/barcode-scan';
	import type { Product } from '$lib/inventory';
	import type { InventoryController } from '../inventory-controller.svelte';
	import CodeInput from './CodeInput.svelte';
	import CountConfirmCard from './CountConfirmCard.svelte';
	import FilterNotice from './FilterNotice.svelte';
	import PanelHeader from './PanelHeader.svelte';
	import ProductCandidateButton from './ProductCandidateButton.svelte';
	import UnmatchedForm from './UnmatchedForm.svelte';
	import { BarcodeCamera } from './barcode-camera.svelte';
	import {
		filterLabel,
		lookupBarcodeScoped,
		saveCounted,
		saveUnmatchedItem,
		shouldAutoStart,
		showAll,
		barcodeUnmatchedDraft,
		type HistoryItem
	} from './quick-count';

	let {
		app,
		onDone,
		onRegistered,
		autoStart = false
	}: {
		app: InventoryController;
		onDone: () => void;
		onRegistered: (item: HistoryItem) => void;
		/** El panel se abrió con el icono del código: abrir la cámara de inmediato, en un solo tap. */
		autoStart?: boolean;
	} = $props();

	let videoEl: HTMLVideoElement | undefined = $state();
	let error = $state('');
	let scannedCode = $state('');
	let foundProduct = $state<Product | null>(null);
	let filterExcludedProduct = $state<Product | null>(null);
	let quantityDraft = $state<number | undefined>(undefined);
	let typedCode = $state('');
	let unmatchedLocation = $state('');

	const camera = new BarcodeCamera({ onCode: (code) => handleCode(code) });

	// Un solo tap: al abrirse con el icono, el panel abre la cámara de
	// inmediato, sin esperar al botón de escanear (que queda como
	// reintento manual si la cámara falla). El $effect corre en el mismo
	// flush de Svelte que el tap provocó — sin setTimeout ni esperas — así
	// que el gesto del tap sigue válido cuando se pide el permiso. Una
	// sola vez por montaje: si el permiso se niega, se muestra
	// `cameraError` en español y no se reintenta en bucle. El arranque
	// reusa el fix de la cámara (scanning + tick antes de getUserMedia).
	let autoStarted = $state(false);
	$effect(() => {
		if (shouldAutoStart(autoStart, autoStarted, camera.supported)) {
			autoStarted = true;
			void camera.start(() => videoEl);
		}
	});

	onDestroy(() => {
		camera.stop();
	});

	function handleCode(rawCode: string): void {
		const code = normalizeBarcode(rawCode);
		camera.stop();
		if (!code) {
			error = 'No se leyó ningún código. Intenta de nuevo o escríbelo a mano.';
			return;
		}
		scannedCode = code;
		// Solo entre los productos del filtro activo (ver quick-count.ts).
		const result = lookupBarcodeScoped(app, code);
		foundProduct = result.product;
		filterExcludedProduct = result.filterExcludedProduct;
		// El código no trae cantidad: arranca en 1 y se ajusta con + / -.
		quantityDraft = 1;
		error = '';
	}

	/** Quita el filtro y vuelve a buscar el código, ya con todo el catálogo. */
	function showAllAndRetry(): void {
		showAll(app);
		handleCode(scannedCode);
	}

	function clearScan(): void {
		scannedCode = '';
		foundProduct = null;
		filterExcludedProduct = null;
		quantityDraft = undefined;
		typedCode = '';
		unmatchedLocation = '';
	}

	function cancel(): void {
		camera.stop();
		clearScan();
		onDone();
	}

	async function confirmCount(): Promise<void> {
		if (!foundProduct || quantityDraft === undefined) return;
		const result = await saveCounted(app, foundProduct, quantityDraft);
		if (!result.ok) {
			error = result.error;
			return;
		}
		onRegistered({
			label: `${foundProduct.name}: ${quantityDraft} piezas guardadas.`,
			kind: 'count'
		});
		clearScan();
		onDone();
	}

	async function registerUnmatched(): Promise<void> {
		if (!scannedCode || quantityDraft === undefined) return;
		const draft = barcodeUnmatchedDraft(scannedCode, quantityDraft, unmatchedLocation);
		const result = await saveUnmatchedItem(app, draft);
		if (!result.ok) {
			error = result.error;
			return;
		}
		onRegistered({
			label: `Código ${scannedCode}: ${quantityDraft} registrado como no encontrado (Pendiente de revisar).`,
			kind: 'unmatched'
		});
		clearScan();
		onDone();
	}
</script>

<div class="space-y-3">
	<PanelHeader
		title="Escanear código de barras"
		subtitle="Apunta la cámara al código del empaque. Nada se guarda hasta que confirmes."
		actionLabel={camera.scanning ? 'Detener escaneo' : 'Escanear con la cámara'}
		actionActive={camera.scanning}
		actionDisabled={!camera.supported}
		onAction={() => (camera.scanning ? camera.stop() : void camera.start(() => videoEl))}
	>
		{#snippet icon()}
			<Barcode size={20} />
		{/snippet}
	</PanelHeader>

	{#if !camera.supported}
		<p class="rounded-xl border border-amber-500 bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-200">
			Este navegador no detecta códigos con la cámara. Usa el cuadro de abajo para
			escribir el código a mano.
		</p>
	{/if}

	{#if camera.scanning}
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
			onclick={() => camera.stop()}
		>
			<Camera size={16} /> Detener cámara
		</button>
	{/if}

	{#if camera.cameraError}
		<p role="alert" class="text-sm text-red-600">{camera.cameraError}</p>
	{/if}

	<CodeInput bind:code={typedCode} onSearch={(code) => handleCode(code)} />

	{#if error}
		<p role="alert" class="text-sm text-red-600">{error}</p>
	{/if}

	{#if scannedCode}
		{#snippet heard()}
			<p class="text-sm text-zinc-500">
				Código escaneado:
				<strong class="text-zinc-900 dark:text-zinc-100">{scannedCode}</strong>
			</p>
		{/snippet}

		{#snippet product()}
			{#if filterExcludedProduct}
				<FilterNotice
					productName={filterExcludedProduct.name}
					filterLabel={filterLabel(app)}
					onShowAll={showAllAndRetry}
				/>
			{:else if foundProduct}
				<ProductCandidateButton
					product={foundProduct}
					selected={true}
					badge="exact"
					onselect={() => {}}
				/>
			{:else}
				<p class="rounded-xl border border-amber-500 bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-200">
					No encontré ese código en el catálogo. Puede ser un producto sin
					código registrado o un código nuevo: regístralo como artículo no
					encontrado y se revisa después.
				</p>
			{/if}
		{/snippet}

		{#snippet unmatched()}
			{#if !foundProduct && !filterExcludedProduct}
				<UnmatchedForm
					bind:location={unmatchedLocation}
					note="Queda como Pendiente de revisar, con el código guardado para identificarlo después. No suma al avance ni modifica el catálogo."
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
			confirmDisabled={!foundProduct || quantityDraft === undefined || !app.canCount}
			onConfirm={() => void confirmCount()}
			onCancel={cancel}
		/>
	{/if}
</div>
