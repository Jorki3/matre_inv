import * as XLSX from 'xlsx';
import { createId, normalizeText, type Product } from './inventory';

export type ColumnMapping = Record<'key' | 'alternateKey' | 'name' | 'expected', string>;
export type CatalogRow = unknown[];
export const importFields = [
	{ id: 'key', label: 'Clave (obligatoria)' },
	{ id: 'alternateKey', label: 'Clave alterna (opcional)' },
	{ id: 'name', label: 'Descripción (obligatoria)' },
	{ id: 'expected', label: 'Existencia SICAR (obligatoria)' }
] as const;

const normalizeHeader = (value: unknown) =>
	normalizeText(String(value ?? '')).replace(/[^a-z0-9]/g, '');
// Generic aliases, not a validated official SICAR template.
const aliases = {
	key: ['clave', 'claveinterna', 'sku', 'internalkey'],
	alternateKey: ['clavealterna', 'codigoalterno', 'codigobarras', 'barcode', 'ean', 'ean13'],
	name: ['descripcion', 'descripcionproducto', 'producto', 'nombre', 'productname'],
	expected: ['existencia', 'existenciasicar', 'stock', 'quantity']
};

export function readCatalogFile(data: ArrayBuffer, filename: string) {
	const workbook = XLSX.read(data, {
		type: 'array',
		...(/\.csv$/i.test(filename) ? { codepage: 65001, raw: true } : {})
	});
	return readCatalogSheet(workbook.Sheets[workbook.SheetNames[0]]);
}

export function readCatalogSheet(sheet: XLSX.WorkSheet): { headers: string[]; rows: CatalogRow[] } {
	const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
		header: 1,
		defval: '',
		raw: false,
		blankrows: true
	});
	const origin = XLSX.utils.decode_range(sheet['!ref'] || 'A1').s;
	return {
		headers: (matrix[0] ?? []).map(String),
		rows: matrix.slice(1).map((row, index) =>
			row.map((text, column) => {
				const raw =
					sheet[XLSX.utils.encode_cell({ r: origin.r + index + 1, c: origin.c + column })]?.v;
				return typeof raw === 'number' ? { raw, text } : text;
			})
		)
	};
}

export function detectColumns(headers: unknown[]): ColumnMapping {
	return Object.fromEntries(
		Object.entries(aliases).map(([field, options]) => {
			const matches = headers
				.map((value, index) => (options.includes(normalizeHeader(value)) ? index : -1))
				.filter((index) => index >= 0);
			return [field, matches.length === 1 ? String(matches[0]) : ''];
		})
	) as ColumnMapping;
}

export function previewCatalog(rows: CatalogRow[], mapping: ColumnMapping, existing: Product[]) {
	const products: Product[] = [];
	const errors: { row: number; message: string }[] = [];
	const duplicates: { row: number; key: string }[] = [];
	const seen = new Set(existing.map((product) => normalizeText(product.key)));
	const required = [mapping.key, mapping.name, mapping.expected];
	const assigned = Object.values(mapping).filter((column) => column !== '');
	const mappingValid =
		required.every((column) => /^\d+$/.test(column)) && new Set(assigned).size === assigned.length;
	if (!mappingValid) return { products, errors, duplicates, mappingValid, total: rows.length };
	rows.forEach((row, index) => {
		if (row.every((cell) => cell === '' || cell === null || cell === undefined)) return;
		const cell = (column: string, numeric = false): unknown => {
			const value = column === '' ? '' : row[Number(column)];
			if (value && typeof value === 'object' && 'raw' in value && 'text' in value)
				return numeric ? value.raw : value.text;
			return value;
		};
		const key = String(cell(mapping.key) ?? '').trim();
		const name = String(cell(mapping.name) ?? '').trim();
		const stock = cell(mapping.expected, true);
		const expected =
			typeof stock === 'number'
				? stock
				: typeof stock === 'string' && stock.trim() !== ''
					? Number(stock.trim())
					: NaN;
		if (!key || !name || !Number.isFinite(expected)) {
			errors.push({
				row: index + 2,
				message: 'Falta clave, descripción o existencia numérica válida.'
			});
			return;
		}
		if (seen.has(normalizeText(key))) {
			duplicates.push({ row: index + 2, key });
			return;
		}
		seen.add(normalizeText(key));
		products.push({
			id: createId('product'),
			key,
			alternateKey: String(cell(mapping.alternateKey) ?? '').trim(),
			name,
			expected,
			physical: 0,
			createdAt: new Date().toISOString(),
			source: 'importado'
		});
	});
	return { products, errors, duplicates, mappingValid, total: rows.length };
}

export function mergeCatalog(
	existing: Product[],
	imported: Product[],
	mode: 'append' | 'replace',
	confirmed = false
): Product[] {
	if (mode === 'replace' && existing.length && !confirmed)
		throw new Error('Confirma el reemplazo antes de importar.');
	const result = mode === 'append' ? [...existing] : [];
	const seen = new Set(result.map((product) => normalizeText(product.key)));
	for (const product of imported) {
		if (seen.has(normalizeText(product.key))) continue;
		seen.add(normalizeText(product.key));
		result.push(product);
	}
	return result;
}
