import { validateUnmatchedArticles, type UnmatchedArticle } from './unmatched-articles';
import Dexie, { type Table } from 'dexie';
import {
	createSession,
	createInventoryExport,
	migrateInventory,
	type InventoryMovement,
	type InventorySession,
	type InventorySnapshot,
	type Product,
	type ThemeMode
} from './inventory';

export interface StoredInventoryState {
	id: string;
	revision?: number;
	session: InventorySession;
	catalog: Product[];
	lastSavedAt: string;
	theme: ThemeMode;
	lastBackupAt?: string;
	movements?: InventoryMovement[];
	unmatchedArticles?: UnmatchedArticle[];
}

class InventoryDatabase extends Dexie {
	state!: Table<StoredInventoryState, string>;
	backups!: Table<InventorySnapshot, string>;

	constructor() {
		super('matre-inventario-db');
		this.version(1).stores({
			state: 'id',
			backups: 'id, exportedAt'
		});
	}
}

export const db = new InventoryDatabase();

function copyProduct(product: Product): Product {
	return { ...product };
}

function copySession(session: InventorySession): InventorySession {
	return {
		...session,
		products: session.products.map(copyProduct),
		...(session.operations
			? { operations: session.operations.map((operation) => ({ ...operation })) }
			: {})
	};
}

export async function loadInventoryState(): Promise<StoredInventoryState> {
	if (typeof window !== 'undefined') {
		const existing = await db.state.get('main');
		if (existing)
			return {
				...existing,
				...migrateInventory(existing.session, existing.catalog),
				unmatchedArticles: validateUnmatchedArticles(existing.unmatchedArticles)
			};
	}
	const fallback: StoredInventoryState = {
		id: 'main',
		session: createSession(),
		catalog: [],
		lastSavedAt: new Date().toISOString(),
		theme: 'system'
	};
	if (typeof window !== 'undefined') await db.state.put(fallback);
	return fallback;
}

export async function saveInventoryState(
	payload: StoredInventoryState,
	archiveCurrent = false,
	expectedRevision?: number
): Promise<number> {
	if (typeof window === 'undefined') return 0;
	return await db.transaction('rw', db.state, db.backups, async () => {
		const persisted = await db.state.get(payload.id ?? 'main');
		if (expectedRevision !== undefined && (persisted?.revision ?? 0) !== expectedRevision)
			throw new Error(
				'El inventario cambió en otra pestaña. Recarga y revisa de nuevo antes de guardar.'
			);
		const revision = (persisted?.revision ?? 0) + 1;
		if (archiveCurrent) {
			const previous = await db.state.get('main');
			if (previous)
				await db.backups.put({
					...createInventoryExport(
						previous.catalog,
						previous.session,
						previous.movements,
						previous.unmatchedArticles
					),
					session: previous.session
				});
		}
		const current = await db.state.get(payload.id ?? 'main');
		await db.state.put({
			...payload,
			revision,
			unmatchedArticles: validateUnmatchedArticles(
				payload.unmatchedArticles ?? current?.unmatchedArticles
			),
			id: payload.id ?? 'main',
			session: copySession(payload.session),
			catalog: payload.catalog.map(copyProduct),
			lastSavedAt: new Date().toISOString()
		});
		return revision;
	});
}

export async function saveBackup(snapshot: InventorySnapshot): Promise<void> {
	if (typeof window === 'undefined') return;
	await db.backups.put({
		...snapshot,
		session: copySession(snapshot.session),
		catalog: snapshot.catalog.map(copyProduct),
		movements: snapshot.movements.map((movement) => ({ ...movement }))
	});
}

export async function loadLatestBackup(): Promise<InventorySnapshot | undefined> {
	if (typeof window === 'undefined') return undefined;
	return (await db.backups.orderBy('exportedAt').reverse().first()) ?? undefined;
}

export function applyTheme(theme: ThemeMode): void {
	if (typeof document === 'undefined') return;
	const root = document.documentElement;
	root.dataset.theme =
		theme === 'system'
			? window.matchMedia('(prefers-color-scheme: dark)').matches
				? 'dark'
				: 'light'
			: theme;
}

export function persistTheme(theme: ThemeMode): void {
	if (typeof window === 'undefined') return;
	window.localStorage.setItem('matre-theme', theme);
	applyTheme(theme);
}

export function readStoredTheme(): ThemeMode {
	if (typeof window === 'undefined') return 'system';
	const value = window.localStorage.getItem('matre-theme');
	return value === 'light' || value === 'dark' ? value : 'system';
}
