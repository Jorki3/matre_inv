import { asset } from '$app/paths';
import { onMount } from 'svelte';
import { SvelteDate } from 'svelte/reactivity';
import * as XLSX from 'xlsx';
import {
	backupFilename,
	resetSessionCounts,
	computeMetrics,
	createInventoryExport,
	createSession,
	createSeedCatalog,
	countInSession,
	exportRows,
	getAchievementProgress,
	searchProducts,
	sessionLabels,
	transitionSession,
	validateBackup,
	type InventoryMovement,
	type InventorySession,
	type InventoryStatus,
	type Product,
	type ThemeMode
} from '$lib/inventory';
import {
	detectColumns,
	mergeCatalog,
	previewCatalog,
	readCatalogFile,
	type CatalogRow,
	type ColumnMapping,
	type CatalogImportMode
} from '$lib/catalog-import';
import {
	applyTheme,
	db,
	loadInventoryState,
	loadLatestBackup,
	persistTheme,
	readStoredTheme,
	saveInventoryState
} from '$lib/database';
import { createSicarExport, SICAR_EXPORT_LAYOUT } from '$lib/sicar-export';
import { navItems, filters, type DataAction } from './inventory-ui';

/** One reactive controller per mounted application; never shared across users or SSR requests. */
export function createInventoryController() {
	let theme = $state<ThemeMode>('system');
	let activeView = $state<(typeof navItems)[number]['id']>('dashboard');
	let query = $state('');
	let filter = $state<(typeof filters)[number]['id']>('all');
	let products = $state<Product[]>([]);
	let session = $state<InventorySession>(createSession());
	let selectedProductId = $state<string | null>(null);
	let countDraft = $state<number | undefined>(undefined);
	let message = $state('Cargando inventario…');
	let hydrated = $state(false);
	let loadFailed = $state(false);
	let busy = $state(false);
	let lastBackupAt = $state<string | null>(null);
	let movements = $state<InventoryMovement[]>([]);
	let dataAction = $state<DataAction | null>(null);
	let acknowledged = $state(false);
	let actionError = $state('');
	const actionTitle = $derived(
		dataAction?.kind === 'new'
			? 'Nuevo inventario'
			: dataAction?.kind === 'reset'
				? 'Reiniciar conteo'
				: 'Importar respaldo JSON'
	);
	const restoreMetrics = $derived(
		dataAction?.kind === 'restore' ? computeMetrics(dataAction.snapshot.catalog) : null
	);
	let headers = $state<string[]>([]);
	let importRows = $state<CatalogRow[]>([]);
	let mapping = $state<ColumnMapping>({ key: '', alternateKey: '', name: '', expected: '' });
	let importMode = $state<CatalogImportMode>('append');
	let importFile = $state('');
	const metrics = $derived(computeMetrics(products));
	const achievements = $derived(getAchievementProgress(products));
	const visibleProducts = $derived(searchProducts(products, query, filter));
	const canCount = $derived(hydrated && !busy && session.status === 'active');
	const preview = $derived(previewCatalog(importRows, mapping, products, importMode));
	const demoIdentities = createSeedCatalog().map((seed) => `${seed.id}|${seed.key}|${seed.name}`);
	const hasDemo = $derived(
		products.some(
			(product) =>
				product.source === 'demo' ||
				demoIdentities.includes(`${product.id}|${product.key}|${product.name}`)
		)
	);

	function applySelection(product: Product): void {
		if (selectedProductId === product.id) {
			selectedProductId = null;
			return;
		}
		selectedProductId = product.id;
		countDraft = product.countedAt ? product.physical : undefined;
	}

	async function commit(
		next: InventorySession,
		archive = false,
		backupAt = lastBackupAt,
		nextMovements = movements
	): Promise<boolean> {
		if (!hydrated || busy) return false;
		busy = true;
		try {
			await saveInventoryState(
				{
					id: 'main',
					session: $state.snapshot(next),
					catalog: $state.snapshot(next.products),
					lastSavedAt: new SvelteDate().toISOString(),
					theme,
					lastBackupAt: backupAt ?? undefined,
					movements: $state.snapshot(nextMovements)
				},
				archive
			);
			session = next;
			products = next.products;
			lastBackupAt = backupAt;
			movements = nextMovements;
			return true;
		} catch (error) {
			message = `No se guardó el cambio. Conservamos el estado anterior. ${error instanceof Error ? error.message : 'Revisa el almacenamiento del navegador.'}`;
			return false;
		} finally {
			busy = false;
		}
	}

	async function cycleSession(next: InventoryStatus): Promise<void> {
		if (!hydrated || busy) return;
		if (
			next === 'completed' &&
			!confirm(
				'¿Finalizar el inventario? Se bloquearán los conteos y el catálogo. Podrás consultar y exportar los resultados.'
			)
		)
			return;
		try {
			if (await commit(transitionSession({ ...session, products }, next)))
				message = `Sesión: ${sessionLabels[next]}.`;
		} catch (error) {
			message = (error as Error).message;
		}
	}

	async function saveCount(product: Product): Promise<void> {
		if (!canCount || countDraft === undefined) return;
		try {
			const quantity = countDraft;
			const next = countInSession({ ...session, products }, product.id, quantity);
			if (await commit(next)) message = `${product.name}: ${quantity} unidades guardadas.`;
		} catch (error) {
			message = (error as Error).message;
		}
	}

	async function handleCatalogImport(event: Event): Promise<void> {
		const input = event.target as HTMLInputElement;
		const file = input.files?.[0];
		input.value = '';
		if (!file || !hydrated || busy || session.status === 'completed') return;
		try {
			const parsed = readCatalogFile(await file.arrayBuffer(), file.name);
			if (!parsed.rows.length)
				throw new Error('El archivo debe contener encabezados y productos en la primera hoja.');
			headers = parsed.headers;
			importRows = parsed.rows;
			mapping = detectColumns(headers);
			importFile = file.name;
			importMode = hasDemo ? 'replace' : 'append';
			message = 'Revisa las columnas y la vista previa antes de importar.';
		} catch (error) {
			message = `No se pudo leer el catálogo: ${(error as Error).message}`;
		}
	}

	async function confirmImport(): Promise<void> {
		const batch = preview;
		if (
			!hydrated ||
			busy ||
			session.status === 'completed' ||
			!batch.mappingValid ||
			!batch.products.length
		)
			return;
		if (importMode !== 'replace' && hasDemo) {
			message = 'Reemplaza el catálogo de demostración para no mezclarlo con productos reales.';
			return;
		}
		if (
			batch.errors.length &&
			!confirm(
				`Se omitirán ${batch.errors.length} filas con errores. ¿Importar únicamente los registros válidos?`
			)
		)
			return;
		const replacing = importMode === 'replace' && products.length > 0;
		const ongoing = session.status === 'active' || session.status === 'paused';
		const updating = importMode === 'update' && batch.updates > 0;
		if (ongoing || replacing || updating) {
			const warning = [
				ongoing ? 'Hay una sesión de inventario abierta.' : '',
				replacing
					? `Se reemplazarán ${products.length} productos y sus conteos por ${batch.products.length} productos pendientes.`
					: updating
						? `Se actualizarán ${batch.updates} claves existentes y se agregarán ${batch.additions} productos. Se conservarán las cantidades físicas, fechas de conteo y productos ausentes del archivo. Las diferencias pueden cambiar al actualizar existencias SICAR.`
						: 'Se agregarán solo claves nuevas; se conservarán todos los conteos.',
				'Se guardará un respaldo local previo. ¿Confirmar importación?'
			]
				.filter(Boolean)
				.join(' ');
			if (!confirm(warning)) return;
		}
		const nextProducts = mergeCatalog(products, batch.products, importMode, replacing);
		if (await commit({ ...session, products: nextProducts }, products.length > 0)) {
			message =
				importMode === 'update'
					? `${batch.additions} productos nuevos y ${batch.updates} actualizados. Conteos conservados. ${batch.duplicates.length} duplicados omitidos.`
					: `${batch.products.length} productos importados. ${batch.duplicates.length} duplicados omitidos.`;
			importRows = [];
			headers = [];
			importFile = '';
			selectedProductId = null;
		}
	}

	function exportForSicar(): void {
		if (!hydrated || busy) return;
		try {
			const rows = createSicarExport(products);
			if (!rows.length) {
				message = 'No hay conteos registrados para exportar a SICAR.';
				return;
			}
			if (
				metrics.pending &&
				!confirm(
					`Quedan ${metrics.pending} productos pendientes. Solo se exportarán ${rows.length} productos contados, incluidos los ceros registrados. ¿Continuar?`
				)
			)
				return;
			const workbook = XLSX.utils.book_new();
			XLSX.utils.book_append_sheet(
				workbook,
				XLSX.utils.json_to_sheet(rows, { header: [...SICAR_EXPORT_LAYOUT.columns] }),
				SICAR_EXPORT_LAYOUT.sheet
			);
			XLSX.writeFile(workbook, SICAR_EXPORT_LAYOUT.filename);
			message = `${rows.length} conteos exportados. Formato provisional Clave/Cantidad: valida la plantilla antes de usarlo en SICAR.`;
		} catch (error) {
			message = `No se pudo exportar para SICAR: ${(error as Error).message}`;
		}
	}

	function downloadJson(
		value: unknown,
		filename = backupFilename(),
		container: HTMLElement = document.body
	): void {
		const link = document.createElement('a');
		link.href = URL.createObjectURL(
			new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' })
		);
		link.download = filename;
		container.append(link);
		link.click();
		link.remove();
		setTimeout(() => URL.revokeObjectURL(link.href), 60000);
	}

	async function exportJsonBackup(): Promise<void> {
		if (!hydrated || busy) return;
		downloadJson(createInventoryExport(products, session, movements));
		if (await commit({ ...session, products }, false, new SvelteDate().toISOString()))
			message = 'Respaldo JSON listo para descargar.';
	}

	async function exportPrevious(): Promise<void> {
		try {
			const previous = await loadLatestBackup();
			if (!previous) {
				message = 'No hay respaldo local previo.';
				return;
			}
			downloadJson(previous, backupFilename(new SvelteDate(previous.exportedAt), true));
		} catch (error) {
			message = `No se pudo leer el respaldo local: ${(error as Error).message}`;
		}
	}

	async function exportRaw(): Promise<void> {
		try {
			downloadJson(await db.state.get('main'), 'matre-datos-originales.json');
		} catch (error) {
			message = `No se pudieron leer los datos originales: ${(error as Error).message}`;
		}
	}

	function openDataAction(action: DataAction): void {
		if (!hydrated || busy || dataAction) return;
		if (action.kind === 'new' && session.status !== 'completed') return;
		if (action.kind === 'reset' && session.status === 'completed') return;
		actionError = '';
		dataAction = action;
		acknowledged = false;
	}

	function cancelDataAction(): void {
		if (busy) return;
		dataAction = null;
		acknowledged = false;
	}

	async function confirmDataAction(): Promise<void> {
		if (!dataAction || !acknowledged || busy) return;
		const action = dataAction;
		try {
			const next =
				action.kind === 'restore'
					? action.snapshot.session
					: resetSessionCounts({ ...session, products }, action.kind);
			const backupAt = action.kind === 'restore' ? action.snapshot.exportedAt : lastBackupAt;
			const nextMovements =
				action.kind === 'restore'
					? action.snapshot.movements
					: action.kind === 'new'
						? []
						: movements;
			if (await commit(next, true, backupAt, nextMovements)) {
				selectedProductId = null;
				countDraft = undefined;
				query = '';
				filter = 'all';
				importRows = [];
				importFile = '';
				headers = [];
				message =
					action.kind === 'restore'
						? 'Respaldo restaurado con sus conteos y estado de sesión.'
						: action.kind === 'new'
							? 'Nuevo inventario preparado. Catálogo conservado; presiona Comenzar cuando estés listo.'
							: 'Conteos reiniciados. Catálogo conservado; sesión Sin iniciar.';
				cancelDataAction();
				if (action.kind !== 'restore') activeView = 'inventory';
			} else {
				actionError = message;
			}
		} catch (error) {
			message = `No se realizó la operación: ${(error as Error).message}`;
			actionError = message;
		}
	}

	async function restoreBackup(event: Event): Promise<void> {
		const input = event.target as HTMLInputElement;
		const file = input.files?.[0];
		input.value = '';
		if (!file || !hydrated || busy || dataAction) return;
		try {
			const result = validateBackup(JSON.parse(await file.text()));
			if (!result.valid || !result.value) throw new Error(result.message);
			await openDataAction({ kind: 'restore', snapshot: result.value });
		} catch (error) {
			message = `No se pudo restaurar el respaldo: ${(error as Error).message}`;
		}
	}

	function exportExcel(): void {
		const workbook = XLSX.utils.book_new();
		XLSX.utils.book_append_sheet(
			workbook,
			XLSX.utils.json_to_sheet(exportRows(products)),
			'Inventario'
		);
		XLSX.writeFile(workbook, 'matre-inventario.xlsx');
		message = 'Reporte Excel generado; no es un archivo de actualización de SICAR.';
	}

	function setTheme(next: ThemeMode): void {
		theme = next;
		applyTheme(theme);
		try {
			persistTheme(theme);
		} catch {
			message = 'No se pudo conservar la preferencia de tema.';
		}
	}

	onMount(() => {
		async function initialize() {
			try {
				theme = readStoredTheme();
				applyTheme(theme);
				const saved = await loadInventoryState();
				products = saved.catalog;
				session = saved.session;
				lastBackupAt = saved.lastBackupAt ?? null;
				movements = saved.movements ?? [];
				hydrated = true;
				message = `Sesión: ${sessionLabels[session.status]}.`;
			} catch (error) {
				loadFailed = true;
				message = `No se pudo cargar el inventario. No se sobrescribieron datos. ${(error as Error).message}`;
			}
		}
		void initialize();
		if (import.meta.env.PROD && 'serviceWorker' in navigator)
			void navigator.serviceWorker.register(asset('sw.js')).catch(() => undefined);
	});

	function downloadCurrentBackup(container?: HTMLElement): void {
		downloadJson(createInventoryExport(products, session, movements), backupFilename(), container);
	}

	function setMappingColumn(field: keyof ColumnMapping, column: string): void {
		mapping[field] = column;
	}

	function cancelCatalogImport(): void {
		importFile = '';
		importRows = [];
		headers = [];
	}

	return {
		get theme() {
			return theme;
		},
		get products() {
			return products;
		},
		get session() {
			return session;
		},
		get selectedProductId() {
			return selectedProductId;
		},
		get message() {
			return message;
		},
		get hydrated() {
			return hydrated;
		},
		get loadFailed() {
			return loadFailed;
		},
		get busy() {
			return busy;
		},
		get lastBackupAt() {
			return lastBackupAt;
		},
		get dataAction() {
			return dataAction;
		},
		get actionError() {
			return actionError;
		},
		get actionTitle() {
			return actionTitle;
		},
		get restoreMetrics() {
			return restoreMetrics;
		},
		get headers() {
			return headers;
		},
		get mapping() {
			return mapping;
		},
		get importFile() {
			return importFile;
		},
		get metrics() {
			return metrics;
		},
		get achievements() {
			return achievements;
		},
		get visibleProducts() {
			return visibleProducts;
		},
		get canCount() {
			return canCount;
		},
		get preview() {
			return preview;
		},
		get hasDemo() {
			return hasDemo;
		},
		get activeView() {
			return activeView;
		},
		set activeView(value: (typeof navItems)[number]['id']) {
			activeView = value;
		},
		get query() {
			return query;
		},
		set query(value: string) {
			query = value;
		},
		get filter() {
			return filter;
		},
		set filter(value: (typeof filters)[number]['id']) {
			filter = value;
		},
		get countDraft() {
			return countDraft;
		},
		set countDraft(value: number | undefined) {
			countDraft = value;
		},
		get acknowledged() {
			return acknowledged;
		},
		set acknowledged(value: boolean) {
			acknowledged = value;
		},
		get importMode() {
			return importMode;
		},
		set importMode(value: CatalogImportMode) {
			importMode = value;
		},
		setMappingColumn,
		applySelection,
		cycleSession,
		saveCount,
		handleCatalogImport,
		confirmImport,
		cancelCatalogImport,
		exportJsonBackup,
		downloadCurrentBackup,
		exportPrevious,
		exportRaw,
		openDataAction,
		cancelDataAction,
		confirmDataAction,
		restoreBackup,
		exportExcel,
		exportForSicar,
		setTheme
	};
}

export type InventoryController = ReturnType<typeof createInventoryController>;
