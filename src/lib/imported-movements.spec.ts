import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import {
	countInSession,
	createInventoryExport,
	validateBackup,
	type InventorySession
} from './inventory';
import { localMovementInstant, historicalSecond } from './movement-time';
import {
	confirmMovementImport,
	previewMovementImport,
	reconcileMovements,
	auditReconciliation,
	candidateForMovement,
	movementId,
	type ImportedMovementType,
	type MovementCandidate
} from './imported-movements';
import { readMovementWorkbook, readMovementFile } from './movement-import';

const zone = 'America/Mexico_City';
const instant = (time: string) => localMovementInstant('11/11/2026', time, zone);
function inventory(quantity = 10, counted = true): InventorySession {
	const session: InventorySession = {
		id: 's',
		name: 'Inventario real',
		status: 'active',
		inventoryTimeZone: zone,
		products: [
			{
				id: 'p',
				key: '228194',
				name: 'Producto',
				expected: 10,
				physical: 0,
				createdAt: instant('10:00:00')
			}
		]
	};
	return counted ? countInSession(session, 'p', quantity, 'recount', instant('12:10:01')) : session;
}
function row(
	folio = '19066',
	time = '12:35:20',
	quantity = 3,
	type: ImportedMovementType = 'sale'
): MovementCandidate {
	return {
		row: 2,
		type,
		folio,
		key: '228194',
		date: '11/11/2026',
		time,
		quantity,
		occurredAt: instant(time),
		errors: []
	};
}
const apply = (session: InventorySession, rows: MovementCandidate[]) =>
	confirmMovementImport(session, rows);
const balance = (session: InventorySession) => session.products[0].physical;

describe('conciliación de inventario', () => {
	it('caso 1: conserva una pieza y registra la venta anterior de dos piezas', () => {
		const result = apply(inventory(1), [row('19066', '11:49:11', 2)]);
		expect(balance(result)).toBe(1);
		expect(result.importedMovements?.[0].status).toBe('included');
		expect(result.importedMovements?.[0].reference?.quantity).toBe(1);
	});
	it('caso 2: venta posterior produce siete, sin modificar la vista previa', () => {
		const original = inventory();
		const preview = previewMovementImport(original, [row()]);
		expect(preview.rows[0]).toMatchObject({ action: 'subtract', current: 10, result: 7 });
		expect(balance(original)).toBe(10);
		expect(original.importedMovements).toBeUndefined();
		expect(balance(apply(original, [row()]))).toBe(7);
	});
	it('caso 3: devolución posterior requiere reingreso confirmado', () => {
		const candidate = row('0001', '12:35:20', 2, 'credit');
		const pending = apply(inventory(7), [candidate]);
		expect(balance(pending)).toBe(7);
		expect(pending.importedMovements?.[0].status).toBe('review');
		const id = movementId('credit', '0001', '228194');
		const confirmed = confirmMovementImport(pending, [candidate], { [id]: 'confirmed' }, [id]);
		expect(balance(confirmed)).toBe(9);
		expect(confirmed.importedMovements?.[0].importedAt).toBe(
			pending.importedMovements?.[0].importedAt
		);
		expect(confirmed.reconciliationLog).toHaveLength(2);
		const noReturn = confirmMovementImport(pending, [candidate], { [id]: 'not_returned' }, [id]);
		expect(balance(noReturn)).toBe(7);
		expect(noReturn.importedMovements?.[0].status).toBe('no_return');
	});
	it('caso 4: devolución anterior no incrementa el recuento', () => {
		const candidate = row('1', '11:00:00', 2, 'credit');
		const result = confirmMovementImport(inventory(7), [candidate], {
			[movementId('credit', '1', '228194')]: 'confirmed'
		});
		expect(balance(result)).toBe(7);
		expect(result.importedMovements?.[0].status).toBe('included');
	});
	it('caso 5: reimportación idempotente y conflicto sin sobrescritura', () => {
		const first = apply(inventory(), [row()]);
		const second = apply(first, [row()]);
		expect(second).toEqual(first);
		expect(previewMovementImport(first, [row()]).rows[0].action).toBe('duplicate');
		expect(() => apply(first, [row('19066', '12:35:20', 4)])).toThrow(/conflicto/);
		expect(first.importedMovements?.[0].quantity).toBe(3);
	});
	it('caso 6: guarda movimientos de Pendientes sin cambiar existencias', () => {
		const result = apply(inventory(0, false), [row()]);
		expect(balance(result)).toBe(0);
		expect(result.products[0].countedAt).toBeUndefined();
		expect(result.importedMovements?.[0].status).toBe('pending');
		const counted = reconcileMovements(
			countInSession(result, 'p', 6, 'recount', instant('13:00:00'))
		);
		expect(balance(counted)).toBe(6);
		expect(counted.importedMovements?.[0].status).toBe('included');
	});
	it('caso 7: un nuevo recuento establece seis sin volver a descontar', () => {
		const first = apply(inventory(), [row('1', '12:35:20', 2)]);
		const manual = countInSession(first, 'p', 6, 'recount', instant('13:00:00'));
		const next = auditReconciliation(first, reconcileMovements(manual));
		expect(balance(first)).toBe(8);
		expect(balance(next)).toBe(6);
		expect(next.importedMovements?.[0].status).toBe('included');
		expect(next.operations?.[0].enteredQuantity).toBe(10);
		expect(balance(apply(next, [row('1', '12:35:20', 2)]))).toBe(6);
	});
	it('caso 8: faltantes y clave parcial impiden aplicar todo el archivo', () => {
		for (const candidate of [
			{ ...row(), time: '12:35' },
			{ ...row(), date: '' },
			{ ...row(), key: '228' },
			{ ...row(), quantity: 0 }
		])
			expect(() => apply(inventory(), [candidate])).toThrow();
	});
	it('caso 9: respaldos antiguos, nuevos y timestamps originales', () => {
		const original = inventory();
		delete original.inventoryTimeZone;
		for (const version of [1, 2, 3]) {
			const backup = { ...createInventoryExport(original.products, original), version };
			expect(validateBackup(JSON.parse(JSON.stringify(backup))).valid).toBe(true);
		}
		const next = apply(inventory(), [row()]);
		const exported = createInventoryExport(next.products, next);
		expect(exported.version).toBe(4);
		const restored = validateBackup(JSON.parse(JSON.stringify(exported)));
		expect(restored.value?.session).toEqual(exported.session);
		expect(restored.value?.session.operations).toEqual(next.operations);
		expect(balance(apply(restored.value!.session, [row()]))).toBe(7);
		expect(
			validateBackup({
				...exported,
				session: {
					...next,
					importedMovements: [...next.importedMovements!, ...next.importedMovements!]
				}
			}).valid
		).toBe(false);
	});
	it('caso 10: importación inversa respeta Sumar y Restar sin alterar sus registros', () => {
		let original = inventory();
		original = countInSession(original, 'p', 5, 'add', instant('13:00:00'));
		original = countInSession(original, 'p', 2, 'subtract', instant('14:00:00'));
		const old = row('old', '12:35:20', 3);
		const recent = row('recent', '13:35:20', 4);
		const forward = apply(apply(original, [old]), [recent]);
		const reverse = apply(apply(original, [recent]), [old]);
		expect(balance(forward)).toBe(6);
		expect(balance(reverse)).toBe(6);
		expect(reverse.operations).toEqual(original.operations);
		expect(reverse.products[0].countedAt).toBe(original.products[0].countedAt);
	});
	it('colisiones con operaciones manuales se comparan por segundos', () => {
		const original = countInSession(
			inventory(),
			'p',
			2,
			'add',
			instant('13:00:00').replace('.000Z', '.500Z')
		);
		const next = apply(original, [row('x', '13:00:00', 1)]);
		expect(balance(next)).toBe(12);
		expect(next.importedMovements?.[0].status).toBe('review');
	});
	it('negativos no dependen de qué archivo llegó primero: quedan para revisión', () => {
		const a = row('a', '12:35:20', 8),
			b = row('b', '13:00:00', 8);
		const forward = apply(apply(inventory(), [a]), [b]);
		const reverse = apply(apply(inventory(), [b]), [a]);
		expect(balance(forward)).toBe(10);
		expect(balance(reverse)).toBe(10);
		expect(forward.importedMovements?.every((m) => m.status === 'review')).toBe(true);
	});
	it('folios independientes por tipo y productos dentro de un folio', () => {
		const original = inventory();
		original.products.push({ ...original.products[0], id: 'p2', key: '00001' });
		const a = row('001');
		const b = { ...row('001'), key: '00001' };
		const credit = row('001', '13:00:00', 1, 'credit');
		const result = apply(original, [a, b, credit]);
		expect(result.importedMovements).toHaveLength(3);
		expect(() => apply(original, [a, { ...a }])).toThrow(/duplicados/);
	});
	it('captura una referencia de un conteo legado sin inventar eventos', () => {
		const original = inventory();
		delete original.operations;
		const result = apply(original, [row()]);
		expect(balance(result)).toBe(7);
		expect(result.operations).toBeUndefined();
		expect(balance(apply(result, [row('2', '13:00:00', 1)]))).toBe(6);
		expect(result.movementBaselines?.[0].quantity).toBe(10);
	});
	it('fechas históricas sin zona quedan para revisión y no se reescriben', () => {
		const original = inventory();
		original.products[0].countedAt = '2026-11-11T12:10:01';
		const result = apply(original, [row()]);
		expect(balance(result)).toBe(10);
		expect(result.products[0].countedAt).toBe(original.products[0].countedAt);
		expect(result.importedMovements?.[0].status).toBe('review');
	});
	it('revisar una devolución usa el instante original', () => {
		const next = apply(inventory(), [row('c', '13:00:00', 1, 'credit')]);
		expect(candidateForMovement(next.importedMovements![0]).occurredAt).toBe(instant('13:00:00'));
	});
});

describe('fechas locales y horario de verano', () => {
	it('México UTC-6 sin desplazar la hora local', () => {
		expect(instant('12:10:01')).toBe('2026-11-11T18:10:01.000Z');
		expect(historicalSecond('2026-11-11T12:10:01-06:00')).toBe(
			historicalSecond(instant('12:10:01'))
		);
		expect(historicalSecond('2026-11-11T12:10:01')).toBeUndefined();
	});
	it('verano e invierno en una zona con cambios', () => {
		expect(localMovementInstant('01/07/2026', '12:00:00', 'America/New_York')).toBe(
			'2026-07-01T16:00:00.000Z'
		);
		expect(localMovementInstant('01/12/2026', '12:00:00', 'America/New_York')).toBe(
			'2026-12-01T17:00:00.000Z'
		);
	});
	it('rechaza horas duplicadas, inexistentes, fechas inválidas y segundos ausentes', () => {
		expect(() => localMovementInstant('01/11/2026', '01:30:00', 'America/New_York')).toThrow(
			/ambigua/
		);
		expect(() => localMovementInstant('08/03/2026', '02:30:00', 'America/New_York')).toThrow(
			/no existe/
		);
		for (const [date, time] of [
			['29/02/2026', '12:00:00'],
			['11/11/2026', '24:00:00'],
			['11/11/2026', '12:00'],
			['11/11/2026', '12:00:60']
		])
			expect(() => localMovementInstant(date, time, zone)).toThrow();
	});
});

function workbook(values: unknown[][]): XLSX.WorkBook {
	const book = XLSX.utils.book_new();
	XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(values), 'Movimientos');
	return book;
}
const header = ['Folio', 'Clave', 'Fecha', 'Hora', 'Cantidad'];
describe('lectura real de archivos xlsx generados', () => {
	it('conserva ceros iniciales y lee columnas independientes', () => {
		const book = workbook([header, ['0019066', '00001', '11/11/2026', '12:35:20', 0.25]]);
		const bytes = XLSX.write(book, { type: 'array', bookType: 'xlsx' });
		const result = readMovementFile(bytes, 'ventas.xlsx', 'sale', zone);
		expect(result.rows[0]).toMatchObject({
			folio: '0019066',
			key: '00001',
			quantity: 0.25,
			errors: []
		});
	});
	it('acepta seriales de Excel y formato numérico con ceros, sin convertirlos a UTC como fechas del navegador', () => {
		const book = workbook([header, [123, 1, 46337, (12 * 3600 + 35 * 60 + 20) / 86400, 3]]);
		const sheet = book.Sheets.Movimientos;
		sheet.A2.z = '00000';
		sheet.B2.z = '000000';
		sheet.C2.z = 'dd/mm/yyyy';
		sheet.D2.z = 'hh:mm:ss';
		const bytes = XLSX.write(book, { type: 'array', bookType: 'xlsx' });
		const parsed = readMovementFile(bytes, 'movimientos.xlsx', 'sale', zone).rows[0];
		expect(parsed.folio).toBe('00123');
		expect(parsed.key).toBe('000001');
		expect(parsed.time).toBe('12:35:20');
		expect(parsed.errors).toEqual([]);
		expect(parsed.occurredAt).toBe(localMovementInstant(parsed.date, parsed.time, zone));
	});
	it('fecha 1904 y medianoche explícita son válidas', () => {
		const book = workbook([header, ['1', '228194', 1, 0, 1]]);
		book.Workbook = { WBProps: { date1904: true } };
		book.Sheets.Movimientos.C2.z = 'dd/mm/yyyy';
		book.Sheets.Movimientos.D2.z = 'hh:mm:ss';
		const result = readMovementWorkbook(book, 'sale', zone).rows[0];
		expect(result.date).toBe('02/01/1904');
		expect(result.time).toBe('00:00:00');
		expect(result.errors).toEqual([]);
	});
	it('detecta errores, filas vacías, fórmulas y horas sin segundos', () => {
		const book = workbook([
			header,
			['1', '228194', '11/11/2026', '12:00', 0],
			[],
			['2', '228194', '11/11/2026', 0.5, 1]
		]);
		book.Sheets.Movimientos.D4.z = 'hh:mm';
		book.Sheets.Movimientos.A4.f = '1+1';
		const parsed = readMovementWorkbook(book, 'sale', zone);
		expect(parsed.blankRows).toEqual([3]);
		expect(parsed.rows[0].errors.join(' ')).toMatch(/mayor que cero/);
		expect(parsed.rows[0].errors.join(' ')).toMatch(/segundos/);
		expect(parsed.rows[1].errors.join(' ')).toMatch(/fórmulas/);
		expect(parsed.rows[1].errors.join(' ')).toMatch(/segundos/);
	});
	it('exige encabezados inequívocos y extensión xlsx', () => {
		expect(() =>
			readMovementWorkbook(workbook([['Folio', 'Clave', 'Fecha', 'Cantidad']]), 'sale', zone)
		).toThrow(/columnas/);
		expect(() => readMovementFile(new ArrayBuffer(0), 'ventas.csv', 'sale', zone)).toThrow(/xlsx/);
	});
});
