import {
	createId,
	getProductStatus,
	type InventorySession,
	type CountOperation
} from './inventory';

/** Internal contract only. No SICAR file layout has been verified yet. */
export interface SicarSale {
	/** Stable identifier for the sale line across overlapping reports. */
	id: string;
	key: string;
	quantity: number;
	/** ISO timestamp with explicit timezone, or YYYY-MM-DD when time is unavailable. */
	occurredAt: string;
}
export interface SalePreview {
	sale: SicarSale;
	productId?: string;
	status: 'eligible' | 'included' | 'duplicate' | 'review';
	reason: string;
	previousQuantity?: number;
	resultingQuantity?: number;
}

const instant = (value: string) =>
	/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value) &&
	Number.isFinite(Date.parse(value));

/** Pure preview: importing never changes inventory. Unordered rows share a running balance. */
export function previewSicarSales(session: InventorySession, sales: SicarSale[]): SalePreview[] {
	const seen = new Set(
		(session.operations ?? []).filter((op) => op.source === 'SICAR').map((op) => op.saleId)
	);
	const balances = new Map(session.products.map((p) => [p.id, p.physical]));
	const counts = new Map<string, number>();
	for (const sale of sales) counts.set(sale.id, (counts.get(sale.id) ?? 0) + 1);
	return sales.map((sale) => {
		const products = session.products.filter((p) => p.key.trim() === sale.key.trim());
		const product = products.length === 1 ? products[0] : undefined;
		const base = { sale, productId: product?.id };
		if (
			!sale.id ||
			!sale.key ||
			!Number.isFinite(sale.quantity) ||
			sale.quantity <= 0 ||
			!product ||
			!product.countedAt
		)
			return {
				...base,
				status: 'review',
				reason: 'Pendiente de revisión: datos inválidos, clave desconocida o sin recuento.'
			};
		if (seen.has(sale.id)) return { ...base, status: 'duplicate', reason: 'Venta ya aplicada.' };
		if (counts.get(sale.id)! > 1)
			return { ...base, status: 'review', reason: 'Identificador repetido en el reporte.' };
		if (
			!instant(sale.occurredAt) ||
			!instant(product.countedAt) ||
			Date.parse(sale.occurredAt) === Date.parse(product.countedAt)
		)
			return {
				...base,
				status: 'review',
				reason: 'Pendiente de revisión: no se puede determinar el orden de venta y recuento.'
			};
		if (Date.parse(sale.occurredAt) < Date.parse(product.countedAt))
			return {
				...base,
				status: 'included',
				reason: 'Venta anterior al recuento físico; no descontar.'
			};
		const previousQuantity = balances.get(product.id)!;
		const resultingQuantity = previousQuantity - sale.quantity;
		if (resultingQuantity < 0)
			return {
				...base,
				previousQuantity,
				resultingQuantity,
				status: 'review',
				reason: 'Pendiente de revisión: el descuento produciría una cantidad negativa.'
			};
		balances.set(product.id, resultingQuantity);
		return {
			...base,
			previousQuantity,
			resultingQuantity,
			status: 'eligible',
			reason: 'Venta posterior al recuento; requiere confirmación.'
		};
	});
}

/** Recompute after confirmation so a new recount or an earlier import cannot be bypassed. */
export function confirmSicarSales(
	session: InventorySession,
	sales: SicarSale[],
	confirmedIds: string[],
	appliedAt = new Date().toISOString()
): InventorySession {
	if (session.status !== 'active') throw new Error('Comienza o reanuda la sesión.');
	if (!instant(appliedAt)) throw new Error('Fecha de aplicación inválida.');
	const confirmed = new Set(confirmedIds);
	const selected = sales.filter((sale) => confirmed.has(sale.id));
	if (confirmed.size !== new Set(selected.map((sale) => sale.id)).size)
		throw new Error('Venta no encontrada.');
	const preview = previewSicarSales(session, selected);
	if (preview.some((row) => row.status !== 'eligible'))
		throw new Error('Revisa la vista previa actual antes de confirmar.');
	const operations: CountOperation[] = preview.map((row) => ({
		id: createId('operation'),
		productId: row.productId!,
		type: 'sale',
		previousQuantity: row.previousQuantity!,
		enteredQuantity: row.sale.quantity,
		resultingQuantity: row.resultingQuantity!,
		occurredAt: appliedAt,
		source: 'SICAR',
		saleId: row.sale.id,
		saleOccurredAt: row.sale.occurredAt
	}));
	return {
		...session,
		products: session.products.map((product) => {
			const last = operations.filter((op) => op.productId === product.id).at(-1);
			if (!last) return product;
			const updated = { ...product, physical: last.resultingQuantity };
			return { ...updated, status: getProductStatus(updated) };
		}),
		operations: [...(session.operations ?? []), ...operations]
	};
}
