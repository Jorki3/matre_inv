import { beforeEach, describe, expect, it } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import App from '../routes/+page.svelte';
import { db, loadInventoryState, saveInventoryState, loadLatestBackup } from './database';
import {
	countInSession,
	createSession,
	createInventoryExport,
	validateBackup,
	type InventorySession
} from './inventory';
import { confirmInventoryMerge } from './inventory-merge';

const at = (hour: number) => `2026-11-11T${hour}:00:00.000Z`;
function base(): InventorySession {
	return {
		...createSession(),
		status: 'active',
		products: [
			{ id: 'p', key: 'A', name: 'Producto A', expected: 10, physical: 0, createdAt: at(8) }
		]
	};
}
async function seed(session = countInSession(base(), 'p', 10, 'recount', at(10))) {
	await saveInventoryState({
		id: 'main',
		session,
		catalog: session.products,
		theme: 'light',
		lastSavedAt: at(10)
	});
}
function upload(snapshot: unknown) {
	const input = document.querySelector(
		'input[aria-label="Fusionar inventarios JSON"]'
	) as HTMLInputElement;
	const transfer = new DataTransfer();
	transfer.items.add(
		new File([JSON.stringify(snapshot)], 'otro-dispositivo.json', { type: 'application/json' })
	);
	input.files = transfer.files;
	input.dispatchEvent(new Event('change', { bubbles: true }));
}
beforeEach(async () => {
	await db.state.clear();
	await db.backups.clear();
	localStorage.clear();
});

describe('navegación, captura y fusión persistente', () => {
	it('cuatro opciones, herramientas reubicadas, temas y enfoque de la cantidad', async () => {
		await seed();
		render(App);
		expect(
			[...document.querySelectorAll('nav[aria-label="Principal"] button')].map((node) =>
				node.textContent?.trim()
			)
		).toEqual(['Inicio', 'Inventario', 'Movimientos', 'Configuración']);
		await page.getByRole('button', { name: 'Configuración', exact: true }).click();
		await page.getByRole('button', { name: 'Oscuro', exact: true }).click();
		expect(document.documentElement.dataset.theme).toBe('dark');
		await page.getByRole('button', { name: 'Claro', exact: true }).click();
		expect(document.documentElement.dataset.theme).toBe('light');
		await page.getByRole('button', { name: 'Productos', exact: true }).click();
		await expect
			.element(page.getByRole('heading', { name: 'Importación y catálogo' }))
			.toBeVisible();
		await page.getByRole('button', { name: 'Respaldos', exact: true }).click();
		await expect.element(page.getByRole('region', { name: 'Fusionar inventarios' })).toBeVisible();
		await page.getByRole('button', { name: 'Datos', exact: true }).click();
		await expect.element(page.getByRole('button', { name: 'Reiniciar conteo' })).toBeVisible();
		await page.getByRole('button', { name: 'Inventario', exact: true }).click();
		await page.getByTestId('product-card').getByRole('button').first().click();
		await expect
			.poll(() => document.activeElement?.getAttribute('aria-label'))
			.toBe('Cantidad física');
		expect((await loadInventoryState()).catalog[0].physical).toBe(10);
		await page.getByRole('button', { name: 'Artículos no encontrados', exact: true }).click();
		await expect
			.element(page.getByRole('button', { name: 'Registrar artículo no encontrado', exact: true }))
			.toBeVisible();
	}, 45000);
	it('vista previa sin cambios, conflicto persistente y resolución mediante recuento', async () => {
		const original = base();
		const local = countInSession(original, 'p', 30, 'recount', at(10));
		const donor = countInSession(original, 'p', 25, 'recount', at(11));
		await seed(local);
		render(App);
		await page.getByRole('button', { name: 'Configuración', exact: true }).click();
		await page.getByRole('button', { name: 'Respaldos', exact: true }).click();
		upload(createInventoryExport(donor.products, donor, [], [], 'other-device'));
		const preview = page.getByRole('region', { name: 'Vista previa de fusión' });
		await expect.element(preview).toHaveTextContent('1 en conflicto');
		expect((await loadInventoryState()).session.mergeConflicts).toBeUndefined();
		await page.getByRole('button', { name: 'Confirmar fusión', exact: true }).click();
		await expect.element(page.getByRole('status')).toHaveTextContent('Fusión guardada');
		db.close();
		await db.open();
		const saved = await loadInventoryState();
		expect(saved.catalog[0].physical).toBe(30);
		expect(saved.catalog[0].mergeConflictId).toBeTruthy();
		expect(saved.session.mergeConflicts?.[0].status).toBe('pending');
		expect(saved.session.operations).toHaveLength(2);
		expect((await loadLatestBackup())?.session.operations).toEqual(local.operations);
		const backup = createInventoryExport(saved.catalog, saved.session);
		expect(
			validateBackup(JSON.parse(JSON.stringify(backup))).value?.session.mergeConflicts
		).toEqual(saved.session.mergeConflicts);
		await page.getByRole('button', { name: 'Inventario', exact: true }).click();
		await page.getByTestId('product-card').getByRole('button').first().click();
		await expect.element(page.getByRole('button', { name: 'Sumar (+)' })).toBeDisabled();
		await page.getByRole('spinbutton', { name: 'Cantidad física', exact: true }).fill('27');
		await page.getByRole('button', { name: 'Confirmar operación', exact: true }).click();
		await expect.element(page.getByRole('status')).toHaveTextContent('27 unidades guardadas');
		const resolved = await loadInventoryState();
		expect(resolved.session.mergeConflicts?.[0].status).toBe('resolved');
		expect(resolved.catalog[0].mergeConflictId).toBeUndefined();
		expect(resolved.session.operations).toHaveLength(3);
		expect(resolved.session.mergeSources).toHaveLength(1);
	}, 45000);
	it('falla de almacenamiento revierte una fusión junto con su copia previa', async () => {
		const original = base();
		await seed(original);
		const state = await loadInventoryState();
		const donor = countInSession(original, 'p', 25, 'recount', at(11));
		const current = createInventoryExport(state.catalog, state.session);
		const merged = confirmInventoryMerge(
			current,
			[{ filename: 'donor.json', snapshot: createInventoryExport(donor.products, donor) }],
			'local'
		);
		const fail = () => {
			throw new Error('sin espacio');
		};
		db.state.hook('updating', fail);
		try {
			await expect(
				saveInventoryState(
					{ ...state, session: merged.session, catalog: merged.catalog },
					true,
					state.revision
				)
			).rejects.toThrow('sin espacio');
		} finally {
			db.state.hook('updating').unsubscribe(fail);
		}
		expect((await loadInventoryState()).session).toEqual(state.session);
		expect(await db.backups.count()).toBe(0);
		expect(db.verno).toBe(1);
	});
});
