<script lang="ts">
	import { Volume2 } from 'lucide-svelte';
	import type { VoiceFraction } from '$lib/voice-count';

	/** "Escuché: …" + botón de lectura + cantidad y medida detectadas. */
	let {
		transcript,
		quantity,
		fraction,
		conflict,
		onSpeak
	}: {
		transcript: string;
		quantity: number | undefined;
		fraction?: VoiceFraction;
		conflict?: number;
		onSpeak: () => void;
	} = $props();
</script>

<p class="text-sm text-zinc-500">
	Escuché: <strong class="text-zinc-900 dark:text-zinc-100">«{transcript}»</strong>
</p>
<button
	type="button"
	class="min-h-9 rounded-xl border border-zinc-300 px-3 text-sm dark:border-zinc-700"
	onclick={onSpeak}
>
	<Volume2 size={16} class="mr-1 inline" /> Escuchar lectura
</button>
<p class="text-sm">
	Cantidad detectada:
	<strong>{quantity ?? '—'}</strong>
	{#if fraction}
		· Medida detectada: <strong>{fraction.text}″</strong>
	{/if}
	{#if conflict !== undefined}
		· <span class="text-red-600">Sin coincidencia exacta, pediste {conflict}.</span>
	{/if}
</p>
