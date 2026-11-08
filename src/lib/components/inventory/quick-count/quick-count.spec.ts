import { describe, expect, it, vi } from 'vitest';
import {
	addHistory,
	barcodeUnmatchedDraft,
	filterLabel,
	interpretScoped,
	lookupBarcodeScoped,
	saveCounted,
	saveUnmatchedItem,
	scopedProducts,
	showAll,
	voiceUnmatchedDraft,
	type HistoryItem
} from './quick-count';
import type { Product } from '$lib/inventory';
import type { VoiceInterpretation } from '$lib/voice-count';
import type { InventoryController } from '../inventory-controller.svelte';

function product(): Product {
	return {
		id: 'P-1',
		name: 'Brocha practica 013mm 1/2 exito',
		key: '19AH963021',
		expected: 0,
		physical: 0,
		// Fecha fija: dos llamadas a product() deben ser idénticas (si no,
		// el toHaveBeenCalledWith de saveCounted falla al cruzar un milisegundo).
		createdAt: '2026-11-08T00:00:00.000Z'
	};
}

function interpretation(): VoiceInterpretation {
	return {
		transcript: 'brocha de media pulgada tres piezas',
		normalized: 'brocha de media pulgada tres piezas',
		description: 'brocha',
		quantity: 3,
		measures: [],
		exact: true,
		candidates: []
	};
}

/** Controlador falso con solo la superficie que usa quick-count. */
function fakeApp(over: Partial<InventoryController> = {}): InventoryController {
	return {
		products: [product()],
		filter: 'all',
		query: '',
		canCount: true,
		countDraft: undefined,
		unmatchedError: '',
		message: 'Brocha practica 013mm 1/2 exito: 3 unidades guardadas.',
		saveCount: vi.fn(async () => {}),
		saveUnmatched: vi.fn(async () => {}),
		...over
	} as unknown as InventoryController;
}

/** Catálogo de brochas de Eduardo: la 1/2 y la 2 pendientes, la 1 ya contada. */
function brochas(): Product[] {
	const base = (over: Partial<Product>): Product => ({
		id: 'P-x',
		name: 'Brocha',
		key: 'K-x',
		expected: 5,
		physical: 0,
		createdAt: new Date().toISOString(),
		...over
	});
	return [
		base({
			id: 'P-12',
			name: 'Brocha practica 013mm 1/2 exito',
			key: '19AH963021',
			alternateKey: '7500112842428'
		}),
		base({
			id: 'P-1',
			name: 'Brocha practica 025mm 1 exito',
			key: '19AH963022',
			alternateKey: '7500112842435',
			countedAt: new Date().toISOString(),
			physical: 5
		}),
		base({
			id: 'P-2',
			name: 'Brocha practica 050mm 2 exito',
			key: '19AH963024',
			alternateKey: '7500112842459'
		})
	];
}

describe('addHistory', () => {
	it('pone el registro nuevo arriba y conserva el orden', () => {
		const items: HistoryItem[] = [{ label: 'viejo', kind: 'count' }];
		const next = addHistory(items, { label: 'nuevo', kind: 'unmatched' });
		expect(next.map((item) => item.label)).toEqual(['nuevo', 'viejo']);
		expect(items).toHaveLength(1);
	});
});

describe('voiceUnmatchedDraft', () => {
	it('usa la descripción y guarda la frase dictada en notas', () => {
		const draft = voiceUnmatchedDraft(interpretation(), 3, 'Pasillo 3');
		expect(draft.description).toBe('brocha');
		expect(draft.quantity).toBe(3);
		expect(draft.location).toBe('Pasillo 3');
		expect(draft.notes).toContain('brocha de media pulgada tres piezas');
		expect(draft.reviewStatus).toBe('pending');
		expect(draft.alternateKey).toBe('');
	});

	it('si no hay descripción, usa la transcripción', () => {
		const found = interpretation();
		found.description = '';
		expect(voiceUnmatchedDraft(found, 1, '').description).toBe(
			'brocha de media pulgada tres piezas'
		);
	});
});

describe('barcodeUnmatchedDraft', () => {
	it('guarda el código en la clave alterna para identificarlo después', () => {
		const draft = barcodeUnmatchedDraft('7502293080002', 2, '');
		expect(draft.description).toContain('7502293080002');
		expect(draft.alternateKey).toBe('7502293080002');
		expect(draft.quantity).toBe(2);
		expect(draft.reviewStatus).toBe('pending');
	});
});

describe('saveCounted', () => {
	it('pone la cantidad en countDraft y llama a saveCount', async () => {
		const app = fakeApp();
		const result = await saveCounted(app, product(), 3);
		expect(app.countDraft).toBe(3);
		expect(app.saveCount).toHaveBeenCalledWith(product());
		expect(result.ok).toBe(true);
		expect(result.note).toContain('3 unidades guardadas');
	});

	it('no guarda si la sesión no permite contar', async () => {
		const app = fakeApp({ canCount: false });
		const result = await saveCounted(app, product(), 3);
		expect(result.ok).toBe(false);
		expect(result.error).toContain('reanuda la sesión');
		expect(app.saveCount).not.toHaveBeenCalled();
	});

	it('devuelve el error del controlador si saveCount falla', async () => {
		const app = fakeApp({ unmatchedError: 'No se guardó el cambio.' });
		const result = await saveCounted(app, product(), 3);
		expect(result.ok).toBe(false);
		expect(result.error).toBe('No se guardó el cambio.');
	});
});

describe('saveUnmatchedItem', () => {
	it('llama a saveUnmatched con el borrador y no guarda si no se puede contar', async () => {
		const app = fakeApp();
		const draft = barcodeUnmatchedDraft('123', 1, '');
		const result = await saveUnmatchedItem(app, draft);
		expect(app.saveUnmatched).toHaveBeenCalledWith(draft);
		expect(result.ok).toBe(true);

		const blocked = fakeApp({ canCount: false });
		const blockedResult = await saveUnmatchedItem(blocked, draft);
		expect(blockedResult.ok).toBe(false);
		expect(blocked.saveUnmatched).not.toHaveBeenCalled();
	});
});

describe('scopedProducts y el filtro', () => {
	it('con Pendientes solo devuelve los pendientes', () => {
		const app = fakeApp({ products: brochas(), filter: 'pending' });
		expect(scopedProducts(app).map((p) => p.id)).toEqual(['P-12', 'P-2']);
	});

	it('con Contados solo devuelve los contados', () => {
		const app = fakeApp({ products: brochas(), filter: 'counted' });
		expect(scopedProducts(app).map((p) => p.id)).toEqual(['P-1']);
	});

	it('con Todos devuelve todo el catálogo', () => {
		const app = fakeApp({ products: brochas(), filter: 'all' });
		expect(scopedProducts(app)).toHaveLength(3);
	});

	it('filterLabel usa las etiquetas del filtro', () => {
		expect(filterLabel(fakeApp({ filter: 'pending' }))).toBe('Pendientes');
		expect(filterLabel(fakeApp({ filter: 'counted' }))).toBe('Contados');
		expect(filterLabel(fakeApp({ filter: 'difference' }))).toBe('Diferencias');
		expect(filterLabel(fakeApp({ filter: 'exact' }))).toBe('Sin diferencias');
		expect(filterLabel(fakeApp({ filter: 'all' }))).toBe('Todos');
	});

	it('showAll quita el filtro y el texto de búsqueda', () => {
		const app = fakeApp({ filter: 'pending', query: 'brocha' });
		showAll(app);
		expect(app.filter).toBe('all');
		expect(app.query).toBe('');
	});
});

describe('interpretScoped (dictado con filtro)', () => {
	it('con Pendientes, brocha de media pulgada es la 1/2 pendiente', () => {
		const app = fakeApp({ products: brochas(), filter: 'pending' });
		const { interpretation, filterExcludedProduct } = interpretScoped(
			app,
			'brocha de media pulgada tres piezas'
		);
		expect(interpretation.exact).toBe(true);
		expect(interpretation.product?.id).toBe('P-12');
		expect(interpretation.quantity).toBe(3);
		expect(filterExcludedProduct).toBeNull();
	});

	it('con Contados, la 1/2 pendiente no se preselecciona: queda fuera del filtro', () => {
		const app = fakeApp({ products: brochas(), filter: 'counted' });
		const { interpretation, filterExcludedProduct } = interpretScoped(
			app,
			'brocha de media pulgada tres piezas'
		);
		expect(interpretation.exact).toBe(false);
		expect(interpretation.product).toBeUndefined();
		expect(filterExcludedProduct?.id).toBe('P-12');
	});

	it('con Todos no hay producto fuera del filtro', () => {
		const app = fakeApp({ products: brochas(), filter: 'all' });
		const { interpretation, filterExcludedProduct } = interpretScoped(
			app,
			'brocha de media pulgada tres piezas'
		);
		expect(interpretation.exact).toBe(true);
		expect(filterExcludedProduct).toBeNull();
	});
});

describe('lookupBarcodeScoped (escaneo con filtro)', () => {
	it('con Pendientes encuentra el código de un pendiente', () => {
		const app = fakeApp({ products: brochas(), filter: 'pending' });
		const result = lookupBarcodeScoped(app, '7500112842428');
		expect(result.product?.id).toBe('P-12');
		expect(result.filterExcludedProduct).toBeNull();
	});

	it('con Pendientes, el código de un contado queda fuera del filtro', () => {
		const app = fakeApp({ products: brochas(), filter: 'pending' });
		const result = lookupBarcodeScoped(app, '7500112842435');
		expect(result.product).toBeNull();
		expect(result.filterExcludedProduct?.id).toBe('P-1');
	});

	it('con Todos no hay producto fuera del filtro', () => {
		const app = fakeApp({ products: brochas(), filter: 'all' });
		const result = lookupBarcodeScoped(app, '7500112842435');
		expect(result.product?.id).toBe('P-1');
		expect(result.filterExcludedProduct).toBeNull();
	});

	it('un código desconocido no es fuera del filtro', () => {
		const app = fakeApp({ products: brochas(), filter: 'pending' });
		const result = lookupBarcodeScoped(app, '7500000000000');
		expect(result.product).toBeNull();
		expect(result.filterExcludedProduct).toBeNull();
	});
});
