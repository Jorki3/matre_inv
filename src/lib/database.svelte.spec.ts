import { beforeEach, describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import App from '../routes/+page.svelte';
import { db, loadInventoryState, loadLatestBackup, saveInventoryState } from './database';
import { countInSession, createSeedCatalog, createSession, transitionSession } from './inventory';

beforeEach(async () => {
	await db.state.clear();
	await db.backups.clear();
	localStorage.clear();
});

describe('IndexedDB and mobile counting', () => {
	it('persists zero counts and every session state through a database close and reopen', async () => {
		let session = { ...createSession(), products: createSeedCatalog() };
		for (const status of ['not_started', 'active', 'paused', 'active', 'completed'] as const) {
			if (status !== 'not_started') session = transitionSession(session, status);
			if (status === 'active') session = countInSession(session, session.products[0].id, 0);
			await saveInventoryState({
				id: 'main',
				session,
				catalog: session.products,
				theme: 'dark',
				lastSavedAt: new Date().toISOString()
			});
			db.close();
			await db.open();
			const restored = await loadInventoryState();
			expect(restored.session.status).toBe(status);
			expect(restored.session.startedAt).toBe(session.startedAt);
			if (status !== 'not_started') {
				expect(restored.catalog[0].physical).toBe(0);
				expect(restored.catalog[0].countedAt).toBeTruthy();
			}
		}
	});

	it('migrates existing data without deleting it and archives the old counts before replacement', async () => {
		const product = {
			...createSeedCatalog()[0],
			barcode: 'OLD-1',
			physical: 0,
			countedAt: '2025-01-01T00:00:00Z'
		};
		const session = {
			...createSession(),
			products: [product],
			status: 'paused' as const,
			startedAt: '2024-01-01T00:00:00Z'
		};
		await db.state.put({
			id: 'main',
			session,
			catalog: [product],
			theme: 'light',
			lastSavedAt: '2025-01-01T00:00:00Z'
		});
		const migrated = await loadInventoryState();
		expect(migrated.catalog[0].alternateKey).toBe('OLD-1');
		expect((await db.state.get('main'))?.catalog[0].barcode).toBe('OLD-1');
		await saveInventoryState({ ...migrated, session: createSession(), catalog: [] }, true);
		const backup = await loadLatestBackup();
		expect(backup?.catalog[0].countedAt).toBe('2025-01-01T00:00:00Z');
		expect(backup?.session.status).toBe('paused');
	});

	it('rolls back both the archive and state when storage rejects a replacement', async () => {
		const original = {
			id: 'main',
			session: createSession(),
			catalog: [],
			theme: 'light' as const,
			lastSavedAt: new Date().toISOString()
		};
		await saveInventoryState(original);
		const failWrite = () => {
			throw new Error('simulated storage failure');
		};
		db.state.hook('updating', failWrite);
		try {
			await expect(
				saveInventoryState(
					{ ...original, session: transitionSession(original.session, 'active') },
					true
				)
			).rejects.toThrow('simulated storage failure');
		} finally {
			db.state.hook('updating').unsubscribe(failWrite);
		}
		expect((await db.state.get('main'))?.session.status).toBe('not_started');
		expect(await db.backups.count()).toBe(0);
	});

	it('does not seed demonstration products or auto-start an empty installation', async () => {
		render(App);
		await page.getByRole('button', { name: 'Inventario', exact: true }).click();
		await expect.element(page.getByRole('button', { name: 'Comenzar', exact: true })).toBeEnabled();
		await expect.element(page.getByTestId('session-status')).toHaveTextContent('Sin iniciar');
		expect((await loadInventoryState()).catalog).toHaveLength(0);
	});

	it('previews an uploaded CSV and reports the imported batch after reactive state changes', async () => {
		render(App);
		await page.getByRole('button', { name: 'Inventario', exact: true }).click();
		await expect.element(page.getByRole('button', { name: 'Comenzar', exact: true })).toBeEnabled();
		await page.getByRole('button', { name: 'Productos', exact: true }).click();
		const input = document.querySelector<HTMLInputElement>(
			'input[aria-label="Importar catálogo"]'
		)!;
		const transfer = new DataTransfer();
		transfer.items.add(
			new File(
				[
					'Clave,Clave alterna,Descripción,Existencia SICAR\n0001,ALT-1,Martillo,20\n0002,ALT-2,Lija,0'
				],
				'catalogo.csv',
				{ type: 'text/csv' }
			)
		);
		input.files = transfer.files;
		input.dispatchEvent(new Event('change', { bubbles: true }));
		await expect.element(page.getByTestId('import-summary')).toHaveTextContent('2 válidos');
		expect((await loadInventoryState()).catalog).toHaveLength(0);
		await page.getByRole('button', { name: 'Confirmar importación', exact: true }).click();
		await expect
			.element(page.getByRole('status'))
			.toHaveTextContent('2 productos importados. 0 duplicados omitidos.');
		const saved = await loadInventoryState();
		expect(saved.catalog.map((product) => product.key)).toEqual(['0001', '0002']);
		expect(saved.session.status).toBe('not_started');
	});

	it('edits zero in the expanded card, retains search/filter, and locks paused and finalized capture', async () => {
		const product = { ...createSeedCatalog()[0], alternateKey: 'ALT-001' };
		await saveInventoryState({
			id: 'main',
			session: { ...createSession(), products: [product] },
			catalog: [product],
			theme: 'light',
			lastSavedAt: new Date().toISOString()
		});
		render(App);
		await page.getByRole('button', { name: 'Inventario', exact: true }).click();
		await expect.element(page.getByRole('button', { name: 'Comenzar', exact: true })).toBeEnabled();
		await page.getByTestId('product-card').getByRole('button').click();
		await expect.element(page.getByRole('spinbutton', { name: 'Cantidad física' })).toBeDisabled();
		await page.getByRole('button', { name: 'Comenzar', exact: true }).click();
		await expect.element(page.getByRole('spinbutton', { name: 'Cantidad física' })).toBeEnabled();
		await page.getByRole('textbox', { name: 'Buscar productos' }).fill('ALT-001');
		await page.getByRole('spinbutton', { name: 'Cantidad física' }).fill('0');
		await page.getByRole('button', { name: 'Guardar cantidad', exact: true }).click();
		await expect.element(page.getByRole('status')).toHaveTextContent('0 unidades guardadas');
		await page.getByRole('button', { name: 'Contados', exact: true }).click();
		await expect.element(page.getByTestId('product-card')).toHaveTextContent('Con diferencia');
		await page.getByRole('spinbutton', { name: 'Cantidad física' }).fill(String(product.expected));
		await page.getByRole('button', { name: 'Guardar cantidad', exact: true }).click();
		await expect
			.element(page.getByRole('status'))
			.toHaveTextContent(`${product.expected} unidades guardadas`);
		await expect
			.element(page.getByRole('textbox', { name: 'Buscar productos' }))
			.toHaveValue('ALT-001');
		await expect
			.element(page.getByRole('button', { name: 'Contados', exact: true }))
			.toHaveAttribute('aria-pressed', 'true');
		await page.getByRole('button', { name: 'Pausar', exact: true }).click();
		await expect.element(page.getByRole('spinbutton', { name: 'Cantidad física' })).toBeDisabled();
		expect((await loadInventoryState()).session.status).toBe('paused');
		await page.getByRole('button', { name: 'Reanudar', exact: true }).click();
		await expect.element(page.getByRole('spinbutton', { name: 'Cantidad física' })).toBeEnabled();
		const confirmation = vi.spyOn(window, 'confirm').mockReturnValue(false);
		await page.getByRole('button', { name: 'Finalizar', exact: true }).click();
		expect((await loadInventoryState()).session.status).toBe('active');
		confirmation.mockReturnValue(true);
		await page.getByRole('button', { name: 'Finalizar', exact: true }).click();
		await expect.element(page.getByTestId('session-status')).toHaveTextContent('Finalizado');
		await expect.element(page.getByRole('spinbutton', { name: 'Cantidad física' })).toBeDisabled();
		expect((await loadInventoryState()).session.finishedAt).toBeTruthy();
		confirmation.mockRestore();
	});
});
