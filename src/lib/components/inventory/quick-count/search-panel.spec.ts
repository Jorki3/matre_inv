import { describe, expect, it } from 'vitest';
import { togglePanel } from './quick-count';

/**
 * El cambio de panel de la barra de búsqueda estilo YouTube (micrófono
 * y código de barras junto a la caja): solo un panel a la vez, tocar el
 * mismo icono lo cierra, tocar el otro cambia. `togglePanel` es puro,
 * así que se prueba sin montar Svelte. Que el panel se cierre al
 * confirmar/cancelar lo garantiza el cableado: ambos paneles llaman a
 * `onDone` y `ProductSearch` pone `mode = 'closed'` ahí.
 */
describe('togglePanel (mic/barcode junto a la búsqueda)', () => {
	it('cerrado + micrófono abre el dictado', () => {
		expect(togglePanel('closed', 'voice')).toBe('voice');
	});

	it('cerrado + código abre el escaneo', () => {
		expect(togglePanel('closed', 'barcode')).toBe('barcode');
	});

	it('tocar el mismo icono otra vez cierra el panel', () => {
		expect(togglePanel('voice', 'voice')).toBe('closed');
		expect(togglePanel('barcode', 'barcode')).toBe('closed');
	});

	it('de voz se cambia directo a código, y viceversa', () => {
		expect(togglePanel('voice', 'barcode')).toBe('barcode');
		expect(togglePanel('barcode', 'voice')).toBe('voice');
	});

	it('nunca queda más de un panel abierto', () => {
		// Simula la secuencia de toques: mic -> código -> mic -> mic.
		let mode = togglePanel('closed', 'voice');
		mode = togglePanel(mode, 'barcode');
		expect(mode).toBe('barcode');
		mode = togglePanel(mode, 'voice');
		expect(mode).toBe('voice');
		mode = togglePanel(mode, 'voice');
		expect(mode).toBe('closed');
	});
});
