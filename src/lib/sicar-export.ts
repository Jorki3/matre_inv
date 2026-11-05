import { normalizeText, type Product } from './inventory';

// Provisional exchange layout. Adjust here once a real SICAR import template is validated.
export const SICAR_EXPORT_LAYOUT = {
	columns: ['Clave', 'Cantidad'] as const,
	sheet: 'Conteo',
	filename: 'MATRE_Conteo_para_SICAR.xlsx'
};

export function createSicarExport(products: Product[]): { Clave: string; Cantidad: number }[] {
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
