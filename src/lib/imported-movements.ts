import type { InventorySession, Product } from './inventory';
import { historicalSecond, localMovementInstant, validateTimeZone } from './movement-time';

export type ImportedMovementType = 'sale' | 'credit';
export type ReturnDecision = 'unconfirmed' | 'confirmed' | 'not_returned';
export type ReconciliationStatus = 'applied' | 'included' | 'pending' | 'review' | 'no_return';
export interface PhysicalReference {
	id: string;
	productId: string;
	sessionId: string;
	occurredAt: string;
	quantity: number;
}
export interface ImportedMovement {
	id: string;
	type: ImportedMovementType;
	folio: string;
	key: string;
	date: string;
	time: string;
	quantity: number;
	timeZone: string;
	occurredAt: string;
	importedAt: string;
	returnDecision: ReturnDecision;
	status: ReconciliationStatus;
	reason: string;
	reference?: PhysicalReference;
}
export interface MovementCandidate {
	row: number;
	type: ImportedMovementType;
	folio: string;
	key: string;
	date: string;
	time: string;
	quantity?: number;
	occurredAt?: string;
	errors: string[];
}
export interface ReconciliationAudit {
	id: string;
	at: string;
	sessionId: string;
	productId: string;
	previousQuantity: number;
	resultingQuantity: number;
	manualOperationIds: string[];
	outcomes: {
		id: string;
		status: ReconciliationStatus;
		reason: string;
		reference?: PhysicalReference;
		returnDecision: ReturnDecision;
	}[];
}
export interface MovementPreviewRow {
	candidate: MovementCandidate;
	id: string;
	product?: Product;
	action: 'subtract' | 'add' | 'omit' | 'review' | 'duplicate';
	reason: string;
	current?: number;
	result?: number;
}
export interface MovementPreview {
	rows: MovementPreviewRow[];
	errors: string[];
	next: InventorySession;
	revisedRecords: ImportedMovement[];
	changes: { productId: string; name: string; previous: number; result: number }[];
}

export const movementId = (type: ImportedMovementType, folio: string, key: string) =>
	JSON.stringify([type, folio, key]);
const quantityStatus = (p: Product, quantity: number) =>
	!p.countedAt
		? ('pending' as const)
		: quantity === p.expected
			? ('counted' as const)
			: ('difference' as const);
const close = (a: number, b: number) =>
	Math.abs(a - b) <= Number.EPSILON * 16 * Math.max(1, Math.abs(a), Math.abs(b));
const cleanQuantity = (value: number) =>
	Math.abs(value) < 1e12 ? Number(value.toPrecision(15)) : value;

function referenceFor(
	session: InventorySession,
	product: Product
): { reference?: PhysicalReference; error?: string } {
	const countSecond = historicalSecond(product.countedAt);
	if (countSecond === undefined)
		return { error: 'El conteo histórico no tiene una fecha ISO con zona verificable.' };
	const operations = (session.operations ?? []).filter((op) => op.productId === product.id);
	const recount = operations
		.filter((op) => op.type === 'recount' && op.occurredAt === product.countedAt)
		.at(-1);
	if (recount)
		return {
			reference: {
				id: recount.id,
				productId: product.id,
				sessionId: session.id,
				occurredAt: recount.occurredAt,
				quantity: recount.enteredQuantity
			}
		};
	const saved = session.movementBaselines?.find(
		(ref) =>
			ref.productId === product.id &&
			ref.sessionId === session.id &&
			ref.occurredAt === product.countedAt
	);
	if (saved) return { reference: saved };
	// Legacy physical counts have no event. Only capture an anchor if the available history agrees.
	const later = operations.filter((op) => {
		const second = historicalSecond(op.occurredAt);
		return second === undefined || second >= countSecond;
	});
	if (
		later.some(
			(op) =>
				!['add', 'subtract'].includes(op.type) || historicalSecond(op.occurredAt) === undefined
		)
	)
		return {
			error:
				'Historial anterior incompleto o ambiguo. Registra un nuevo recuento físico para conciliar.'
		};
	const quantity = later.length ? later[0].previousQuantity : product.physical;
	if (quantity === null || !Number.isFinite(quantity))
		return { error: 'No se puede verificar el conteo original.' };
	const reconstructed = later.reduce(
		(sum, op) => sum + (op.type === 'add' ? op.enteredQuantity : -op.enteredQuantity),
		quantity
	);
	if (!close(reconstructed, product.physical))
		return {
			error: 'La cantidad actual no coincide con el historial disponible. Requiere un recuento.'
		};
	return {
		reference: {
			id: JSON.stringify(['legacy-count', session.id, product.id, product.countedAt]),
			productId: product.id,
			sessionId: session.id,
			occurredAt: product.countedAt!,
			quantity
		}
	};
}

/** Rebuild from the last physical reference, never from a previously adjusted balance. */
export function reconcileMovements(session: InventorySession): InventorySession {
	const imported = (session.importedMovements ?? []).map((m) => ({ ...m }));
	const baselines = [...(session.movementBaselines ?? [])];
	const rowsByKey = new Map<string, ImportedMovement[]>();
	for (const row of imported) {
		const rows = rowsByKey.get(row.key) ?? [];
		rows.push(row);
		rowsByKey.set(row.key, rows);
	}
	const products = session.products.map((product) => {
		const rows = rowsByKey.get(product.key) ?? [];
		if (!rows.length) return product;
		for (const row of rows) {
			delete row.reference;
			row.status = 'pending';
			row.reason = 'Producto Pendiente: no se modifica su existencia.';
		}
		if (!product.countedAt) return product;
		const resolved = referenceFor(session, product);
		if (!resolved.reference) {
			for (const row of rows) {
				row.status = 'review';
				row.reason = resolved.error!;
			}
			return product;
		}
		const ref = resolved.reference;
		if (!baselines.some((base) => base.id === ref.id)) baselines.push(ref);
		const countSecond = historicalSecond(ref.occurredAt)!;
		const allManual = (session.operations ?? []).filter((op) => op.productId === product.id);
		const refIndex = allManual.findIndex((op) => op.id === ref.id);
		const subsequent =
			refIndex >= 0
				? allManual.slice(refIndex + 1)
				: allManual.filter((op) => (historicalSecond(op.occurredAt) ?? Infinity) >= countSecond);
		let problem = '';
		const manual = subsequent.filter((op) => ['add', 'subtract'].includes(op.type));
		if (
			subsequent.some(
				(op) =>
					!['add', 'subtract'].includes(op.type) ||
					historicalSecond(op.occurredAt) === undefined ||
					historicalSecond(op.occurredAt)! < countSecond
			)
		)
			problem = 'La cronología manual es incompleta o retrocede en el tiempo. Requiere revisión.';
		const eligible: ImportedMovement[] = [];
		for (const row of rows) {
			row.reference = ref;
			const second = historicalSecond(row.occurredAt);
			if (second === undefined) {
				row.status = 'review';
				row.reason = 'Fecha del movimiento ambigua.';
				continue;
			}
			if (second < countSecond) {
				row.status = 'included';
				row.reason = 'Movimiento anterior al recuento, ya reflejado físicamente.';
				continue;
			}
			if (
				second === countSecond ||
				manual.some((op) => historicalSecond(op.occurredAt) === second)
			) {
				row.status = 'review';
				row.reason = 'Movimiento y operación manual en el mismo segundo: orden ambiguo.';
				continue;
			}
			if (row.type === 'credit' && row.returnDecision !== 'confirmed') {
				row.status = row.returnDecision === 'not_returned' ? 'no_return' : 'review';
				row.reason =
					row.returnDecision === 'not_returned'
						? 'Se confirmó que no hubo reingreso físico.'
						: 'Falta confirmar el reingreso físico de la devolución.';
				continue;
			}
			eligible.push(row);
		}
		// A simultaneous sale and return also require review: their order could affect the balance.
		for (const row of [...eligible]) {
			if (
				eligible.some(
					(other) =>
						other.id !== row.id &&
						other.type !== row.type &&
						historicalSecond(other.occurredAt) === historicalSecond(row.occurredAt)
				)
			) {
				row.status = 'review';
				row.reason = 'Venta y devolución simultáneas: requiere revisión del orden.';
			}
		}
		const events: { second: number; order: string; delta: number; movement?: ImportedMovement }[] =
			[
				...manual.map((op, i) => ({
					second: historicalSecond(op.occurredAt) ?? Infinity,
					order: `manual-${String(i).padStart(12, '0')}`,
					delta: op.type === 'add' ? op.enteredQuantity : -op.enteredQuantity
				})),
				...eligible
					.filter((row) => row.status !== 'review')
					.map((row) => ({
						second: historicalSecond(row.occurredAt)!,
						order: row.id,
						delta: row.type === 'sale' ? -row.quantity : row.quantity,
						movement: row
					}))
			].sort((a, b) => a.second - b.second || a.order.localeCompare(b.order));
		let quantity = ref.quantity;
		for (const event of events) {
			quantity = cleanQuantity(quantity + event.delta);
			if (quantity < 0 || !Number.isFinite(quantity)) {
				problem =
					'La cronología produciría una existencia negativa. Revisa los movimientos o registra un recuento físico.';
				break;
			}
		}
		if (problem) {
			for (const row of eligible) {
				row.status = 'review';
				row.reason = problem;
			}
			// Cancel this product's entire imported adjustment, including earlier imports, when safe.
			// This makes conflicting batches deterministic rather than retaining whichever arrived first.
			if (problem.startsWith('La cronología manual')) return product;
			let manualOnly = ref.quantity;
			for (const op of manual) {
				manualOnly = cleanQuantity(
					manualOnly + (op.type === 'add' ? op.enteredQuantity : -op.enteredQuantity)
				);
				if (manualOnly < 0) return product;
			}
			return { ...product, physical: manualOnly, status: quantityStatus(product, manualOnly) };
		}
		for (const row of eligible.filter((row) => row.status !== 'review')) {
			row.status = 'applied';
			row.reason =
				row.type === 'sale'
					? 'Venta posterior al recuento: restar.'
					: 'Devolución posterior con reingreso físico confirmado: sumar.';
		}
		return { ...product, physical: quantity, status: quantityStatus(product, quantity) };
	});
	return { ...session, products, importedMovements: imported, movementBaselines: baselines };
}

function samePayload(existing: ImportedMovement, candidate: MovementCandidate): boolean {
	return (
		existing.type === candidate.type &&
		existing.folio === candidate.folio &&
		existing.key === candidate.key &&
		existing.date === candidate.date &&
		existing.time === candidate.time &&
		existing.quantity === candidate.quantity
	);
}

export function previewMovementImport(
	session: InventorySession,
	candidates: MovementCandidate[],
	decisions: Record<string, ReturnDecision> = {},
	reviewIds: string[] = []
): MovementPreview {
	if (!candidates.length)
		return { rows: [], errors: [], next: session, changes: [], revisedRecords: [] };
	const errors: string[] = [];
	const ids = new Set<string>();
	const records = (session.importedMovements ?? []).map((m) => ({ ...m }));
	const duplicates = new Set<string>();
	const timeZone = session.inventoryTimeZone;
	if (!timeZone) errors.push('Confirma la zona horaria del inventario antes de importar.');
	const now = new Date().toISOString();
	for (const row of candidates) {
		const id = movementId(row.type, row.folio, row.key);
		if (
			decisions[id] !== undefined &&
			!['unconfirmed', 'confirmed', 'not_returned'].includes(decisions[id])
		)
			errors.push(`Fila ${row.row}: decisión de reingreso inválida.`);
		if (
			!['sale', 'credit'].includes(row.type) ||
			!row.folio.trim() ||
			row.folio !== row.folio.trim() ||
			!row.key.trim() ||
			row.key !== row.key.trim() ||
			row.quantity === undefined ||
			!Number.isFinite(row.quantity) ||
			row.quantity <= 0
		)
			errors.push(`Fila ${row.row}: tipo, folio, clave o cantidad inválidos.`);
		try {
			const existingZone = reviewIds.includes(id)
				? records.find((record) => record.id === id)?.timeZone
				: undefined;
			if (
				localMovementInstant(row.date, row.time, existingZone ?? timeZone ?? '') !== row.occurredAt
			)
				errors.push(`Fila ${row.row}: fecha normalizada inconsistente.`);
		} catch (error) {
			errors.push(`Fila ${row.row}: ${(error as Error).message}`);
		}
		for (const error of row.errors) errors.push(`Fila ${row.row}: ${error}`);
		if (ids.has(id))
			errors.push(`Fila ${row.row}: tipo, folio y clave duplicados dentro del archivo.`);
		ids.add(id);
		if (!session.products.some((product) => product.key === row.key))
			errors.push(`Fila ${row.row}: clave principal desconocida.`);
		if (row.errors.length || !row.occurredAt || row.quantity === undefined || !timeZone) continue;
		const existing = records.find((record) => record.id === id);
		if (existing) {
			if (!samePayload(existing, row))
				errors.push(
					`Fila ${row.row}: conflicto con un movimiento registrado; no se sobrescribirá.`
				);
			else if (reviewIds.includes(id))
				existing.returnDecision =
					existing.type === 'credit'
						? (decisions[id] ?? existing.returnDecision)
						: existing.returnDecision;
			else duplicates.add(id);
			continue;
		}
		records.push({
			id,
			type: row.type,
			folio: row.folio,
			key: row.key,
			date: row.date,
			time: row.time,
			quantity: row.quantity,
			timeZone,
			occurredAt: row.occurredAt,
			importedAt: now,
			returnDecision: row.type === 'credit' ? (decisions[id] ?? 'unconfirmed') : 'not_returned',
			status: 'pending',
			reason: ''
		});
	}
	const next = errors.length
		? session
		: reconcileMovements({ ...session, importedMovements: records });
	const changes = next.products
		.filter((p) => p.physical !== session.products.find((old) => old.id === p.id)?.physical)
		.map((p) => ({
			productId: p.id,
			name: p.name,
			previous: session.products.find((old) => old.id === p.id)!.physical,
			result: p.physical
		}));
	const rows = candidates.map((candidate): MovementPreviewRow => {
		const id = movementId(candidate.type, candidate.folio, candidate.key);
		const product = session.products.find((p) => p.key === candidate.key);
		const record = next.importedMovements?.find((m) => m.id === id);
		const rowErrors = errors.filter((error) => error.startsWith(`Fila ${candidate.row}:`));
		return {
			candidate,
			id,
			product,
			current: product?.countedAt ? product.physical : undefined,
			result: product?.countedAt
				? next.products.find((p) => p.id === product.id)?.physical
				: undefined,
			action: rowErrors.length
				? 'review'
				: duplicates.has(id)
					? 'duplicate'
					: record?.status === 'applied'
						? candidate.type === 'sale'
							? 'subtract'
							: 'add'
						: record?.status === 'included' || record?.status === 'no_return'
							? 'omit'
							: 'review',
			reason:
				rowErrors.join(' ') ||
				(duplicates.has(id)
					? 'Movimiento ya registrado; no se aplica otra vez.'
					: (record?.reason ?? 'Revisa los errores del archivo.'))
		};
	});
	const revisedRecords = (next.importedMovements ?? []).filter((m) => {
		const old = session.importedMovements?.find((record) => record.id === m.id);
		return old && JSON.stringify(old) !== JSON.stringify(m);
	});
	return { rows, errors, next, changes, revisedRecords };
}

export function auditReconciliation(
	previous: InventorySession,
	next: InventorySession,
	at = new Date().toISOString()
): InventorySession {
	const entries: ReconciliationAudit[] = [];
	for (const product of next.products) {
		const rows = (next.importedMovements ?? []).filter((m) => m.key === product.key);
		if (!rows.length) continue;
		const outcomes = rows.map((m) => ({
			id: m.id,
			status: m.status,
			reason: m.reason,
			reference: m.reference,
			returnDecision: m.returnDecision
		}));
		const old = (previous.importedMovements ?? [])
			.filter((m) => m.key === product.key)
			.map((m) => ({
				id: m.id,
				status: m.status,
				reason: m.reason,
				reference: m.reference,
				returnDecision: m.returnDecision
			}));
		const before = previous.products.find((p) => p.id === product.id)?.physical ?? product.physical;
		if (JSON.stringify(old) === JSON.stringify(outcomes) && before === product.physical) continue;
		entries.push({
			id: `reconciliation-${crypto.getRandomValues(new Uint32Array(4)).join('-')}`,
			at,
			sessionId: next.id,
			productId: product.id,
			previousQuantity: before,
			resultingQuantity: product.physical,
			manualOperationIds: (next.operations ?? [])
				.filter((op) => op.productId === product.id)
				.map((op) => op.id),
			outcomes
		});
	}
	return { ...next, reconciliationLog: [...(next.reconciliationLog ?? []), ...entries] };
}

export function confirmMovementImport(
	session: InventorySession,
	candidates: MovementCandidate[],
	decisions: Record<string, ReturnDecision> = {},
	reviewIds: string[] = []
): InventorySession {
	if (session.status !== 'active')
		throw new Error('Comienza o reanuda la sesión para importar movimientos.');
	const preview = previewMovementImport(session, candidates, decisions, reviewIds);
	if (!candidates.length || preview.errors.length)
		throw new Error(preview.errors.join(' ') || 'No hay filas para importar.');
	return auditReconciliation(session, preview.next);
}

/** Old backups need no conversion. New fields are validated without changing their original timestamps. */
export function validateMovementState(session: InventorySession): void {
	if (session.inventoryTimeZone !== undefined) validateTimeZone(session.inventoryTimeZone);
	const records = session.importedMovements;
	if (records !== undefined) {
		if (!Array.isArray(records)) throw new Error('Movimientos importados inválidos.');
		const ids = new Set<string>();
		for (const m of records) {
			if (
				!m ||
				!['sale', 'credit'].includes(m.type) ||
				typeof m.folio !== 'string' ||
				!m.folio.trim() ||
				typeof m.key !== 'string' ||
				!m.key.trim() ||
				m.id !== movementId(m.type, m.folio, m.key) ||
				ids.has(m.id) ||
				!Number.isFinite(m.quantity) ||
				m.quantity <= 0 ||
				historicalSecond(m.importedAt) === undefined ||
				!['unconfirmed', 'confirmed', 'not_returned'].includes(m.returnDecision) ||
				!['applied', 'included', 'pending', 'review', 'no_return'].includes(m.status) ||
				typeof m.reason !== 'string' ||
				localMovementInstant(m.date, m.time, m.timeZone) !== m.occurredAt
			)
				throw new Error('Movimiento importado inválido o duplicado.');
			ids.add(m.id);
			if (m.reference) validateReference(m.reference);
		}
	}
	if (session.movementBaselines !== undefined) {
		if (!Array.isArray(session.movementBaselines))
			throw new Error('Referencias físicas inválidas.');
		for (const ref of session.movementBaselines) validateReference(ref);
	}
	if (session.reconciliationLog !== undefined) {
		if (!Array.isArray(session.reconciliationLog))
			throw new Error('Historial de conciliación inválido.');
		for (const entry of session.reconciliationLog) {
			if (
				!entry ||
				typeof entry.id !== 'string' ||
				historicalSecond(entry.at) === undefined ||
				typeof entry.productId !== 'string' ||
				typeof entry.sessionId !== 'string' ||
				!Number.isFinite(entry.previousQuantity) ||
				entry.previousQuantity < 0 ||
				!Number.isFinite(entry.resultingQuantity) ||
				entry.resultingQuantity < 0 ||
				!Array.isArray(entry.manualOperationIds) ||
				!entry.manualOperationIds.every((id) => typeof id === 'string') ||
				!Array.isArray(entry.outcomes)
			)
				throw new Error('Historial de conciliación inválido.');
			for (const outcome of entry.outcomes) {
				if (
					!outcome ||
					typeof outcome.id !== 'string' ||
					!['applied', 'included', 'pending', 'review', 'no_return'].includes(outcome.status) ||
					typeof outcome.reason !== 'string' ||
					!['unconfirmed', 'confirmed', 'not_returned'].includes(outcome.returnDecision)
				)
					throw new Error('Resultado de conciliación inválido.');
				if (outcome.reference) validateReference(outcome.reference);
			}
		}
	}
}
function validateReference(ref: PhysicalReference): void {
	if (
		!ref ||
		typeof ref.id !== 'string' ||
		typeof ref.productId !== 'string' ||
		typeof ref.sessionId !== 'string' ||
		historicalSecond(ref.occurredAt) === undefined ||
		!Number.isFinite(ref.quantity) ||
		ref.quantity < 0
	)
		throw new Error('Referencia física inválida.');
}

export function candidateForMovement(m: ImportedMovement): MovementCandidate {
	return {
		row: 1,
		type: m.type,
		folio: m.folio,
		key: m.key,
		date: m.date,
		time: m.time,
		quantity: m.quantity,
		occurredAt: m.occurredAt,
		errors: []
	};
}
