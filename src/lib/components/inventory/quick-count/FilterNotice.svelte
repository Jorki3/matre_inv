<script lang="ts">
	/**
	 * Aviso cuando el producto exacto sí está en el catálogo pero el
	 * filtro activo lo esconde. No preselecciona nada: el usuario toca
	 * "Ver todos" para quitar el filtro y contarlo.
	 */
	let {
		productName,
		filterLabel,
		onShowAll
	}: {
		productName: string;
		filterLabel: string;
		onShowAll: () => void;
	} = $props();
</script>

<div class="space-y-2 rounded-xl border border-amber-500 bg-amber-50 p-3 dark:bg-amber-950">
	<p class="text-sm text-amber-800 dark:text-amber-200">
		«{productName}» sí está en el catálogo, pero no está en este filtro ({filterLabel}).
	</p>
	<button
		type="button"
		class="min-h-11 w-full rounded-xl bg-amber-600 px-4 text-sm font-medium text-white"
		onclick={onShowAll}
	>
		Ver todos
	</button>
	<p class="text-xs text-zinc-500">Cambia el filtro a Todos para contarlo.</p>
</div>
