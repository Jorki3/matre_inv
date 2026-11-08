<script lang="ts">
	import type { Snippet } from 'svelte';

	/** Encabezado compacto de un panel: título + botón redondo de acción. */
	let {
		title,
		subtitle,
		actionLabel,
		actionActive = false,
		actionDisabled = false,
		icon,
		onAction
	}: {
		title: string;
		subtitle: string;
		actionLabel: string;
		actionActive?: boolean;
		actionDisabled?: boolean;
		icon: Snippet;
		onAction: () => void;
	} = $props();
</script>

<div class="flex items-center justify-between gap-3">
	<div>
		<h2 class="font-semibold">{title}</h2>
		<p class="text-sm text-zinc-500">{subtitle}</p>
	</div>
	<button
		type="button"
		disabled={actionDisabled}
		aria-label={actionLabel}
		class={`flex min-h-11 min-w-11 items-center justify-center rounded-full text-white disabled:opacity-50 ${actionActive ? 'animate-pulse bg-zinc-700' : 'bg-red-600'}`}
		onclick={onAction}
	>
		{@render icon()}
	</button>
</div>
