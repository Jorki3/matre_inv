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
	const csv =
		'Clave,Clave alterna,Descripción,Existencia SICAR\n' +
		Array.from(
			{ length: 2401 },
			(_, i) => `K${String(i).padStart(5, '0')},ALT${i},Producto ${i},20`
		).join('\n');
	await page
		.getByLabel('Importar catálogo', { exact: true })
		.setInputFiles({ name: 'catalogo.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
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
	await nav('Respaldo');
	const jsonDownload = page.waitForEvent('download');
	await page.getByRole('button', { name: 'Exportar respaldo JSON', exact: true }).click();
	const backup = await jsonDownload;
	const json = JSON.parse(await fs.readFile(await backup.path(), 'utf8'));
	assert.equal(json.catalog.length, 2401);
	assert.equal(json.session.status, 'completed');
	assert.ok(json.session.finishedAt);
	assert.equal(json.catalog[0].physical, 0);
	assert.ok(json.catalog[0].countedAt);
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
