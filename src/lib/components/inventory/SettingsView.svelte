<script lang="ts">
	import type { InventoryController } from './inventory-controller.svelte';
	import { settingsSections } from './inventory-ui';
	import GeneralSettings from './GeneralSettings.svelte';
	import DataSettings from './DataSettings.svelte';
	import CatalogView from './CatalogView.svelte';
	import BackupView from './BackupView.svelte';
	let { app }: { app: InventoryController } = $props();
</script>

<section class="space-y-3" aria-label="Configuración">
	<nav class="grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label="Subsecciones de Configuración">
		{#each settingsSections as section (section.id)}<button
				type="button"
				aria-current={app.settingsSection === section.id ? 'page' : undefined}
				class="min-h-11 rounded-xl border px-3 text-sm aria-[current=page]:bg-red-600 aria-[current=page]:text-white"
				onclick={() => (app.settingsSection = section.id)}>{section.label}</button
			>{/each}
	</nav>
	{#if app.settingsSection === 'general'}<GeneralSettings
			{app}
		/>{:else if app.settingsSection === 'products'}<CatalogView
			{app}
		/>{:else if app.settingsSection === 'backups'}<BackupView {app} />{:else}<DataSettings
			{app}
		/>{/if}
</section>
