import { describe, expect, it } from 'vitest';
import {
	applyPhysicalCount,
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
			{ id: '1', name: 'Codo CPVC 1/2"', key: 'CPV-001', barcode: '750100000101', expected: 20, physical: 0, createdAt: '2025-01-01T00:00:00.000Z' }
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
