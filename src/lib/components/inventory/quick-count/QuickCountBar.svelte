<!--
  Contar rápido: una sola barra compacta en vez de dos tarjetas grandes
  siempre abiertas. Solo un panel a la vez (voz, escribir o código) y al
  confirmar o cancelar se vuelve a cerrar, para que la lista de
  productos quede a la vista. El historial es uno solo, compartido por
  voz y código, y muestra solo los últimos 3 (ver `SessionHistory`).
-->
<script lang="ts">
	import { Barcode, Keyboard, Mic } from 'lucide-svelte';
	import VoicePanel from './VoicePanel.svelte';
	import BarcodePanel from './BarcodePanel.svelte';
	import SessionHistory from './SessionHistory.svelte';
	import { addHistory, type HistoryItem, type QuickCountMode } from './quick-count';
	import type { InventoryController } from '../inventory-controller.svelte';

	let { app }: { app: InventoryController } = $props();

	let mode = $state<QuickCountMode>('closed');
	let history = $state<HistoryItem[]>([]);
	let lastSaved = $state('');

	function toggle(next: Exclude<QuickCountMode, 'closed'>): void {
		mode = mode === next ? 'closed' : next;
		lastSaved = '';
	}

	function handleRegistered(item: HistoryItem): void {
		history = addHistory(history, item);
		lastSaved = item.label;
	}

	function handleDone(): void {
		mode = 'closed';
	}
</script>

<section
	class="space-y-3 rounded-2xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900"
	aria-label="Contar rápido"
>
	<div class="flex items-center justify-between gap-2">
		<p class="text-sm font-semibold">
			Contar rápido{#if history.length > 0}<span class="font-normal text-zinc-500">
					· {history.length} hoy</span
				>{/if}
		</p>
	</div>
	<div class="grid grid-cols-3 gap-2">
		<button
			type="button"
			aria-pressed={mode === 'voice'}
			aria-label="Dictar por voz"
			class={`flex min-h-11 items-center justify-center gap-2 rounded-xl px-3 text-sm font-medium ${mode === 'voice' ? 'bg-red-600 text-white' : 'border border-zinc-300 dark:border-zinc-700'}`}
			onclick={() => toggle('voice')}
		>
			<Mic size={18} /> Voz
		</button>
		<button
			type="button"
			aria-pressed={mode === 'barcode'}
			aria-label="Escanear código de barras"
			class={`flex min-h-11 items-center justify-center gap-2 rounded-xl px-3 text-sm font-medium ${mode === 'barcode' ? 'bg-red-600 text-white' : 'border border-zinc-300 dark:border-zinc-700'}`}
			onclick={() => toggle('barcode')}
		>
			<Barcode size={18} /> Código
		</button>
		<button
			type="button"
			aria-pressed={mode === 'text'}
			aria-label="Escribir lo dictado"
			class={`flex min-h-11 items-center justify-center gap-2 rounded-xl px-3 text-sm font-medium ${mode === 'text' ? 'bg-red-600 text-white' : 'border border-zinc-300 dark:border-zinc-700'}`}
			onclick={() => toggle('text')}
		>
			<Keyboard size={18} /> Escribir
		</button>
	</div>

	{#if lastSaved && mode === 'closed'}
		<p class="rounded-xl border border-green-600 bg-green-50 p-3 text-sm text-green-800 dark:bg-green-950 dark:text-green-200">
			{lastSaved}
		</p>
	{/if}

	{#if mode === 'voice' || mode === 'text'}
		<VoicePanel
			{app}
			autofocusText={mode === 'text'}
			onDone={handleDone}
			onRegistered={handleRegistered}
		/>
	{:else if mode === 'barcode'}
		<BarcodePanel {app} onDone={handleDone} onRegistered={handleRegistered} />
	{/if}

	{#if mode !== 'closed'}
		<SessionHistory items={history} />
	{/if}
</section>
