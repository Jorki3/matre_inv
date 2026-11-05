import type { InventorySnapshot } from '$lib/inventory';

export const navItems = [
	{ id: 'dashboard', label: 'Inicio' },
	{ id: 'inventory', label: 'Inventario' },
	{ id: 'products', label: 'Productos' },
	{ id: 'unmatched', label: 'Artículos no encontrados' },
	{ id: 'backup', label: 'Respaldo' },
	{ id: 'settings', label: 'Configuración' }
] as const;
export const filters = [
	{ id: 'all', label: 'Todos' },
	{ id: 'pending', label: 'Pendientes' },
	{ id: 'counted', label: 'Contados' },
	{ id: 'difference', label: 'Diferencias' },
	{ id: 'exact', label: 'Sin diferencias' }
] as const;
export const statusLabels = {
	pending: 'Pendiente',
	counted: 'Contado',
	difference: 'Con diferencia'
};

export type DataAction =
	{ kind: 'reset' | 'new' } | { kind: 'restore'; snapshot: InventorySnapshot };
