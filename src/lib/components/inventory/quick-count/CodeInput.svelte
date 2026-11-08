<script lang="ts">
	/** Cuadro para escribir un código a mano + botón Buscar. */
	let {
		code = $bindable(''),
		placeholder = 'Ej. 7502293080002',
		onSearch
	}: {
		code: string;
		placeholder?: string;
		onSearch: (code: string) => void;
	} = $props();
</script>

<div class="flex gap-2">
	<input
		bind:value={code}
		inputmode="numeric"
		aria-label="Escribir el código de barras a mano"
		{placeholder}
		class="min-h-11 flex-1 rounded-xl border border-zinc-300 bg-transparent px-3 text-base dark:border-zinc-700"
	/>
	<button
		type="button"
		disabled={!code.trim()}
		class="min-h-11 rounded-xl bg-red-600 px-4 text-sm font-medium text-white disabled:opacity-50"
		onclick={() => onSearch(code)}
	>
		Buscar
	</button>
</div>
