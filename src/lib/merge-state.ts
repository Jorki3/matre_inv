import type { InventorySnapshot, InventorySession, Product } from './inventory';

export interface MergeSource {
	id: string;
	filename: string;
	parentIds: string[];
	/** Flattened archive: parents are kept once in session.mergeSources, never recursively copied. */
	snapshot: InventorySnapshot;
}
export interface MergeConflict {
	id: string;
	productId: string;
	key: string;
	status: 'pending' | 'resolved';
	reason: string;
	createdAt: string;
	sourceIds: string[];
	localProduct: Product;
	resolvedAt?: string;
	resolutionOperationId?: string;
}
export interface MergeReceipt {
	id: string;
	at: string;
	instanceId: string;
	sourceIds: string[];
	adoptedProductIds: string[];
	conflictProductIds: string[];
	duplicateOperations: number;
}
const date = (value: unknown) => typeof value === 'string' && Number.isFinite(Date.parse(value));
const strings = (value: unknown): value is string[] =>
	Array.isArray(value) && value.every((id) => typeof id === 'string' && !!id);
export function validateMergeState(
	session: InventorySession,
	validateSnapshot: (value: unknown) => void
): void {
	if (
		session.countEpochId !== undefined &&
		(typeof session.countEpochId !== 'string' || !session.countEpochId)
	)
		throw new Error('Identificador de ciclo inválido.');
	for (const list of ['mergeSources', 'mergeConflicts', 'mergeHistory'] as const)
		if (session[list] !== undefined && !Array.isArray(session[list]))
			throw new Error('Historial de fusión inválido.');
	const sourceIds = new Set<string>();
	for (const source of session.mergeSources ?? []) {
		if (
			!source ||
			typeof source.id !== 'string' ||
			!source.id ||
			sourceIds.has(source.id) ||
			typeof source.filename !== 'string' ||
			!strings(source.parentIds) ||
			source.snapshot?.id !== source.id ||
			source.snapshot.session?.mergeSources !== undefined
		)
			throw new Error('Archivo de origen de fusión inválido.');
		validateSnapshot(source.snapshot);
		sourceIds.add(source.id);
	}
	for (const source of session.mergeSources ?? [])
		if (source.parentIds.some((id) => id === source.id || !sourceIds.has(id)))
			throw new Error('Relación de orígenes de fusión inválida.');
	const conflicts = new Set<string>();
	for (const conflict of session.mergeConflicts ?? []) {
		if (
			!conflict ||
			typeof conflict.id !== 'string' ||
			!conflict.id ||
			conflicts.has(conflict.id) ||
			typeof conflict.productId !== 'string' ||
			typeof conflict.key !== 'string' ||
			!['pending', 'resolved'].includes(conflict.status) ||
			typeof conflict.reason !== 'string' ||
			!date(conflict.createdAt) ||
			!strings(conflict.sourceIds) ||
			!conflict.localProduct ||
			conflict.localProduct.id !== conflict.productId ||
			conflict.localProduct.key !== conflict.key ||
			!Number.isFinite(conflict.localProduct.physical) ||
			conflict.localProduct.physical < 0 ||
			(conflict.status === 'resolved' &&
				(!date(conflict.resolvedAt) ||
					typeof conflict.resolutionOperationId !== 'string' ||
					!conflict.resolutionOperationId))
		)
			throw new Error('Conflicto de fusión inválido.');
		conflicts.add(conflict.id);
	}
	if (Array.isArray(session.products))
		for (const product of session.products) {
			if (
				product.mergeConflictId &&
				!(session.mergeConflicts ?? []).some(
					(c) =>
						c.id === product.mergeConflictId && c.productId === product.id && c.status === 'pending'
				)
			)
				throw new Error('El producto no tiene un conflicto pendiente verificable.');
		}
	for (const conflict of session.mergeConflicts ?? [])
		if (
			conflict.status === 'resolved' &&
			!(session.operations ?? []).some(
				(op) =>
					op.id === conflict.resolutionOperationId &&
					op.productId === conflict.productId &&
					op.type === 'recount' &&
					op.occurredAt === conflict.resolvedAt
			)
		)
			throw new Error('La resolución no tiene una operación de recuento verificable.');
	const receipts = new Set<string>();
	for (const receipt of session.mergeHistory ?? []) {
		if (
			!receipt ||
			typeof receipt.id !== 'string' ||
			!receipt.id ||
			receipts.has(receipt.id) ||
			!date(receipt.at) ||
			typeof receipt.instanceId !== 'string' ||
			!receipt.instanceId ||
			!strings(receipt.sourceIds) ||
			!strings(receipt.adoptedProductIds) ||
			!strings(receipt.conflictProductIds) ||
			!Number.isSafeInteger(receipt.duplicateOperations) ||
			receipt.duplicateOperations < 0
		)
			throw new Error('Registro administrativo de fusión inválido.');
		receipts.add(receipt.id);
	}
}
