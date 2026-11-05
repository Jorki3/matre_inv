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
	await page.getByRole('button', { name: 'Exportar respaldo', exact: true }).click();
	const backup = await jsonDownload;
	const json = JSON.parse(await fs.readFile(await backup.path(), 'utf8'));
	assert.equal(json.catalog.length, 2401);
	assert.equal(json.session.status, 'completed');
	assert.ok(json.session.finishedAt);
	assert.equal(json.catalog[0].physical, 0);
	assert.ok(json.catalog[0].countedAt);
	await page.getByRole('status').filter({ hasText: 'JSON listo' }).waitFor();
	page.once('dialog', (d) => d.accept());
	await page.getByLabel('Importar respaldo', { exact: true }).setInputFiles({
		name: 'respaldo.json',
		mimeType: 'application/json',
		buffer: Buffer.from(JSON.stringify(json))
	});
	await page.getByRole('status').filter({ hasText: 'restaurado con sus conteos' }).waitFor();
	await nav('Inventario');
	await search.fill('ALT0');
	await card.getByRole('button').click();
	assert.equal(await page.getByRole('spinbutton', { name: 'Cantidad física' }).inputValue(), '0');
	assert.match(await page.getByTestId('session-status').innerText(), /Finalizado/);
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
