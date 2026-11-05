import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import {
	detectColumns,
	mergeCatalog,
	previewCatalog,
	readCatalogSheet,
	readCatalogFile
} from './catalog-import';

const headers = [' CLÁVE ', 'Clave alterna', ' DESCRIPCIÓN ', 'Existencia SICAR'];
const mapping = detectColumns(headers);

describe('catalog import', () => {
	it('imports more than 2300 products and preserves leading zero keys from xls and xlsx', () => {
		for (const bookType of ['xls', 'xlsx'] as const) {
			const rows = Array.from({ length: 2401 }, (_, index) => [
				String(index).padStart(6, '0'),
				`ALT-${index}`,
				`Artículo ${index}`,
				index
			]);
			const workbook = XLSX.utils.book_new();
			XLSX.utils.book_append_sheet(
				workbook,
				XLSX.utils.aoa_to_sheet([headers, ...rows]),
				'Catálogo'
			);
			const read = XLSX.read(XLSX.write(workbook, { type: 'array', bookType }), { type: 'array' });
			const data = readCatalogSheet(read.Sheets[read.SheetNames[0]]);
			const preview = previewCatalog(data.rows, detectColumns(data.headers), []);
			expect(preview.products).toHaveLength(2401);
			expect(preview.products[0]).toMatchObject({
				key: '000000',
				alternateKey: 'ALT-0',
				expected: 0
			});
		}
	});

	it('detects duplicate main keys in the file and existing catalog without treating alternate keys as products', () => {
		const first = previewCatalog([['A', 'B', 'Uno', 20]], mapping, []).products;
		const preview = previewCatalog(
			[
				['a', '', 'Duplicado', 5],
				['B', 'A', 'Dos', 2],
				['B', '', 'Duplicado 2', 0]
			],
			mapping,
			first
		);
		expect(preview.duplicates).toHaveLength(2);
		expect(preview.products.map((product) => product.key)).toEqual(['B']);
	});

	it('requires explicit columns and does not turn missing or invalid stock and main keys into generated data', () => {
		expect(previewCatalog([['Uno', 0]], detectColumns(['Algo', 'Otra']), []).mappingValid).toBe(
			false
		);
		const result = previewCatalog(
			[
				['', '', 'Sin clave', 2],
				['A', '', 'Vacío', ''],
				['B', '', 'Inválido', '1,2,3'],
				['C', '', 'Cero', 0]
			],
			mapping,
			[]
		);
		expect(result.errors).toHaveLength(3);
		expect(result.products).toHaveLength(1);
		expect(result.products[0].expected).toBe(0);
		expect(previewCatalog([], { ...mapping, name: mapping.key }, []).mappingValid).toBe(false);
	});

	it('supports manual column assignment and requires confirmation before replacing counts', () => {
		const manual = { key: '2', alternateKey: '', name: '0', expected: '1' };
		const first = previewCatalog([['Martillo', 8, 'HER-1']], manual, []).products;
		first[0] = { ...first[0], physical: 0, countedAt: '2026-01-01T00:00:00.000Z' };
		const next = previewCatalog([['Martillo', 9, 'HER-1']], manual, []).products;
		expect(mergeCatalog(first, next, 'append')[0]).toEqual(first[0]);
		expect(() => mergeCatalog(first, next, 'replace')).toThrow('Confirma');
		expect(mergeCatalog(first, next, 'replace', true)[0].countedAt).toBeUndefined();
	});
});

describe('spreadsheet cell formats', () => {
	it('uses raw numeric stock while preserving formatted main and alternate keys', () => {
		const sheet = XLSX.utils.aoa_to_sheet([headers, [123, 456, 'Producto', 2300.5]]);
		sheet.A2.z = '000000';
		sheet.B2.z = '000000';
		sheet.D2.z = '#,##0.00';
		const data = readCatalogSheet(sheet);
		const preview = previewCatalog(data.rows, detectColumns(data.headers), []);
		expect(preview.products[0]).toMatchObject({
			key: '000123',
			alternateKey: '000456',
			expected: 2300.5
		});
	});
});

it('reads UTF-8 CSV headers without a BOM and preserves zero-prefixed keys', () => {
	const bytes = new TextEncoder().encode(
		'Clave,Clave alterna,Descripción,Existencia SICAR\n00001,00002,Martillo,20'
	);
	const parsed = readCatalogFile(bytes.buffer, 'catalogo.csv');
	const preview = previewCatalog(parsed.rows, detectColumns(parsed.headers), []);
	expect(preview.mappingValid).toBe(true);
	expect(preview.products[0]).toMatchObject({ key: '00001', alternateKey: '00002', expected: 20 });
});
