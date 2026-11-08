import { describe, expect, it } from 'vitest';
import {
	BARCODE_FORMATS,
	findProductByBarcode,
	normalizeBarcode,
	productBarcodes
} from './barcode-scan';
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

// Catálogo real de Eduardo (claves y códigos de sus capturas).
const catalog: Product[] = [
	product({
		id: 'P-lub',
		name: 'Lubricante en aerosol 110ml Zoms',
		key: 'A-AZ110',
		alternateKey: '7502293080002'
	}),
	product({
		id: 'P-brocha',
		name: 'Brocha practica 013mm 1/2 exito',
		key: '19AH963021',
		alternateKey: '7500112842428'
	}),
	product({
		id: 'P-pila',
		name: 'Pila alcalina D blister c/2 pz al-d voltech',
		key: '46318',
		alternateKey: '7501206657652'
	}),
	product({
		id: 'P-rodillo',
		name: 'Rodillo de felpa 9"',
		key: 'ROD-009',
		alternateKey: '7501234567890'
	}),
	product({
		id: 'P-taquete',
		name: 'Taquete de 3/8',
		key: 'TAQ-038',
		barcode: '7509876543210'
	}),
	product({
		id: 'P-gen',
		name: 'Tornillo generico sin codigo',
		key: 'TOR-GEN'
	}),
	product({
		id: 'P-upc',
		name: 'Cinta aislante',
		key: 'CIN-001',
		alternateKey: '0750123456789'
	})
];

describe('normalizeBarcode', () => {
	it('quita espacios y guiones', () => {
		expect(normalizeBarcode('75022 9308-0002')).toBe('7502293080002');
	});
	it('vacio o nulo es cadena vacia', () => {
		expect(normalizeBarcode('')).toBe('');
		expect(normalizeBarcode(null)).toBe('');
		expect(normalizeBarcode(undefined)).toBe('');
	});
});

describe('productBarcodes', () => {
	it('prioriza la clave alterna, luego barcode, luego clave', () => {
		expect(productBarcodes(catalog[0])).toEqual(['7502293080002', 'aaz110']);
		expect(productBarcodes(catalog[4])).toEqual(['7509876543210', 'taq038']);
	});
	it('sin codigos solo queda la clave', () => {
		expect(productBarcodes(catalog[5])).toEqual(['torgen']);
	});
});

describe('findProductByBarcode', () => {
	it('encuentra por clave alterna (EAN del empaque)', () => {
		expect(findProductByBarcode(catalog, '7502293080002')?.id).toBe('P-lub');
		expect(findProductByBarcode(catalog, '7500112842428')?.id).toBe('P-brocha');
		expect(findProductByBarcode(catalog, '7501206657652')?.id).toBe('P-pila');
	});
	it('encuentra por barcode heredado', () => {
		expect(findProductByBarcode(catalog, '7509876543210')?.id).toBe('P-taquete');
	});
	it('encuentra por clave SICAR', () => {
		expect(findProductByBarcode(catalog, '19AH963021')?.id).toBe('P-brocha');
		expect(findProductByBarcode(catalog, '46318')?.id).toBe('P-pila');
	});
	it('ignora espacios, guiones y mayusculas al escanear', () => {
		expect(findProductByBarcode(catalog, '75022 9308-0002')?.id).toBe('P-lub');
		expect(findProductByBarcode(catalog, '19ah963021')?.id).toBe('P-brocha');
	});
	it('UPC-A de 12 digitos es el mismo EAN-13 con 0 inicial', () => {
		// EAN-13 0750123456789 == UPC-A 750123456789 (mismo GTIN).
		expect(findProductByBarcode(catalog, '750123456789')?.id).toBe('P-upc');
		expect(findProductByBarcode(catalog, '0750123456789')?.id).toBe('P-upc');
	});
	it('codigo parcial NO coincide: nunca por subcadena', () => {
		expect(findProductByBarcode(catalog, '75022')).toBeNull();
		expect(findProductByBarcode(catalog, '750229308000')).toBeNull();
		expect(findProductByBarcode(catalog, '3080002')).toBeNull();
	});
	it('codigo desconocido devuelve null, no un parecido', () => {
		expect(findProductByBarcode(catalog, '7500000000000')).toBeNull();
		expect(findProductByBarcode(catalog, '')).toBeNull();
	});
	it('el codigo del lubricante NO casa con la brocha ni al reves', () => {
		expect(findProductByBarcode(catalog, '7502293080002')?.id).not.toBe('P-brocha');
		expect(findProductByBarcode(catalog, '7500112842428')?.id).not.toBe('P-lub');
	});
	it('el codigo de la pila NO casa con el rodillo', () => {
		expect(findProductByBarcode(catalog, '7501206657652')?.id).not.toBe('P-rodillo');
		expect(findProductByBarcode(catalog, '7501234567890')?.id).not.toBe('P-pila');
	});
	it('producto sin codigo nunca se encuentra por escanear', () => {
		expect(findProductByBarcode(catalog, 'TOR-GEN')?.id).toBe('P-gen');
		expect(findProductByBarcode(catalog, '7500000000001')).toBeNull();
	});
});

describe('formatos pedidos al detector', () => {
	it('incluye EAN-13, el formato de los empaques de la ferre', () => {
		expect(BARCODE_FORMATS).toContain('ean_13');
		expect(BARCODE_FORMATS).toContain('code_128');
		expect(BARCODE_FORMATS).toContain('qr_code');
	});
});
