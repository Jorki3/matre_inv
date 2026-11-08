<!--
  Búsqueda estilo YouTube: la caja original ("Descripción, clave o clave
  alterna") con su icono de búsqueda, y junto a ella dos botones de
  icono: micrófono (dictado por voz) y código de barras (escaneo por
  cámara). Al tocar uno se abre su panel DEBAJO de la barra, como un
  desplegable; al confirmar o cancelar se cierra. Los botones de filtro
  (Todos / Pendientes / Contados / Diferencias / Sin diferencias) quedan
  EXACTAMENTE como estaban: son rápidos y no se tocan.

  El texto escrito en la caja NO bloquea el dictado ni el escaneo: el
  dictado ES la búsqueda. Lo que sí manda es el filtro activo (ver
  quick-count.ts: `scopedProducts`).
-->
<script lang="ts">
	import type { InventoryController } from './inventory-controller.svelte';
	import { Barcode, Mic, Search } from 'lucide-svelte';
	import { filters } from './inventory-ui';
	import VoicePanel from './quick-count/VoicePanel.svelte';
	import BarcodePanel from './quick-count/BarcodePanel.svelte';
	import SessionHistory from './quick-count/SessionHistory.svelte';
	import {
		addHistory,
		togglePanel,
		type HistoryItem,
		type SearchPanelMode
	} from './quick-count/quick-count';

	let { app }: { app: InventoryController } = $props();

	/** Panel abierto debajo de la barra: solo uno a la vez. */
	let mode = $state<SearchPanelMode>('closed');
	let history = $state<HistoryItem[]>([]);
	let lastSaved = $state('');

	function handleRegistered(item: HistoryItem): void {
		history = addHistory(history, item);
		lastSaved = item.label;
	}

	function handleDone(): void {
		mode = 'closed';
	}
</script>

<div class="rounded-xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
	<div class="flex gap-2">
		<div class="relative flex-1">
			<Search size={18} class="pointer-events-none absolute top-3.5 left-3 text-zinc-400" /><input
				bind:value={app.query}
				aria-label="Buscar productos"
				class="min-h-11 w-full rounded-xl border border-zinc-300 bg-transparent pr-3 pl-10 text-base dark:border-zinc-700"
				placeholder="Descripción, clave o clave alterna"
			/>
		</div>
		<button
			type="button"
			aria-pressed={mode === 'voice'}
			aria-label="Dictar por voz"
			class={`flex min-h-11 min-w-11 items-center justify-center rounded-xl ${mode === 'voice' ? 'bg-red-600 text-white' : 'border border-zinc-300 dark:border-zinc-700'}`}
			onclick={() => {
				mode = togglePanel(mode, 'voice');
				lastSaved = '';
			}}
		>
			<Mic size={18} />
		</button>
		<button
			type="button"
			aria-pressed={mode === 'barcode'}
			aria-label="Escanear código de barras"
			class={`flex min-h-11 min-w-11 items-center justify-center rounded-xl ${mode === 'barcode' ? 'bg-red-600 text-white' : 'border border-zinc-300 dark:border-zinc-700'}`}
			onclick={() => {
				mode = togglePanel(mode, 'barcode');
				lastSaved = '';
			}}
		>
			<Barcode size={18} />
		</button>
	</div>
	<div class="mt-2 flex flex-wrap gap-1">
		{#each filters as item (item.id)}<button
				aria-pressed={app.filter === item.id}
				class={`min-h-11 rounded-xl px-3 text-sm ${app.filter === item.id ? 'bg-red-600 text-white' : 'bg-zinc-100 dark:bg-zinc-800'}`}
				onclick={() => (app.filter = item.id)}>{item.label}</button
			>{/each}
	</div>

	{#if lastSaved && mode === 'closed'}
		<p
			class="mt-3 rounded-xl border border-green-600 bg-green-50 p-3 text-sm text-green-800 dark:bg-green-950 dark:text-green-200"
		>
			{lastSaved}
		</p>
	{/if}

	{#if mode === 'voice'}
		<div class="mt-3">
			<VoicePanel {app} onDone={handleDone} onRegistered={handleRegistered} />
		</div>
	{:else if mode === 'barcode'}
		<div class="mt-3">
			<BarcodePanel {app} onDone={handleDone} onRegistered={handleRegistered} />
		</div>
	{/if}

	{#if mode !== 'closed'}
		<div class="mt-3">
			<SessionHistory items={history} />
		</div>
	{/if}
</div>
