import { normalizeText, type Product } from './inventory';

// Export layout for counted products: main key and physical quantity only.
export const COUNTS_EXPORT_LAYOUT = {
	columns: ['Clave', 'Cantidad'] as const,
	sheet: 'Conteo',
	filename: 'MATRE_Conteo.xlsx'
};

export function createCountsExport(products: Product[]): { Clave: string; Cantidad: number }[] {
	const keys = new Set<string>();
	return products
		.filter((product) => Boolean(product.countedAt))
		.map((product) => {
			if (!product.key.trim() || !Number.isFinite(product.physical) || product.physical < 0)
				throw new Error(
					'Hay conteos con clave o cantidad inválida. Revisa el inventario antes de exportar.'
				);
			const key = normalizeText(product.key);
			if (keys.has(key))
				throw new Error(
					'Hay claves principales duplicadas. Revisa el inventario antes de exportar.'
				);
			keys.add(key);
			return { Clave: product.key, Cantidad: product.physical };
		});
}
