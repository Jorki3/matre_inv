import Dexie, { type Table } from 'dexie';
import type { InventorySession, InventorySnapshot, Product, ThemeMode } from './inventory';

export interface StoredInventoryState {
	id: string;
	session: InventorySession;
	catalog: Product[];
	lastSavedAt: string;
	theme: ThemeMode;
	lastBackupAt?: string;
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

export async function loadInventoryState(): Promise<StoredInventoryState> {
	if (typeof window === 'undefined') {
		return {
			id: 'main',
			session: {
				id: 'demo-session',
				name: 'Inventario MATRE',
				startedAt: new Date().toISOString(),
				status: 'active',
				products: []
			},
			catalog: [],
			lastSavedAt: new Date().toISOString(),
			theme: 'system'
		};
	}

	const existing = await db.state.get('main');
	if (existing) {
		return existing;
	}

	const fallback: StoredInventoryState = {
		id: 'main',
		session: {
			id: 'demo-session',
			name: 'Inventario MATRE',
			startedAt: new Date().toISOString(),
			status: 'active',
			products: []
		},
		catalog: [],
		lastSavedAt: new Date().toISOString(),
		theme: 'system'
	};

	await db.state.put(fallback);
	return fallback;
}

export async function saveInventoryState(payload: StoredInventoryState): Promise<void> {
	if (typeof window === 'undefined') return;
	await db.state.put({ ...payload, id: payload.id ?? 'main', lastSavedAt: new Date().toISOString() });
}

export async function saveBackup(snapshot: InventorySnapshot): Promise<void> {
	if (typeof window === 'undefined') return;
	await db.backups.put(snapshot);
}

export async function loadLatestBackup(): Promise<InventorySnapshot | undefined> {
	if (typeof window === 'undefined') return undefined;
	return (await db.backups.orderBy('exportedAt').reverse().first()) ?? undefined;
}

export function applyTheme(theme: ThemeMode): void {
	if (typeof document === 'undefined') return;
	const root = document.documentElement;
	root.dataset.theme = theme === 'system' ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : theme;
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
