import { normalizeText, type Product } from './inventory';

/**
 * Escaneo de código de barras por cámara para MATRE Inventario.
 *
 * Puro y local: la cámara la abre el navegador (getUserMedia) y el código
 * lo lee la API nativa BarcodeDetector, sin red ni tokens. Este módulo
 * solo busca el código en el catálogo, con JavaScript en el teléfono.
 * Nada se guarda aquí: el componente `BarcodeScan.svelte` confirma con
 * el usuario y después llama a las funciones que ya existen en el
 * controlador (`saveCount` / `saveUnmatched`), igual que `VoiceCount`.
 *
 * Reglas (probadas en `barcode-scan.spec.ts`):
 * - El código se compara EXACTO contra `alternateKey`, `barcode` y
 *   `key`, en ese orden. Nunca por subcadena: "75022" NO coincide con
 *   "7502293080002", y un código de un producto jamás casa con otro
 *   (la brocha no casa con el lubricante, el rodillo no casa con la pila).
 * - Se ignoran espacios, guiones y mayúsculas: "75022 9308-0002"
 *   es el mismo código que "7502293080002".
 * - UPC-A (12 dígitos) y EAN-13 (13 dígitos con un 0 al inicio) son
 *   el mismo producto: se comparan también sin el 0 inicial.
 * - No todos los productos tienen código: si no se encuentra, NO se
 *   fuerza al más parecido; se ofrece registrarlo como artículo no
 *   encontrado, con el código guardado en la clave alterna.
 */

/** Formatos que se le piden a BarcodeDetector (Chrome en Android). */
export const BARCODE_FORMATS = [
	'ean_13',
	'ean_8',
	'upc_a',
	'upc_e',
	'code_128',
	'code_39',
	'qr_code'
] as const;

export type BarcodeFormat = (typeof BARCODE_FORMATS)[number];

/**
 * Normaliza un código: sin acentos, minúsculas, y solo letras y
 * dígitos (fuera espacios, guiones y puntos).
 */
export function normalizeBarcode(code: string | undefined | null): string {
	return normalizeText(code ?? '').replace(/[^a-z0-9]/g, '');
}

function withoutLeadingZero(code: string): string {
	return code.replace(/^0+/, '');
}

/**
 * Todos los códigos de un producto, normalizados y sin duplicados:
 * primero la clave alterna (casi siempre el EAN impreso en el
 * empaque), luego el barcode heredado y luego la clave principal.
 */
export function productBarcodes(product: Product): string[] {
	const codes: string[] = [];
	for (const raw of [product.alternateKey, product.barcode, product.key]) {
		const normalized = normalizeBarcode(raw);
		if (normalized && !codes.includes(normalized)) codes.push(normalized);
	}
	return codes;
}

function codesMatch(a: string, b: string): boolean {
	if (!a || !b) return false;
	if (a === b) return true;
	// UPC-A (12 dígitos) es el EAN-13 sin el 0 inicial: mismo producto.
	return withoutLeadingZero(a) === withoutLeadingZero(b);
}

/**
 * Busca un producto por su código de barras. Coincidencia exacta o
 * nada: nunca devuelve un producto parecido. Devuelve `null` si el
 * código no está en el catálogo (producto sin código, código nuevo
 * o código mal leído).
 */
export function findProductByBarcode(
	products: Product[],
	code: string | undefined | null
): Product | null {
	const wanted = normalizeBarcode(code);
	if (!wanted) return null;
	for (const product of products) {
		if (productBarcodes(product).some((candidate) => codesMatch(candidate, wanted))) {
			return product;
		}
	}
	return null;
}
