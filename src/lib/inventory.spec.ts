import { describe, expect, it } from 'vitest';
import {
	applyPhysicalCount,
	resetSessionCounts,
	backupFilename,
	countInSession,
	createSession,
	createInventoryExport,
	exportRows,
	getProductStatus,
	transitionSession,
	calculateDifference,
	computeMetrics,
	createSeedCatalog,
	getAchievementProgress,
	searchProducts,
	validateBackup
} from './inventory';

describe('inventory logic', () => {
	it('calculates difference between expected and physical counts', () => {
		expect(calculateDifference(50, 20)).toBe(30);
		expect(calculateDifference(0, 5)).toBe(-5);
	});

	it('sums and corrects inventory counts', () => {
		const product = createSeedCatalog()[0];
		const counted = applyPhysicalCount(product, 20);
		expect(counted.physical).toBe(20);
		expect(counted.countedAt).toBeTruthy();
	});

	it('marks products as pending or counted', () => {
		const products = createSeedCatalog().slice(0, 2);
		products[0] = applyPhysicalCount(products[0], 0);
		const metrics = computeMetrics(products);
		expect(metrics.total).toBe(2);
		expect(metrics.counted).toBe(1);
		expect(metrics.pending).toBe(1);
	});

	it('searches product records ignoring case and accents', () => {
		const products = [
			{
				id: '1',
				name: 'Codo CPVC 1/2"',
				key: 'CPV-001',
				barcode: '750100000101',
				expected: 20,
				physical: 0,
				createdAt: '2025-01-01T00:00:00.000Z'
			}
		];
		expect(searchProducts(products, 'codo').length).toBe(1);
		expect(searchProducts(products, '750100000101').length).toBe(1);
	});

	it('validates backup objects before restoring them', () => {
		const valid = {
			id: 'backup-1',
			version: 1,
			exportedAt: '2025-01-01T00:00:00.000Z',
			session: {
				id: 'session-1',
				name: 'Inventario',
				startedAt: '2025-01-01T00:00:00.000Z',
				status: 'active',
				products: []
			},
			catalog: [],
			movements: []
		};
		expect(validateBackup(valid).valid).toBe(true);
		expect(validateBackup({ version: 2 }).valid).toBe(false);
	});

	it('tracks achievement progression', () => {
		const products = createSeedCatalog().map((product, index) => ({
			...product,
			countedAt: index < 10 ? new Date().toISOString() : undefined,
			physical: index < 10 ? product.expected : 0
		}));
		const achievements = getAchievementProgress(products);
		expect(achievements[0]?.unlocked).toBe(true);
	});
});

describe('reliable counting and sessions', () => {
	it('records zero as a real count and keeps all counted differences in the counted filter', () => {
		const pending = createSeedCatalog()[0];
		const zero = applyPhysicalCount(pending, 0);
		const exact = applyPhysicalCount({ ...pending, id: 'exact', key: 'EXACT' }, pending.expected);
		expect(zero.countedAt).toBeTruthy();
		expect(getProductStatus(zero)).toBe('difference');
		expect(getProductStatus(exact)).toBe('counted');
		expect(searchProducts([zero, exact, pending], '', 'counted')).toEqual([zero, exact]);
		expect(searchProducts([zero, exact, pending], '', 'difference')).toEqual([zero]);
		expect(searchProducts([zero, exact, pending], '', 'exact')).toEqual([exact]);
		expect(searchProducts([zero, exact, pending], '', 'pending')).toEqual([pending]);
		expect(computeMetrics([zero, exact, pending])).toMatchObject({
			counted: 2,
			pending: 1,
			differences: 1,
			exact: 1
		});
		expect(exportRows([pending])[0]).toMatchObject({
			'Cantidad física': null,
			Diferencia: null,
			Estado: 'Pendiente'
		});
	});

	it('searches by alternate key and validates quantities', () => {
		const product = { ...createSeedCatalog()[0], alternateKey: 'ALT-Á1' };
		expect(searchProducts([product], 'alt-a1')).toEqual([product]);
		for (const quantity of [-1, NaN, Infinity])
			expect(() => applyPhysicalCount(product, quantity)).toThrow();
	});

	it('only starts the clock on Comenzar and blocks edits outside active sessions', () => {
		let session = { ...createSession(), products: createSeedCatalog() };
		expect(session.status).toBe('not_started');
		expect(session.startedAt).toBeUndefined();
		expect(() => countInSession(session, session.products[0].id, 0)).toThrow();
		session = transitionSession(session, 'active');
		const started = session.startedAt;
		expect(started).toBeTruthy();
		session = countInSession(session, session.products[0].id, 0);
		session = transitionSession(session, 'paused');
		expect(() => countInSession(session, session.products[0].id, 2)).toThrow();
		session = transitionSession(session, 'active');
		expect(session.startedAt).toBe(started);
		session = transitionSession(session, 'completed');
		expect(session.finishedAt).toBeTruthy();
		expect(session.products[0].physical).toBe(0);
		expect(() => countInSession(session, session.products[0].id, 2)).toThrow();
		expect(() => transitionSession(session, 'active')).toThrow();
	});

	it('restores legacy barcode backups and reconciles counted values from both old arrays without mutating input', () => {
		const product = { ...createSeedCatalog()[0], source: 'SICAR', barcode: '000123' };
		const old = {
			id: 'old',
			version: 1,
			exportedAt: '2026-01-01T00:00:00Z',
			session: {
				id: 'old',
				name: 'Viejo',
				status: 'paused',
				startedAt: '2025-01-01T00:00:00Z',
				products: [applyPhysicalCount(product, 0)]
			},
			catalog: [product],
			movements: []
		};
		const result = validateBackup(old);
		expect(result.valid).toBe(true);
		expect(result.value?.catalog[0]).toMatchObject({
			alternateKey: '000123',
			barcode: '000123',
			physical: 0
		});
		expect(result.value?.catalog[0].countedAt).toBeTruthy();
		expect(result.value?.session.status).toBe('paused');
		expect(old.catalog[0].countedAt).toBeUndefined();
		const exported = createInventoryExport(result.value!.catalog, result.value!.session);
		expect(validateBackup(exported).value?.catalog).toMatchObject(result.value!.catalog);
		expect(validateBackup({ ...old, session: { ...old.session, status: 'invalid' } }).valid).toBe(
			false
		);
		expect(validateBackup({ ...old, catalog: [{ ...product, expected: null }] }).valid).toBe(false);
	});
});

describe('session renewal and portable backups', () => {
	it('resets only counts and timestamps, preserving SICAR fields and session identity', () => {
		const catalog = createSeedCatalog()
			.slice(0, 2)
			.map((product) => ({
				...product,
				alternateKey: `ALT-${product.key}`,
				notes: 'Nota de catálogo'
			}));
		const active = countInSession(
			transitionSession({ ...createSession(), products: catalog }, 'active'),
			catalog[0].id,
			0
		);
		for (const status of ['active', 'paused'] as const) {
			const old = status === 'paused' ? transitionSession(active, 'paused') : active;
			const reset = resetSessionCounts(old, 'reset');
			expect(reset.id).toBe(old.id);
			expect(reset.status).toBe('not_started');
			expect(reset.startedAt).toBeUndefined();
			expect(reset.finishedAt).toBeUndefined();
			expect(reset.products).toHaveLength(2);
			for (const [index, product] of reset.products.entries()) {
				expect(product).toMatchObject({
					id: catalog[index].id,
					key: catalog[index].key,
					alternateKey: catalog[index].alternateKey,
					name: catalog[index].name,
					expected: catalog[index].expected,
					notes: 'Nota de catálogo'
				});
				expect(product.countedAt).toBeUndefined();
				expect(getProductStatus(product)).toBe('pending');
			}
			expect(computeMetrics(reset.products)).toMatchObject({
				counted: 0,
				pending: 2,
				differences: 0,
				progress: 0
			});
			expect(old.products[0].countedAt).toBeTruthy();
		}
	});

	it('opens a distinct unstarted session after completion and protects finalized sessions from reset', () => {
		const catalog = createSeedCatalog();
		const completed = transitionSession(
			countInSession(
				transitionSession({ ...createSession(), products: catalog }, 'active'),
				catalog[0].id,
				0
			),
			'completed'
		);
		const next = resetSessionCounts(completed, 'new');
		expect(next.id).not.toBe(completed.id);
		expect(next.status).toBe('not_started');
		expect(next.startedAt).toBeUndefined();
		expect(next.finishedAt).toBeUndefined();
		expect(next.products.map(({ key, expected }) => ({ key, expected }))).toEqual(
			catalog.map(({ key, expected }) => ({ key, expected }))
		);
		expect(completed.products[0].countedAt).toBeTruthy();
		expect(() => resetSessionCounts(completed, 'reset')).toThrow('solo lectura');
		expect(() => resetSessionCounts(next, 'new')).toThrow('Finaliza');
	});

	it('exports product states, zero counts, session dates and extra work in JSON', () => {
		const catalog = createSeedCatalog().slice(0, 2);
		const session = transitionSession(
			countInSession(
				transitionSession({ ...createSession(), products: catalog }, 'active'),
				catalog[0].id,
				0
			),
			'paused'
		);
		const movements = [
			{
				id: 'move-1',
				productId: catalog[0].id,
				productName: catalog[0].name,
				type: 'adjustment' as const,
				quantity: 1,
				occurredAt: '2026-11-04T12:00:00Z'
			}
		];
		const exported = JSON.parse(
			JSON.stringify(createInventoryExport(session.products, session, movements))
		);
		expect(exported.catalog[0]).toMatchObject({ physical: 0, status: 'difference' });
		expect(exported.catalog[1].status).toBe('pending');
		const restored = validateBackup(exported).value!;
		expect(restored.session.status).toBe('paused');
		expect(restored.session.startedAt).toBe(session.startedAt);
		expect(restored.catalog[0].countedAt).toBe(session.products[0].countedAt);
		expect(restored.movements).toEqual(movements);
		expect(backupFilename(new Date(2026, 10, 4))).toBe('MATRE_Inventario_2026-11-04.json');
	});

	it('rejects invalid versions, product structures and session structures', () => {
		const snapshot = createInventoryExport([], createSession());
		for (const candidate of [
			{ ...snapshot, version: 99 },
			{ ...snapshot, catalog: {} },
			{ ...snapshot, session: null },
			{ ...snapshot, exportedAt: 'invalid' },
			{ ...snapshot, id: '' }
		])
			expect(validateBackup(candidate).valid).toBe(false);
	});
});
