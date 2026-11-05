import * as XLSX from 'xlsx';
import { createId, getProductStatus, normalizeText, type Product } from './inventory';

export type ColumnMapping = Record<'key' | 'alternateKey' | 'name' | 'expected', string> &
	Partial<Record<'category' | 'unit', string>>;
export type CatalogImportMode = 'append' | 'update' | 'replace';
export type CatalogRow = unknown[];
export const importFields = [
	{ id: 'key', label: 'Clave (obligatoria)' },
	{ id: 'alternateKey', label: 'Clave alterna (opcional)' },
	{ id: 'name', label: 'Descripción (obligatoria)' },
	{ id: 'expected', label: 'Existencia actual / SICAR (obligatoria)' },
	{ id: 'category', label: 'Categoría / Departamento (opcional)' },
	{ id: 'unit', label: 'Unidad de medida (opcional)' }
] as const;

const normalizeHeader = (value: unknown) =>
	normalizeText(String(value ?? '')).replace(/[^a-z0-9]/g, '');
// Generic aliases, not a validated official SICAR template.
const aliases = {
	key: ['clave', 'claveprincipal', 'claveinterna', 'sku', 'internalkey'],
	alternateKey: ['clavealterna', 'clavealternativa', 'codigoalterno'],
	name: [
		'descripcion',
		'descripcionproducto',
		'producto',
		'nombre',
		'productname',
		'productodescripcion'
	],
	expected: [
		'existenciaactual',
		'existenciasactuales',
		'existenciaactualsicar',
		'existencia',
		'existenciasicar',
		'stock',
		'quantity'
	],
	category: ['categoria', 'departamento', 'categoriadepartamento'],
	unit: ['unidaddemedida', 'unidadmedida', 'unidad', 'umedida']
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

export function previewCatalog(
	rows: CatalogRow[],
	mapping: ColumnMapping,
	existing: Product[],
	mode: CatalogImportMode = 'append'
) {
	const products: Product[] = [];
	const errors: { row: number; message: string }[] = [];
	const duplicates: { row: number; key: string }[] = [];
	const existingKeys = new Set(existing.map((product) => normalizeText(product.key)));
	const seen = new Set<string>();
	let updates = 0;
	const required = [mapping.key, mapping.name, mapping.expected];
	const assigned = Object.values(mapping).filter((column) => column !== '' && column !== undefined);
	const mappingValid =
		required.every((column) => /^\d+$/.test(column)) && new Set(assigned).size === assigned.length;
	if (!mappingValid)
		return {
			products,
			errors,
			duplicates,
			mappingValid,
			total: rows.length,
			updates,
			additions: products.length - updates
		};
	rows.forEach((row, index) => {
		if (row.every((cell) => cell === '' || cell === null || cell === undefined)) return;
		const cell = (column: string | undefined, numeric = false): unknown => {
			const value = column === '' || column === undefined ? '' : row[Number(column)];
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
		if (
			seen.has(normalizeText(key)) ||
			(mode === 'append' && existingKeys.has(normalizeText(key)))
		) {
			duplicates.push({ row: index + 2, key });
			return;
		}
		seen.add(normalizeText(key));
		if (mode === 'update' && existingKeys.has(normalizeText(key))) updates++;
		products.push({
			id: createId('product'),
			key,
			...(mapping.alternateKey
				? { alternateKey: String(cell(mapping.alternateKey) ?? '').trim() }
				: {}),
			...(mapping.category ? { category: String(cell(mapping.category) ?? '').trim() } : {}),
			...(mapping.unit ? { unit: String(cell(mapping.unit) ?? '').trim() } : {}),
			name,
			expected,
			physical: 0,
			createdAt: new Date().toISOString(),
			source: 'importado'
		});
	});
	return {
		products,
		errors,
		duplicates,
		mappingValid,
		total: rows.length,
		updates,
		additions: products.length - updates
	};
}

export function mergeCatalog(
	existing: Product[],
	imported: Product[],
	mode: CatalogImportMode,
	confirmed = false
): Product[] {
	if (mode === 'replace' && existing.length && !confirmed)
		throw new Error('Confirma el reemplazo antes de importar.');
	const result = mode === 'replace' ? [] : [...existing];
	const positions = new Map(result.map((product, index) => [normalizeText(product.key), index]));
	const seen = new Set<string>();
	for (const product of imported) {
		const key = normalizeText(product.key);
		if (seen.has(key)) continue;
		seen.add(key);
		const position = positions.get(key);
		if (position !== undefined) {
			if (mode === 'update') {
				const current = result[position];
				const updated = {
					...current,
					name: product.name,
					expected: product.expected,
					...(product.alternateKey !== undefined ? { alternateKey: product.alternateKey } : {}),
					...(product.category !== undefined ? { category: product.category } : {}),
					...(product.unit !== undefined ? { unit: product.unit } : {})
				};
				result[position] = { ...updated, status: getProductStatus(updated) };
			}
			continue;
		}
		positions.set(key, result.length);
		result.push(product);
	}
	return result;
}
