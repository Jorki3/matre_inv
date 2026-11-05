<script lang="ts">
	import { onMount } from 'svelte';
	import {
		Archive,
		BarChart3,
		Check,
		Download,
		FileSpreadsheet,
		Moon,
		PackageCheck,
		Pause,
		Play,
		Search,
		SunMedium,
		Upload,
		Zap
	} from 'lucide-svelte';
	import * as XLSX from 'xlsx';
	import {
		applyPhysicalCount,
		calculateDifference,
		computeMetrics,
		createInventoryExport,
		createSeedCatalog,
		getAchievementProgress,
		getProductStatus,
		searchProducts,
		validateBackup,
		type InventorySession,
		type Product,
		type ThemeMode
	} from '$lib/inventory';
	import {
		applyTheme,
		loadInventoryState,
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

	let theme = $state<ThemeMode>('system');
	let activeView = $state<(typeof navItems)[number]['id']>('dashboard');
	let query = $state('');
	let filter = $state<(typeof filters)[number]['id']>('all');
	let products = $state<Product[]>([]);
	let session = $state<InventorySession>({
		id: 'demo-session',
		name: 'Inventario MATRE',
		startedAt: new Date().toISOString(),
		status: 'active',
		products: []
	});
	let selectedProductId = $state<string | null>(null);
	let countDraft = $state(0);
	let message = $state('Inventario listo para comenzar.');
	let hydrated = $state(false);
	let lastBackupAt = $state<string | null>(null);

	let metrics = $derived.by(() => computeMetrics(products));
	let achievements = $derived.by(() => getAchievementProgress(products));
	let visibleProducts = $derived.by(() => searchProducts(products, query, filter));
	let currentProduct = $derived.by(() => {
		if (!products.length) return null;
		return products.find((product) => product.id === selectedProductId) ?? products[0];
	});

	function firstValue(row: Record<string, unknown>, candidates: string[]): string | number | undefined {
		for (const candidate of candidates) {
			const value = row[candidate];
			if (value !== undefined && value !== null && String(value).trim() !== '') {
				return String(value);
			}
		}
		return undefined;
	}

	function applySelection(id: string): void {
		selectedProductId = id;
		const product = products.find((entry) => entry.id === id);
		countDraft = product?.physical ?? 0;
	}

	async function persistState(): Promise<void> {
		if (!hydrated) return;
		await saveInventoryState({
			id: 'main',
			session: { ...session, products },
			catalog: products,
			lastSavedAt: new Date().toISOString(),
			theme,
			lastBackupAt: lastBackupAt ?? undefined
		});
		persistTheme(theme);
	}

	$effect(() => {
		if (!hydrated) return;
		void persistState();
	});

	function cycleSession(nextStatus: 'active' | 'paused' | 'completed'): void {
		session = {
			...session,
			status: nextStatus,
			finishedAt: nextStatus === 'completed' ? new Date().toISOString() : undefined
		};
		message =
			nextStatus === 'active'
				? 'Inventario reanudado.'
				: nextStatus === 'paused'
					? 'Inventario pausado.'
					: 'Inventario finalizado.';
	}

	function saveCount(productId: string): void {
		const target = products.find((product) => product.id === productId);
		if (!target) return;
		const quantity = Number(countDraft);
		const next = applyPhysicalCount(target, quantity);
		products = products.map((product) => (product.id === productId ? next : product));
		session = { ...session, products };
		const nextProduct = products.find((product) => product.id !== productId) ?? next;
		if (nextProduct) {
			applySelection(nextProduct.id);
		}
		message = `${target.name} registrado con ${quantity} unidades.`;
	}

	async function handleCatalogImport(event: Event): Promise<void> {
		const input = event.target as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;

		try {
			const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' });
			const sheet = workbook.Sheets[workbook.SheetNames[0]];
			const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
			const imported = rows
				.slice(0, 200)
				.map((row, index) => {
					const name = firstValue(row, ['descripcion', 'descripcion_producto', 'producto', 'nombre', 'product_name']) ?? `Producto ${index + 1}`;
					const key = firstValue(row, ['clave', 'clave_interna', 'codigo', 'sku', 'internal_key']) ?? `SKU-${index + 1}`;
					const barcode = firstValue(row, ['codigo_barras', 'barcode', 'ean', 'ean13']) ?? '';
					const expected = Number(firstValue(row, ['existencia', 'stock', 'existencia_sicar', 'quantity']) ?? 0);
					return {
						id: String(firstValue(row, ['id', 'identificador', 'product_id']) ?? `import-${Date.now()}-${index + 1}`),
						name: String(name),
						key: String(key),
						barcode: String(barcode),
						expected: Number.isFinite(expected) ? expected : 0,
						physical: 0,
						createdAt: new Date().toISOString(),
						source: 'importado'
					};
				});
			products = imported.length ? [...products, ...imported] : products;
			session = { ...session, products };
			if (products.length && !selectedProductId) {
				applySelection(products[0].id);
			}
			message = `Se importaron ${imported.length} productos del archivo.`;
		} catch (error) {
			message = `No fue posible importar el catálogo: ${error instanceof Error ? error.message : 'archivo no compatible'}`;
		}
		input.value = '';
	}

	function exportJsonBackup(): void {
		const blob = new Blob(
			[
				JSON.stringify(
					createInventoryExport(products, session),
					null,
					2
				)
			],
			{ type: 'application/json' }
		);
		const link = document.createElement('a');
		link.href = URL.createObjectURL(blob);
		link.download = 'matre-backup.json';
		link.click();
		URL.revokeObjectURL(link.href);
		lastBackupAt = new Date().toISOString();
		message = 'Respaldo JSON listo para descargar.';
	}

	async function restoreBackup(event: Event): Promise<void> {
		const input = event.target as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;
		try {
			const text = await file.text();
			const parsed = JSON.parse(text);
			const result = validateBackup(parsed);
			if (!result.valid || !result.value) {
				throw new Error(result.message);
			}
			products = result.value.catalog;
			session = result.value.session;
			lastBackupAt = result.value.exportedAt;
			selectedProductId = products[0]?.id ?? null;
			message = 'Respaldo restaurado correctamente.';
		} catch (error) {
			message = `No se pudo restaurar el respaldo: ${error instanceof Error ? error.message : 'archivo inválido'}`;
		}
		input.value = '';
	}

	function exportExcel(): void {
		const rows = products.map((product) => ({
			Producto: product.name,
			Clave: product.key,
			CodigoBarras: product.barcode,
			ExistenciaSICAR: product.expected,
			ExistenciaFisica: product.physical,
			Diferencia: calculateDifference(product.physical, product.expected),
			Estado: getProductStatus(product)
		}));
		const sheet = XLSX.utils.json_to_sheet(rows);
		const workbook = XLSX.utils.book_new();
		XLSX.utils.book_append_sheet(workbook, sheet, 'Inventario');
		XLSX.writeFile(workbook, 'matre-inventario.xlsx');
		message = 'Reporte Excel generado.';
	}

	onMount(async () => {
		const savedTheme = readStoredTheme();
		theme = savedTheme;
		applyTheme(theme);
		const savedState = await loadInventoryState();
		products = savedState.catalog.length ? savedState.catalog : createSeedCatalog();
		session = savedState.session?.id ? { ...savedState.session, products } : { ...session, products };
		if (!products.length) {
			products = createSeedCatalog();
		}
		if (products.length) {
			selectedProductId = products[0].id;
			countDraft = products[0].physical;
		}
		lastBackupAt = savedState.lastBackupAt ?? null;
		hydrated = true;
		if ('serviceWorker' in navigator) {
			navigator.serviceWorker.register('/sw.js').catch(() => undefined);
		}
	});
</script>

<svelte:head>
	<title>MATRE Inventario</title>
	<meta name="theme-color" content="#B91C1C" />
	<link rel="manifest" href="/manifest.webmanifest" />
</svelte:head>

<div class="min-h-screen bg-zinc-50 text-zinc-900 transition-colors dark:bg-zinc-950 dark:text-zinc-50">
	<div class="mx-auto max-w-6xl px-4 pb-20 pt-4 sm:px-6">
		<header class="mb-6 rounded-2xl border border-zinc-200 bg-white/80 p-4 shadow-sm backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/80">
			<div class="flex items-center justify-between gap-3">
				<div>
					<p class="text-xs font-medium uppercase tracking-[0.2em] text-zinc-500">MATRE Ferretería</p>
					<h1 class="mt-1 text-2xl font-semibold">MATRE Inventario</h1>
				</div>
				<div class="flex items-center gap-2">
					<button
						type="button"
						class="rounded-full border border-zinc-200 bg-zinc-100 p-2 text-zinc-700 transition hover:bg-zinc-200 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
						onclick={() => {
							theme = theme === 'dark' ? 'light' : 'dark';
							applyTheme(theme);
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

		<nav class="mb-6 grid grid-cols-2 gap-2 rounded-2xl border border-zinc-200 bg-white p-2 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 sm:grid-cols-5">
			{#each navItems as item (item.id)}
				<button
					type="button"
					class={`rounded-xl px-3 py-2 text-sm font-medium transition ${
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
					<div class="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
						<p class="text-sm text-zinc-500">Total de productos</p>
						<p class="mt-3 text-3xl font-semibold">{metrics.total}</p>
					</div>
					<div class="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
						<p class="text-sm text-zinc-500">Productos contados</p>
						<p class="mt-3 text-3xl font-semibold text-red-600">{metrics.counted}</p>
					</div>
					<div class="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
						<p class="text-sm text-zinc-500">Productos pendientes</p>
						<p class="mt-3 text-3xl font-semibold">{metrics.pending}</p>
					</div>
					<div class="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
						<p class="text-sm text-zinc-500">Avance</p>
						<p class="mt-3 text-3xl font-semibold">{metrics.progress}%</p>
					</div>
				</div>

				<div class="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
					<div class="mb-2 flex items-center justify-between text-sm text-zinc-500">
						<span>Progreso del inventario</span>
						<span>{metrics.progress}%</span>
					</div>
					<div class="h-3 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
						<div class="h-full rounded-full bg-red-600 transition-all" style={`width: ${metrics.progress}%`}></div>
					</div>
				</div>

				<div class="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
					<div class="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
						<div class="mb-4 flex items-center justify-between">
							<h2 class="text-lg font-semibold">Resumen del inventario</h2>
							<button type="button" class="rounded-xl bg-red-600 px-3 py-2 text-sm font-medium text-white" onclick={() => (activeView = 'inventory')}>
								Continuar conteo
							</button>
						</div>
						<div class="space-y-3 text-sm text-zinc-600 dark:text-zinc-300">
							<div class="flex items-center justify-between rounded-xl bg-zinc-100 p-3 dark:bg-zinc-800">
								<span>Inicio</span>
								<span>{new Date(session.startedAt).toLocaleString()}</span>
							</div>
							<div class="flex items-center justify-between rounded-xl bg-zinc-100 p-3 dark:bg-zinc-800">
								<span>Productos con diferencias</span>
								<span>{metrics.differences}</span>
							</div>
							<div class="flex items-center justify-between rounded-xl bg-zinc-100 p-3 dark:bg-zinc-800">
								<span>Sin diferencias</span>
								<span>{metrics.exact}</span>
							</div>
							<div class="flex items-center justify-between rounded-xl bg-zinc-100 p-3 dark:bg-zinc-800">
								<span>Último respaldo</span>
								<span>{lastBackupAt ? new Date(lastBackupAt).toLocaleDateString() : 'Sin respaldo'}</span>
							</div>
						</div>
					</div>

					<div class="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
						<h2 class="mb-3 text-lg font-semibold">Logros</h2>
						<div class="space-y-3">
							{#each achievements as achievement (achievement.id)}
								<div class="rounded-xl border border-zinc-200 p-3 dark:border-zinc-800">
									<div class="mb-1 flex items-center justify-between text-sm">
										<span class="font-medium">{achievement.name}</span>
										<span>{achievement.unlocked ? 'Desbloqueado' : `${achievement.progress}/${achievement.target}`}</span>
									</div>
									<div class="h-2 rounded-full bg-zinc-200 dark:bg-zinc-800">
										<div class="h-full rounded-full bg-red-600 transition-all" style={`width: ${(achievement.progress / achievement.target) * 100}%`}></div>
									</div>
								</div>
							{/each}
						</div>
					</div>
				</div>
			</section>
		{:else if activeView === 'inventory'}
			<section class="space-y-6">
				<div class="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
					<div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
						<div>
							<p class="text-xs uppercase tracking-[0.2em] text-zinc-500">Sesión</p>
							<h2 class="text-xl font-semibold">{session.name}</h2>
						</div>
						<div class="flex gap-2">
							<button type="button" class="rounded-xl bg-red-600 px-3 py-2 text-sm font-medium text-white" onclick={() => cycleSession('active')}>
								<Play size={16} class="mr-1 inline" />Reanudar
							</button>
							<button type="button" class="rounded-xl border border-zinc-200 px-3 py-2 text-sm font-medium dark:border-zinc-700" onclick={() => cycleSession('paused')}>
								<Pause size={16} class="mr-1 inline" />Pausar
							</button>
							<button type="button" class="rounded-xl border border-zinc-200 px-3 py-2 text-sm font-medium dark:border-zinc-700" onclick={() => cycleSession('completed')}>
								<Check size={16} class="mr-1 inline" />Finalizar
							</button>
						</div>
					</div>
				</div>

				<div class="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
					<div class="flex flex-col gap-3 sm:flex-row sm:items-center">
						<div class="relative flex-1">
							<Search size={16} class="pointer-events-none absolute left-3 top-3.5 text-zinc-400" />
							<input bind:value={query} class="w-full rounded-xl border border-zinc-200 bg-zinc-50 py-2.5 pl-10 pr-3 text-sm outline-none ring-0 transition focus:border-red-500 dark:border-zinc-700 dark:bg-zinc-800" placeholder="Buscar por nombre, clave o código de barras" />
						</div>
						<div class="flex flex-wrap gap-2">
							{#each filters as item (item.id)}
								<button
									type="button"
									class={`rounded-full px-3 py-1.5 text-xs font-medium ${
										filter === item.id
											? 'bg-red-600 text-white'
											: 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300'
									}`}
									onclick={() => (filter = item.id)}
								>
									{item.label}
								</button>
							{/each}
						</div>
					</div>
				</div>

				<div class="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
					<div class="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
						<h3 class="mb-3 text-lg font-semibold">Productos</h3>
						<div class="space-y-2">
							{#each visibleProducts as product (product.id)}
								<button
									type="button"
									class={`flex w-full items-center justify-between rounded-xl border p-3 text-left transition ${
										currentProduct?.id === product.id
											? 'border-red-500 bg-red-50 dark:border-red-500 dark:bg-red-500/5'
											: 'border-zinc-200 bg-zinc-50 hover:bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-800/50 dark:hover:bg-zinc-800'
									}`}
									onclick={() => applySelection(product.id)}
								>
									<div>
										<p class="font-medium">{product.name}</p>
										<p class="text-xs text-zinc-500">{product.key} · {product.barcode || 'Sin código'}</p>
									</div>
									<div class="text-right">
										<span class="block text-sm font-medium">{product.physical}</span>
										<span class="text-xs text-zinc-500">{getProductStatus(product)}</span>
									</div>
								</button>
							{/each}
						</div>
					</div>

					<div class="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
						{#if currentProduct}
							<div class="space-y-4">
								<p class="text-xs uppercase tracking-[0.2em] text-zinc-500">Producto</p>
								<h3 class="text-2xl font-semibold">{currentProduct.name}</h3>
								<div class="grid gap-2 text-sm text-zinc-600 dark:text-zinc-300">
									<div class="flex justify-between"><span>Clave</span><span>{currentProduct.key}</span></div>
									<div class="flex justify-between"><span>Código</span><span>{currentProduct.barcode || 'Sin código'}</span></div>
									<div class="flex justify-between"><span>SICAR</span><span>{currentProduct.expected}</span></div>
									<div class="flex justify-between"><span>Físico</span><span>{currentProduct.physical}</span></div>
									<div class="flex justify-between"><span>Diferencia</span><span>{calculateDifference(currentProduct.physical, currentProduct.expected)}</span></div>
								</div>
								<div class="mt-4 rounded-xl bg-zinc-100 p-3 dark:bg-zinc-800">
									<label for="count-draft" class="mb-2 block text-xs uppercase tracking-[0.2em] text-zinc-500">Cantidad física</label>
									<input id="count-draft" bind:value={countDraft} type="number" class="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900" />
								</div>
								<div class="flex gap-2 pt-2">
									<button type="button" class="flex-1 rounded-xl bg-red-600 px-3 py-2 text-sm font-medium text-white" onclick={() => saveCount(currentProduct.id)}>
										Guardar cantidad
									</button>
								</div>
							</div>
						{:else}
							<p class="text-sm text-zinc-500">No hay productos disponibles para contar.</p>
						{/if}
					</div>
				</div>
			</section>
		{:else if activeView === 'products'}
			<section class="space-y-6">
				<div class="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
					<div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
						<h2 class="text-xl font-semibold">Importación y catálogo</h2>
						<label class="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-red-600 px-3 py-2 text-sm font-medium text-white">
							<Upload size={16} /> Importar catálogo
							<input type="file" accept=".xlsx,.xls,.csv" class="hidden" onchange={handleCatalogImport} aria-label="Importar catálogo" />
						</label>
					</div>
					<p class="mt-2 text-sm text-zinc-500">Importa una plantilla genérica de SICAR o un catálogo en Excel para mapear columnas y preparar el conteo.</p>
				</div>

				<div class="grid gap-4 lg:grid-cols-2">
					<div class="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
						<h3 class="mb-3 text-lg font-semibold">Estado del catálogo</h3>
						<div class="space-y-3 text-sm text-zinc-600 dark:text-zinc-300">
							<div class="flex justify-between rounded-xl bg-zinc-100 p-3 dark:bg-zinc-800"><span>Productos cargados</span><span>{products.length}</span></div>
							<div class="flex justify-between rounded-xl bg-zinc-100 p-3 dark:bg-zinc-800"><span>Sin contar</span><span>{metrics.pending}</span></div>
							<div class="flex justify-between rounded-xl bg-zinc-100 p-3 dark:bg-zinc-800"><span>Diferencias</span><span>{metrics.differences}</span></div>
						</div>
					</div>

					<div class="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
						<h3 class="mb-3 text-lg font-semibold">Acciones</h3>
						<div class="space-y-2">
							<button type="button" class="flex w-full items-center justify-between rounded-xl bg-zinc-100 p-3 text-left text-sm dark:bg-zinc-800" onclick={exportExcel}>
								<span class="flex items-center gap-2"><FileSpreadsheet size={16} /> Exportar Excel</span>
								<Download size={16} />
							</button>
							<button type="button" class="flex w-full items-center justify-between rounded-xl bg-zinc-100 p-3 text-left text-sm dark:bg-zinc-800" onclick={exportJsonBackup}>
								<span class="flex items-center gap-2"><Archive size={16} /> Exportar respaldo JSON</span>
								<Download size={16} />
							</button>
						</div>
					</div>
				</div>
			</section>
		{:else if activeView === 'backup'}
			<section class="space-y-6">
				<div class="grid gap-4 lg:grid-cols-2">
					<div class="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
						<h2 class="mb-3 text-xl font-semibold">Respaldos</h2>
						<div class="space-y-3 text-sm">
							<button type="button" class="flex w-full items-center justify-between rounded-xl bg-red-600 px-4 py-3 text-white" onclick={exportJsonBackup}>
								<span class="flex items-center gap-2"><Archive size={16} /> Exportar respaldo</span>
								<Download size={16} />
							</button>
							<label class="flex w-full cursor-pointer items-center justify-between rounded-xl border border-zinc-200 bg-zinc-100 px-4 py-3 text-zinc-700 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200">
								<span class="flex items-center gap-2"><Upload size={16} /> Importar respaldo</span>
								<input type="file" accept="application/json,.json" class="hidden" onchange={restoreBackup} aria-label="Importar respaldo" />
							</label>
						</div>
					</div>

					<div class="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
						<h3 class="mb-3 text-lg font-semibold">Estado</h3>
						<div class="space-y-3 text-sm text-zinc-600 dark:text-zinc-300">
							<div class="flex justify-between rounded-xl bg-zinc-100 p-3 dark:bg-zinc-800"><span>Último respaldo</span><span>{lastBackupAt ? new Date(lastBackupAt).toLocaleString() : 'No disponible'}</span></div>
							<div class="flex justify-between rounded-xl bg-zinc-100 p-3 dark:bg-zinc-800"><span>Versión</span><span>1.0</span></div>
						</div>
					</div>
				</div>
			</section>
		{:else}
			<section class="space-y-6">
				<div class="grid gap-4 lg:grid-cols-2">
					<div class="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
						<h2 class="mb-3 text-xl font-semibold">Configuración</h2>
						<div class="space-y-3 text-sm">
							<div class="flex items-center justify-between rounded-xl bg-zinc-100 p-3 dark:bg-zinc-800">
								<span>Tema</span>
								<div class="flex gap-2">
									<button type="button" class={`rounded-lg px-3 py-1.5 ${theme === 'light' ? 'bg-red-600 text-white' : 'bg-zinc-200 dark:bg-zinc-700'}`} onclick={() => { theme = 'light'; applyTheme(theme); }}>Claro</button>
									<button type="button" class={`rounded-lg px-3 py-1.5 ${theme === 'dark' ? 'bg-red-600 text-white' : 'bg-zinc-200 dark:bg-zinc-700'}`} onclick={() => { theme = 'dark'; applyTheme(theme); }}>Oscuro</button>
									<button type="button" class={`rounded-lg px-3 py-1.5 ${theme === 'system' ? 'bg-red-600 text-white' : 'bg-zinc-200 dark:bg-zinc-700'}`} onclick={() => { theme = 'system'; applyTheme(theme); }}>Sistema</button>
								</div>
							</div>
							<div class="flex items-center justify-between rounded-xl bg-zinc-100 p-3 dark:bg-zinc-800">
								<span>Modo PWA</span>
								<span class="inline-flex items-center gap-1 text-emerald-600"><PackageCheck size={16} /> Activado</span>
							</div>
						</div>
					</div>

					<div class="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
						<h3 class="mb-3 text-lg font-semibold">Estado operativo</h3>
						<div class="space-y-3 text-sm text-zinc-600 dark:text-zinc-300">
							<div class="flex justify-between rounded-xl bg-zinc-100 p-3 dark:bg-zinc-800"><span>Sin conexión</span><span class="text-emerald-600">Soportado</span></div>
							<div class="flex justify-between rounded-xl bg-zinc-100 p-3 dark:bg-zinc-800"><span>Almacenamiento</span><span>IndexedDB</span></div>
							<div class="flex justify-between rounded-xl bg-zinc-100 p-3 dark:bg-zinc-800"><span>Estado</span><span>{session.status}</span></div>
						</div>
					</div>
				</div>
			</section>
		{/if}

		<div class="fixed bottom-6 left-1/2 z-20 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 rounded-xl bg-zinc-900 px-4 py-3 text-sm text-zinc-100 shadow-lg dark:bg-white dark:text-zinc-900">
			<div class="flex items-center gap-2">
				<Zap size={16} class="text-red-400" />
				<span>{message}</span>
			</div>
		</div>
	</div>
</div>
