<script lang="ts">
	import { Minus, Plus } from 'lucide-svelte';

	let { quantity = $bindable(), disabled = false }: { quantity: number | undefined; disabled?: boolean } =
		$props();
</script>

<div>
	<p class="text-sm font-medium">Cantidad contada:</p>
	<div class="mt-1 flex items-center gap-2">
		<button
			type="button"
			aria-label="Quitar una pieza"
			disabled={quantity === undefined || quantity <= 0 || disabled}
			class="flex min-h-11 min-w-11 items-center justify-center rounded-xl border border-zinc-300 disabled:opacity-50 dark:border-zinc-700"
			onclick={() => (quantity = Math.max(0, (quantity ?? 0) - 1))}
		>
			<Minus size={18} />
		</button>
		<span class="min-w-16 text-center text-lg font-semibold">{quantity ?? '—'}</span>
		<button
			type="button"
			aria-label="Agregar una pieza"
			disabled={quantity === undefined || disabled}
			class="flex min-h-11 min-w-11 items-center justify-center rounded-xl border border-zinc-300 disabled:opacity-50 dark:border-zinc-700"
			onclick={() => (quantity = (quantity ?? 0) + 1)}
		>
			<Plus size={18} />
		</button>
		<span class="text-sm text-zinc-500">piezas</span>
	</div>
</div>
