import type { InventoryController } from '../inventory-controller.svelte';
import type { UnmatchedDraft } from '$lib/unmatched-articles';
import { searchProducts, type Product } from '$lib/inventory';
import { parseVoiceCount, type VoiceInterpretation } from '$lib/voice-count';
import { findProductByBarcode } from '$lib/barcode-scan';
import { filters } from '../inventory-ui';

/** Panel abierto en la barra de conteo rápido. Solo uno a la vez. */
export type QuickCountMode = 'closed' | 'voice' | 'text' | 'barcode';

/** Un registro en el historial compartido de la sesión. */
export interface HistoryItem {
	label: string;
	kind: 'count' | 'unmatched';
}

/** Agrega un registro arriba del historial (el más reciente primero). */
export function addHistory(items: HistoryItem[], item: HistoryItem): HistoryItem[] {
	return [item, ...items];
}

/**
 * Conteo rápido respeta el filtro activo (Todos / Pendientes / Contados /
 * Diferencias / Sin diferencias): voz y código solo buscan entre los
 * productos de ese filtro.
 *
 * Es la lista filtrada solo por el filtro, sin el texto de búsqueda: con
 * la caja de búsqueda vacía es idéntica a `app.visibleProducts`. El texto
 * escrito no bloquea el dictado ni el escaneo — el dictado ES la
 * búsqueda — pero el filtro sí manda, porque Eduardo cuenta por bloques
 * (primero los pendientes, luego el resto).
 */
export function scopedProducts(app: InventoryController): Product[] {
	return searchProducts(app.products, '', app.filter);
}

/** Etiqueta del filtro activo ("Pendientes", "Contados", ...). */
export function filterLabel(app: InventoryController): string {
	return filters.find((item) => item.id === app.filter)?.label ?? 'Todos';
}

/** Quita el filtro (y el texto de búsqueda) para ver todo el catálogo. */
export function showAll(app: InventoryController): void {
	app.filter = 'all';
	app.query = '';
}

export interface ScopedVoiceResult {
	interpretation: VoiceInterpretation;
	/** Exacto en todo el catálogo pero fuera del filtro activo (o null). */
	filterExcludedProduct: Product | null;
}

/**
 * Interpreta un dictado solo entre los productos del filtro. Si el
 * exacto existe en el catálogo pero el filtro lo esconde, se devuelve
 * en `filterExcludedProduct` para avisar en vez de preseleccionarlo.
 */
export function interpretScoped(app: InventoryController, text: string): ScopedVoiceResult {
	const interpretation = parseVoiceCount(text, scopedProducts(app));
	let filterExcludedProduct: Product | null = null;
	if (!interpretation.exact) {
		const full = parseVoiceCount(text, app.products);
		if (full.exact && full.product) filterExcludedProduct = full.product;
	}
	return { interpretation, filterExcludedProduct };
}

export interface ScopedBarcodeResult {
	product: Product | null;
	/** En el catálogo pero fuera del filtro activo (o null). */
	filterExcludedProduct: Product | null;
}

/** Busca un código solo entre los productos del filtro (ver interpretScoped). */
export function lookupBarcodeScoped(app: InventoryController, code: string): ScopedBarcodeResult {
	const product = findProductByBarcode(scopedProducts(app), code);
	if (product) return { product, filterExcludedProduct: null };
	return { product: null, filterExcludedProduct: findProductByBarcode(app.products, code) };
}

export interface SaveResult {
	ok: boolean;
	error: string;
	note: string;
}

/**
 * Guarda un conteo con los hooks que ya existen (`app.countDraft` +
 * `app.saveCount`). A propósito NO usa `app.applySelection`, porque
 * alterna la selección. Devuelve el mensaje del controlador o el error.
 */
export async function saveCounted(
	app: InventoryController,
	product: Product,
	quantity: number
): Promise<SaveResult> {
	if (!app.canCount) {
		return { ok: false, error: 'Comienza o reanuda la sesión para contar.', note: '' };
	}
	app.countDraft = quantity;
	await app.saveCount(product);
	if (app.unmatchedError) {
		return { ok: false, error: app.unmatchedError, note: '' };
	}
	return { ok: true, error: '', note: app.message };
}

/** Guarda un artículo no encontrado (Pendiente de revisar). */
export async function saveUnmatchedItem(
	app: InventoryController,
	draft: UnmatchedDraft
): Promise<SaveResult> {
	if (!app.canCount) {
		return {
			ok: false,
			error: 'Comienza o reanuda la sesión para registrar hallazgos.',
			note: ''
		};
	}
	await app.saveUnmatched(draft);
	if (app.unmatchedError) {
		return { ok: false, error: app.unmatchedError, note: '' };
	}
	return { ok: true, error: '', note: app.message };
}

/** Borrador de no encontrado para algo dictado (sin código). */
export function voiceUnmatchedDraft(
	interpretation: VoiceInterpretation,
	quantity: number,
	location: string
): UnmatchedDraft {
	return {
		description: interpretation.description || interpretation.transcript,
		quantity,
		key: '',
		alternateKey: '',
		location: location.trim(),
		notes: `Dictado por voz: «${interpretation.transcript}»`,
		reviewStatus: 'pending',
		linkedProductKey: ''
	};
}

/** Borrador de no encontrado para un código escaneado/escrito. */
export function barcodeUnmatchedDraft(
	code: string,
	quantity: number,
	location: string
): UnmatchedDraft {
	return {
		description: `Código de barras ${code} (sin producto en catálogo)`,
		quantity,
		key: '',
		alternateKey: code,
		location: location.trim(),
		notes: `Escaneo por cámara: código ${code}`,
		reviewStatus: 'pending',
		linkedProductKey: ''
	};
}
