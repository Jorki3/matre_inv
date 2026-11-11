import {
	createId,
	getProductStatus,
	validateBackup,
	type InventorySession,
	type InventorySnapshot,
	type Product
} from './inventory';
import { reconcileMovements, auditReconciliation } from './imported-movements';
import type { MergeSource } from './merge-state';

export interface MergeInput {
	filename: string;
	snapshot: InventorySnapshot;
}
export interface MergePreviewRow {
	productId: string;
	key: string;
	name: string;
	action: 'new' | 'adopt' | 'same' | 'conflict';
	reason: string;
	local?: number;
	incoming?: number;
	filename: string;
}
export interface MergePreview {
	rows: MergePreviewRow[];
	errors: string[];
	duplicateOperations: number;
	duplicateFiles: string[];
	next: InventorySnapshot;
	files: { filename: string; sessionId: string; sessionName: string }[];
}

/** Canonical equality compares complete identifiers and payloads, never quantities/timestamps alone. */
export function canonical(value: unknown): string {
	return JSON.stringify(value, (_key, entry) =>
		entry && typeof entry === 'object' && !Array.isArray(entry)
			? Object.fromEntries(Object.entries(entry).sort(([a], [b]) => a.localeCompare(b)))
			: entry
	);
}
export function validateMergeBackup(input: unknown): InventorySnapshot {
	const raw = input as InventorySnapshot;
	if (raw && Array.isArray(raw.catalog) && Array.isArray(raw.session?.products)) {
		for (const product of raw.catalog) {
			const other = raw.session.products.find((p) => p?.key === product?.key);
			if (
				other &&
				(Number(raw.version) >= 3 || (other.countedAt && product.countedAt)) &&
				(product.physical !== other.physical ||
					product.countedAt !== other.countedAt ||
					product.mergeConflictId !== other.mergeConflictId)
			)
				throw new Error(
					`El respaldo contiene dos estados distintos para ${product.key}. No se elegirá automáticamente el más reciente.`
				);
		}
	}
	const result = validateBackup(input);
	if (!result.valid || !result.value) throw new Error(result.message);
	return result.value;
}
function archive(input: MergeInput): MergeSource {
	const { mergeSources, ...session } = input.snapshot.session;
	return {
		id: input.snapshot.id,
		filename: input.filename,
		parentIds: (mergeSources ?? []).map((source) => source.id),
		snapshot: { ...input.snapshot, session }
	};
}
function sourceEqual(a: MergeSource, b: MergeSource): boolean {
	return (
		canonical({ parentIds: a.parentIds, snapshot: a.snapshot }) ===
		canonical({ parentIds: b.parentIds, snapshot: b.snapshot })
	);
}
function catalogIdentity(product: Product) {
	return {
		id: product.id,
		key: product.key,
		name: product.name,
		expected: product.expected,
		unit: product.unit ?? '',
		category: product.category ?? '',
		alternateKey: product.alternateKey ?? product.barcode ?? ''
	};
}
function prefix<T extends { id: string }>(a: T[], b: T[]): boolean {
	return a.length <= b.length && a.every((entry, index) => entry.id === b[index].id);
}
function countEqual(a: Product, b: Product): boolean {
	return a.physical === b.physical && a.countedAt === b.countedAt;
}
function countVerified(session: InventorySession, p: Product): boolean {
	if (!p.countedAt || p.mergeConflictId) return true;
	const ops = (session.operations ?? []).filter((op) => op.productId === p.id);
	const index = ops.findLastIndex((op) => op.type === 'recount' && op.occurredAt === p.countedAt);
	if (
		index < 0 &&
		session.importedMovements?.some((m) => m.key === p.key && m.status === 'applied') &&
		!session.movementBaselines?.some(
			(base) =>
				base.productId === p.id && base.occurredAt === p.countedAt && base.sessionId === session.id
		)
	)
		return false;

	if (session.importedMovements?.some((m) => m.key === p.key)) {
		return reconcileMovements({ ...session, products: [p] }).products[0].physical === p.physical;
	}
	if (index < 0) return true;
	let quantity = ops[index].enteredQuantity;
	for (const op of ops.slice(index + 1)) {
		if (op.type !== 'add' && op.type !== 'subtract') return false;
		quantity += op.type === 'add' ? op.enteredQuantity : -op.enteredQuantity;
	}
	return (
		Math.abs(quantity - p.physical) <=
		Number.EPSILON * 16 * Math.max(1, Math.abs(quantity), Math.abs(p.physical))
	);
}

export function previewInventoryMerge(
	current: InventorySnapshot,
	inputs: MergeInput[],
	instanceId: string,
	at = new Date().toISOString()
): MergePreview {
	const errors: string[] = [],
		rows: MergePreviewRow[] = [],
		duplicateFiles: string[] = [];
	let duplicateOperations = 0;
	let session: InventorySession = {
		...current.session,
		products: current.session.products.map((p) => ({ ...p })),
		operations: [...(current.session.operations ?? [])],
		importedMovements: [...(current.session.importedMovements ?? [])],
		movementBaselines: [...(current.session.movementBaselines ?? [])],
		reconciliationLog: [...(current.session.reconciliationLog ?? [])],
		mergeSources: [...(current.session.mergeSources ?? [])],
		mergeConflicts: (current.session.mergeConflicts ?? []).map((c) => ({
			...c,
			sourceIds: [...c.sourceIds]
		})),
		mergeHistory: [...(current.session.mergeHistory ?? [])]
	};
	let findings = [...(current.unmatchedArticles ?? [])];
	let legacyMovements = [...current.movements];
	const newSources: string[] = [],
		adopted = new Set<string>(),
		conflicted = new Set<string>();
	function union<T extends { id: string }>(
		local: T[],
		incoming: T[],
		label: string,
		duplicate = false
	): T[] {
		const merged = new Map(local.map((entry) => [entry.id, entry]));
		for (const entry of incoming) {
			const old = merged.get(entry.id);
			if (old) {
				if (canonical(old) !== canonical(entry))
					errors.push(
						`${label}: el identificador ${entry.id} tiene contenidos distintos; no se sobrescribirá.`
					);
				else if (duplicate) duplicateOperations++;
			} else merged.set(entry.id, entry);
		}
		return [...merged.values()];
	}
	for (const input of inputs) {
		let incoming: InventorySnapshot;
		try {
			incoming = validateMergeBackup(input.snapshot);
		} catch (error) {
			errors.push(`${input.filename}: ${(error as Error).message}`);
			continue;
		}
		if (
			incoming.session.id !== current.session.id ||
			incoming.session.countEpochId !== current.session.countEpochId
		) {
			errors.push(
				`${input.filename}: pertenece a otra sesión o ciclo de conteo. Distribuye primero un mismo respaldo entre los dispositivos.`
			);
			continue;
		}
		if (
			session.inventoryTimeZone &&
			incoming.session.inventoryTimeZone &&
			session.inventoryTimeZone !== incoming.session.inventoryTimeZone
		) {
			errors.push(`${input.filename}: la zona horaria del inventario no coincide.`);
			continue;
		}
		const source = archive({ ...input, snapshot: incoming });
		const known = session.mergeSources!.find((s) => s.id === source.id);
		if (known) {
			if (!sourceEqual(known, source))
				errors.push(
					`${input.filename}: el identificador de respaldo ya existe con otro contenido.`
				);
			else duplicateFiles.push(input.filename);
			continue;
		}
		for (const parent of [...(incoming.session.mergeSources ?? []), source]) {
			const existing = session.mergeSources!.find((s) => s.id === parent.id);
			if (existing && !sourceEqual(existing, parent))
				errors.push(`${input.filename}: un origen compartido tiene contenido incompatible.`);
			if (!existing) session.mergeSources!.push(parent);
		}
		newSources.push(source.id);
		const incomingConflicts = incoming.session.mergeConflicts ?? [];
		const decisionConflicts = new Set<string>();
		const imported = new Map((session.importedMovements ?? []).map((m) => [m.id, m]));
		for (const movement of incoming.session.importedMovements ?? []) {
			const existing = imported.get(movement.id);
			if (!existing) imported.set(movement.id, movement);
			else {
				const original = (m: typeof movement) => ({
					id: m.id,
					type: m.type,
					folio: m.folio,
					key: m.key,
					date: m.date,
					time: m.time,
					quantity: m.quantity,
					timeZone: m.timeZone,
					occurredAt: m.occurredAt
				});
				if (canonical(original(existing)) !== canonical(original(movement)))
					errors.push(
						`${input.filename}: conflicto documental en el movimiento ${movement.folio}, clave ${movement.key}.`
					);
				else {
					duplicateOperations++;
					if (existing.returnDecision !== movement.returnDecision)
						decisionConflicts.add(movement.key);
				}
			}
		}
		for (const p of incoming.session.products) {
			const local = session.products.find((item) => item.key === p.key);
			if (!local) {
				if (session.products.some((item) => item.id === p.id)) {
					errors.push(`${input.filename}: el identificador de ${p.key} ya pertenece a otra clave.`);
					continue;
				}
				const added = { ...p };
				if (!countVerified(incoming.session, p)) {
					const held = { ...p, physical: 0, countedAt: undefined, status: 'pending' as const };
					const conflict = {
						id: createId('merge-conflict'),
						productId: p.id,
						key: p.key,
						status: 'pending' as const,
						reason: 'No se puede verificar la cantidad nueva con su historial.',
						createdAt: at,
						sourceIds: [source.id],
						localProduct: held
					};
					session.mergeConflicts!.push(conflict);
					Object.assign(added, held, { mergeConflictId: conflict.id });
				}
				session.products.push(added);
				if (added.mergeConflictId) conflicted.add(p.id);
				else adopted.add(p.id);
				rows.push({
					productId: p.id,
					key: p.key,
					name: p.name,
					filename: input.filename,
					action: added.mergeConflictId ? 'conflict' : 'new',
					reason: added.mergeConflictId
						? 'Requiere revisión antes de usar su cantidad como definitiva.'
						: 'Producto nuevo con historial original.',
					incoming: p.countedAt ? p.physical : undefined
				});
				continue;
			}
			if (canonical(catalogIdentity(local)) !== canonical(catalogIdentity(p))) {
				errors.push(
					`${input.filename}: catálogo incompatible para ${p.key}; revisa identificador, nombre, unidad, claves y existencia de referencia.`
				);
				continue;
			}
			const localOps = (session.operations ?? []).filter((op) => op.productId === local.id);
			const incomingOps = (incoming.session.operations ?? []).filter((op) => op.productId === p.id);
			const incomingExtends = localOps.length > 0 && prefix(localOps, incomingOps);
			const localExtends = incomingOps.length > 0 && prefix(incomingOps, localOps);
			const incomingResolution = incomingConflicts.find(
				(c) =>
					c.productId === p.id &&
					(localOps.length > 0 || !local.countedAt || c.id === local.mergeConflictId) &&
					c.status === 'resolved' &&
					incomingOps.some((op) => op.id === c.resolutionOperationId && op.type === 'recount') &&
					localOps.every((op) => incomingOps.some((other) => other.id === op.id))
			);
			const localResolution = session.mergeConflicts!.find(
				(c) =>
					c.productId === p.id &&
					(incomingOps.length > 0 || !p.countedAt) &&
					c.status === 'resolved' &&
					localOps.some((op) => op.id === c.resolutionOperationId && op.type === 'recount') &&
					incomingOps.every((op) => localOps.some((other) => other.id === op.id))
			);
			const incomingResolved = !!incomingResolution;
			const localResolved = !!localResolution;
			let reason = '';
			if ((local.mergeConflictId && !incomingResolved) || (p.mergeConflictId && !localResolved))
				reason = 'Existe un conflicto pendiente de revisión.';
			else if (decisionConflicts.has(p.key))
				reason = 'Los dispositivos discrepan sobre el reingreso físico de una devolución.';
			else if (!countVerified(session, local) || !countVerified(incoming.session, p))
				reason = 'No se puede verificar la cantidad con el historial disponible.';
			else if (
				local.countedAt &&
				p.countedAt &&
				!incomingExtends &&
				!localExtends &&
				!incomingResolved &&
				!localResolved
			)
				reason =
					'Conteos independientes, incluso si sus cantidades coinciden. Requiere un nuevo recuento.';
			else if (
				local.countedAt &&
				p.countedAt &&
				localOps.length === incomingOps.length &&
				incomingExtends &&
				!countEqual(local, p)
			) {
				// Imported documents may account for differing balances; otherwise identical histories must agree.
				if (
					!session.importedMovements?.some((m) => m.key === p.key) &&
					!incoming.session.importedMovements?.some((m) => m.key === p.key)
				)
					reason = 'La misma historia de operaciones contiene cantidades distintas.';
			}
			let action: MergePreviewRow['action'] = 'same';
			if (reason) {
				action = 'conflict';
				conflicted.add(local.id);
				let conflict = session.mergeConflicts!.find(
					(c) => c.productId === local.id && c.status === 'pending'
				);
				if (!conflict) {
					conflict = {
						id: createId('merge-conflict'),
						productId: local.id,
						key: local.key,
						status: 'pending',
						reason,
						createdAt: at,
						sourceIds: [],
						localProduct: {
							...(current.session.products.find((item) => item.id === local.id) ?? {
								...local,
								physical: 0,
								countedAt: undefined,
								status: 'pending' as const
							})
						}
					};
					session.mergeConflicts!.push(conflict);
				}
				conflict.sourceIds = [
					...new Set([
						...conflict.sourceIds,
						source.id,
						...session
							.mergeSources!.filter((item) =>
								item.snapshot.session.products.some(
									(observed) => observed.key === local.key && observed.countedAt
								)
							)
							.map((item) => item.id)
					])
				];
				const held = conflict.localProduct;
				local.physical = held.physical;
				local.countedAt = held.countedAt;
				local.mergeConflictId = conflict.id;
				adopted.delete(local.id);
			} else if (
				p.countedAt &&
				(!local.countedAt ||
					(incomingExtends && incomingOps.length > localOps.length) ||
					(incomingResolved && (!localResolved || !!local.mergeConflictId)))
			) {
				action = 'adopt';
				adopted.add(local.id);
				if (incomingResolution) {
					const resolution = incomingOps.find(
						(op) => op.id === incomingResolution.resolutionOperationId
					)!;
					for (const conflict of session.mergeConflicts!.filter(
						(c) => c.productId === local.id && c.status === 'pending'
					))
						Object.assign(conflict, {
							status: 'resolved',
							resolvedAt: resolution.occurredAt,
							resolutionOperationId: resolution.id
						});
				}
				Object.assign(local, {
					physical: p.physical,
					countedAt: p.countedAt,
					status: getProductStatus(p),
					mergeConflictId: p.mergeConflictId
				});
			}
			rows.push({
				productId: p.id,
				key: p.key,
				name: p.name,
				filename: input.filename,
				action,
				reason:
					reason ||
					(action === 'adopt'
						? 'Conteo compatible; no se suma a otro conteo.'
						: 'Sin cambios de conteo; se conserva el historial compatible.'),
				local: current.session.products.find((item) => item.id === p.id)?.countedAt
					? current.session.products.find((item) => item.id === p.id)?.physical
					: undefined,
				incoming: p.countedAt ? p.physical : undefined
			});
		}
		session.operations = union(
			session.operations!,
			incoming.session.operations ?? [],
			`${input.filename}: operación manual`,
			true
		);
		session.importedMovements = [...imported.values()];
		session.movementBaselines = union(
			session.movementBaselines!,
			incoming.session.movementBaselines ?? [],
			`${input.filename}: referencia física`
		);
		session.reconciliationLog = union(
			session.reconciliationLog!,
			incoming.session.reconciliationLog ?? [],
			`${input.filename}: auditoría de movimientos`
		);
		session.mergeHistory = union(
			session.mergeHistory!,
			incoming.session.mergeHistory ?? [],
			`${input.filename}: historial de fusión`
		);
		for (const conflict of incomingConflicts) {
			const existing = session.mergeConflicts!.find((c) => c.id === conflict.id);
			if (!existing)
				session.mergeConflicts!.push({ ...conflict, sourceIds: [...conflict.sourceIds] });
			else {
				existing.sourceIds = [...new Set([...existing.sourceIds, ...conflict.sourceIds])];
				if (
					existing.status === 'pending' &&
					conflict.status === 'resolved' &&
					!session.products.find((p) => p.id === conflict.productId)?.mergeConflictId
				)
					Object.assign(existing, conflict);
			}
		}
		session.inventoryTimeZone ??= incoming.session.inventoryTimeZone;
		findings = union(
			findings,
			incoming.unmatchedArticles ?? [],
			`${input.filename}: artículo no encontrado`
		);
		legacyMovements = union(
			legacyMovements,
			incoming.movements,
			`${input.filename}: movimiento histórico`
		);
	}
	if (!errors.length && newSources.length) {
		const before = { ...session, products: current.session.products };
		session = auditReconciliation(before, reconcileMovements(session), at);
		session.mergeHistory!.push({
			id: createId('merge'),
			at,
			instanceId,
			sourceIds: newSources,
			adoptedProductIds: [...adopted],
			conflictProductIds: [...conflicted],
			duplicateOperations
		});
	}
	const next =
		errors.length || !newSources.length
			? current
			: {
					...current,
					version: 5,
					session,
					catalog: session.products,
					movements: legacyMovements,
					unmatchedArticles: findings
				};
	return {
		rows,
		errors,
		duplicateOperations,
		duplicateFiles,
		next,
		files: inputs.map((input) => ({
			filename: input.filename,
			sessionId: input.snapshot.session.id,
			sessionName: input.snapshot.session.name
		}))
	};
}

export function confirmInventoryMerge(
	current: InventorySnapshot,
	inputs: MergeInput[],
	instanceId: string
): InventorySnapshot {
	if (current.session.status !== 'active')
		throw new Error('Comienza o reanuda la sesión antes de fusionar.');
	const preview = previewInventoryMerge(current, inputs, instanceId);
	if (!inputs.length || preview.errors.length)
		throw new Error(preview.errors.join(' ') || 'Selecciona respaldos para fusionar.');
	const validated = validateBackup(preview.next);
	if (!validated.valid || !validated.value) throw new Error(validated.message);
	return validated.value;
}
