interface SpeechRecognitionResultLike {
	transcript: string;
}
interface SpeechRecognitionEventLike {
	results: ArrayLike<ArrayLike<SpeechRecognitionResultLike>>;
}
interface SpeechRecognitionLike {
	lang: string;
	continuous: boolean;
	interimResults: boolean;
	start(): void;
	stop(): void;
	onresult: ((event: SpeechRecognitionEventLike) => void) | null;
	onerror: ((event: { error?: string }) => void) | null;
	onend: (() => void) | null;
}
type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

function getSpeechRecognitionConstructor(): SpeechRecognitionConstructor | null {
	if (typeof window === 'undefined') return null;
	const w = window as unknown as {
		SpeechRecognition?: SpeechRecognitionConstructor;
		webkitSpeechRecognition?: SpeechRecognitionConstructor;
	};
	return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/**
 * Mensaje en español para un error del reconocimiento de voz. Puro, para
 * poder probarlo sin micrófono. El permiso denegado tiene mensaje
 * propio: con el arranque en un solo tap es el primer error que Eduardo
 * puede ver, y debe decirle qué hacer (activar el permiso o usar el
 * cuadro de texto), no solo el código del error.
 */
export function speechErrorMessage(error?: string): string {
	if (error === 'not-allowed' || error === 'service-not-allowed') {
		return 'Permiso de micrófono denegado. Actívalo para este sitio en los ajustes del navegador y vuelve a intentar, o usa el cuadro de texto o las frases de ejemplo.';
	}
	return `No se pudo escuchar (${error ?? 'error del micrófono'}). Prueba con el cuadro de texto.`;
}

/** Lee un texto en voz alta (es-MX), para la confirmación de voz. */
export function speakText(text: string): void {
	if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
	window.speechSynthesis.cancel();
	const utterance = new SpeechSynthesisUtterance(text);
	utterance.lang = 'es-MX';
	window.speechSynthesis.speak(utterance);
}

/** Dictado por voz (Web Speech API, es-MX). Puro y local, sin red. */
export class VoiceRecognition {
	listening = $state(false);
	supported = $state(true);

	private recognition: SpeechRecognitionLike | null = null;
	private onTranscript: (text: string) => void;
	private onError: (message: string) => void;

	constructor(handlers: {
		onTranscript: (text: string) => void;
		onError: (message: string) => void;
	}) {
		this.onTranscript = handlers.onTranscript;
		this.onError = handlers.onError;
		this.supported = getSpeechRecognitionConstructor() !== null;
	}

	start(): void {
		const Ctor = getSpeechRecognitionConstructor();
		if (!Ctor) {
			this.supported = false;
			this.onError(
				'Este navegador no soporta dictado por voz. Usa el cuadro de texto o las frases de ejemplo.'
			);
			return;
		}
		const recognition = new Ctor();
		recognition.lang = 'es-MX';
		recognition.continuous = false;
		recognition.interimResults = false;
		recognition.onresult = (event) => {
			const text = event.results[0]?.[0]?.transcript ?? '';
			if (text.trim()) this.onTranscript(text);
		};
		recognition.onerror = (event) => {
			this.listening = false;
			this.onError(speechErrorMessage(event.error));
		};
		recognition.onend = () => {
			this.listening = false;
		};
		this.recognition = recognition;
		this.listening = true;
		try {
			recognition.start();
		} catch {
			this.listening = false;
		}
	}

	stop(): void {
		this.recognition?.stop();
		this.listening = false;
	}
}
