import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { existsSync } from 'node:fs';
import * as XLSX from 'xlsx';
const url = process.argv[2] || 'http://127.0.0.1:4173/';
const browser = await chromium.launch({
	executablePath:
		process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ||
		(existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined)
});
const context = await browser.newContext({
	viewport: { width: 390, height: 844 },
	isMobile: true,
	hasTouch: true
});
const page = await context.newPage();
page.setDefaultTimeout(15000);
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('response', (r) => {
	if (r.status() >= 400) errors.push(`${r.status()} ${r.url()}`);
});
const nav = (name) =>
	page.getByRole('navigation').getByRole('button', { name, exact: true }).click();
try {
	await page.goto(url, { waitUntil: 'networkidle' });
	await nav('Inventario');
	await page.getByRole('button', { name: 'Comenzar', exact: true }).waitFor();
	assert.match(await page.getByTestId('session-status').innerText(), /Sin iniciar/);
	await nav('Productos');
	const catalogHeaders = [
		'Clave',
		'Clave alterna',
		'Producto',
		'Existencia actual',
		'Departamento',
		'Unidad de medida'
	];
	const catalogFile = (rows) => {
		const workbook = XLSX.utils.book_new();
		XLSX.utils.book_append_sheet(
			workbook,
			XLSX.utils.aoa_to_sheet([catalogHeaders, ...rows]),
			'Catálogo'
		);
		return {
			name: 'catalogo.xlsx',
			mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
			buffer: XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' })
		};
	};
	await page
		.getByLabel('Importar catálogo', { exact: true })
		.setInputFiles(
			catalogFile(
				Array.from({ length: 2401 }, (_, index) => [
					`K${String(index).padStart(5, '0')}`,
					`ALT${index}`,
					`Producto ${index}`,
					20,
					'Ferretería',
					'Pieza'
				])
			)
		);

	await page.getByTestId('import-summary').filter({ hasText: '2401 válidos' }).waitFor();
	await page.getByRole('button', { name: 'Confirmar importación', exact: true }).click();
	await page.getByRole('status').filter({ hasText: '2401 productos importados' }).waitFor();
	await nav('Inventario');
	await page.getByRole('button', { name: 'Comenzar', exact: true }).click();
	const search = page.getByRole('textbox', { name: 'Buscar productos' });
	await search.fill('ALT0');
	const card = page.getByTestId('product-card');
	await card.getByRole('button').click();
	await page.getByRole('spinbutton', { name: 'Cantidad física' }).fill('0');
	await page.getByRole('button', { name: 'Guardar cantidad', exact: true }).click();
	await page.getByRole('status').filter({ hasText: '0 unidades guardadas' }).waitFor();
	assert.equal(await search.inputValue(), 'ALT0');
	// Record and identify a physical finding without adding it to the official inventory.
	await search.fill('Pieza sin catálogo');
	await page.getByRole('button', { name: 'Registrar artículo no encontrado', exact: true }).click();
	assert.equal(
		await page.getByRole('textbox', { name: 'Descripción del producto', exact: true }).inputValue(),
		'Pieza sin catálogo'
	);
	await page
		.getByRole('spinbutton', { name: 'Cantidad física encontrada', exact: true })
		.fill('1.25');
	await page.getByRole('button', { name: 'Guardar artículo', exact: true }).click();
	await page.getByRole('status').filter({ hasText: 'Artículo no encontrado guardado' }).waitFor();
	await page
		.getByTestId('unmatched-card')
		.getByRole('button', { name: 'Editar', exact: true })
		.click();
	await page
		.getByRole('combobox', { name: 'Estado de revisión', exact: true })
		.selectOption('identified');
	await page
		.getByRole('combobox', { name: 'Clave principal SICAR relacionada', exact: true })
		.fill('K00000');
	await page.getByRole('button', { name: 'Guardar artículo', exact: true }).click();
	await page.getByTestId('unmatched-card').filter({ hasText: 'Identificado en SICAR' }).waitFor();
	const findingDownload = page.waitForEvent('download');
	await page
		.getByRole('button', { name: 'Exportar artículos no encontrados', exact: true })
		.click();
	const findingExcel = await findingDownload;
	const findingBook = XLSX.read(await fs.readFile(await findingExcel.path()), { type: 'buffer' });
	const findingRows = XLSX.utils.sheet_to_json(findingBook.Sheets[findingBook.SheetNames[0]]);
	assert.equal(findingRows.length, 1);
	assert.equal(findingRows[0]['Cantidad física encontrada'], 1.25);
	assert.equal(findingRows[0]['Clave SICAR relacionada'], 'K00000');
	await nav('Inventario');
	await search.fill('ALT0');
	assert.match(await page.getByTestId('session-status').innerText(), /1\/2401 contados/);
	await nav('Productos');
	await page
		.getByLabel('Importar catálogo', { exact: true })
		.setInputFiles(
			catalogFile([['K00000', 'ALT0', 'Producto 0 actualizado', 20, 'Herramientas', 'Unidad']])
		);
	await page.getByRole('combobox', { name: 'Destino del catálogo' }).selectOption('update');
	await page.getByTestId('import-summary').filter({ hasText: '1 válidos' }).waitFor();
	page.once('dialog', (dialog) => {
		assert.match(dialog.message(), /sesión de inventario abierta/);
		return dialog.accept();
	});
	await page.getByRole('button', { name: 'Confirmar importación', exact: true }).click();
	await page
		.getByRole('status')
		.filter({ hasText: '0 productos nuevos y 1 actualizados. Conteos conservados.' })
		.waitFor();
	await nav('Inventario');
	await card.getByRole('button').click();
	assert.equal(await page.getByRole('spinbutton', { name: 'Cantidad física' }).inputValue(), '0');
	assert.match(await card.innerText(), /Producto 0 actualizado/);
	await page.getByRole('button', { name: 'Contados', exact: true }).click();
	assert.equal(await card.count(), 1);
	assert.match(await card.innerText(), /Con diferencia/);
	await page.getByRole('button', { name: 'Pausar', exact: true }).click();
	await page.getByRole('status').filter({ hasText: 'Pausado' }).waitFor();
	await page.reload({ waitUntil: 'networkidle' });
	await nav('Inventario');
	assert.match(await page.getByTestId('session-status').innerText(), /Pausado/);
	await search.fill('ALT0');
	await card.getByRole('button').click();
	assert.equal(await page.getByRole('spinbutton', { name: 'Cantidad física' }).isDisabled(), true);
	assert.equal(await page.getByRole('spinbutton', { name: 'Cantidad física' }).inputValue(), '0');
	await page.getByRole('button', { name: 'Reanudar', exact: true }).click();
	await page.getByRole('status').filter({ hasText: 'En curso' }).waitFor();
	page.once('dialog', (d) => d.dismiss());
	await page.getByRole('button', { name: 'Finalizar', exact: true }).click();
	assert.match(await page.getByTestId('session-status').innerText(), /En curso/);
	page.once('dialog', (d) => d.accept());
	await page.getByRole('button', { name: 'Finalizar', exact: true }).click();
	await page.getByRole('status').filter({ hasText: 'Finalizado' }).waitFor();
	assert.equal(await page.getByRole('spinbutton', { name: 'Cantidad física' }).isDisabled(), true);
	assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
	await nav('Productos');
	const excelDownload = page.waitForEvent('download');
	await page.getByRole('button', { name: 'Exportar Excel', exact: true }).click();
	const excel = await excelDownload;
	const data = await fs.readFile(await excel.path());
	const book = XLSX.read(data, { type: 'buffer' });
	const rows = XLSX.utils.sheet_to_json(book.Sheets[book.SheetNames[0]], { defval: null });
	assert.equal(rows.length, 2401);
	assert.equal(rows[0]['Cantidad física'], 0);
	assert.equal(rows[0].Diferencia, -20);
	assert.equal(rows[1]['Cantidad física'], null);
	assert.equal(rows[1].Diferencia, null);
	// The SICAR-specific download is independent from the full inventory report.
	page.once('dialog', (dialog) => dialog.dismiss());
	await page.getByRole('button', { name: 'Exportar para SICAR', exact: true }).click();
	const sicarDownload = page.waitForEvent('download');
	page.once('dialog', (dialog) => {
		assert.match(dialog.message(), /2400 productos pendientes/);
		return dialog.accept();
	});
	await page.getByRole('button', { name: 'Exportar para SICAR', exact: true }).click();
	const sicar = await sicarDownload;
	const sicarBook = XLSX.read(await fs.readFile(await sicar.path()), { type: 'buffer' });
	assert.deepEqual(
		XLSX.utils.sheet_to_json(sicarBook.Sheets[sicarBook.SheetNames[0]], { header: 1 }),
		[
			['Clave', 'Cantidad'],
			['K00000', 0]
		]
	);
	await nav('Respaldo');
	const jsonDownload = page.waitForEvent('download');
	await page.getByRole('button', { name: 'Exportar respaldo JSON', exact: true }).click();
	const backup = await jsonDownload;
	const json = JSON.parse(await fs.readFile(await backup.path(), 'utf8'));
	assert.equal(json.catalog.length, 2401);
	assert.equal(json.session.status, 'completed');
	assert.ok(json.session.finishedAt);
	assert.equal(json.catalog[0].physical, 0);
	assert.equal(json.catalog[0].category, 'Herramientas');
	assert.equal(json.catalog[0].unit, 'Unidad');
	assert.ok(json.catalog[0].countedAt);
	assert.equal(json.version, 3);
	assert.equal(json.unmatchedArticles.length, 1);
	assert.equal(json.unmatchedArticles[0].quantity, 1.25);
	assert.equal(json.unmatchedArticles[0].reviewStatus, 'identified');
	await page.getByRole('status').filter({ hasText: 'JSON listo' }).waitFor();
	await page.getByLabel('Importar respaldo JSON', { exact: true }).setInputFiles({
		name: 'respaldo.json',
		mimeType: 'application/json',
		buffer: Buffer.from(JSON.stringify(json))
	});
	const restoreDialog = page.getByRole('dialog');
	await restoreDialog
		.getByTestId('backup-preview')
		.filter({ hasText: 'Productos: 2401' })
		.waitFor();
	assert.equal(
		await restoreDialog
			.getByRole('button', { name: 'Confirmar restauración', exact: true })
			.isDisabled(),
		true
	);
	await restoreDialog.getByRole('checkbox').check();
	await restoreDialog.getByRole('button', { name: 'Confirmar restauración', exact: true }).click();
	await page.getByRole('status').filter({ hasText: 'restaurado con sus conteos' }).waitFor();
	await nav('Inventario');
	await search.fill('ALT0');
	await card.getByRole('button').click();
	assert.equal(await page.getByRole('spinbutton', { name: 'Cantidad física' }).inputValue(), '0');
	assert.match(await page.getByTestId('session-status').innerText(), /Finalizado/);
	// A new inventory keeps the catalog, archives the completed session and does not start itself.
	await page.getByRole('button', { name: 'Nuevo inventario', exact: true }).click();
	await page.getByRole('dialog').getByRole('button', { name: 'Cancelar', exact: true }).click();
	assert.match(await page.getByTestId('session-status').innerText(), /Finalizado/);
	await page.getByRole('button', { name: 'Nuevo inventario', exact: true }).click();
	const priorDownload = page.waitForEvent('download');
	await page
		.getByRole('dialog')
		.getByRole('button', { name: 'Descargar respaldo actual JSON', exact: true })
		.click();
	const prior = await priorDownload;
	assert.match(prior.suggestedFilename(), /^MATRE_Inventario_\d{4}-\d{2}-\d{2}\.json$/);
	await page.getByRole('dialog').getByRole('checkbox').check();
	await page
		.getByRole('dialog')
		.getByRole('button', { name: 'Crear nuevo inventario', exact: true })
		.click();
	await page.getByRole('status').filter({ hasText: 'Nuevo inventario preparado' }).waitFor();
	assert.match(await page.getByTestId('session-status').innerText(), /Sin iniciar · 0\/2401/);
	await page.getByRole('button', { name: 'Comenzar', exact: true }).click();
	await page.getByRole('status').filter({ hasText: 'En curso' }).waitFor();
	await search.fill('ALT0');
	await card.getByRole('button').click();
	await page.getByRole('spinbutton', { name: 'Cantidad física' }).fill('0');
	await page.getByRole('button', { name: 'Guardar cantidad', exact: true }).click();
	await page.getByRole('status').filter({ hasText: '0 unidades guardadas' }).waitFor();
	await nav('Configuración');
	await page.getByRole('button', { name: 'Reiniciar conteo', exact: true }).click();
	await page.getByRole('dialog').getByRole('button', { name: 'Cancelar', exact: true }).click();
	await page.getByRole('button', { name: 'Reiniciar conteo', exact: true }).click();
	await page.getByRole('dialog').getByRole('checkbox').check();
	await page
		.getByRole('dialog')
		.getByRole('button', { name: 'Confirmar reinicio', exact: true })
		.click();
	await page.getByRole('status').filter({ hasText: 'Conteos reiniciados' }).waitFor();
	assert.match(await page.getByTestId('session-status').innerText(), /Sin iniciar · 0\/2401/);
	await page.reload({ waitUntil: 'networkidle' });
	await nav('Inventario');
	assert.match(await page.getByTestId('session-status').innerText(), /Sin iniciar · 0\/2401/);
	await nav('Artículos no encontrados');
	assert.equal(await page.getByTestId('unmatched-card').count(), 0);
	await page
		.getByRole('combobox', { name: 'Sesión de los hallazgos', exact: true })
		.selectOption(json.session.id);
	await page.getByTestId('unmatched-card').filter({ hasText: 'Pieza sin catálogo' }).waitFor();
	assert.equal(await page.getByRole('button', { name: 'Editar', exact: true }).count(), 0);
	assert.equal(
		await page
			.getByRole('button', { name: 'Exportar artículos no encontrados', exact: true })
			.isEnabled(),
		true
	);
	await nav('Inventario');
	// Simulate a PC with a separate, empty IndexedDB, restoring the actual mobile download.
	const pc = await browser.newContext({ viewport: { width: 1280, height: 900 } });
	const desktop = await pc.newPage();
	desktop.on('pageerror', (error) => errors.push(error.message));
	await desktop.goto(url, { waitUntil: 'networkidle' });
	await desktop
		.getByRole('navigation')
		.getByRole('button', { name: 'Respaldo', exact: true })
		.click();
	await desktop.getByLabel('Importar respaldo JSON', { exact: true }).setInputFiles({
		name: 'mobile.json',
		mimeType: 'application/json',
		buffer: Buffer.from(JSON.stringify(json))
	});
	const pcDialog = desktop.getByRole('dialog');
	await pcDialog.getByTestId('backup-preview').waitFor();
	assert.match(await pcDialog.innerText(), /No hay productos ni conteos locales/);
	await pcDialog.getByRole('checkbox').check();
	await pcDialog.getByRole('button', { name: 'Confirmar restauración', exact: true }).click();
	await desktop.getByRole('status').filter({ hasText: 'restaurado con sus conteos' }).waitFor();
	await desktop.reload({ waitUntil: 'networkidle' });
	await desktop
		.getByRole('navigation')
		.getByRole('button', { name: 'Inventario', exact: true })
		.click();
	assert.match(await desktop.getByTestId('session-status').innerText(), /Finalizado · 1\/2401/);
	await desktop.getByRole('textbox', { name: 'Buscar productos' }).fill('ALT0');
	await desktop.getByTestId('product-card').getByRole('button').click();
	assert.equal(
		await desktop.getByRole('spinbutton', { name: 'Cantidad física' }).inputValue(),
		'0'
	);
	await desktop
		.getByRole('navigation')
		.getByRole('button', { name: 'Artículos no encontrados', exact: true })
		.click();
	await desktop.getByTestId('unmatched-card').filter({ hasText: 'Pieza sin catálogo' }).waitFor();
	assert.match(await desktop.getByTestId('unmatched-card').innerText(), /1.25/);
	await pc.close();
	await search.fill('ALT0');
	await card.getByRole('button').click();
	await page.screenshot({ path: join(tmpdir(), 'matre-mobile.png'), fullPage: true });
	assert.deepEqual(errors, []);
	console.log(
		JSON.stringify({
			url,
			products: 2401,
			mobile: true,
			zeroCount: true,
			sessionPersistence: true,
			finalizationConfirmation: true,
			xlsxExport: true,
			sicarExport: true,
			unmatchedArticles: true,
			unmatchedHistory: true,
			unmatchedExcel: true,
			catalogUpdatePreservesCounts: true,
			jsonRestore: true,
			newInventory: true,
			resetCount: true,
			mobileToDesktop: true,
			errors
		})
	);
} catch (error) {
	console.log(
		JSON.stringify({ errors, body: (await page.locator('body').innerText()).slice(0, 3500) })
	);
	throw error;
} finally {
	await browser.close();
}
