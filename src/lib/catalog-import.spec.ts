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

describe('catalog fields and safe updates', () => {
	it('recognizes equivalent catalog field labels and keeps alternate keys distinct from barcodes', () => {
		const columns = detectColumns([
			' CLÁVE ',
			' Clave   alterna ',
			'Producto / Descripción',
			'EXISTENCIA ACTUAL',
			'Departamento',
			'Unidad de medida'
		]);
		expect(columns).toEqual({
			key: '0',
			alternateKey: '1',
			name: '2',
			expected: '3',
			category: '4',
			unit: '5'
		});
		const preview = previewCatalog(
			[['000001', 'ALT-01', 'Martillo', 0, 'Herramientas', 'Pieza']],
			columns,
			[]
		);
		expect(preview.products).toHaveLength(1);
		expect(preview.products[0]).toMatchObject({
			key: '000001',
			alternateKey: 'ALT-01',
			name: 'Martillo',
			expected: 0,
			category: 'Herramientas',
			unit: 'Pieza'
		});
		expect(preview.products[0]).not.toHaveProperty('barcode');
		expect(
			detectColumns(['Clave', 'Código de barras', 'Descripción', 'Existencia actual']).alternateKey
		).toBe('');
	});

	it('preserves registered zero, dates, identity, notes and commercial data while updating the catalog', () => {
		const existing = previewCatalog(
			[
				['0001', 'OLD', 'Anterior', 20],
				['0002', 'OTHER', 'No incluido', 8]
			],
			mapping,
			[]
		).products;
		existing[0] = {
			...existing[0],
			physical: 0,
			countedAt: '2026-11-04T12:00:00Z',
			notes: 'Conservar'
		};
		const original = { ...existing[0], price: 99 };
		existing[0] = original;
		const file = previewCatalog(
			[
				['0001', 'NEW', 'Nueva descripción', 0],
				['0003', 'ALT-3', 'Nuevo', 4]
			],
			mapping,
			existing,
			'update'
		);
		expect(file).toMatchObject({ updates: 1, additions: 1 });
		const result = mergeCatalog(existing, file.products, 'update');
		expect(result).toHaveLength(3);
		expect(result[0]).toMatchObject({
			id: original.id,
			key: '0001',
			alternateKey: 'NEW',
			name: 'Nueva descripción',
			expected: 0,
			physical: 0,
			countedAt: original.countedAt,
			notes: 'Conservar',
			price: 99,
			status: 'counted'
		});
		expect(result[1]).toEqual(existing[1]);
		expect(original.name).toBe('Anterior');
		expect(result[2].countedAt).toBeUndefined();
	});

	it('keeps unmapped optional fields and distinguishes matches, file duplicates and invalid stock', () => {
		const old = previewCatalog([['A', 'OLD', 'Uno', 10]], mapping, []).products.map((product) => ({
			...product,
			category: 'Ferretería',
			unit: 'Pieza'
		}));
		const manual = { key: '0', alternateKey: '', name: '1', expected: '2' };
		const file = previewCatalog(
			[
				['A', 'Actualizado', 11],
				['A', 'Duplicado', 12],
				['B', 'Nuevo', 2],
				['C', 'Vacío', ''],
				['D', 'Inválido', 'no']
			],
			manual,
			old,
			'update'
		);
		expect(file).toMatchObject({ updates: 1, additions: 1 });
		expect(file.duplicates).toHaveLength(1);
		expect(file.errors).toHaveLength(2);
		const updated = mergeCatalog(old, file.products, 'update');
		expect(updated[0]).toMatchObject({
			alternateKey: 'OLD',
			category: 'Ferretería',
			unit: 'Pieza',
			expected: 11
		});
	});

	it('updates more than 2300 products without losing any registered counts or creating alternate products', () => {
		const rows = Array.from({ length: 2401 }, (_, index) => [
			String(index).padStart(6, '0'),
			`ALT-${index}`,
			`Producto ${index}`,
			20
		]);
		const existing = previewCatalog(rows, mapping, []).products.map((product, index) =>
			index < 500
				? { ...product, physical: index % 10, countedAt: '2026-11-04T12:00:00Z' }
				: product
		);
		const preview = previewCatalog(
			rows.map((row) => [row[0], row[1], `${row[2]} actualizado`, 30]),
			mapping,
			existing,
			'update'
		);
		const merged = mergeCatalog(existing, preview.products, 'update');
		expect(preview.updates).toBe(2401);
		expect(preview.additions).toBe(0);
		expect(merged).toHaveLength(2401);
		expect(merged.filter((product) => product.countedAt)).toHaveLength(500);
		for (let index = 0; index < 500; index++)
			expect(merged[index]).toMatchObject({
				id: existing[index].id,
				physical: existing[index].physical,
				countedAt: existing[index].countedAt,
				expected: 30
			});
	});
});
