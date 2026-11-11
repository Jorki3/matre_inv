import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { existsSync } from 'node:fs';
const url = process.argv[2] || 'http://127.0.0.1:4173/matre_inv/';
const browser = await chromium.launch({
	executablePath: existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined
});
const time = (hour) => `2026-11-11T${String(hour).padStart(2, '0')}:00:00.000Z`;
const products = ['A', 'B'].map((key) => ({
	id: key,
	key,
	name: `Producto ${key}`,
	alternateKey: '',
	expected: 10,
	physical: 0,
	status: 'pending',
	createdAt: time(8)
}));
const operation = (id, key, quantity, hour) => ({
	id,
	productId: key,
	type: 'recount',
	previousQuantity: null,
	enteredQuantity: quantity,
	resultingQuantity: quantity,
	occurredAt: time(hour),
	source: 'manual',
	instanceId: 'smoke-donor'
});
const observed = (key, quantity, hour) =>
	products.map((p) =>
		p.key === key
			? {
					...p,
					physical: quantity,
					countedAt: time(hour),
					status: quantity === p.expected ? 'counted' : 'difference'
				}
			: { ...p }
	);
function snapshot(id, key, quantity, hour) {
	const catalog = observed(key, quantity, hour);
	return {
		id,
		version: 5,
		exportedAt: time(15),
		exportedBy: 'smoke-donor',
		session: {
			id: 'smoke-session',
			name: 'Prueba aislada',
			countEpochId: 'smoke-cycle',
			status: 'active',
			startedAt: time(9),
			products: catalog,
			operations: [operation(`${id}-op`, key, quantity, hour)]
		},
		catalog,
		movements: [],
		unmatchedArticles: []
	};
}
try {
	for (const width of [320, 390, 1280]) {
		const context = await browser.newContext({
			viewport: { width, height: 900 },
			isMobile: width < 600,
			hasTouch: width < 600
		});
		const page = await context.newPage();
		const errors = [];
		page.on('pageerror', (error) => errors.push(error.message));
		await page.goto(url, { waitUntil: 'networkidle' });
		await page.getByRole('status').filter({ hasText: 'Sesión:' }).waitFor();
		const local = snapshot('local', 'A', 10, 10);
		await page.evaluate(async (value) => {
			await new Promise((resolve, reject) => {
				const request = indexedDB.open('matre-inventario-db');
				request.onerror = () => reject(request.error);
				request.onsuccess = () => {
					const db = request.result;
					const tx = db.transaction('state', 'readwrite');
					tx.objectStore('state').put({
						id: 'main',
						revision: 1,
						instanceId: 'smoke-local',
						session: value.session,
						catalog: value.catalog,
						theme: 'light',
						lastSavedAt: value.exportedAt
					});
					tx.oncomplete = () => {
						db.close();
						resolve();
					};
					tx.onerror = () => reject(tx.error);
				};
			});
		}, local);
		await page.reload({ waitUntil: 'networkidle' });
		const nav = (name) =>
			page
				.getByRole('navigation', { name: 'Principal', exact: true })
				.getByRole('button', { name, exact: true })
				.click();
		assert.deepEqual(
			await page
				.getByRole('navigation', { name: 'Principal', exact: true })
				.getByRole('button')
				.allTextContents()
				.then((names) => names.map((name) => name.trim())),
			['Inicio', 'Inventario', 'Movimientos', 'Configuración']
		);
		await nav('Configuración');
		await page.getByRole('button', { name: 'Oscuro', exact: true }).click();
		assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), 'dark');
		await page.getByRole('button', { name: 'Claro', exact: true }).click();
		assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), 'light');
		await page.getByRole('button', { name: 'Productos', exact: true }).click();
		await page.getByRole('heading', { name: 'Importación y catálogo' }).waitFor();
		await nav('Inventario');
		await page.getByRole('textbox', { name: 'Buscar productos' }).fill('Producto A');
		await page.getByTestId('product-card').getByRole('button').first().click();
		const quantity = page.getByRole('spinbutton', { name: 'Cantidad física', exact: true });
		assert.equal(await quantity.evaluate((node) => document.activeElement === node), true);
		await quantity.press('4');
		assert.equal(await quantity.inputValue(), '4', 'La cantidad previa debe estar seleccionada');
		await page.getByRole('button', { name: 'Confirmar operación', exact: true }).click();
		await page.getByRole('status').filter({ hasText: '4 unidades guardadas' }).waitFor();
		await page.getByRole('button', { name: 'Artículos no encontrados', exact: true }).click();
		await page
			.getByRole('button', { name: 'Registrar artículo no encontrado', exact: true })
			.waitFor();
		await nav('Configuración');
		await page.getByRole('button', { name: 'Respaldos', exact: true }).click();
		const upload = async (data) => {
			await page.getByLabel('Fusionar inventarios JSON', { exact: true }).setInputFiles({
				name: `${data.id}.json`,
				mimeType: 'application/json',
				buffer: Buffer.from(JSON.stringify(data))
			});
		};
		await upload(snapshot('donor-B', 'B', 25, 11));
		const preview = page.getByRole('region', { name: 'Vista previa de fusión' });
		await preview.getByText('1 compatibles', { exact: false }).waitFor();
		await preview.getByRole('button', { name: 'Confirmar fusión', exact: true }).click();
		await page.getByRole('status').filter({ hasText: 'Fusión guardada' }).waitFor();
		await upload(snapshot('donor-A', 'A', 30, 12));
		await preview.getByText('1 en conflicto', { exact: false }).waitFor();
		await preview.getByRole('button', { name: 'Confirmar fusión', exact: true }).click();
		await page.getByRole('status').filter({ hasText: 'Fusión guardada' }).waitFor();
		await nav('Inventario');
		await page.getByTestId('product-card').getByRole('button').first().click();
		assert.equal(
			await page.getByRole('button', { name: 'Sumar (+)', exact: true }).isDisabled(),
			true
		);
		const previousSecond = Math.floor(Date.now() / 1000);
		await page.waitForFunction((second) => Math.floor(Date.now() / 1000) > second, previousSecond);
		await quantity.fill('42');
		await page.getByRole('button', { name: 'Confirmar operación', exact: true }).click();
		await page.getByRole('status').filter({ hasText: '42 unidades guardadas' }).waitFor();
		await page.reload({ waitUntil: 'networkidle' });
		await nav('Inventario');
		await page.getByRole('textbox', { name: 'Buscar productos' }).fill('Producto A');
		await page.getByTestId('product-card').getByRole('button').first().click();
		assert.equal(await quantity.inputValue(), '42');
		assert.equal(
			await page.getByRole('button', { name: 'Sumar (+)', exact: true }).isEnabled(),
			true
		);
		assert.equal(
			await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
			true,
			'Sin desplazamiento horizontal'
		);
		await page.screenshot({ path: `/tmp/matre-v010-${width}.png`, fullPage: true });
		assert.deepEqual(errors, []);
		await context.close();
		process.stdout.write(
			`OK: ${width}px, navegación, enfoque, teclado, temas, fusión, conflicto y persistencia\n`
		);
	}
} finally {
	await browser.close();
}
