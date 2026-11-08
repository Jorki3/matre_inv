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
