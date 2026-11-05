import { validateUnmatchedArticles, type UnmatchedArticle } from './unmatched-articles';

export type ProductStatus = 'pending' | 'counted' | 'difference';
export type ThemeMode = 'light' | 'dark' | 'system';
export type InventoryStatus = 'not_started' | 'active' | 'paused' | 'completed';
export type MovementType = 'sale' | 'purchase' | 'adjustment';

export interface Product {
	id: string;
	name: string;
	key: string;
	alternateKey?: string;
	category?: string;
	unit?: string;
	/** Legacy identifier, retained when migrating old catalogs. */
	barcode?: string;
	expected: number;
	physical: number;
	countedAt?: string;
	status?: ProductStatus;
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
	startedAt?: string;
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
	unmatchedArticles?: UnmatchedArticle[];
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
	if (!Number.isFinite(quantity) || quantity < 0)
		throw new Error('La cantidad debe ser un número no negativo.');
	return {
		...product,
		physical: Number(quantity),
		status: quantity === product.expected ? 'counted' : 'difference',
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
			if (filter === 'counted') return Boolean(product.countedAt);
			if (filter === 'difference') return getProductStatus(product) === 'difference';
			if (filter === 'exact') return getProductStatus(product) === 'counted';
			return true;
		})();

		if (!normalizedQuery) return matchesFilter;

		const haystack = normalizeText(
			`${product.name} ${product.key} ${product.alternateKey ?? product.barcode ?? ''}`.trim()
		);
		return matchesFilter && haystack.includes(normalizedQuery);
	});
}

export function createSeedCatalog(): Product[] {
	return [
		{
			id: 'P-101',
			name: 'Codo CPVC 1/2"',
			key: 'CPV-001',
			barcode: '750100000101',
			expected: 20,
			physical: 0,
			createdAt: new Date().toISOString(),
			source: 'demo'
		},
		{
			id: 'P-102',
			name: 'Tee PVC 3/4"',
			key: 'PVC-014',
			barcode: '750100000102',
			expected: 44,
			physical: 0,
			createdAt: new Date().toISOString(),
			source: 'demo'
		},
		{
			id: 'P-103',
			name: 'Pegamento PVC',
			key: 'ADH-002',
			barcode: '750100000103',
			expected: 15,
			physical: 0,
			createdAt: new Date().toISOString(),
			source: 'demo'
		},
		{
			id: 'P-104',
			name: 'Martillo 16 oz',
			key: 'HER-007',
			barcode: '750100000104',
			expected: 11,
			physical: 0,
			createdAt: new Date().toISOString(),
			source: 'demo'
		},
		{
			id: 'P-105',
			name: 'Llave inglesa 10"',
			key: 'LLA-025',
			barcode: '750100000105',
			expected: 8,
			physical: 0,
			createdAt: new Date().toISOString(),
			source: 'demo'
		},
		{
			id: 'P-106',
			name: 'Taladro inalambrico',
			key: 'TAL-110',
			barcode: '750100000106',
			expected: 6,
			physical: 0,
			createdAt: new Date().toISOString(),
			source: 'demo'
		},
		{
			id: 'P-107',
			name: 'Lija 120',
			key: 'LIJ-021',
			barcode: '750100000107',
			expected: 32,
			physical: 0,
			createdAt: new Date().toISOString(),
			source: 'demo'
		},
		{
			id: 'P-108',
			name: 'Tuerca hexagonal M8',
			key: 'NUT-066',
			barcode: '750100000108',
			expected: 58,
			physical: 0,
			createdAt: new Date().toISOString(),
			source: 'demo'
		},
		{
			id: 'P-109',
			name: 'Sierra circular 7"',
			key: 'SIE-052',
			barcode: '750100000109',
			expected: 9,
			physical: 0,
			createdAt: new Date().toISOString(),
			source: 'demo'
		},
		{
			id: 'P-110',
			name: 'Cable eléctrico 2.5mm',
			key: 'CAB-089',
			barcode: '750100000110',
			expected: 28,
			physical: 0,
			createdAt: new Date().toISOString(),
			source: 'demo'
		},
		{
			id: 'P-111',
			name: 'Fierro de soldar 1/8"',
			key: 'SOL-030',
			barcode: '750100000111',
			expected: 17,
			physical: 0,
			createdAt: new Date().toISOString(),
			source: 'demo'
		},
		{
			id: 'P-112',
			name: 'Pintura esmalte blanco',
			key: 'PNT-003',
			barcode: '750100000112',
			expected: 12,
			physical: 0,
			createdAt: new Date().toISOString(),
			source: 'demo'
		}
	];
}

export function createId(prefix: string): string {
	// getRandomValues also works during mobile development over a local HTTP network.
	const random = crypto.getRandomValues(new Uint32Array(4));
	return `${prefix}-${Array.from(random, (value) => value.toString(16).padStart(8, '0')).join('')}`;
}

export function createSession(name = 'Inventario MATRE'): InventorySession {
	return {
		id: createId('session'),
		name,
		status: 'not_started',
		products: []
	};
}

export function resetSessionCounts(
	session: InventorySession,
	action: 'reset' | 'new'
): InventorySession {
	if (action === 'new' && session.status !== 'completed')
		throw new Error('Finaliza la sesión antes de crear un nuevo inventario.');
	if (action === 'reset' && session.status === 'completed')
		throw new Error('La sesión finalizada es de solo lectura. Crea un nuevo inventario.');
	const { startedAt: _startedAt, finishedAt: _finishedAt, ...previous } = session;
	void _startedAt;
	void _finishedAt;
	return {
		...previous,
		id: action === 'new' ? createId('session') : session.id,
		status: 'not_started',
		products: session.products.map((product) => {
			const { countedAt: _countedAt, ...catalog } = product;
			void _countedAt;
			return {
				...catalog,
				physical: 0,
				status: 'pending',
				...(product.notes === 'Conteo registrado' ? { notes: undefined } : {})
			};
		})
	};
}

export function backupFilename(date = new Date(), previous = false): string {
	const day = [
		date.getFullYear(),
		String(date.getMonth() + 1).padStart(2, '0'),
		String(date.getDate()).padStart(2, '0')
	].join('-');
	return `MATRE_Inventario_${day}${previous ? '_previo' : ''}.json`;
}

export const sessionLabels: Record<InventoryStatus, string> = {
	not_started: 'Sin iniciar',
	active: 'En curso',
	paused: 'Pausado',
	completed: 'Finalizado'
};

export function transitionSession(
	session: InventorySession,
	next: InventoryStatus
): InventorySession {
	const allowed: Record<InventoryStatus, InventoryStatus[]> = {
		not_started: ['active'],
		active: ['paused', 'completed'],
		paused: ['active', 'completed'],
		completed: []
	};
	if (!allowed[session.status].includes(next)) throw new Error('Cambio de estado no permitido.');
	return {
		...session,
		status: next,
		...(session.status === 'not_started' ? { startedAt: new Date().toISOString() } : {}),
		...(next === 'completed' ? { finishedAt: new Date().toISOString() } : {})
	};
}

export function countInSession(
	session: InventorySession,
	id: string,
	quantity: number
): InventorySession {
	if (session.status !== 'active') throw new Error('Comienza o reanuda la sesión para contar.');
	if (!session.products.some((product) => product.id === id))
		throw new Error('Producto no encontrado.');
	return {
		...session,
		products: session.products.map((product) =>
			product.id === id ? applyPhysicalCount(product, quantity) : product
		)
	};
}

export function exportRows(products: Product[]) {
	return products.map((product) => ({
		Clave: product.key,
		'Clave alterna': product.alternateKey ?? product.barcode ?? '',
		Descripción: product.name,
		'Existencia SICAR': product.expected,
		'Cantidad física': product.countedAt ? product.physical : null,
		Diferencia: product.countedAt ? calculateDifference(product.physical, product.expected) : null,
		Estado: { pending: 'Pendiente', counted: 'Contado', difference: 'Con diferencia' }[
			getProductStatus(product)
		]
	}));
}

export function getAchievementProgress(products: Product[]): Achievement[] {
	const total = products.length || 1;
	const countedUnique = new Set(
		products.filter((product) => Boolean(product.countedAt)).map((product) => product.id)
	).size;
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

function record(input: unknown): Record<string, unknown> {
	if (!input || typeof input !== 'object' || Array.isArray(input))
		throw new Error('Registro inválido.');
	return input as Record<string, unknown>;
}

export function migrateProducts(input: unknown): Product[] {
	if (!Array.isArray(input)) throw new Error('Catálogo inválido.');
	const ids = new Set<string>();
	const keys = new Set<string>();
	return input.map((entry) => {
		const value = record(entry);
		if (
			typeof value.id !== 'string' ||
			!value.id ||
			typeof value.key !== 'string' ||
			!value.key.trim() ||
			typeof value.name !== 'string' ||
			!value.name.trim() ||
			typeof value.expected !== 'number' ||
			!Number.isFinite(value.expected) ||
			typeof value.physical !== 'number' ||
			!Number.isFinite(value.physical) ||
			value.physical < 0 ||
			(value.countedAt !== undefined &&
				(typeof value.countedAt !== 'string' || !Number.isFinite(Date.parse(value.countedAt))))
		) {
			throw new Error(
				'Producto inválido: revisa clave, descripción, cantidades y fecha de conteo.'
			);
		}
		const key = normalizeText(value.key);
		if (ids.has(value.id) || keys.has(key))
			throw new Error(
				'El catálogo contiene claves o identificadores duplicados; no se modificaron los datos.'
			);
		ids.add(value.id);
		keys.add(key);
		return {
			...value,
			alternateKey: String(value.alternateKey ?? value.barcode ?? ''),
			...(Object.hasOwn(value, 'status')
				? { status: getProductStatus(value as unknown as Product) }
				: {})
		} as unknown as Product;
	});
}

export function migrateInventory(
	sessionInput: unknown,
	catalogInput: unknown
): { session: InventorySession; catalog: Product[] } {
	const value = record(sessionInput);
	if (
		typeof value.id !== 'string' ||
		typeof value.name !== 'string' ||
		!Object.hasOwn(sessionLabels, String(value.status))
	)
		throw new Error('Sesión inválida.');
	for (const field of ['startedAt', 'finishedAt']) {
		if (
			value[field] !== undefined &&
			(typeof value[field] !== 'string' || !Number.isFinite(Date.parse(value[field] as string)))
		)
			throw new Error('Fecha de sesión inválida.');
	}
	const catalog = migrateProducts(catalogInput);
	const counted = migrateProducts(value.products);
	const merged = new Map(catalog.map((product) => [normalizeText(product.key), product]));
	for (const product of counted) {
		const existing = merged.get(normalizeText(product.key));
		// Keep the latest recorded count, including zero, from either old array.
		const preferred =
			existing?.countedAt &&
			(!product.countedAt || Date.parse(existing.countedAt) > Date.parse(product.countedAt))
				? existing
				: product;
		merged.set(normalizeText(product.key), {
			...existing,
			...product,
			physical: preferred.physical,
			countedAt: preferred.countedAt
		});
	}
	const products = migrateProducts([...merged.values()]);
	return { session: { ...value, products } as unknown as InventorySession, catalog: products };
}

export function validateBackup(input: unknown): {
	valid: boolean;
	message: string;
	value?: InventorySnapshot;
} {
	try {
		const candidate = record(input);
		if (typeof candidate.id !== 'string' || !candidate.id.trim())
			throw new Error('Identificador de respaldo inválido.');
		if (candidate.version !== 1 && candidate.version !== 2 && candidate.version !== 3)
			throw new Error('La versión del respaldo no es compatible.');
		if (
			typeof candidate.exportedAt !== 'string' ||
			!Number.isFinite(Date.parse(candidate.exportedAt))
		)
			throw new Error('Fecha del respaldo inválida.');
		if (candidate.version === 3 && !Array.isArray(candidate.unmatchedArticles))
			throw new Error('El respaldo no contiene la lista de hallazgos.');
		const unmatchedArticles = validateUnmatchedArticles(candidate.unmatchedArticles);
		const migrated = migrateInventory(candidate.session, candidate.catalog);
		if (candidate.movements !== undefined && !Array.isArray(candidate.movements))
			throw new Error('Movimientos inválidos.');
		return {
			valid: true,
			message: 'Respaldo válido.',
			value: {
				...candidate,
				...migrated,
				movements: candidate.movements ?? [],
				unmatchedArticles
			} as InventorySnapshot
		};
	} catch (error) {
		return { valid: false, message: error instanceof Error ? error.message : 'Respaldo inválido.' };
	}
}

export function createInventoryExport(
	products: Product[],
	session: InventorySession,
	movements: InventoryMovement[] = [],
	unmatchedArticles: UnmatchedArticle[] = []
): InventorySnapshot {
	const catalog = products.map((product) => ({
		...product,
		alternateKey: product.alternateKey ?? product.barcode ?? '',
		status: getProductStatus(product)
	}));
	return {
		id: createId('backup'),
		version: 3,
		exportedAt: new Date().toISOString(),
		session: { ...session, products: catalog },
		catalog,
		movements,
		unmatchedArticles
	};
}
