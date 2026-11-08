import { tick } from 'svelte';
import { BARCODE_FORMATS } from '$lib/barcode-scan';

interface BarcodeDetectorResultLike {
	rawValue: string;
	format: string;
}
interface BarcodeDetectorLike {
	detect(source: ImageBitmapSource): Promise<BarcodeDetectorResultLike[]>;
}
interface BarcodeDetectorConstructorLike {
	new (options?: { formats?: readonly string[] }): BarcodeDetectorLike;
	getSupportedFormats?: () => Promise<string[]>;
}

/**
 * Mensaje en español para un fallo al abrir la cámara. Puro, para poder
 * probarlo sin cámara. El permiso denegado tiene mensaje propio: con el
 * arranque en un solo tap es el primer error que Eduardo puede ver, y
 * debe decirle qué hacer (activar el permiso o escribir el código).
 */
export function cameraErrorMessage(name: string): string {
	if (name === 'NotAllowedError') {
		return 'Permiso de cámara denegado. Actívalo para este sitio en los ajustes del navegador y vuelve a intentar, o escribe el código a mano.';
	}
	if (name === 'NotFoundError') {
		return 'No se encontró cámara en este teléfono. Escribe el código a mano.';
	}
	return 'No se pudo abrir la cámara. Escribe el código a mano.';
}

function getBarcodeDetectorConstructor(): BarcodeDetectorConstructorLike | null {
	if (typeof window === 'undefined') return null;
	const w = window as unknown as {
		BarcodeDetector?: BarcodeDetectorConstructorLike;
	};
	return w.BarcodeDetector ?? null;
}

/**
 * Cámara trasera + BarcodeDetector nativo (Chrome en Android).
 *
 * ORDEN IMPORTANTE: el <video> solo existe mientras `scanning` es true
 * (está dentro de {#if scanning}), así que `start()` primero pone
 * `scanning = true` y espera `tick()` para que el video se monte, y
 * DESPUÉS pide la cámara. Pedir el permiso antes dejaba `videoEl` en
 * undefined y la cámara se cerraba sola sin mostrar nada.
 */
export class BarcodeCamera {
	scanning = $state(false);
	cameraError = $state('');
	supported = $state(true);

	private stream: MediaStream | null = null;
	private detector: BarcodeDetectorLike | null = null;
	private video: HTMLVideoElement | null = null;
	private rafId: number | undefined;
	private lastDetectAt = 0;
	private onCode: (code: string) => void;

	constructor(handlers: { onCode: (code: string) => void }) {
		this.onCode = handlers.onCode;
		this.supported = getBarcodeDetectorConstructor() !== null;
	}

	private releaseStream(): void {
		if (this.stream) {
			for (const track of this.stream.getTracks()) track.stop();
			this.stream = null;
		}
	}

	stop(): void {
		if (this.rafId !== undefined) {
			cancelAnimationFrame(this.rafId);
			this.rafId = undefined;
		}
		this.releaseStream();
		if (this.video) this.video.srcObject = null;
		this.video = null;
		this.scanning = false;
	}

	private scanLoop = (): void => {
		if (!this.scanning || !this.video || !this.detector) return;
		const now = Date.now();
		if (now - this.lastDetectAt >= 300) {
			this.lastDetectAt = now;
			this.detector
				.detect(this.video)
				.then((results) => {
					const value = results[0]?.rawValue?.trim();
					if (value) this.onCode(value);
				})
				.catch(() => {
					// Un cuadro fallido no detiene el escaneo; el siguiente lo intenta.
				});
		}
		if (this.scanning) this.rafId = requestAnimationFrame(this.scanLoop);
	};

	async start(getVideo: () => HTMLVideoElement | undefined): Promise<void> {
		const Ctor = getBarcodeDetectorConstructor();
		if (!Ctor) {
			this.supported = false;
			return;
		}
		if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
			this.cameraError = 'Este navegador no permite usar la cámara. Escribe el código a mano.';
			return;
		}
		this.stop();
		this.cameraError = '';
		try {
			this.detector = new Ctor({ formats: [...BARCODE_FORMATS] });
		} catch {
			this.detector = new Ctor();
		}
		this.scanning = true;
		await tick();
		try {
			this.stream = await navigator.mediaDevices.getUserMedia({
				video: { facingMode: 'environment' },
				audio: false
			});
		} catch (err) {
			const name = err instanceof Error ? err.name : '';
			this.scanning = false;
			this.cameraError = cameraErrorMessage(name);
			return;
		}
		const video = getVideo();
		if (!video) {
			this.releaseStream();
			this.scanning = false;
			this.cameraError = 'No se pudo abrir la cámara. Escribe el código a mano.';
			return;
		}
		this.video = video;
		video.srcObject = this.stream;
		try {
			await video.play();
		} catch {
			this.releaseStream();
			this.scanning = false;
			this.cameraError = 'No se pudo abrir la cámara. Escribe el código a mano.';
			return;
		}
		this.lastDetectAt = 0;
		this.rafId = requestAnimationFrame(this.scanLoop);
	}
}
