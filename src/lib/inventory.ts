export type ProductStatus = 'pending' | 'counted' | 'difference';
export type ThemeMode = 'light' | 'dark' | 'system';
export type InventoryStatus = 'active' | 'paused' | 'completed';
export type MovementType = 'sale' | 'purchase' | 'adjustment';

export interface Product {
	id: string;
	name: string;
	key: string;
	barcode: string;
	expected: number;
	physical: number;
	countedAt?: string;
	createdAt: string;
	source?: string;
	notes?: string;
}

export interface InventoryMovement {
	id: string;
	productId: string;
	productName: string;
	type: MovementType;
	quantity: number;
	occurredAt: string;
	notes?: string;
}

export interface InventorySession {
	id: string;
	name: string;
	startedAt: string;
	finishedAt?: string;
	status: InventoryStatus;
	products: Product[];
}

export interface InventorySnapshot {
	id: string;
	version: number;
	exportedAt: string;
	session: InventorySession;
	catalog: Product[];
	movements: InventoryMovement[];
	lastBackupAt?: string;
}

export interface ProductMetrics {
	total: number;
	counted: number;
	pending: number;
	differences: number;
	exact: number;
	progress: number;
}

export interface Achievement {
	id: string;
	name: string;
	description: string;
	target: number;
	progress: number;
	unlocked: boolean;
}

export function normalizeText(value: string): string {
	return value
		.normalize('NFD')
		.replace(/[\u0300-\u036f]/g, '')
		.toLowerCase()
		.trim();
}

export function calculateDifference(actual: number, expected: number): number {
	return actual - expected;
}

export function getProductStatus(product: Product): ProductStatus {
	if (!product.countedAt) {
		return 'pending';
	}
	return calculateDifference(product.physical, product.expected) === 0 ? 'counted' : 'difference';
}

export function applyPhysicalCount(product: Product, quantity: number): Product {
	return {
		...product,
		physical: Number(quantity),
		countedAt: new Date().toISOString(),
		notes: product.notes ?? 'Conteo registrado'
	};
}

export function computeMetrics(products: Product[]): ProductMetrics {
	const total = products.length;
	const counted = products.filter((product) => Boolean(product.countedAt)).length;
	const pending = total - counted;
	const differences = products.filter((product) => {
		if (!product.countedAt) return false;
		return calculateDifference(product.physical, product.expected) !== 0;
	}).length;
	const exact = products.filter((product) => {
		if (!product.countedAt) return false;
		return calculateDifference(product.physical, product.expected) === 0;
	}).length;

	return {
		total,
		counted,
		pending,
		differences,
		exact,
		progress: total === 0 ? 0 : Math.round((counted / total) * 100)
	};
}

export function searchProducts(
	products: Product[],
	query: string,
	filter: 'all' | 'pending' | 'counted' | 'difference' | 'exact' = 'all'
): Product[] {
	const normalizedQuery = normalizeText(query);

	return products.filter((product) => {
		const matchesFilter = (() => {
			if (filter === 'all') return true;
			if (filter === 'pending') return getProductStatus(product) === 'pending';
			if (filter === 'counted') return getProductStatus(product) === 'counted';
			if (filter === 'difference') return getProductStatus(product) === 'difference';
			if (filter === 'exact') return getProductStatus(product) === 'counted';
			return true;
		})();

		if (!normalizedQuery) return matchesFilter;

		const haystack = normalizeText(
			`${product.name} ${product.key} ${product.barcode} ${product.id}`.trim()
		);
		return matchesFilter && haystack.includes(normalizedQuery);
	});
}

export function createSeedCatalog(): Product[] {
	return [
		{ id: 'P-101', name: 'Codo CPVC 1/2"', key: 'CPV-001', barcode: '750100000101', expected: 20, physical: 0, createdAt: new Date().toISOString(), source: 'SICAR' },
		{ id: 'P-102', name: 'Tee PVC 3/4"', key: 'PVC-014', barcode: '750100000102', expected: 44, physical: 0, createdAt: new Date().toISOString(), source: 'SICAR' },
		{ id: 'P-103', name: 'Pegamento PVC', key: 'ADH-002', barcode: '750100000103', expected: 15, physical: 0, createdAt: new Date().toISOString(), source: 'SICAR' },
		{ id: 'P-104', name: 'Martillo 16 oz', key: 'HER-007', barcode: '750100000104', expected: 11, physical: 0, createdAt: new Date().toISOString(), source: 'SICAR' },
		{ id: 'P-105', name: 'Llave inglesa 10"', key: 'LLA-025', barcode: '750100000105', expected: 8, physical: 0, createdAt: new Date().toISOString(), source: 'SICAR' },
		{ id: 'P-106', name: 'Taladro inalambrico', key: 'TAL-110', barcode: '750100000106', expected: 6, physical: 0, createdAt: new Date().toISOString(), source: 'SICAR' },
		{ id: 'P-107', name: 'Lija 120', key: 'LIJ-021', barcode: '750100000107', expected: 32, physical: 0, createdAt: new Date().toISOString(), source: 'SICAR' },
		{ id: 'P-108', name: 'Tuerca hexagonal M8', key: 'NUT-066', barcode: '750100000108', expected: 58, physical: 0, createdAt: new Date().toISOString(), source: 'SICAR' },
		{ id: 'P-109', name: 'Sierra circular 7"', key: 'SIE-052', barcode: '750100000109', expected: 9, physical: 0, createdAt: new Date().toISOString(), source: 'SICAR' },
		{ id: 'P-110', name: 'Cable eléctrico 2.5mm', key: 'CAB-089', barcode: '750100000110', expected: 28, physical: 0, createdAt: new Date().toISOString(), source: 'SICAR' },
		{ id: 'P-111', name: 'Fierro de soldar 1/8"', key: 'SOL-030', barcode: '750100000111', expected: 17, physical: 0, createdAt: new Date().toISOString(), source: 'SICAR' },
		{ id: 'P-112', name: 'Pintura esmalte blanco', key: 'PNT-003', barcode: '750100000112', expected: 12, physical: 0, createdAt: new Date().toISOString(), source: 'SICAR' }
	];
}

export function createSession(name = 'Inventario MATRE'): InventorySession {
	const now = new Date().toISOString();
	return {
		id: `session-${Date.now()}`,
		name,
		startedAt: now,
		status: 'active',
		products: createSeedCatalog()
	};
}

export function getAchievementProgress(products: Product[]): Achievement[] {
	const total = products.length || 1;
	const countedUnique = new Set(products.filter((product) => Boolean(product.countedAt)).map((product) => product.id)).size;
	const perfectCount = products.filter((product) => {
		if (!product.countedAt) return false;
		return calculateDifference(product.physical, product.expected) === 0;
	}).length;

	const achievements: Achievement[] = [
		{
			id: 'first-step',
			name: 'Primer paso',
			description: 'Contar 10 productos.',
			target: 10,
			progress: Math.min(countedUnique, 10),
			unlocked: countedUnique >= 10
		},
		{
			id: 'agarrando-ritmo',
			name: 'Agarrando ritmo',
			description: 'Contar 100 productos.',
			target: 100,
			progress: Math.min(countedUnique, 100),
			unlocked: countedUnique >= 100
		},
		{
			id: 'modo-ferretero',
			name: 'Modo ferretero',
			description: 'Contar 500 productos.',
			target: 500,
			progress: Math.min(countedUnique, 500),
			unlocked: countedUnique >= 500
		},
		{
			id: 'halfway',
			name: 'Mitad del camino',
			description: 'Completar el 50% del catálogo.',
			target: total,
			progress: Math.min(Math.ceil((countedUnique / total) * total), total),
			unlocked: countedUnique >= Math.ceil(total / 2)
		},
		{
			id: 'master',
			name: 'Maestro del inventario',
			description: 'Completar el 100% del catálogo.',
			target: total,
			progress: Math.min(countedUnique, total),
			unlocked: countedUnique >= total
		},
		{
			id: 'sin-diferencias',
			name: 'Sin diferencias',
			description: 'Contar 25 productos distintos sin diferencias.',
			target: 25,
			progress: Math.min(perfectCount, 25),
			unlocked: perfectCount >= 25
		}
	];

	return achievements;
}

export function validateBackup(input: unknown): { valid: boolean; message: string; value?: InventorySnapshot } {
	if (!input || typeof input !== 'object') {
		return { valid: false, message: 'El respaldo no es un objeto válido.' };
	}

	const candidate = input as Partial<InventorySnapshot>;
	if (candidate.version !== 1) {
		return { valid: false, message: 'La versión del respaldo no es compatible.' };
	}

	if (!Array.isArray(candidate.catalog) || !Array.isArray(candidate.session?.products)) {
		return { valid: false, message: 'El respaldo no contiene catálogo o productos válidos.' };
	}

	return {
		valid: true,
		message: 'Respaldo válido.',
		value: candidate as InventorySnapshot
	};
}

export function createInventoryExport(products: Product[], session: InventorySession): InventorySnapshot {
	return {
		id: `backup-${Date.now()}`,
		version: 1,
		exportedAt: new Date().toISOString(),
		session,
		catalog: products,
		movements: []
	};
}
