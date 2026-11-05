import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { createSicarExport, SICAR_EXPORT_LAYOUT } from './sicar-export';
import { applyPhysicalCount, createSeedCatalog } from './inventory';

describe('provisional SICAR export', () => {
	it('writes only main key and physical quantity, including counted zero and excluding pending products', () => {
		const catalog = createSeedCatalog().slice(0, 3);
		const products = [
			applyPhysicalCount({ ...catalog[0], key: '00001', alternateKey: 'NOT-THE-KEY' }, 0),
			applyPhysicalCount(catalog[1], 5),
			catalog[2]
		];
		const rows = createSicarExport(products);
		expect(rows).toEqual([
			{ Clave: '00001', Cantidad: 0 },
			{ Clave: catalog[1].key, Cantidad: 5 }
		]);
		const book = XLSX.utils.book_new();
		XLSX.utils.book_append_sheet(
			book,
			XLSX.utils.json_to_sheet(rows, { header: [...SICAR_EXPORT_LAYOUT.columns] }),
			SICAR_EXPORT_LAYOUT.sheet
		);
		const read = XLSX.read(XLSX.write(book, { type: 'array', bookType: 'xlsx' }), {
			type: 'array'
		});
		const sheet = read.Sheets[SICAR_EXPORT_LAYOUT.sheet];
		expect(XLSX.utils.sheet_to_json(sheet, { header: 1 })).toEqual([
			['Clave', 'Cantidad'],
			['00001', 0],
			[catalog[1].key, 5]
		]);
		expect(sheet.A2.t).toBe('s');
		expect(sheet.B2.t).toBe('n');
	});

	it('does not turn pending zeros into counts and rejects invalid or duplicate counted keys', () => {
		const product = createSeedCatalog()[0];
		expect(createSicarExport([product])).toEqual([]);
		const counted = applyPhysicalCount(product, 0);
		expect(() => createSicarExport([{ ...counted, physical: NaN }])).toThrow('inválida');
		expect(() => createSicarExport([counted, { ...counted, id: 'duplicate' }])).toThrow(
			'duplicadas'
		);
	});
});
