<script lang="ts">
	import { asset } from '$app/paths';
	import { createInventoryController } from './inventory-controller.svelte';
	import AppHeader from './AppHeader.svelte';
	import AppNavigation from './AppNavigation.svelte';
	import DashboardView from './DashboardView.svelte';
	import InventoryView from './InventoryView.svelte';
	import CatalogView from './CatalogView.svelte';
	import BackupView from './BackupView.svelte';
	import SettingsView from './SettingsView.svelte';
	import DataActionDialog from './DataActionDialog.svelte';
	import StorageRecovery from './StorageRecovery.svelte';
	import AppStatus from './AppStatus.svelte';

	const app = createInventoryController();
</script>

<svelte:head>
	<title>MATRE Inventario</title>
	<meta name="theme-color" content="#B91C1C" />
	<link rel="manifest" href={asset('manifest.webmanifest')} />
</svelte:head>

<DataActionDialog {app} />
<div
	class="min-h-screen bg-zinc-50 text-zinc-900 transition-colors dark:bg-zinc-950 dark:text-zinc-50"
>
	<div class="mx-auto max-w-6xl px-4 pt-4 pb-20 sm:px-6">
		<AppHeader {app} />
		<StorageRecovery {app} />
		<AppNavigation {app} />

		{#if app.activeView === 'dashboard'}
			<DashboardView {app} />
		{/if}
		{#if app.activeView === 'inventory'}
			<InventoryView {app} />
		{/if}
		{#if app.activeView === 'products'}
			<CatalogView {app} />
		{/if}
		{#if app.activeView === 'backup'}
			<BackupView {app} />
		{/if}
		{#if app.activeView === 'settings'}
			<SettingsView {app} />
		{/if}

		<AppStatus {app} />
	</div>
</div>
