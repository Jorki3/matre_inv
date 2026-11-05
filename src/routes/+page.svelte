<script lang="ts">
	import { asset } from '$app/paths';
	import { onMount, tick } from 'svelte';
	import {
		Archive,
		Download,
		FileSpreadsheet,
		Moon,
		PackageCheck,
		Search,
		SunMedium,
		Upload,
		Zap
	} from 'lucide-svelte';
	import * as XLSX from 'xlsx';
	import {
		backupFilename,
		resetSessionCounts,
		calculateDifference,
		computeMetrics,
		createInventoryExport,
		createSession,
		createSeedCatalog,
		countInSession,
		exportRows,
		getAchievementProgress,
		getProductStatus,
		searchProducts,
		sessionLabels,
		transitionSession,
		validateBackup,
		type InventorySnapshot,
		type InventoryMovement,
		type InventorySession,
		type InventoryStatus,
		type Product,
		type ThemeMode
	} from '$lib/inventory';
	import {
		detectColumns,
		importFields,
		mergeCatalog,
		previewCatalog,
		readCatalogFile,
		type CatalogRow,
		type ColumnMapping
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

	const navItems = [
		{ id: 'dashboard', label: 'Inicio' },
		{ id: 'inventory', label: 'Inventario' },
		{ id: 'products', label: 'Productos' },
		{ id: 'backup', label: 'Respaldo' },
		{ id: 'settings', label: 'Configuración' }
	] as const;
	const filters = [
		{ id: 'all', label: 'Todos' },
		{ id: 'pending', label: 'Pendientes' },
		{ id: 'counted', label: 'Contados' },
		{ id: 'difference', label: 'Diferencias' },
		{ id: 'exact', label: 'Sin diferencias' }
	] as const;
	const statusLabels = { pending: 'Pendiente', counted: 'Contado', difference: 'Con diferencia' };
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
	type DataAction = { kind: 'reset' | 'new' } | { kind: 'restore'; snapshot: InventorySnapshot };
	let dataAction = $state<DataAction | null>(null);
	let acknowledged = $state(false);
	let confirmationDialog = $state<HTMLDialogElement>();
	let cancelActionButton = $state<HTMLButtonElement>();
	let actionError = $state('');
	let actionTitle = $derived(
		dataAction?.kind === 'new'
			? 'Nuevo inventario'
			: dataAction?.kind === 'reset'
				? 'Reiniciar conteo'
				: 'Importar respaldo JSON'
	);
	let restoreMetrics = $derived(
		dataAction?.kind === 'restore' ? computeMetrics(dataAction.snapshot.catalog) : null
	);
	let headers = $state<string[]>([]);
	let importRows = $state<CatalogRow[]>([]);
	let mapping = $state<ColumnMapping>({ key: '', alternateKey: '', name: '', expected: '' });
	let importMode = $state<'append' | 'replace'>('append');
	let importFile = $state('');
	let metrics = $derived(computeMetrics(products));
	let achievements = $derived(getAchievementProgress(products));
	let visibleProducts = $derived(searchProducts(products, query, filter));
	let canCount = $derived(hydrated && !busy && session.status === 'active');
	let preview = $derived(
		previewCatalog(importRows, mapping, importMode === 'append' ? products : [])
	);
	const demoIdentities = new Set(
		createSeedCatalog().map((seed) => `${seed.id}|${seed.key}|${seed.name}`)
	);
	let hasDemo = $derived(
		products.some(
			(product) =>
				product.source === 'demo' ||
				demoIdentities.has(`${product.id}|${product.key}|${product.name}`)
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
					lastSavedAt: new Date().toISOString(),
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
		if (importMode === 'append' && hasDemo) {
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
		if (
			replacing &&
			!confirm(
				`¿Reemplazar ${products.length} productos y sus conteos por ${batch.products.length} productos pendientes? Se guardará un respaldo local previo. Exporta también un JSON para conservarlo fuera de este dispositivo.`
			)
		)
			return;
		const nextProducts = mergeCatalog(products, batch.products, importMode, replacing);
		if (await commit({ ...session, products: nextProducts }, replacing)) {
			message = `${batch.products.length} productos importados. ${batch.duplicates.length} duplicados omitidos.`;
			importRows = [];
			headers = [];
			importFile = '';
			selectedProductId = null;
		}
	}

	function downloadJson(value: unknown, filename = backupFilename()): void {
		const link = document.createElement('a');
		link.href = URL.createObjectURL(
			new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' })
		);
		link.download = filename;
		(confirmationDialog?.open ? confirmationDialog : document.body).append(link);
		link.click();
		link.remove();
		setTimeout(() => URL.revokeObjectURL(link.href), 60000);
	}

	async function exportJsonBackup(): Promise<void> {
		if (!hydrated || busy) return;
		downloadJson(createInventoryExport(products, session, movements));
		if (await commit({ ...session, products }, false, new Date().toISOString()))
			message = 'Respaldo JSON listo para descargar.';
	}

	async function exportPrevious(): Promise<void> {
		try {
			const previous = await loadLatestBackup();
			if (!previous) {
				message = 'No hay respaldo local previo.';
				return;
			}
			downloadJson(previous, backupFilename(new Date(previous.exportedAt), true));
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

	async function openDataAction(action: DataAction): Promise<void> {
		if (!hydrated || busy || dataAction) return;
		if (action.kind === 'new' && session.status !== 'completed') return;
		if (action.kind === 'reset' && session.status === 'completed') return;
		actionError = '';
		dataAction = action;
		acknowledged = false;
		await tick();
		confirmationDialog?.showModal();
		cancelActionButton?.focus();
	}

	function cancelDataAction(): void {
		if (busy) return;
		dataAction = null;
		acknowledged = false;
		confirmationDialog?.close();
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
</script>

<svelte:head>
	<title>MATRE Inventario</title>
	<meta name="theme-color" content="#B91C1C" />
	<link rel="manifest" href={asset('manifest.webmanifest')} />
</svelte:head>

{#snippet backupActions()}
	<div class="space-y-2">
		<button
			type="button"
			class="min-h-11 w-full rounded-xl bg-red-600 px-4 py-3 text-left text-sm font-medium text-white disabled:opacity-50"
			disabled={!hydrated || busy}
			onclick={exportJsonBackup}>Exportar respaldo JSON</button
		>
		<label
			class="flex min-h-11 w-full cursor-pointer items-center rounded-xl border border-zinc-300 px-4 py-3 text-sm dark:border-zinc-700"
			>Importar respaldo JSON<input
				type="file"
				accept="application/json,.json"
				class="sr-only"
				onchange={restoreBackup}
				disabled={!hydrated || busy}
				aria-label="Importar respaldo JSON"
			/></label
		>
		<button
			type="button"
			class="min-h-11 w-full rounded-xl border border-zinc-300 px-4 py-3 text-left text-sm dark:border-zinc-700"
			onclick={exportPrevious}>Descargar respaldo local previo</button
		>
	</div>
{/snippet}

<dialog
	bind:this={confirmationDialog}
	aria-labelledby="data-action-title"
	oncancel={(event) => {
		event.preventDefault();
		cancelDataAction();
	}}
	class="m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-lg overflow-y-auto rounded-2xl border border-zinc-200 bg-white p-5 text-zinc-900 shadow-xl backdrop:bg-black/60 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
>
	{#if dataAction}
		<h2 id="data-action-title" class="text-xl font-semibold">{actionTitle}</h2>
		{#if dataAction.kind === 'restore' && restoreMetrics}
			<div
				class="my-3 space-y-1 rounded-xl bg-zinc-100 p-3 text-sm dark:bg-zinc-800"
				data-testid="backup-preview"
			>
				<p>
					Productos: {restoreMetrics.total} · Contados: {restoreMetrics.counted} · Pendientes: {restoreMetrics.pending}
				</p>
				<p>Fecha del respaldo: {new Date(dataAction.snapshot.exportedAt).toLocaleString()}</p>
				<p>
					Sesión: {dataAction.snapshot.session.name} · {sessionLabels[
						dataAction.snapshot.session.status
					]}
				</p>
				<p>Formato: {dataAction.snapshot.version}</p>
			</div>
			<p class="mt-3 text-sm">
				{products.length || session.startedAt
					? `Se reemplazarán los datos locales: ${products.length} productos y ${metrics.counted} conteos.`
					: 'No hay productos ni conteos locales. Se restaurará el trabajo del respaldo.'}
			</p>
		{:else}
			<p class="mt-3 text-sm">
				{dataAction.kind === 'new'
					? 'Se conservará la sesión finalizada en un respaldo local y se creará una sesión distinta Sin iniciar.'
					: 'Se limpiarán las cantidades y fechas de conteo de esta misma sesión y volverá a Sin iniciar.'}
			</p>
			<p class="mt-2 text-sm">
				Se conservarán los {products.length} productos con su clave, clave alterna, descripción y existencia
				SICAR. Se reiniciarán las estadísticas y el progreso.
			</p>
		{/if}
		<p class="mt-3 text-sm text-zinc-600 dark:text-zinc-300">
			Antes de continuar, puedes descargar el inventario actual. También guardaremos una copia local
			previa sin borrar respaldos anteriores. El archivo JSON permite recuperarlo en otro
			dispositivo.
		</p>
		<button
			type="button"
			class="my-3 min-h-11 w-full rounded-xl border border-zinc-300 px-3 text-sm font-medium dark:border-zinc-600"
			disabled={busy}
			onclick={() => downloadJson(createInventoryExport(products, session, movements))}
			>Descargar respaldo actual JSON</button
		>
		<label
			class="flex min-h-11 items-start gap-3 rounded-xl bg-zinc-100 p-3 text-sm dark:bg-zinc-800"
			><input
				type="checkbox"
				bind:checked={acknowledged}
				disabled={busy}
				class="mt-1 h-5 w-5 shrink-0 accent-red-600"
			/>Entiendo que los conteos actuales serán reemplazados; confirmo esta operación.</label
		>
		{#if actionError}<p role="alert" class="mt-3 text-sm text-red-600">{actionError}</p>{/if}
		<div class="mt-4 flex flex-col-reverse gap-2 sm:flex-row">
			<button
				bind:this={cancelActionButton}
				type="button"
				class="min-h-11 flex-1 rounded-xl border border-zinc-300 px-4 dark:border-zinc-600"
				disabled={busy}
				onclick={cancelDataAction}>Cancelar</button
			>
			<button
				type="button"
				disabled={!acknowledged || busy}
				class="min-h-11 flex-1 rounded-xl bg-red-600 px-4 font-medium text-white disabled:opacity-50"
				onclick={confirmDataAction}
				>{busy
					? 'Guardando…'
					: dataAction.kind === 'restore'
						? 'Confirmar restauración'
						: dataAction.kind === 'new'
							? 'Crear nuevo inventario'
							: 'Confirmar reinicio'}</button
			>
		</div>
	{/if}
</dialog>

<div
	class="min-h-screen bg-zinc-50 text-zinc-900 transition-colors dark:bg-zinc-950 dark:text-zinc-50"
>
	<div class="mx-auto max-w-6xl px-4 pt-4 pb-20 sm:px-6">
		<header
			class="mb-3 rounded-2xl border border-zinc-200 bg-white/80 p-3 shadow-sm backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/80"
		>
			<div class="flex items-center justify-between gap-3">
				<div>
					<p class="text-xs font-medium tracking-[0.2em] text-zinc-500 uppercase">
						MATRE Ferretería
					</p>
					<h1 class="text-xl font-semibold">MATRE Inventario</h1>
				</div>
				<div class="flex items-center gap-2">
					<button
						aria-label="Cambiar tema"
						type="button"
						class="min-h-11 min-w-11 rounded-full border border-zinc-200 bg-zinc-100 p-2 text-zinc-700 transition hover:bg-zinc-200 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
						onclick={() => {
							setTheme(theme === 'dark' ? 'light' : 'dark');
						}}
					>
						{#if theme === 'dark'}
							<SunMedium size={18} />
						{:else}
							<Moon size={18} />
						{/if}
					</button>
				</div>
			</div>
		</header>

		{#if loadFailed}<div role="alert" class="mb-3 rounded-xl border border-red-500 p-3 text-sm">
				No se modificaron los datos almacenados. Exporta los originales antes de solicitar una
				reparación. <button class="min-h-11 underline" onclick={exportRaw}
					>Descargar datos originales</button
				>
			</div>{/if}
		<nav
			class="mb-3 grid grid-cols-3 gap-2 rounded-2xl border border-zinc-200 bg-white p-2 shadow-sm sm:grid-cols-5 dark:border-zinc-800 dark:bg-zinc-900"
		>
			{#each navItems as item (item.id)}
				<button
					type="button"
					class={`min-h-11 rounded-xl px-3 py-2 text-sm font-medium transition ${
						activeView === item.id
							? 'bg-red-600 text-white shadow-sm'
							: 'text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800'
					}`}
					onclick={() => (activeView = item.id)}
				>
					{item.label}
				</button>
			{/each}
		</nav>

		{#if activeView === 'dashboard'}
			<section class="space-y-6">
				<div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
					<div
						class="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
					>
						<p class="text-sm text-zinc-500">Total de productos</p>
						<p class="mt-3 text-3xl font-semibold">{metrics.total}</p>
					</div>
					<div
						class="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
					>
						<p class="text-sm text-zinc-500">Productos contados</p>
						<p class="mt-3 text-3xl font-semibold text-red-600">{metrics.counted}</p>
					</div>
					<div
						class="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
					>
						<p class="text-sm text-zinc-500">Productos pendientes</p>
						<p class="mt-3 text-3xl font-semibold">{metrics.pending}</p>
					</div>
					<div
						class="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
					>
						<p class="text-sm text-zinc-500">Avance</p>
						<p class="mt-3 text-3xl font-semibold">{metrics.progress}%</p>
					</div>
				</div>

				<div
					class="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
				>
					<div class="mb-2 flex items-center justify-between text-sm text-zinc-500">
						<span>Progreso del inventario</span>
						<span>{metrics.progress}%</span>
					</div>
					<div class="h-3 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
						<div
							class="h-full rounded-full bg-red-600 transition-all"
							style={`width: ${metrics.progress}%`}
						></div>
					</div>
				</div>

				<div class="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
					<div
						class="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
					>
						<div class="mb-4 flex items-center justify-between">
							<h2 class="text-lg font-semibold">Resumen del inventario</h2>
							<button
								type="button"
								class="rounded-xl bg-red-600 px-3 py-2 text-sm font-medium text-white"
								onclick={() => (activeView = 'inventory')}
							>
								Ver inventario
							</button>
						</div>
						<div class="space-y-3 text-sm text-zinc-600 dark:text-zinc-300">
							<div
								class="flex items-center justify-between rounded-xl bg-zinc-100 p-3 dark:bg-zinc-800"
							>
								<span>Inicio</span>
								<span
									>{session.startedAt
										? new Date(session.startedAt).toLocaleString()
										: 'Sin iniciar'}</span
								>
							</div>
							<div
								class="flex items-center justify-between rounded-xl bg-zinc-100 p-3 dark:bg-zinc-800"
							>
								<span>Productos con diferencias</span>
								<span>{metrics.differences}</span>
							</div>
							<div
								class="flex items-center justify-between rounded-xl bg-zinc-100 p-3 dark:bg-zinc-800"
							>
								<span>Sin diferencias</span>
								<span>{metrics.exact}</span>
							</div>
							<div
								class="flex items-center justify-between rounded-xl bg-zinc-100 p-3 dark:bg-zinc-800"
							>
								<span>Último respaldo</span>
								<span
									>{lastBackupAt
										? new Date(lastBackupAt).toLocaleDateString()
										: 'Sin respaldo'}</span
								>
							</div>
						</div>
					</div>

					<div
						class="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
					>
						<h2 class="mb-3 text-lg font-semibold">Logros</h2>
						<div class="space-y-3">
							{#each achievements as achievement (achievement.id)}
								<div class="rounded-xl border border-zinc-200 p-3 dark:border-zinc-800">
									<div class="mb-1 flex items-center justify-between text-sm">
										<span class="font-medium">{achievement.name}</span>
										<span
											>{achievement.unlocked
												? 'Desbloqueado'
												: `${achievement.progress}/${achievement.target}`}</span
										>
									</div>
									<div class="h-2 rounded-full bg-zinc-200 dark:bg-zinc-800">
										<div
											class="h-full rounded-full bg-red-600 transition-all"
											style={`width: ${(achievement.progress / achievement.target) * 100}%`}
										></div>
									</div>
								</div>
							{/each}
						</div>
					</div>
				</div>
			</section>
		{:else if activeView === 'inventory'}
			<section class="space-y-3" aria-label="Conteo de inventario">
				<div
					class="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900"
				>
					<div>
						<h2 class="font-semibold">{session.name}</h2>
						<p class="text-sm" data-testid="session-status">
							{sessionLabels[session.status]} · {metrics.counted}/{metrics.total} contados
						</p>
					</div>
					<div class="flex flex-wrap gap-2">
						{#if session.status === 'not_started' || session.status === 'paused'}
							<button
								class="min-h-11 rounded-xl bg-red-600 px-4 text-sm font-medium text-white disabled:opacity-50"
								disabled={!hydrated || busy}
								onclick={() => cycleSession('active')}
								>{session.status === 'not_started' ? 'Comenzar' : 'Reanudar'}</button
							>
						{/if}
						{#if session.status === 'active'}<button
								class="min-h-11 rounded-xl border border-zinc-300 px-3 text-sm dark:border-zinc-700"
								disabled={busy}
								onclick={() => cycleSession('paused')}>Pausar</button
							>{/if}
						{#if session.status === 'completed'}
							<button
								type="button"
								disabled={!hydrated || busy}
								class="min-h-11 rounded-xl bg-red-600 px-4 text-sm font-medium text-white disabled:opacity-50"
								onclick={() => openDataAction({ kind: 'new' })}>Nuevo inventario</button
							>
							<button
								type="button"
								class="min-h-11 rounded-xl border border-zinc-300 px-3 text-sm dark:border-zinc-700"
								onclick={exportExcel}>Exportar Excel</button
							>
							<button
								type="button"
								class="min-h-11 rounded-xl border border-zinc-300 px-3 text-sm dark:border-zinc-700"
								onclick={exportJsonBackup}>Exportar respaldo JSON</button
							>
						{/if}
						{#if session.status === 'active' || session.status === 'paused'}<button
								class="min-h-11 rounded-xl border border-zinc-300 px-3 text-sm dark:border-zinc-700"
								disabled={busy}
								onclick={() => cycleSession('completed')}>Finalizar</button
							>{/if}
					</div>
					{#if session.finishedAt}<p class="w-full text-xs text-zinc-500">
							Finalizado: {new Date(session.finishedAt).toLocaleString()}
						</p>{/if}
				</div>
				<div
					class="rounded-xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900"
				>
					<div class="relative">
						<Search
							size={18}
							class="pointer-events-none absolute top-3.5 left-3 text-zinc-400"
						/><input
							bind:value={query}
							aria-label="Buscar productos"
							class="min-h-11 w-full rounded-xl border border-zinc-300 bg-transparent pr-3 pl-10 text-base dark:border-zinc-700"
							placeholder="Descripción, clave o clave alterna"
						/>
					</div>
					<div class="mt-2 flex flex-wrap gap-1">
						{#each filters as item (item.id)}<button
								aria-pressed={filter === item.id}
								class={`min-h-11 rounded-xl px-3 text-sm ${filter === item.id ? 'bg-red-600 text-white' : 'bg-zinc-100 dark:bg-zinc-800'}`}
								onclick={() => (filter = item.id)}>{item.label}</button
							>{/each}
					</div>
				</div>
				<p class="text-sm text-zinc-500">
					{visibleProducts.length} productos · {canCount
						? 'Toca una tarjeta para capturar.'
						: session.status === 'completed'
							? 'Sesión finalizada: solo consulta y exportación.'
							: 'Captura bloqueada: comienza o reanuda la sesión para contar.'}
				</p>
				<div class="space-y-2">
					{#each visibleProducts as product (product.id)}
						<article
							class={`overflow-hidden rounded-xl border bg-white dark:bg-zinc-900 ${selectedProductId === product.id ? 'border-red-500' : 'border-zinc-200 dark:border-zinc-800'}`}
							data-testid="product-card"
						>
							<button
								class="flex min-h-16 w-full items-center justify-between gap-3 p-3 text-left"
								aria-expanded={selectedProductId === product.id}
								aria-controls={`count-${product.id}`}
								onclick={() => applySelection(product)}
							>
								<div class="min-w-0">
									<h3 class="font-medium">{product.name}</h3>
									<p class="text-xs break-words text-zinc-500">
										Clave: {product.key} · Alterna: {product.alternateKey || '—'}
									</p>
								</div>
								<div class="shrink-0 text-right text-sm">
									<span class="block font-semibold"
										>{product.countedAt ? product.physical : '—'}</span
									><span
										class:text-red-600={getProductStatus(product) === 'difference'}
										class="text-xs text-zinc-500">{statusLabels[getProductStatus(product)]}</span
									>
								</div>
							</button>
							{#if selectedProductId === product.id}
								<form
									id={`count-${product.id}`}
									class="border-t border-zinc-200 p-3 dark:border-zinc-800"
									onsubmit={(event) => {
										event.preventDefault();
										void saveCount(product);
									}}
								>
									<div class="mb-3 flex flex-wrap gap-x-6 gap-y-1 text-sm">
										<span>Existencia SICAR: <strong>{product.expected}</strong></span><span
											>Diferencia: <strong
												>{product.countedAt
													? calculateDifference(product.physical, product.expected)
													: '—'}</strong
											></span
										>
									</div>
									<div class="flex flex-wrap items-end gap-2">
										<label class="min-w-32 flex-1 text-sm"
											>Cantidad física<input
												aria-label="Cantidad física"
												bind:value={countDraft}
												disabled={!canCount}
												required
												type="number"
												min="0"
												step="any"
												inputmode="decimal"
												class="mt-1 min-h-11 w-full rounded-xl border border-zinc-300 bg-transparent px-3 text-base disabled:opacity-60 dark:border-zinc-700"
											/></label
										><button
											type="submit"
											disabled={!canCount || countDraft === undefined}
											class="min-h-11 rounded-xl bg-red-600 px-4 text-sm font-medium text-white disabled:opacity-50"
											>Guardar cantidad</button
										>
									</div>
								</form>
							{/if}
						</article>
					{:else}<p class="rounded-xl border border-zinc-200 p-4 text-sm dark:border-zinc-800">
							{products.length
								? 'No hay productos que coincidan.'
								: 'Importa tu catálogo desde Productos. No se cargan artículos de demostración.'}
						</p>{/each}
				</div>
			</section>
		{:else if activeView === 'products'}
			<section class="space-y-6">
				<div
					class="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
				>
					<div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
						<h2 class="text-xl font-semibold">Importación y catálogo</h2>
						<label
							class="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-red-600 px-3 py-2 text-sm font-medium text-white"
						>
							<Upload size={16} /> Importar catálogo
							<input
								type="file"
								accept=".xlsx,.xls,.csv"
								class="hidden"
								onchange={handleCatalogImport}
								disabled={!hydrated || busy || session.status === 'completed'}
								aria-label="Importar catálogo"
							/>
						</label>
					</div>
					<p class="mt-2 text-sm text-zinc-500">
						Importa Excel (.xls o .xlsx) o CSV. Revisa y asigna las columnas antes de confirmar. No
						hay una plantilla oficial de SICAR validada; verifica claves y existencias con tu
						archivo original.
					</p>
				</div>

				{#if importFile}
					<div
						class="space-y-4 rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"
						aria-label="Vista previa de importación"
					>
						<h3 class="font-semibold">Vista previa: {importFile}</h3>
						<p class="text-sm text-zinc-500">
							Primera hoja, encabezados en la primera fila. Asigna columnas únicas. Los errores y
							duplicados se omiten; no se generan claves ni existencias faltantes.
						</p>
						<div class="grid gap-3 sm:grid-cols-2">
							{#each importFields as field (field.id)}<label class="text-sm"
									>{field.label}<select
										bind:value={mapping[field.id]}
										class="mt-1 min-h-11 w-full rounded-xl border border-zinc-300 bg-white px-3 dark:border-zinc-700 dark:bg-zinc-900"
										><option value="">Sin asignar</option
										>{#each headers as header, index (index)}<option value={String(index)}
												>{index + 1}. {header || '(sin encabezado)'}</option
											>{/each}</select
									></label
								>{/each}
						</div>
						<label class="block text-sm"
							>Destino del catálogo<select
								bind:value={importMode}
								class="mt-1 min-h-11 w-full rounded-xl border border-zinc-300 bg-white px-3 dark:border-zinc-700 dark:bg-zinc-900"
								><option value="append" disabled={hasDemo}
									>Agregar solo claves nuevas (conservar conteos)</option
								><option value="replace">Reemplazar catálogo y conteos (con confirmación)</option
								></select
							></label
						>
						{#if hasDemo}<p class="text-sm text-red-600">
								Se detectaron artículos de demostración. El reemplazo requiere confirmación para no
								mezclarlos con tu catálogo real.
							</p>{/if}
						{#if !preview.mappingValid}<p class="text-sm text-red-600">
								Asigna Clave, Descripción y Existencia SICAR a columnas diferentes.
							</p>{/if}
						<p class="text-sm" data-testid="import-summary">
							{preview.products.length} válidos · {preview.duplicates.length} duplicados · {preview
								.errors.length} errores
						</p>
						{#if preview.products.length}<div class="overflow-x-auto">
								<table class="w-full text-left text-sm">
									<caption class="mb-2 text-left text-zinc-500"
										>Muestra de los primeros 5 registros válidos; se importan todos.</caption
									><thead
										><tr
											><th class="p-2">Clave</th><th class="p-2">Clave alterna</th><th class="p-2"
												>Descripción</th
											><th class="p-2">Existencia SICAR</th></tr
										></thead
									><tbody
										>{#each preview.products.slice(0, 5) as product (product.id)}<tr
												class="border-t border-zinc-200 dark:border-zinc-800"
												><td class="p-2">{product.key}</td><td class="p-2"
													>{product.alternateKey || '—'}</td
												><td class="p-2">{product.name}</td><td class="p-2">{product.expected}</td
												></tr
											>{/each}</tbody
									>
								</table>
							</div>{/if}
						{#if preview.errors.length || preview.duplicates.length}<details class="text-sm">
								<summary class="min-h-11 cursor-pointer py-3"
									>Ver incidencias (primeras 50 de cada tipo)</summary
								>{#each preview.errors.slice(0, 50) as error (error.row)}<p>
										Fila {error.row}: {error.message}
									</p>{/each}{#each preview.duplicates.slice(0, 50) as duplicate (duplicate.row)}<p>
										Fila {duplicate.row}: clave duplicada {duplicate.key}.
									</p>{/each}
							</details>{/if}
						<div class="flex flex-wrap gap-2">
							<button
								disabled={!preview.mappingValid ||
									!preview.products.length ||
									busy ||
									session.status === 'completed'}
								class="min-h-11 rounded-xl bg-red-600 px-4 text-sm font-medium text-white disabled:opacity-50"
								onclick={confirmImport}>Confirmar importación</button
							><button
								class="min-h-11 rounded-xl border border-zinc-300 px-4 text-sm dark:border-zinc-700"
								onclick={() => {
									importFile = '';
									importRows = [];
									headers = [];
								}}>Cancelar</button
							>
						</div>
					</div>
				{/if}

				<div class="grid gap-4 lg:grid-cols-2">
					<div
						class="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
					>
						<h3 class="mb-3 text-lg font-semibold">Estado del catálogo</h3>
						<div class="space-y-3 text-sm text-zinc-600 dark:text-zinc-300">
							<div class="flex justify-between rounded-xl bg-zinc-100 p-3 dark:bg-zinc-800">
								<span>Productos cargados</span><span>{products.length}</span>
							</div>
							<div class="flex justify-between rounded-xl bg-zinc-100 p-3 dark:bg-zinc-800">
								<span>Sin contar</span><span>{metrics.pending}</span>
							</div>
							<div class="flex justify-between rounded-xl bg-zinc-100 p-3 dark:bg-zinc-800">
								<span>Diferencias</span><span>{metrics.differences}</span>
							</div>
						</div>
					</div>

					<div
						class="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
					>
						<h3 class="mb-3 text-lg font-semibold">Acciones</h3>
						<div class="space-y-2">
							<button
								type="button"
								class="flex w-full items-center justify-between rounded-xl bg-zinc-100 p-3 text-left text-sm dark:bg-zinc-800"
								onclick={exportExcel}
							>
								<span class="flex items-center gap-2"
									><FileSpreadsheet size={16} /> Exportar Excel</span
								>
								<Download size={16} />
							</button>
							<button
								type="button"
								class="flex w-full items-center justify-between rounded-xl bg-zinc-100 p-3 text-left text-sm dark:bg-zinc-800"
								onclick={exportJsonBackup}
							>
								<span class="flex items-center gap-2"
									><Archive size={16} /> Exportar respaldo JSON</span
								>
								<Download size={16} />
							</button>
						</div>
					</div>
				</div>
			</section>
		{:else if activeView === 'backup'}
			<section class="space-y-6">
				<div class="grid gap-4 lg:grid-cols-2">
					<div
						class="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
					>
						<h2 class="mb-3 text-xl font-semibold">Respaldos</h2>
						{@render backupActions()}
					</div>

					<div
						class="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
					>
						<h3 class="mb-3 text-lg font-semibold">Estado</h3>
						<div class="space-y-3 text-sm text-zinc-600 dark:text-zinc-300">
							<div class="flex justify-between rounded-xl bg-zinc-100 p-3 dark:bg-zinc-800">
								<span>Último respaldo</span><span
									>{lastBackupAt ? new Date(lastBackupAt).toLocaleString() : 'No disponible'}</span
								>
							</div>
							<div class="flex justify-between rounded-xl bg-zinc-100 p-3 dark:bg-zinc-800">
								<span>Versión del respaldo</span><span>2 (compatible con 1)</span>
							</div>
						</div>
					</div>
				</div>
			</section>
		{:else}
			<section class="space-y-6">
				<div class="grid gap-4 lg:grid-cols-2">
					<section
						class="space-y-3 rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"
						aria-labelledby="data-admin-heading"
					>
						<h2 id="data-admin-heading" class="text-xl font-semibold">Administración de datos</h2>
						<p class="text-sm text-zinc-500">
							Reiniciar conteo limpia la sesión actual. Nuevo inventario abre otra sesión después de
							finalizar. Ambas acciones conservan el catálogo.
						</p>
						<button
							type="button"
							disabled={!hydrated || busy || session.status === 'completed'}
							class="min-h-11 w-full rounded-xl border border-red-600 px-4 text-left text-sm font-medium text-red-600 disabled:opacity-50"
							onclick={() => openDataAction({ kind: 'reset' })}>Reiniciar conteo</button
						>
						{#if session.status === 'completed'}<button
								type="button"
								disabled={busy}
								class="min-h-11 w-full rounded-xl bg-red-600 px-4 text-left text-sm font-medium text-white"
								onclick={() => openDataAction({ kind: 'new' })}>Nuevo inventario</button
							>
							<p class="text-sm text-zinc-500">
								La sesión finalizada es de solo lectura; prepara un nuevo inventario para volver a
								contar.
							</p>{/if}
					</section>
					<section
						class="space-y-3 rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"
						aria-labelledby="settings-backup-heading"
					>
						<h2 id="settings-backup-heading" class="text-xl font-semibold">Respaldos</h2>
						{@render backupActions()}
					</section>
				</div>

				<div class="grid gap-4 lg:grid-cols-2">
					<div
						class="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
					>
						<h2 class="mb-3 text-xl font-semibold">Configuración</h2>
						<div class="space-y-3 text-sm">
							<div
								class="flex items-center justify-between rounded-xl bg-zinc-100 p-3 dark:bg-zinc-800"
							>
								<span>Tema</span>
								<div class="flex gap-2">
									<button
										type="button"
										class={`rounded-lg px-3 py-1.5 ${theme === 'light' ? 'bg-red-600 text-white' : 'bg-zinc-200 dark:bg-zinc-700'}`}
										onclick={() => {
											setTheme('light');
										}}>Claro</button
									>
									<button
										type="button"
										class={`rounded-lg px-3 py-1.5 ${theme === 'dark' ? 'bg-red-600 text-white' : 'bg-zinc-200 dark:bg-zinc-700'}`}
										onclick={() => {
											setTheme('dark');
										}}>Oscuro</button
									>
									<button
										type="button"
										class={`rounded-lg px-3 py-1.5 ${theme === 'system' ? 'bg-red-600 text-white' : 'bg-zinc-200 dark:bg-zinc-700'}`}
										onclick={() => {
											setTheme('system');
										}}>Sistema</button
									>
								</div>
							</div>
							<div
								class="flex items-center justify-between rounded-xl bg-zinc-100 p-3 dark:bg-zinc-800"
							>
								<span>Modo PWA</span>
								<span class="inline-flex items-center gap-1 text-emerald-600"
									><PackageCheck size={16} /> Activado</span
								>
							</div>
						</div>
					</div>

					<div
						class="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
					>
						<h3 class="mb-3 text-lg font-semibold">Estado operativo</h3>
						<div class="space-y-3 text-sm text-zinc-600 dark:text-zinc-300">
							<div class="flex justify-between rounded-xl bg-zinc-100 p-3 dark:bg-zinc-800">
								<span>Sin conexión</span><span class="text-emerald-600">Soportado</span>
							</div>
							<div class="flex justify-between rounded-xl bg-zinc-100 p-3 dark:bg-zinc-800">
								<span>Almacenamiento</span><span>IndexedDB</span>
							</div>
							<div class="flex justify-between rounded-xl bg-zinc-100 p-3 dark:bg-zinc-800">
								<span>Estado</span><span>{sessionLabels[session.status]}</span>
							</div>
						</div>
					</div>
				</div>
			</section>
		{/if}

		<div
			role="status"
			aria-live="polite"
			class="fixed bottom-3 left-1/2 z-20 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 rounded-xl bg-zinc-900 px-4 py-3 text-sm text-zinc-100 shadow-lg dark:bg-white dark:text-zinc-900"
		>
			<div class="flex items-center gap-2">
				<Zap size={16} class="text-red-400" />
				<span>{message}</span>
			</div>
		</div>
	</div>
</div>
