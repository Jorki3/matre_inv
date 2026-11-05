<script lang="ts">
	import type { InventoryController } from './inventory-controller.svelte';
	import { Zap } from 'lucide-svelte';

	let { app }: { app: InventoryController } = $props();
</script>

<div
	role="status"
	aria-live="polite"
	class="fixed bottom-3 left-1/2 z-20 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 rounded-xl bg-zinc-900 px-4 py-3 text-sm text-zinc-100 shadow-lg dark:bg-white dark:text-zinc-900"
>
	<div class="flex items-center gap-2">
		<Zap size={16} class="text-red-400" />
		<span>{app.message}</span>
	</div>
</div>
