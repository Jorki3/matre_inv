<script lang="ts">
	import type { InventoryController } from './inventory-controller.svelte';
	import SessionControls from './SessionControls.svelte';
	import ProductSearch from './ProductSearch.svelte';
	import ProductCard from './ProductCard.svelte';
	import UnmatchedArticlesView from './UnmatchedArticlesView.svelte';

	let { app }: { app: InventoryController } = $props();
</script>

<section class="space-y-3" aria-label="Conteo de inventario">
	<div class="grid grid-cols-2 gap-2" role="group" aria-label="Vistas de inventario">
		<button
			type="button"
			aria-pressed={app.inventorySection === 'products'}
			class="min-h-11 rounded-lg border px-2 text-xs aria-pressed:bg-red-600 aria-pressed:text-white sm:text-sm"
			onclick={() => (app.inventorySection = 'products')}>Productos y conteos</button
		><button
			type="button"
			aria-pressed={app.inventorySection === 'unmatched'}
			class="min-h-11 rounded-lg border px-2 text-xs aria-pressed:bg-red-600 aria-pressed:text-white sm:text-sm"
			onclick={() => (app.inventorySection = 'unmatched')}>Artículos no encontrados</button
		>
	</div>
	{#if app.inventorySection === 'unmatched'}<UnmatchedArticlesView {app} />{:else}
		<ProductSearch {app} />
		<SessionControls {app} />
		{#if app.visibleProducts.length || !app.query.trim()}<button
				type="button"
				disabled={!app.canCount}
				class="min-h-11 rounded-xl border border-red-600 px-4 text-sm font-medium text-red-600 disabled:opacity-50"
				onclick={() => app.startUnmatchedRegistration()}>Registrar artículo no encontrado</button
			>{/if}
		<p class="text-sm text-zinc-500">
			{app.visibleProducts.length} productos · {app.canCount
				? 'Toca una tarjeta para capturar.'
				: app.session.status === 'completed'
					? 'Sesión finalizada: solo consulta y exportación.'
					: 'Captura bloqueada: comienza o reanuda la sesión para contar.'}
		</p>
		<div class="space-y-2">
			{#each app.visibleProducts as product (product.id)}
				<ProductCard {app} {product} />
			{:else}<p class="rounded-xl border border-zinc-200 p-4 text-sm dark:border-zinc-800">
					{app.products.length
						? 'No hay productos que coincidan.'
						: 'Importa tu catálogo desde Configuración → Productos. No se cargan artículos de demostración.'}
				</p>
				{#if app.query.trim()}<button
						type="button"
						disabled={!app.canCount}
						class="min-h-11 w-full rounded-xl bg-red-600 px-4 text-sm font-medium text-white disabled:opacity-50"
						onclick={() => app.startUnmatchedRegistration()}
						>Registrar artículo no encontrado</button
					>{/if}
			{/each}
		</div>
	{/if}
</section>
