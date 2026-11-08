import { beforeEach, describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import App from '../routes/+page.svelte';
import * as XLSX from 'xlsx';
import { db, loadInventoryState, loadLatestBackup, saveInventoryState } from './database';
import {
	applyPhysicalCount,
	countInSession,
	createInventoryExport,
	createSeedCatalog,
	createSession,
	transitionSession
} from './inventory';

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

async function mountCounted(status: 'paused' | 'completed') {
	const catalog = createSeedCatalog().slice(0, 2);
	const session = transitionSession(
		countInSession(
			transitionSession({ ...createSession(), products: catalog }, 'active'),
			catalog[0].id,
			0
		),
		status
	);
	await saveInventoryState({
		id: 'main',
		session,
		catalog: session.products,
		theme: 'light',
		lastSavedAt: new Date().toISOString()
	});
	render(App);
	await page.getByRole('button', { name: 'Inventario', exact: true }).click();
	await expect
		.element(page.getByTestId('session-status'))
		.toHaveTextContent(status === 'completed' ? 'Finalizado' : 'Pausado');
	return session;
}

function uploadBackup(value: unknown) {
	const input = document.querySelector<HTMLInputElement>(
		'input[aria-label="Importar respaldo JSON"]'
	)!;
	const transfer = new DataTransfer();
	transfer.items.add(
		new File([JSON.stringify(value)], 'MATRE_Inventario.json', { type: 'application/json' })
	);
	input.files = transfer.files;
	input.dispatchEvent(new Event('change', { bubbles: true }));
}

describe('safe session administration and JSON restore', () => {
	it('requires confirmation to create a new session and retains the completed inventory in history', async () => {
		const previous = await mountCounted('completed');
		await page.getByRole('button', { name: 'Nuevo inventario', exact: true }).click();
		const dialog = page.getByRole('dialog');
		await expect
			.element(dialog.getByRole('button', { name: 'Crear nuevo inventario', exact: true }))
			.toBeDisabled();
		await expect
			.element(dialog.getByRole('button', { name: 'Descargar respaldo actual JSON' }))
			.toBeVisible();
		await dialog.getByRole('button', { name: 'Cancelar', exact: true }).click();
		expect((await loadInventoryState()).session.id).toBe(previous.id);
		await page.getByRole('button', { name: 'Nuevo inventario', exact: true }).click();
		await dialog.getByRole('checkbox').click();
		await dialog.getByRole('button', { name: 'Crear nuevo inventario', exact: true }).click();
		await expect.element(page.getByRole('button', { name: 'Comenzar', exact: true })).toBeEnabled();
		const next = await loadInventoryState();
		expect(next.session.id).not.toBe(previous.id);
		expect(next.session.status).toBe('not_started');
		expect(next.session.startedAt).toBeUndefined();
		expect(next.catalog).toHaveLength(2);
		expect(next.catalog.map((product) => product.key)).toEqual(
			previous.products.map((product) => product.key)
		);
		expect(next.catalog.every((product) => !product.countedAt)).toBe(true);
		const history = await loadLatestBackup();
		expect(history?.session.id).toBe(previous.id);
		expect(history?.catalog[0].physical).toBe(0);
		expect(history?.catalog[0].countedAt).toBeTruthy();
		db.close();
		await db.open();
		expect((await loadInventoryState()).session.status).toBe('not_started');
	});

	it('resets the current session only after confirmation and keeps every older backup', async () => {
		const previous = await mountCounted('paused');
		await db.backups.put(createInventoryExport(previous.products, previous));
		await page.getByRole('button', { name: 'Configuración', exact: true }).click();
		await page.getByRole('button', { name: 'Reiniciar conteo', exact: true }).click();
		const dialog = page.getByRole('dialog');
		await dialog.getByRole('button', { name: 'Cancelar', exact: true }).click();
		expect((await loadInventoryState()).catalog[0].countedAt).toBeTruthy();
		await page.getByRole('button', { name: 'Reiniciar conteo', exact: true }).click();
		await dialog.getByRole('checkbox').click();
		await dialog.getByRole('button', { name: 'Confirmar reinicio', exact: true }).click();
		await expect.element(page.getByRole('button', { name: 'Comenzar', exact: true })).toBeEnabled();
		const reset = await loadInventoryState();
		expect(reset.session.id).toBe(previous.id);
		expect(reset.catalog).toHaveLength(2);
		expect(reset.session.startedAt).toBeUndefined();
		expect(reset.catalog.every((product) => !product.countedAt && product.physical === 0)).toBe(
			true
		);
		expect(await db.backups.count()).toBe(2);
	});

	it('keeps original counts and shows the storage error inside the confirmation dialog', async () => {
		const original = await mountCounted('paused');
		await page.getByRole('button', { name: 'Configuración', exact: true }).click();
		await page.getByRole('button', { name: 'Reiniciar conteo', exact: true }).click();
		const dialog = page.getByRole('dialog');
		await dialog.getByRole('checkbox').click();
		const rejectWrite = () => {
			throw new Error('almacenamiento no disponible');
		};
		db.state.hook('updating', rejectWrite);
		try {
			await dialog.getByRole('button', { name: 'Confirmar reinicio', exact: true }).click();
			await expect
				.element(dialog.getByRole('alert'))
				.toHaveTextContent('almacenamiento no disponible');
		} finally {
			db.state.hook('updating').unsubscribe(rejectWrite);
		}
		expect((await loadInventoryState()).catalog[0].countedAt).toBe(original.products[0].countedAt);
		expect(await db.backups.count()).toBe(0);
		await dialog.getByRole('button', { name: 'Cancelar', exact: true }).click();
	});

	it('rejects invalid JSON and previews a valid legacy backup before replacing existing data', async () => {
		const original = await mountCounted('completed');
		await page.getByRole('button', { name: 'Respaldo', exact: true }).click();
		uploadBackup({ version: 99 });
		await expect.element(page.getByRole('status')).toHaveTextContent('No se pudo restaurar');
		expect((await loadInventoryState()).session.id).toBe(original.id);
		const incoming = {
			...createInventoryExport(original.products, {
				...original,
				id: 'other-device',
				status: 'paused',
				finishedAt: undefined
			}),
			version: 1
		};
		uploadBackup(incoming);
		const dialog = page.getByRole('dialog');
		await expect
			.element(page.getByTestId('backup-preview'))
			.toHaveTextContent('Productos: 2 · Contados: 1 · Pendientes: 1');
		await expect.element(dialog).toHaveTextContent('Se reemplazarán los datos locales');
		expect((await loadInventoryState()).session.id).toBe(original.id);
		await dialog.getByRole('button', { name: 'Cancelar', exact: true }).click();
		expect((await loadInventoryState()).session.id).toBe(original.id);
		uploadBackup(incoming);
		await dialog.getByRole('checkbox').click();
		await dialog.getByRole('button', { name: 'Confirmar restauración', exact: true }).click();
		await expect.element(page.getByRole('status')).toHaveTextContent('restaurado con sus conteos');
		const restored = await loadInventoryState();
		expect(restored.session.id).toBe('other-device');
		expect(restored.catalog[0].physical).toBe(0);
		expect(restored.catalog[0].countedAt).toBeTruthy();
		expect((await loadLatestBackup())?.session.id).toBe(original.id);
	});

	it('restores 500 counts from 2401 products into an empty database and persists extra work', async () => {
		const template = createSeedCatalog()[0];
		const catalog = Array.from({ length: 2401 }, (_, index) => {
			const product = {
				...template,
				id: `P-${index}`,
				key: `KEY-${index}`,
				alternateKey: `ALT-${index}`
			};
			return index < 500 ? applyPhysicalCount(product, index % 30) : product;
		});
		const session = transitionSession({ ...createSession(), products: catalog }, 'active');
		const movements = [
			{
				id: 'move',
				productId: catalog[0].id,
				productName: catalog[0].name,
				type: 'adjustment' as const,
				quantity: 1,
				occurredAt: new Date().toISOString()
			}
		];
		const backup = createInventoryExport(session.products, session, movements);
		render(App);
		await page.getByRole('button', { name: 'Inventario', exact: true }).click();
		await expect.element(page.getByRole('button', { name: 'Comenzar', exact: true })).toBeEnabled();
		await page.getByRole('button', { name: 'Configuración', exact: true }).click();
		uploadBackup(backup);
		const dialog = page.getByRole('dialog');
		await expect.element(dialog).toHaveTextContent('No hay productos ni conteos locales');
		await dialog.getByRole('checkbox').click();
		await dialog.getByRole('button', { name: 'Confirmar restauración', exact: true }).click();
		await expect.element(page.getByRole('status')).toHaveTextContent('restaurado con sus conteos');
		db.close();
		await db.open();
		const restored = await loadInventoryState();
		expect(restored.session.status).toBe('active');
		expect(restored.session.startedAt).toBe(session.startedAt);
		expect(restored.catalog).toHaveLength(2401);
		expect(restored.catalog).toMatchObject(backup.catalog);
		expect(restored.catalog.filter((product) => product.countedAt)).toHaveLength(500);
		expect(restored.movements).toEqual(movements);
	});
});

describe('catalog updates in IndexedDB', () => {
	it('previews Excel fields, asks for consent and preserves counts and session after an update and reload', async () => {
		const original = {
			id: 'real-1',
			key: '00001',
			alternateKey: 'ALT-OLD',
			name: 'Artículo anterior',
			expected: 20,
			physical: 0,
			createdAt: '2026-01-01T00:00:00Z',
			source: 'importado'
		};
		const missing = {
			...original,
			id: 'real-2',
			key: '00002',
			name: 'Conservar aunque no venga en archivo'
		};
		const counted = transitionSession(
			countInSession(
				transitionSession({ ...createSession(), products: [original, missing] }, 'active'),
				original.id,
				0
			),
			'paused'
		);
		await saveInventoryState({
			id: 'main',
			session: counted,
			catalog: counted.products,
			theme: 'light',
			lastSavedAt: new Date().toISOString()
		});
		render(App);
		await page.getByRole('button', { name: 'Inventario', exact: true }).click();
		await expect.element(page.getByTestId('session-status')).toHaveTextContent('Pausado');
		await page.getByRole('button', { name: 'Productos', exact: true }).click();
		const book = XLSX.utils.book_new();
		XLSX.utils.book_append_sheet(
			book,
			XLSX.utils.aoa_to_sheet([
				[
					'Clave',
					'Clave alterna',
					'Producto',
					'Existencia actual',
					'Departamento',
					'Unidad de medida'
				],
				['00001', 'ALT-NEW', 'Actualizado', 0, 'Herramientas', 'Pieza'],
				['00003', 'ALT-3', 'Nuevo', 7, 'Herramientas', 'Caja']
			]),
			'Catálogo'
		);
		const transfer = new DataTransfer();
		transfer.items.add(
			new File([XLSX.write(book, { type: 'array', bookType: 'xlsx' })], 'catalogo.xlsx')
		);
		const input = document.querySelector<HTMLInputElement>(
			'input[aria-label="Importar catálogo"]'
		)!;
		input.files = transfer.files;
		input.dispatchEvent(new Event('change', { bubbles: true }));
		await expect
			.element(page.getByTestId('import-summary'))
			.toHaveTextContent('1 válidos · 1 duplicados');
		await page.getByRole('combobox', { name: 'Destino del catálogo' }).selectOptions('update');
		await expect
			.element(page.getByTestId('import-summary'))
			.toHaveTextContent('2 válidos · 0 duplicados');
		const consent = vi.spyOn(window, 'confirm').mockReturnValue(false);
		try {
			await page.getByRole('button', { name: 'Confirmar importación', exact: true }).click();
			expect((await loadInventoryState()).catalog[0].name).toBe(original.name);
			consent.mockReturnValue(true);
			await page.getByRole('button', { name: 'Confirmar importación', exact: true }).click();
			await expect
				.element(page.getByRole('status'))
				.toHaveTextContent('1 productos nuevos y 1 actualizados. Conteos conservados.');
		} finally {
			consent.mockRestore();
		}
		db.close();
		await db.open();
		const saved = await loadInventoryState();
		expect(saved.session.id).toBe(counted.id);
		expect(saved.session.status).toBe('paused');
		expect(saved.catalog).toHaveLength(3);
		expect(saved.catalog[0]).toMatchObject({
			id: original.id,
			key: '00001',
			alternateKey: 'ALT-NEW',
			name: 'Actualizado',
			expected: 0,
			physical: 0,
			countedAt: counted.products[0].countedAt,
			category: 'Herramientas',
			unit: 'Pieza'
		});
		expect(saved.catalog[1].key).toBe('00002');
		expect((await loadLatestBackup())?.catalog[0].name).toBe(original.name);
	});

	it('requires replacement of a demonstration catalog and does not silently append real products', async () => {
		const demo = createSeedCatalog();
		await saveInventoryState({
			id: 'main',
			session: { ...createSession(), products: demo },
			catalog: demo,
			theme: 'light',
			lastSavedAt: new Date().toISOString()
		});
		render(App);
		await page.getByRole('button', { name: 'Inventario', exact: true }).click();
		await expect.element(page.getByRole('button', { name: 'Comenzar', exact: true })).toBeEnabled();
		await page.getByRole('button', { name: 'Productos', exact: true }).click();
		const transfer = new DataTransfer();
		transfer.items.add(new File(['Clave,Producto,Existencia actual\n00001,Real,0'], 'real.csv'));
		const input = document.querySelector<HTMLInputElement>(
			'input[aria-label="Importar catálogo"]'
		)!;
		input.files = transfer.files;
		input.dispatchEvent(new Event('change', { bubbles: true }));
		await expect.element(page.getByTestId('import-summary')).toHaveTextContent('1 válidos');
		await expect
			.element(page.getByRole('combobox', { name: 'Destino del catálogo' }))
			.toHaveValue('replace');
		const confirmation = vi.spyOn(window, 'confirm').mockReturnValue(false);
		try {
			await page.getByRole('button', { name: 'Confirmar importación', exact: true }).click();
			expect((await loadInventoryState()).catalog).toHaveLength(12);
			confirmation.mockReturnValue(true);
			await page.getByRole('button', { name: 'Confirmar importación', exact: true }).click();
			await expect.element(page.getByRole('status')).toHaveTextContent('1 productos importados');
		} finally {
			confirmation.mockRestore();
		}
		expect((await loadInventoryState()).catalog.map((product) => product.key)).toEqual(['00001']);
		expect((await loadLatestBackup())?.catalog).toHaveLength(12);
	});
});

async function mountUnmatchedSession() {
	const products = [{ ...createSeedCatalog()[0], id: 'official-1', source: 'importado' }];
	const session = transitionSession({ ...createSession(), products }, 'active');
	await saveInventoryState({
		id: 'main',
		session,
		catalog: products,
		theme: 'light',
		lastSavedAt: new Date().toISOString()
	});
	render(App);
	await page.getByRole('button', { name: 'Inventario', exact: true }).click();
	await expect.element(page.getByTestId('session-status')).toHaveTextContent('En curso');
	return session;
}

describe('unmatched article UI and persistence', () => {
	it('prefills a failed search, saves decimals without keys, edits, reviews and persists without affecting official counts', async () => {
		const session = await mountUnmatchedSession();
		await page.getByRole('textbox', { name: 'Buscar productos' }).fill('Tornillo sin catálogo');
		await page
			.getByRole('button', { name: 'Registrar artículo no encontrado', exact: true })
			.click();
		await expect
			.element(page.getByRole('textbox', { name: 'Descripción del producto', exact: true }))
			.toHaveValue('Tornillo sin catálogo');
		await page
			.getByRole('spinbutton', { name: 'Cantidad física encontrada', exact: true })
			.fill('1.25');
		await page.getByRole('button', { name: 'Guardar artículo', exact: true }).click();
		await expect
			.element(page.getByRole('status'))
			.toHaveTextContent('Artículo no encontrado guardado');
		await expect.element(page.getByTestId('unmatched-card')).toHaveTextContent('1.25');
		const first = await loadInventoryState();
		expect(first.catalog[0].countedAt).toBeUndefined();
		expect(first.unmatchedArticles?.[0].key).toBe('');
		await page
			.getByTestId('unmatched-card')
			.getByRole('button', { name: 'Editar', exact: true })
			.click();
		await page
			.getByRole('spinbutton', { name: 'Cantidad física encontrada', exact: true })
			.fill('0');
		await page
			.getByRole('combobox', { name: 'Estado de revisión', exact: true })
			.selectOptions('identified');
		await page
			.getByRole('combobox', { name: 'Clave principal relacionada', exact: true })
			.fill(session.products[0].key);
		await page.getByRole('button', { name: 'Guardar artículo', exact: true }).click();
		await expect
			.element(page.getByTestId('unmatched-card'))
			.toHaveTextContent('Identificado en catálogo');
		db.close();
		await db.open();
		const saved = await loadInventoryState();
		expect(saved.unmatchedArticles?.[0]).toMatchObject({
			quantity: 0,
			linkedProductKey: session.products[0].key,
			reviewStatus: 'identified'
		});
		expect(saved.catalog[0].countedAt).toBeUndefined();
		expect(saved.session.status).toBe('active');
		const consent = vi.spyOn(window, 'confirm').mockReturnValue(false);
		try {
			await page
				.getByTestId('unmatched-card')
				.getByRole('button', { name: 'Eliminar', exact: true })
				.click();
			expect((await loadInventoryState()).unmatchedArticles).toHaveLength(1);
			consent.mockReturnValue(true);
			await page
				.getByTestId('unmatched-card')
				.getByRole('button', { name: 'Eliminar', exact: true })
				.click();
			await expect.element(page.getByRole('status')).toHaveTextContent('Hallazgo eliminado');
		} finally {
			consent.mockRestore();
		}
		expect((await loadInventoryState()).unmatchedArticles).toHaveLength(0);
		expect((await loadLatestBackup())?.unmatchedArticles).toHaveLength(1);
	});

	it('keeps findings on count reset and new inventory, and restores their JSON independently of the official catalog', async () => {
		const session = await mountUnmatchedSession();
		await page
			.getByRole('button', { name: 'Registrar artículo no encontrado', exact: true })
			.click();
		await page
			.getByRole('textbox', { name: 'Descripción del producto', exact: true })
			.fill('Artículo especial');
		await page
			.getByRole('spinbutton', { name: 'Cantidad física encontrada', exact: true })
			.fill('2.5');
		await page.getByRole('button', { name: 'Guardar artículo', exact: true }).click();
		await expect.element(page.getByRole('status')).toHaveTextContent('guardado');
		const state = await loadInventoryState();
		const backup = createInventoryExport(
			state.catalog,
			state.session,
			state.movements,
			state.unmatchedArticles
		);
		await page.getByRole('button', { name: 'Configuración', exact: true }).click();
		await page.getByRole('button', { name: 'Reiniciar conteo', exact: true }).click();
		await page.getByRole('dialog').getByRole('checkbox').click();
		await page
			.getByRole('dialog')
			.getByRole('button', { name: 'Confirmar reinicio', exact: true })
			.click();
		await expect.element(page.getByRole('button', { name: 'Comenzar', exact: true })).toBeEnabled();
		expect((await loadInventoryState()).unmatchedArticles).toHaveLength(1);
		await page.getByRole('button', { name: 'Comenzar', exact: true }).click();
		await expect.element(page.getByTestId('session-status')).toHaveTextContent('En curso');
		const consent = vi.spyOn(window, 'confirm').mockReturnValue(true);
		try {
			await page.getByRole('button', { name: 'Finalizar', exact: true }).click();
			await expect.element(page.getByTestId('session-status')).toHaveTextContent('Finalizado');
		} finally {
			consent.mockRestore();
		}
		await page.getByRole('button', { name: 'Artículos no encontrados', exact: true }).click();
		await expect.element(page.getByTestId('unmatched-card')).toHaveTextContent('Artículo especial');
		await expect
			.element(page.getByRole('button', { name: 'Registrar artículo no encontrado', exact: true }))
			.toBeDisabled();
		await page.getByRole('button', { name: 'Inventario', exact: true }).click();
		await page.getByRole('button', { name: 'Nuevo inventario', exact: true }).click();
		await page.getByRole('dialog').getByRole('checkbox').click();
		await page
			.getByRole('dialog')
			.getByRole('button', { name: 'Crear nuevo inventario', exact: true })
			.click();
		await expect.element(page.getByRole('button', { name: 'Comenzar', exact: true })).toBeEnabled();
		const next = await loadInventoryState();
		expect(next.session.id).not.toBe(session.id);
		expect(next.unmatchedArticles).toHaveLength(1);
		await page.getByRole('button', { name: 'Artículos no encontrados', exact: true }).click();
		await expect
			.element(page.getByText('0 registros de esta sesión', { exact: false }))
			.toBeVisible();
		await page
			.getByRole('combobox', { name: 'Sesión de los hallazgos', exact: true })
			.selectOptions(session.id);
		await expect.element(page.getByTestId('unmatched-card')).toHaveTextContent('Artículo especial');
		await page.getByRole('button', { name: 'Respaldo', exact: true }).click();
		uploadBackup(backup);
		await page.getByRole('dialog').getByRole('checkbox').click();
		await page
			.getByRole('dialog')
			.getByRole('button', { name: 'Confirmar restauración', exact: true })
			.click();
		await expect.element(page.getByRole('status')).toHaveTextContent('restaurado');
		const restored = await loadInventoryState();
		expect(restored.unmatchedArticles).toEqual(state.unmatchedArticles);
		expect(restored.session.id).toBe(session.id);
	});
});
