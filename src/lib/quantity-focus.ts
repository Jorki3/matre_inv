import { tick } from 'svelte';

/** Only mounted quantity editors request focus; never scroll a page or save a count. */
export function focusQuantity(node: HTMLInputElement, enabled: boolean) {
	let live = true;
	async function focus(value: boolean) {
		await tick();
		if (live && value && node.isConnected && !node.disabled) {
			node.focus({ preventScroll: true });
			node.select();
		}
	}
	void focus(enabled);
	return {
		update(value: boolean) {
			void focus(value);
		},
		destroy() {
			live = false;
		}
	};
}
