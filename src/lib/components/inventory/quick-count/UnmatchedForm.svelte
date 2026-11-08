<script lang="ts">
	/** Registro de artículo no encontrado (Pendiente de revisar). */
	let {
		location = $bindable(''),
		note = 'Queda como Pendiente de revisar, separado del conteo oficial. No suma al avance ni modifica el catálogo SICAR.',
		registerDisabled = false,
		onRegister
	}: {
		location: string;
		note?: string;
		registerDisabled?: boolean;
		onRegister: () => void;
	} = $props();
</script>

<div class="space-y-2 rounded-xl border border-red-500 p-3">
	<p class="text-sm font-medium">¿No está en el catálogo?</p>
	<label class="block text-sm">
		Ubicación o sección (opcional)
		<input
			bind:value={location}
			class="mt-1 min-h-11 w-full rounded-xl border border-zinc-300 bg-transparent px-3 text-base dark:border-zinc-700"
			placeholder="Ej. Pasillo 3, anaquel B"
		/>
	</label>
	<button
		type="button"
		disabled={registerDisabled}
		class="min-h-11 w-full rounded-xl bg-red-600 px-4 text-sm font-medium text-white disabled:opacity-50"
		onclick={onRegister}
	>
		Registrar como artículo no encontrado
	</button>
	<p class="text-xs text-zinc-500">{note}</p>
</div>
