import { describe, expect, it } from 'vitest';
import {
	createSession,
	createInventoryExport,
	countInSession,
	validateBackup,
	computeMetrics,
	resetSessionCounts,
	getProductStatus,
	type InventorySession
} from './inventory';
import {
	previewInventoryMerge,
	confirmInventoryMerge,
	validateMergeBackup
} from './inventory-merge';
import { createCountsExport } from './counts-export';
import { confirmMovementImport, movementId, reconcileMovements } from './imported-movements';

const at = (hour: number) => `2026-11-11T${String(hour).padStart(2, '0')}:00:00.000Z`;
function base(): InventorySession {
	return {
		...createSession(),
		status: 'active',
		inventoryTimeZone: 'UTC',
		products: ['A', 'B'].map((key) => ({
			id: key,
			key,
			name: `Producto ${key}`,
			expected: 10,
			physical: 0,
			createdAt: at(8)
		}))
	};
}
const exported = (session: InventorySession, device = 'device-A') =>
	createInventoryExport(session.products, session, [], [], device);
const input = (session: InventorySession, device = 'device-B') => ({
	filename: 'dispositivo.json',
	snapshot: exported(session, device)
});
const count = (session: InventorySession, key: string, quantity: number, hour = 10) =>
	countInSession(session, key, quantity, 'recount', at(hour), 'device-B');

describe('fusión de inventarios y trazabilidad', () => {
	it('fusiona productos distintos sin sumar sus cantidades físicas y sin modificar la vista previa', () => {
		const original = base();
		const local = count(original, 'A', 30);
		const donor = count(original, 'B', 25);
		const current = exported(local);
		const sources = [input(donor)];
		const preview = previewInventoryMerge(current, sources, 'local');
		expect(preview.errors).toEqual([]);
		expect(preview.rows.find((r) => r.key === 'B')?.action).toBe('adopt');
		expect(current.session.products[1].physical).toBe(0);
		const merged = confirmInventoryMerge(current, sources, 'local');
		expect(merged.session.products.map((p) => p.physical)).toEqual([30, 25]);
		expect(merged.session.operations).toHaveLength(2);
		expect(merged.session.mergeSources).toHaveLength(1);
		expect(merged.session.mergeHistory).toHaveLength(1);
	});
	it.each([
		[30, 25],
		[30, 30]
	])('detecta conteos independientes %s y %s, incluyendo cantidades iguales', (a, b) => {
		const original = base();
		const local = count(original, 'A', a);
		const donor = count(original, 'A', b, 11);
		const source = input(donor);
		const merged = confirmInventoryMerge(exported(local), [source], 'local');
		expect(merged.session.products[0].physical).toBe(a);
		expect(getProductStatus(merged.session.products[0])).toBe('review');
		expect(computeMetrics(merged.session.products).counted).toBe(0);
		expect(createCountsExport(merged.session.products)).toEqual([]);
		expect(merged.session.operations).toHaveLength(2);
		expect(merged.session.mergeSources?.[0].snapshot.session.products[0].physical).toBe(b);
		expect(() => countInSession(merged.session, 'A', 1, 'add')).toThrow(/recuento/);
		const resolved = count(merged.session, 'A', 27, 12);
		expect(resolved.products[0].physical).toBe(27);
		expect(resolved.products[0].mergeConflictId).toBeUndefined();
		expect(resolved.operations).toHaveLength(3);
		expect(resolved.mergeConflicts?.[0]).toMatchObject({
			status: 'resolved',
			resolvedAt: at(12),
			resolutionOperationId: resolved.operations?.[2].id
		});
		expect(createCountsExport(resolved.products)).toEqual([{ Clave: 'A', Cantidad: 27 }]);
		expect(confirmInventoryMerge(exported(resolved), [source], 'local').session).toEqual(resolved);
	});
	it('una historia compartida se deduplica por ID y un descendiente compatible se integra', () => {
		const original = count(base(), 'A', 10);
		const donor = countInSession(original, 'A', 5, 'add', at(11), 'other');
		const merged = confirmInventoryMerge(exported(original), [input(donor)], 'local');
		expect(merged.session.products[0].physical).toBe(15);
		expect(merged.session.operations).toHaveLength(2);
		expect(merged.session.mergeConflicts).toEqual([]);
		const sources = [input(original)];
		expect(
			confirmInventoryMerge(exported(merged.session), sources, 'local').session.products[0].physical
		).toBe(15);
	});
	it('modificaciones independientes desde un conteo común requieren revisión', () => {
		const original = count(base(), 'A', 10);
		const a = countInSession(original, 'A', 5, 'add', at(11));
		const b = countInSession(original, 'A', 2, 'subtract', at(12));
		const merged = confirmInventoryMerge(exported(a), [input(b)], 'local');
		expect(merged.session.products[0].physical).toBe(15);
		expect(merged.session.products[0].mergeConflictId).toBeTruthy();
		expect(merged.session.operations).toHaveLength(3);
	});
	it('rechaza sesiones y ciclos incompatibles sin mutaciones parciales', () => {
		const original = base();
		const current = exported(original);
		const untouched = structuredClone(current);
		expect(() => confirmInventoryMerge(current, [input(base())], 'local')).toThrow(/otra sesión/);
		const reset = resetSessionCounts(original, 'reset');
		reset.status = 'active';
		expect(() => confirmInventoryMerge(current, [input(reset)], 'local')).toThrow(/ciclo/);
		expect(current).toEqual(untouched);
	});
	it('reimportar el mismo respaldo o seleccionarlo dos veces no duplica registros', () => {
		const original = base();
		const donor = input(count(original, 'A', 10));
		const merged = confirmInventoryMerge(exported(original), [donor, donor], 'local');
		expect(merged.session.operations).toHaveLength(1);
		const again = confirmInventoryMerge(merged, [donor], 'local');
		expect(again.session).toEqual(merged.session);
		expect(again.unmatchedArticles).toEqual(merged.unmatchedArticles);
	});
	it('bloquea IDs repetidos con otro contenido y diferencias de catálogo', () => {
		const original = count(base(), 'A', 10);
		const donor = structuredClone(original);
		donor.operations![0].enteredQuantity = 9;
		donor.operations![0].resultingQuantity = 9;
		donor.products[0].physical = 9;
		expect(() => confirmInventoryMerge(exported(original), [input(donor)], 'local')).toThrow(
			/contenidos distintos/
		);
		const bad = structuredClone(original);
		bad.products[0].unit = 'paquete';
		expect(() => confirmInventoryMerge(exported(original), [input(bad)], 'local')).toThrow(
			/catálogo incompatible/
		);
	});
	it('un producto nuevo se integra y un identificador de otra clave se rechaza', () => {
		const original = base();
		const donor = structuredClone(original);
		donor.products.push({ ...donor.products[0], id: 'C', key: 'C' });
		expect(
			confirmInventoryMerge(exported(original), [input(donor)], 'local').session.products
		).toHaveLength(3);
		donor.products[2].id = 'A';
		expect(() => confirmInventoryMerge(exported(original), [input(donor)], 'local')).toThrow();
	});
	it('los respaldos históricos conservan restauración y los conteos ambiguos se bloquean', () => {
		const original = base();
		delete original.countEpochId;
		const a = structuredClone(original),
			b = structuredClone(original);
		for (const branch of [a, b])
			branch.products[0] = { ...branch.products[0], physical: 30, countedAt: at(10) };
		const old = { ...exported(b), version: 1 };
		delete old.exportedBy;
		expect(validateBackup(old).valid).toBe(true);
		const merged = confirmInventoryMerge(
			exported(a),
			[{ filename: 'viejo.json', snapshot: old }],
			'local'
		);
		expect(merged.session.products[0].mergeConflictId).toBeTruthy();
		expect(merged.session.products[0].physical).toBe(30);
	});
	it('no elige el más reciente cuando catálogo y sesión discrepan dentro de un archivo', () => {
		const original = count(base(), 'A', 10);
		const snapshot = exported(original);
		snapshot.catalog = snapshot.catalog.map((p) => ({ ...p, physical: 20, countedAt: at(11) }));
		expect(() => validateMergeBackup(snapshot)).toThrow(/dos estados distintos/);
	});
	it('ventas y notas de crédito usan el mismo motor sin aplicaciones duplicadas', () => {
		const original = count(base(), 'A', 10);
		const sale = {
			row: 2,
			type: 'sale' as const,
			folio: '0001',
			key: 'A',
			date: '11/11/2026',
			time: '11:00:00',
			occurredAt: at(11),
			quantity: 3,
			errors: []
		};
		const credit = {
			...sale,
			type: 'credit' as const,
			time: '12:00:00',
			occurredAt: at(12),
			quantity: 2
		};
		const a = confirmMovementImport(original, [sale]);
		const b = confirmMovementImport(original, [sale, credit], {
			[movementId('credit', '0001', 'A')]: 'confirmed'
		});
		const merged = confirmInventoryMerge(exported(a), [input(b)], 'local');
		expect(merged.session.products[0].physical).toBe(9);
		expect(merged.session.importedMovements).toHaveLength(2);
		expect(merged.session.operations).toHaveLength(1);
		expect(confirmInventoryMerge(merged, [input(b)], 'local').session.products[0].physical).toBe(9);
		expect(reconcileMovements(merged.session).products[0].physical).toBe(9);
	});
	it('conserva conflictos y fuentes en JSON v5 sin archivos recursivos', () => {
		const original = base();
		const merged = confirmInventoryMerge(
			exported(count(original, 'A', 30)),
			[input(count(original, 'A', 25, 11))],
			'local'
		);
		const roundtrip = validateBackup(JSON.parse(JSON.stringify(merged)));
		expect(roundtrip.valid).toBe(true);
		expect(roundtrip.value?.session.mergeSources).toEqual(merged.session.mergeSources);
		expect(roundtrip.value?.session.mergeConflicts).toEqual(merged.session.mergeConflicts);
		expect(merged.session.mergeSources?.[0].snapshot.session.mergeSources).toBeUndefined();
	});
	it('una resolución que incluye la historia de ambas ramas puede volver al otro dispositivo', () => {
		const original = base();
		const a = count(original, 'A', 30);
		const b = count(original, 'A', 25, 11);
		const merged = confirmInventoryMerge(exported(a), [input(b)], 'local');
		const resolved = count(merged.session, 'A', 27, 12);
		const received = confirmInventoryMerge(exported(b), [input(resolved)], 'other');
		expect(received.session.products[0].physical).toBe(27);
		expect(received.session.products[0].mergeConflictId).toBeUndefined();
		expect(received.session.operations).toHaveLength(3);
	});
	it('dos archivos conflictivos preservan el estado local inicial en cualquier orden', () => {
		const original = base();
		const a = input(count(original, 'A', 30));
		const b = input(count(original, 'A', 25, 11));
		for (const inputs of [
			[a, b],
			[b, a]
		]) {
			const merged = confirmInventoryMerge(exported(original), inputs, 'local');
			expect(merged.session.products[0].physical).toBe(0);
			expect(merged.session.products[0].countedAt).toBeUndefined();
			expect(merged.session.products[0].mergeConflictId).toBeTruthy();
			expect(merged.session.mergeConflicts?.[0].sourceIds).toHaveLength(2);
			expect(merged.session.operations).toHaveLength(2);
		}
	});
	it('cantidades y fechas iguales no demuestran que las operaciones sean idénticas', () => {
		const original = base();
		const a = count(original, 'A', 10);
		const b = count(original, 'A', 10);
		expect(
			confirmInventoryMerge(exported(a), [input(b)], 'local').session.products[0].mergeConflictId
		).toBeTruthy();
	});
	it('dos resoluciones independientes tampoco se seleccionan por fecha', () => {
		const original = base();
		const a = count(original, 'A', 30);
		const b = count(original, 'A', 25, 11);
		const merged = confirmInventoryMerge(exported(a), [input(b)], 'local');
		const r1 = count(merged.session, 'A', 27, 12);
		const r2 = count(merged.session, 'A', 26, 13);
		const result = confirmInventoryMerge(exported(r1), [input(r2)], 'local');
		expect(result.session.products[0].physical).toBe(27);
		expect(result.session.products[0].mergeConflictId).toBeTruthy();
	});
	it('discrepancias sobre reingreso se conservan y requieren recuento', () => {
		const original = count(base(), 'A', 10);
		const candidate = {
			row: 2,
			type: 'credit' as const,
			folio: '1',
			key: 'A',
			date: '11/11/2026',
			time: '11:00:00',
			occurredAt: at(11),
			quantity: 2,
			errors: []
		};
		const a = confirmMovementImport(original, [candidate]);
		const b = confirmMovementImport(original, [candidate], {
			[movementId('credit', '1', 'A')]: 'confirmed'
		});
		const result = confirmInventoryMerge(exported(a), [input(b)], 'local');
		expect(result.session.products[0].mergeConflictId).toBeTruthy();
		expect(result.session.products[0].physical).toBe(10);
		const resolved = reconcileMovements(count(result.session, 'A', 12, 14));
		expect(resolved.products[0].physical).toBe(12);
		expect(resolved.importedMovements?.[0].status).toBe('included');
	});
	it('un recuento legado nuevo sin IDs no se da por observado por una resolución anterior', () => {
		const original = base();
		const a = count(original, 'A', 30),
			b = count(original, 'A', 25, 11);
		const merged = confirmInventoryMerge(exported(a), [input(b)], 'local');
		const resolved = count(merged.session, 'A', 27, 12);
		const legacy = {
			...original,
			products: original.products.map((p) =>
				p.id === 'A' ? { ...p, physical: 27, countedAt: at(13) } : p
			)
		};
		const result = confirmInventoryMerge(exported(resolved), [input(legacy)], 'local');
		expect(result.session.products[0].mergeConflictId).toBeTruthy();
		expect(result.session.products[0].physical).toBe(27);
	});
});
