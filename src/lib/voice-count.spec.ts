import { describe, expect, it } from 'vitest';
import { parseVoiceCount, parseNumberWords } from './voice-count';
import type { Product } from './inventory';

function product(over: Partial<Product>): Product {
	return {
		id: over.id ?? 'P-1',
		name: over.name ?? 'Producto',
		key: over.key ?? 'KEY-1',
		expected: 0,
		physical: 0,
		createdAt: new Date().toISOString(),
		...over
	};
}

const catalog: Product[] = [
	product({ id: 'P-1', name: 'Rondana plana 5/16"', key: 'RON-0516', alternateKey: 'TORNILLERIA' }),
	product({ id: 'P-2', name: 'Tornillo hexagonal 5/16" x 2"', key: 'TOR-0516' }),
	product({ id: 'P-3', name: 'Tuerca hexagonal M8', key: 'NUT-066' }),
	product({ id: 'P-4', name: 'Clavo 2"', key: 'CLA-002' }),
	product({ id: 'P-5', name: 'Bisagra 3"', key: 'BIS-003' }),
	product({ id: 'P-6', name: 'Foco 9W', key: 'FOC-009' })
];

describe('números en palabras', () => {
	it('ciento veinte es 120', () => {
		expect(parseNumberWords(['ciento', 'veinte'], 0).value).toBe(120);
	});
	it('cincuenta y nueve es 59', () => {
		expect(parseNumberWords(['cincuenta', 'y', 'nueve'], 0).value).toBe(59);
	});
	it('doscientos cincuenta es 250', () => {
		expect(parseNumberWords(['doscientos', 'cincuenta'], 0).value).toBe(250);
	});
});

describe('parseVoiceCount', () => {
	it('"rondana plana de 5 16, 100 piezas" -> Rondana 5/16", 100 piezas', () => {
		const result = parseVoiceCount('rondana plana de 5 16, 100 piezas', catalog);
		expect(result.quantity).toBe(100);
		expect(result.fraction).toEqual({ numerator: 5, denominator: 16, text: '5/16' });
		expect(result.product?.key).toBe('RON-0516');
		expect(result.exact).toBe(true);
	});

	it('"randana plana de 516, 100 piezas" -> 100, no 616', () => {
		const result = parseVoiceCount('randana plana de 516, 100 piezas', catalog);
		expect(result.quantity).toBe(100);
		expect(result.fraction?.text).toBe('5/16');
		expect(result.product?.key).toBe('RON-0516');
		expect(result.exact).toBe(true);
	});

	it('"rondana plana de 5 dieciseisabos 100 piezas" -> 100, 5/16', () => {
		const result = parseVoiceCount('rondana plana de 5 dieciseisabos 100 piezas', catalog);
		expect(result.quantity).toBe(100);
		expect(result.fraction?.text).toBe('5/16');
		expect(result.exact).toBe(true);
	});

	it('"100 piezas de rondana plana de 5 16" -> cantidad primero, 100', () => {
		const result = parseVoiceCount('100 piezas de rondana plana de 5 16', catalog);
		expect(result.quantity).toBe(100);
		expect(result.fraction?.text).toBe('5/16');
		expect(result.exact).toBe(true);
	});

	it('"foco de 59 watts, 5" con solo Foco 9W -> no exacto, conflicto 59', () => {
		const result = parseVoiceCount('foco de 59 watts, 5', catalog);
		expect(result.quantity).toBe(5);
		expect(result.exact).toBe(false);
		expect(result.product).toBeUndefined();
		expect(result.conflict).toBe(59);
		expect(
			result.candidates.some((candidate) => candidate.product.key === 'FOC-009' && !candidate.exact)
		).toBe(true);
	});

	it('"foco de cincuenta y nueve watts, cinco piezas" -> conflicto 59', () => {
		const result = parseVoiceCount('foco de cincuenta y nueve watts, cinco piezas', catalog);
		expect(result.quantity).toBe(5);
		expect(result.conflict).toBe(59);
		expect(result.exact).toBe(false);
	});

	it('"clavo, 116 piezas" -> 116, sin partir en fracción', () => {
		const result = parseVoiceCount('clavo, 116 piezas', catalog);
		expect(result.quantity).toBe(116);
		expect(result.fraction).toBeUndefined();
		expect(result.product?.key).toBe('CLA-002');
		expect(result.exact).toBe(true);
	});

	it.each([
		['tornillo 120', 120, 'TOR-0516'],
		['clavo 250', 250, 'CLA-002'],
		['tuerca 80', 80, 'NUT-066'],
		['bisagra 24', 24, 'BIS-003'],
		['foco 60', 60, 'FOC-009']
	])('"%s" -> cantidad %s', (transcript, quantity, key) => {
		const result = parseVoiceCount(transcript, catalog);
		expect(result.quantity).toBe(quantity);
		expect(result.product?.key).toBe(key);
	});

	it('"Dado 12 puntas 1/2 5/16 corto, 1" -> no exacto, cantidad 1', () => {
		const result = parseVoiceCount('Dado 12 puntas 1/2 5/16 corto, 1', catalog);
		expect(result.quantity).toBe(1);
		expect(result.exact).toBe(false);
		expect(result.product).toBeUndefined();
		expect(result.measures.filter((measure) => measure.kind === 'fraction')).toHaveLength(2);
	});

	it('"ciento veinte piezas de tornillo" -> 120', () => {
		expect(parseVoiceCount('ciento veinte piezas de tornillo', catalog).quantity).toBe(120);
	});

	it('transcripción vacía -> sin cantidad y sin exacto', () => {
		const result = parseVoiceCount('', catalog);
		expect(result.quantity).toBeUndefined();
		expect(result.exact).toBe(false);
	});
});

import { searchProducts } from './inventory';

const brochas: Product[] = [
	product({ id: 'B-125', name: 'Brocha practica 125mm 5 exito', key: '19AH963028', alternateKey: '7500112842497' }),
	product({ id: 'B-075', name: 'Brocha practica 075mm 3 exito', key: '19AH963026', alternateKey: '7500112842473' }),
	product({ id: 'B-110', name: 'Brocha practica 110mm 4 exito', key: '19AH963027', alternateKey: '7500112842480' }),
	product({ id: 'B-013', name: 'Brocha practica 013mm 1/2 exito', key: '19AH963021', alternateKey: '7500112842428' }),
	product({ id: 'B-025', name: 'Brocha practica 025mm 1 exito', key: '19AH963022', alternateKey: '7500112842435' }),
	product({ id: 'B-038', name: 'Brocha practica 038mm 11/2 exito', key: '19AH963023', alternateKey: '7500112842442' }),
	product({ id: 'B-050', name: 'Brocha practica 050mm 2 exito', key: '19AH963024', alternateKey: '7500112842459' }),
	product({ id: 'B-064', name: 'Brocha practica 064mm 21/2 exito', key: '19AH963025', alternateKey: '7500112842466' }),
	product({ id: 'B-160', name: 'Brocha practica 160mm 6 exito', key: '19AH963029', alternateKey: '7500112842503' }),
	product({ id: 'L-1', name: 'Lubricante en aerosol 110ml Zoms', key: 'A-AZ110', alternateKey: '7502293080002' })
];

describe('brochas: media pulgada es 1/2 y el Lubricante no aparece', () => {
	it('"brocha de media pulgada tres piezas" -> Brocha 013mm 1/2, 3, sin Lubricante', () => {
		const result = parseVoiceCount('brocha de media pulgada tres piezas', brochas);
		expect(result.quantity).toBe(3);
		expect(result.fraction).toEqual({ numerator: 1, denominator: 2, text: '1/2' });
		expect(result.product?.key).toBe('19AH963021');
		expect(result.exact).toBe(true);
		expect(result.candidates.every((c) => c.product.key !== 'A-AZ110')).toBe(true);
		expect(
			result.candidates.some((c) => !c.exact && c.product.name.startsWith('Brocha'))
		).toBe(true);
	});

	it('"brocha 1 1/2, 2 piezas" escrita por separado -> Brocha 038mm 11/2 exact', () => {
		const result = parseVoiceCount('brocha 1 1/2, 2 piezas', brochas);
		expect(result.quantity).toBe(2);
		expect(result.fraction?.text).toBe('1 1/2');
		expect(result.product?.key).toBe('19AH963023');
		expect(result.exact).toBe(true);
	});

	it('"brocha de 2 pulgadas, 5" -> Brocha 050mm 2 exact', () => {
		const result = parseVoiceCount('brocha de 2 pulgadas, 5', brochas);
		expect(result.quantity).toBe(5);
		expect(result.product?.key).toBe('19AH963024');
		expect(result.exact).toBe(true);
	});

	it('"brocha de 1 pulgada y media, 2" -> Brocha 038mm 11/2 exact', () => {
		const result = parseVoiceCount('brocha de 1 pulgada y media, 2', brochas);
		expect(result.quantity).toBe(2);
		expect(result.fraction?.text).toBe('1 1/2');
		expect(result.product?.key).toBe('19AH963023');
		expect(result.exact).toBe(true);
	});

	it('"brocha de 2 y media, 1" -> Brocha 064mm 21/2 exact', () => {
		const result = parseVoiceCount('brocha de 2 y media, 1', brochas);
		expect(result.quantity).toBe(1);
		expect(result.fraction?.text).toBe('2 1/2');
		expect(result.product?.key).toBe('19AH963025');
		expect(result.exact).toBe(true);
	});

	it('"brocha, 4" sin medida -> no exacto, solo brochas como parecidos', () => {
		const result = parseVoiceCount('brocha, 4', brochas);
		expect(result.quantity).toBe(4);
		expect(result.exact).toBe(false);
		expect(result.product).toBeUndefined();
		expect(result.candidates.length).toBeGreaterThan(0);
		expect(result.candidates.every((c) => c.product.name.startsWith('Brocha'))).toBe(true);
		expect(result.candidates.every((c) => !c.exact)).toBe(true);
	});
});

describe('searchProducts por tokens (buscador tal cual)', () => {
	it('"brocha de media pulgada" -> solo la 013mm 1/2', () => {
		const found = searchProducts(brochas, 'brocha de media pulgada');
		expect(found.map((p) => p.key)).toEqual(['19AH963021']);
	});

	it('"brocha 1/2" -> solo la 013mm 1/2, no la 11/2 ni la 21/2', () => {
		const found = searchProducts(brochas, 'brocha 1/2');
		expect(found.map((p) => p.key)).toEqual(['19AH963021']);
	});

	it('"brocha 1 1/2" -> solo la 038mm 11/2', () => {
		const found = searchProducts(brochas, 'brocha 1 1/2');
		expect(found.map((p) => p.key)).toEqual(['19AH963023']);
	});

	it('"brocha 2" -> solo la 050mm 2, no el Lubricante 110ml', () => {
		const found = searchProducts(brochas, 'brocha 2');
		expect(found.map((p) => p.key)).toEqual(['19AH963024']);
	});

	it('"brocha" -> las 9 brochas, sin Lubricante', () => {
		const found = searchProducts(brochas, 'brocha');
		expect(found).toHaveLength(9);
		expect(found.every((p) => p.key !== 'A-AZ110')).toBe(true);
	});

	it('buscar por clave "19AH963021" sigue funcionando', () => {
		const found = searchProducts(brochas, '19AH963021');
		expect(found.map((p) => p.key)).toEqual(['19AH963021']);
	});

	it('"lubricante" -> solo el Lubricante', () => {
		const found = searchProducts(brochas, 'lubricante');
		expect(found.map((p) => p.key)).toEqual(['A-AZ110']);
	});
});

describe('rodillo sin cantidad no casa con la pila', () => {
	const pila = product({
		id: 'PIL-1',
		name: 'Pila alcalina D blister c/2 pz al-d voltech',
		key: '46318',
		alternateKey: '7501206657652'
	});
	const rodillo = product({
		id: 'ROD-1',
		name: 'Rodillo para pintar',
		key: 'ROD-001'
	});
	const sinRodillo = [pila, ...brochas.slice(0, 3)];
	const conRodillo = [pila, rodillo, ...brochas.slice(0, 3)];

	it('"rodillo" solo, sin cantidad -> no exacto, la pila ni aparece', () => {
		const result = parseVoiceCount('rodillo', sinRodillo);
		// Sin cantidad Confirmar queda deshabilitado en VoiceCount
		// (quantityDraft es undefined): no se puede guardar nada.
		expect(result.quantity).toBeUndefined();
		expect(result.exact).toBe(false);
		expect(result.product).toBeUndefined();
		expect(result.candidates).toHaveLength(0);
		expect(result.candidates.some((c) => c.product.key === '46318')).toBe(false);
	});

	it('"rodillo" con un rodillo real en catálogo sí lo encuentra exacto', () => {
		const result = parseVoiceCount('rodillo', conRodillo);
		expect(result.quantity).toBeUndefined();
		expect(result.exact).toBe(true);
		expect(result.product?.key).toBe('ROD-001');
		expect(result.candidates.some((c) => c.product.key === '46318')).toBe(false);
	});

	it('"rodillo, 3 piezas" -> cantidad 3, exacto el rodillo, sin pila', () => {
		const result = parseVoiceCount('rodillo, 3 piezas', conRodillo);
		expect(result.quantity).toBe(3);
		expect(result.exact).toBe(true);
		expect(result.product?.key).toBe('ROD-001');
		expect(result.candidates.some((c) => c.product.key === '46318')).toBe(false);
	});

	it('buscar "rodillo" en el buscador tal cual no trae la pila', () => {
		expect(searchProducts(sinRodillo, 'rodillo')).toHaveLength(0);
		expect(searchProducts(conRodillo, 'rodillo').map((p) => p.key)).toEqual(['ROD-001']);
	});
});
