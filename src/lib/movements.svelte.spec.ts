import { beforeEach, describe, it, expect } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import * as XLSX from 'xlsx';
import App from '../routes/+page.svelte';
import { db, loadInventoryState, loadLatestBackup, saveInventoryState } from './database';
import {
	countInSession,
	createSession,
	createInventoryExport,
	validateBackup,
	type InventorySession
} from './inventory';
import { confirmMovementImport, movementId, type ImportedMovementType } from './imported-movements';
import { localMovementInstant } from './movement-time';
import { readMovementWorkbook } from './movement-import';

const zone = 'America/Mexico_City';
const at = (time: string) => localMovementInstant('11/11/2026', time, zone);
function initial(): InventorySession {
	return countInSession(
		{
			...createSession(),
			status: 'active',
			products: [
				{
					id: 'p',
					key: '00001',
					name: 'Silicón',
					expected: 10,
					physical: 0,
					createdAt: at('10:00:00')
				}
			]
		},
		'p',
		10,
		'recount',
		at('12:10:01')
	);
}
function book(type: ImportedMovementType = 'sale') {
	const workbook = XLSX.utils.book_new();
	XLSX.utils.book_append_sheet(
		workbook,
		XLSX.utils.aoa_to_sheet([
			['Folio', 'Clave', 'Fecha', 'Hora', 'Cantidad'],
			[
				'00019',
				'00001',
				'11/11/2026',
				type === 'sale' ? '12:35:20' : '12:45:20',
				type === 'sale' ? 3 : 2
			]
		]),
		'Movimientos'
	);
	return workbook;
}
function upload(type: ImportedMovementType = 'sale') {
	const input = document.querySelector(
		`input[aria-label="${type === 'sale' ? 'Importar ventas' : 'Importar notas de crédito'}"]`
	) as HTMLInputElement;
	const transfer = new DataTransfer();
	transfer.items.add(
		new File([XLSX.write(book(type), { type: 'array', bookType: 'xlsx' })], 'movimientos.xlsx', {
			type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
		})
	);
	input.files = transfer.files;
	input.dispatchEvent(new Event('change', { bubbles: true }));
}
async function seed(session = initial()) {
	await saveInventoryState({
		id: 'main',
		session,
		catalog: session.products,
		theme: 'light',
		lastSavedAt: at('12:10:01')
	});
}
beforeEach(async () => {
	await db.state.clear();
	await db.backups.clear();
	localStorage.clear();
});

describe('movimientos y persistencia sin cambiar tablas', () => {
	it('actualizar conserva el estado antiguo y persiste conciliación, respaldo e idempotencia', async () => {
		const original = initial();
		await db.state.put({
			id: 'main',
			session: original,
			catalog: original.products,
			theme: 'light',
			lastSavedAt: at('12:10:01')
		});
		const oldRecord = await db.state.get('main');
		const loaded = await loadInventoryState();
		expect(loaded.session.operations).toEqual(original.operations);
		expect(await db.state.get('main')).toEqual(oldRecord);
		const configured = { ...loaded.session, inventoryTimeZone: zone };
		const candidates = readMovementWorkbook(book(), 'sale', zone).rows;
		const next = confirmMovementImport(configured, candidates);
		await saveInventoryState(
			{ ...loaded, session: next, catalog: next.products },
			true,
			loaded.revision ?? 0
		);
		db.close();
		await db.open();
		const restored = await loadInventoryState();
		expect(restored.catalog[0].physical).toBe(7);
		expect(restored.session.operations).toEqual(original.operations);
		expect(restored.session.importedMovements).toEqual(next.importedMovements);
		expect(restored.session.reconciliationLog).toEqual(next.reconciliationLog);
		expect((await loadLatestBackup())?.session.operations).toEqual(original.operations);
		const backup = validateBackup(
			JSON.parse(JSON.stringify(createInventoryExport(restored.catalog, restored.session)))
		);
		expect(backup.value?.session.importedMovements).toEqual(next.importedMovements);
		expect(confirmMovementImport(restored.session, candidates).products[0].physical).toBe(7);
		expect(db.verno).toBe(1);
		expect(db.tables.map((table) => table.name).sort()).toEqual(['backups', 'state']);
	});
	it('rechaza una escritura de una pestaña atrasada y no crea respaldo parcial', async () => {
		await seed();
		const stale = await loadInventoryState();
		await saveInventoryState(stale, false, stale.revision ?? 0);
		await expect(saveInventoryState(stale, true, stale.revision ?? 0)).rejects.toThrow(
			/otra pestaña/
		);
		expect(await db.backups.count()).toBe(0);
		expect((await loadInventoryState()).catalog[0].physical).toBe(10);
	});
	it('una falla revierte juntos movimientos, cantidades, auditoría y respaldo', async () => {
		await seed();
		const original = await loadInventoryState();
		const session = { ...original.session, inventoryTimeZone: zone };
		const next = confirmMovementImport(session, readMovementWorkbook(book(), 'sale', zone).rows);
		const fail = () => {
			throw new Error('sin espacio');
		};
		db.state.hook('updating', fail);
		try {
			await expect(
				saveInventoryState(
					{ ...original, session: next, catalog: next.products },
					true,
					original.revision
				)
			).rejects.toThrow('sin espacio');
		} finally {
			db.state.hook('updating').unsubscribe(fail);
		}
		expect(await loadInventoryState()).toEqual(original);
		expect(await db.backups.count()).toBe(0);
	});
	it('interfaz obliga a revisar ventas, detecta duplicados y confirma reingreso de créditos', async () => {
		await seed();
		render(App);
		await page.getByRole('button', { name: 'Movimientos', exact: true }).click();
		await page.getByRole('combobox', { name: 'Zona horaria del inventario' }).fill(zone);
		await page.getByRole('button', { name: 'Confirmar zona horaria', exact: true }).click();
		await expect
			.element(page.getByText(`Zona del inventario: ${zone}`, { exact: true }))
			.toBeVisible();
		upload();
		const preview = page.getByRole('region', { name: 'Vista previa de movimientos' });
		await expect.element(preview).toHaveTextContent('Resultado: 7');
		expect((await loadInventoryState()).catalog[0].physical).toBe(10);
		await preview.getByRole('button', { name: 'Confirmar importación', exact: true }).click();
		await expect.element(page.getByRole('status')).toHaveTextContent('Movimientos guardados');
		expect((await loadInventoryState()).catalog[0].physical).toBe(7);
		upload();
		await expect.element(preview).toHaveTextContent('Duplicado');
		await preview.getByRole('button', { name: 'Confirmar importación', exact: true }).click();
		await expect.element(page.getByRole('status')).toHaveTextContent('Movimientos guardados');
		expect((await loadInventoryState()).session.importedMovements).toHaveLength(1);
		upload('credit');
		await expect.element(preview).toHaveTextContent('Falta confirmar');
		await preview
			.getByRole('combobox', { name: 'Reingreso físico 00019 00001' })
			.selectOptions('confirmed');
		await expect.element(preview).toHaveTextContent('Resultado: 9');
		expect((await loadInventoryState()).catalog[0].physical).toBe(7);
		await preview.getByRole('button', { name: 'Confirmar importación', exact: true }).click();
		await expect.element(page.getByRole('status')).toHaveTextContent('Movimientos guardados');
		const result = await loadInventoryState();
		expect(result.catalog[0].physical).toBe(9);
		expect(
			result.session.importedMovements?.find((m) => m.id === movementId('credit', '00019', '00001'))
				?.returnDecision
		).toBe('confirmed');
	}, 45000);
});
