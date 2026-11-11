import { describe, it, expect } from 'vitest';
import {
	countInSession,
	createInventoryExport,
	validateBackup,
	resetSessionCounts,
	type InventorySession
} from './inventory';

const time = '2026-11-11T11:00:00Z';
function session(): InventorySession {
	return {
		id: 's',
		name: 'Test',
		status: 'active',
		products: [
			{
				id: 'p',
				key: 'SIL',
				name: 'Silicón',
				expected: 10,
				physical: 10,
				countedAt: time,
				createdAt: time
			}
		]
	};
}
describe('operaciones manuales e historial', () => {
	it.each([
		['add', 5, 15],
		['recount', 12, 12],
		['subtract', 3, 7],
		['recount', 0, 0]
	] as const)('%s %s → %s', (type, quantity, result) => {
		const next = countInSession(session(), 'p', quantity, type);
		expect(next.products[0].physical).toBe(result);
		expect(next.operations?.[0]).toMatchObject({
			type,
			previousQuantity: 10,
			enteredQuantity: quantity,
			resultingQuantity: result,
			source: 'manual'
		});
	});
	it('resta 3 de 12 y conserva la referencia física al sumar/restar', () => {
		const counted = countInSession(session(), 'p', 12, 'recount', time);
		const next = countInSession(counted, 'p', 3, 'subtract');
		expect(next.products[0].physical).toBe(9);
		expect(next.products[0].countedAt).toBe(time);
	});
	it('establece primer conteo, incluyendo cero', () => {
		const initial = session();
		delete initial.products[0].countedAt;
		const next = countInSession(initial, 'p', 0);
		expect(next.operations?.[0].previousQuantity).toBeNull();
		expect(next.products[0].physical).toBe(0);
		expect(() => countInSession(initial, 'p', 1, 'add')).toThrow();
	});
	it('bloquea negativos y cantidades inválidas sin alterar el estado', () => {
		const initial = session();
		expect(() => countInSession(initial, 'p', 11, 'subtract')).toThrow(/negativo/);
		expect(() => countInSession(initial, 'p', NaN)).toThrow();
		expect(initial.products[0].physical).toBe(10);
	});
	it('conserva historial y fechas en JSON y al reiniciar', () => {
		const next = countInSession(session(), 'p', 0);
		const backup = createInventoryExport(next.products, next);
		const restored = validateBackup(JSON.parse(JSON.stringify(backup)));
		expect(restored.valid).toBe(true);
		expect(restored.value?.session.operations).toEqual(next.operations);
		expect(resetSessionCounts(next, 'reset').operations).toEqual(next.operations);
	});
	it('acepta inventarios existentes sin historial y rechaza historial corrupto', () => {
		const initial = session();
		const backup = createInventoryExport(initial.products, initial);
		expect(validateBackup(backup).valid).toBe(true);
		expect(validateBackup({ ...backup, session: { ...initial, operations: [{}] } }).valid).toBe(
			false
		);
	});
});
