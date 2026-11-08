import { describe, expect, it } from 'vitest';
import { shouldAutoStart } from './quick-count';
import { speechErrorMessage } from './voice-recognition.svelte';
import { cameraErrorMessage } from './barcode-camera.svelte';

/**
 * Un solo tap (v0.7.1): al tocar el micrófono el dictado empieza a
 * escuchar de inmediato, y al tocar el código de barras la cámara se
 * abre de inmediato, sin segundo tap en el botón grande del panel.
 *
 * El arranque en sí vive en los paneles (VoicePanel / BarcodePanel):
 * es un `$effect` al montarse y no se puede probar con Vitest sin DOM.
 * Lo que sí se prueba aquí es la lógica pura que lo sostiene: la
 * decisión de arrancar una sola vez (sin reintentos en bucle) y los
 * mensajes en español cuando el permiso se niega. Que el panel reciba
 * la orden de arrancar al tocar el icono lo garantiza el cableado
 * (`ProductSearch` pasa `autoStart` al panel que monta), verificado
 * por `svelte-check`.
 */
describe('shouldAutoStart (arrancar una sola vez al abrir el panel)', () => {
	it('arranca cuando el panel se abre con el icono y hay soporte', () => {
		expect(shouldAutoStart(true, false, true)).toBe(true);
	});

	it('no arranca si el panel no se abrió con el icono', () => {
		expect(shouldAutoStart(false, false, true)).toBe(false);
	});

	it('no reintenta: ya arrancado una vez, no vuelve a arrancar', () => {
		expect(shouldAutoStart(true, true, true)).toBe(false);
	});

	it('no arranca si el navegador no soporta micrófono o cámara', () => {
		expect(shouldAutoStart(true, false, false)).toBe(false);
	});
});

describe('speechErrorMessage (permiso de micrófono denegado, en español)', () => {
	it('permiso denegado dice qué hacer: activar el permiso o usar el texto', () => {
		expect(speechErrorMessage('not-allowed')).toContain('Permiso de micrófono denegado');
		expect(speechErrorMessage('not-allowed')).toContain('cuadro de texto');
		expect(speechErrorMessage('service-not-allowed')).toContain('Permiso de micrófono denegado');
	});

	it('otros errores mantienen el mensaje de antes', () => {
		expect(speechErrorMessage('no-speech')).toBe(
			'No se pudo escuchar (no-speech). Prueba con el cuadro de texto.'
		);
		expect(speechErrorMessage(undefined)).toBe(
			'No se pudo escuchar (error del micrófono). Prueba con el cuadro de texto.'
		);
	});
});

describe('cameraErrorMessage (permiso de cámara denegado, en español)', () => {
	it('permiso denegado dice qué hacer: activar el permiso o escribir el código', () => {
		expect(cameraErrorMessage('NotAllowedError')).toContain('Permiso de cámara denegado');
		expect(cameraErrorMessage('NotAllowedError')).toContain('escribe el código a mano');
	});

	it('sin cámara en el teléfono lo dice claro', () => {
		expect(cameraErrorMessage('NotFoundError')).toBe(
			'No se encontró cámara en este teléfono. Escribe el código a mano.'
		);
	});

	it('cualquier otro fallo mantiene el mensaje genérico de antes', () => {
		expect(cameraErrorMessage('')).toBe('No se pudo abrir la cámara. Escribe el código a mano.');
		expect(cameraErrorMessage('NotReadableError')).toBe(
			'No se pudo abrir la cámara. Escribe el código a mano.'
		);
	});
});
