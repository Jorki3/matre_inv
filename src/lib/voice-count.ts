import { normalizeText, type Product } from './inventory';

/**
 * Dictado por voz para MATRE Inventario.
 *
 * Puro y local: no usa Muse, no hay red ni tokens. La voz la transcribe el
 * navegador (Web Speech API) y este módulo solo interpreta el texto con
 * JavaScript, en el teléfono. Nada se guarda aquí: el componente
 * `VoiceCount.svelte` confirma con el usuario y después llama a las
 * funciones que ya existen en el controlador (`saveCount` / `saveUnmatched`).
 *
 * Reglas que cubre (probadas en `voice-count.spec.ts`):
 * - "rondana plana de 5 16, 100 piezas" -> Rondana plana 5/16", 100 piezas.
 *   La fracción 5/16 es la medida del producto, NO una cantidad.
 * - "rondana plana de 516, 100 piezas" -> lo mismo. El teléfono transcribe
 *   "5 16" pegado como "516" y antes el intérprete sumaba 516 + 100 = 616.
 *   Un número pegado de 3 dígitos solo se parte en fracción cuando YA hay
 *   otra cantidad en la frase; "clavo, 116 piezas" sigue siendo 116.
 * - "rondana plana de 5 dieciseisabos 100 piezas" -> lo mismo. Se aceptan
 *   los sufijos -avos / -abos y "dieciseis" suelto como denominador 16.
 * - "100 piezas de rondana plana de 5 16" -> cantidad primero, igual 100.
 * - "foco de 59 watts, 5" con un catálogo que solo tiene Foco 9W -> NO es
 *   coincidencia exacta y NO se fuerza al de 9W. Exacto exige que TODAS las
 *   palabras y medidas dictadas estén en el producto.
 */

export interface VoiceFraction {
	numerator: number;
	denominator: number;
	text: string;
}

export type VoiceMeasure =
	| { kind: 'fraction'; numerator: number; denominator: number; text: string }
	| { kind: 'watts'; value: number };

export interface VoiceCandidate {
	product: Product;
	exact: boolean;
	matchedTokens: number;
}

export interface VoiceInterpretation {
	/** Lo que se dictó, tal como llegó. */
	transcript: string;
	/** Transcripción normalizada (sin acentos, minúsculas). */
	normalized: string;
	/** Descripción limpia, sin cantidad ni medidas, para buscar en el catálogo. */
	description: string;
	quantity: number | undefined;
	fraction?: VoiceFraction;
	measures: VoiceMeasure[];
	/** Solo cuando hay coincidencia exacta. Nunca se preselecciona un parecido. */
	product?: Product;
	exact: boolean;
	/**
	 * Medida dictada que ningún producto comparte (p. ej. 59 en
	 * "foco de 59 watts"). Sirve para mostrar "pediste 59" en la tarjeta.
	 */
	conflict?: number;
	candidates: VoiceCandidate[];
}

export const EXAMPLE_PHRASES = [
	'Rondana plana de 5 16, 100 piezas',
	'Foco de 59 watts, 5',
	'Dado 12 puntas 1/2 5/16 corto, 1'
] as const;

const PIECE_WORDS = new Set(['pieza', 'piezas', 'unidad', 'unidades', 'pza', 'pzas']);
const STOPWORDS = new Set([
	'de',
	'la',
	'el',
	'los',
	'las',
	'un',
	'una',
	'unos',
	'unas',
	'en',
	'con',
	'por',
	'para',
	'y',
	'o',
	'a',
	'del',
	'pulgada',
	'pulgadas'
]);

/** Alias frecuentes del reconocimiento de voz en la ferretería. */
const ALIASES: Record<string, string> = {
	randana: 'rondana',
	randanas: 'rondanas'
};

const NUMBER_WORDS: Record<string, number> = {
	cero: 0,
	uno: 1,
	un: 1,
	una: 1,
	dos: 2,
	tres: 3,
	cuatro: 4,
	cinco: 5,
	seis: 6,
	siete: 7,
	ocho: 8,
	nueve: 9,
	diez: 10,
	once: 11,
	doce: 12,
	trece: 13,
	catorce: 14,
	quince: 15,
	dieciseis: 16,
	diecisiete: 17,
	dieciocho: 18,
	diecinueve: 19,
	veinte: 20,
	veintiuno: 21,
	veintiun: 21,
	veintidos: 22,
	veintitres: 23,
	veinticuatro: 24,
	veinticinco: 25,
	veintiseis: 26,
	veintisiete: 27,
	veintiocho: 28,
	veintinueve: 29,
	treinta: 30,
	cuarenta: 40,
	cincuenta: 50,
	sesenta: 60,
	setenta: 70,
	ochenta: 80,
	noventa: 90,
	cien: 100,
	ciento: 100,
	doscientos: 200,
	trescientos: 300,
	cuatrocientos: 400,
	quinientos: 500,
	seiscientos: 600,
	setecientos: 700,
	ochocientos: 800,
	novecientos: 900
};

const DENOMINATORS: Record<string, number> = {
	medio: 2,
	media: 2,
	medios: 2,
	medias: 2,
	tercio: 3,
	tercios: 3,
	cuarto: 4,
	cuartos: 4,
	quinto: 5,
	quintos: 5,
	sexto: 6,
	sextos: 6,
	septimo: 7,
	septimos: 7,
	octavo: 8,
	octavos: 8,
	noveno: 9,
	novenos: 9,
	decimo: 10,
	decimos: 10,
	onceavo: 11,
	onceavos: 11,
	doceavo: 12,
	doceavos: 12,
	treceavo: 13,
	treceavos: 13,
	catorceavo: 14,
	catorceavos: 14,
	quinceavo: 15,
	quinceavos: 15,
	dieciseisavo: 16,
	dieciseisavos: 16,
	diecisieteavo: 17,
	diecisieteavos: 17,
	dieciochoavo: 18,
	dieciochoavos: 18,
	diecinueveavo: 19,
	diecinueveavos: 19,
	veinteavo: 20,
	veinteavos: 20,
	// "cinco dieciseis" (sin -avos) también es una fracción 5/16.
	dieciseis: 16,
	diecisiete: 17,
	dieciocho: 18,
	diecinueve: 19
};

const WATTS_WORDS = new Set(['watts', 'watt', 'w']);

function isDigitToken(token: string): boolean {
	return /^\d+$/.test(token);
}

/**
 * Lee un número en palabras a partir de `tokens[i]`: "ciento veinte" -> 120,
 * "cincuenta y nueve" -> 59, "doscientos cincuenta" -> 250.
 */
export function parseNumberWords(
	tokens: string[],
	start: number
): { value: number; consumed: number } {
	let total = 0;
	let current = 0;
	let i = start;
	let consumed = 0;
	while (i < tokens.length) {
		const token = tokens[i];
		if (token === 'y') {
			i += 1;
			consumed += 1;
			continue;
		}
		if (token === 'mil') {
			current = (current === 0 ? 1 : current) * 1000;
			total += current;
			current = 0;
			i += 1;
			consumed += 1;
			continue;
		}
		const value = NUMBER_WORDS[token];
		if (value === undefined) break;
		current += value;
		i += 1;
		consumed += 1;
	}
	return { value: total + current, consumed };
}

/** Lee un número (dígitos o palabras) en `tokens[i]`, si lo hay. */
function readNumber(
	tokens: string[],
	i: number
): { value: number; consumed: number } | null {
	if (i >= tokens.length) return null;
	if (isDigitToken(tokens[i])) return { value: Number(tokens[i]), consumed: 1 };
	const parsed = parseNumberWords(tokens, i);
	if (parsed.consumed === 0) return null;
	return parsed;
}

function splitGluedFraction(token: string): VoiceFraction | null {
	// "516" -> 5/16. Solo se usa cuando YA hay otra cantidad en la frase
	// (ver parseVoiceCount); nunca sobre el número que ES la cantidad.
	if (!/^\d{3}$/.test(token)) return null;
	const numerator = Number(token[0]);
	const denominator = Number(token.slice(1));
	if (denominator < 2 || numerator >= denominator) return null;
	return { numerator, denominator, text: `${numerator}/${denominator}` };
}

function productMeasures(product: Product): VoiceMeasure[] {
	const haystack = normalizeText(
		`${product.name} ${product.key} ${product.alternateKey ?? product.barcode ?? ''}`
	);
	const measures: VoiceMeasure[] = [];
	for (const match of haystack.matchAll(/(\d+)\/(\d+)/g)) {
		measures.push({
			kind: 'fraction',
			numerator: Number(match[1]),
			denominator: Number(match[2]),
			text: `${match[1]}/${match[2]}`
		});
	}
	for (const match of haystack.matchAll(/(\d+)\s*w\b/g)) {
		measures.push({ kind: 'watts', value: Number(match[1]) });
	}
	return measures;
}

function measureMatches(product: Product, measure: VoiceMeasure): boolean {
	return productMeasures(product).some((candidate) => {
		if (measure.kind === 'fraction' && candidate.kind === 'fraction') {
			return (
				measure.numerator === candidate.numerator &&
				measure.denominator === candidate.denominator
			);
		}
		if (measure.kind === 'watts' && candidate.kind === 'watts') {
			return measure.value === candidate.value;
		}
		return false;
	});
}

function measureValue(measure: VoiceMeasure): number {
	return measure.kind === 'fraction' ? measure.denominator : measure.value;
}

/**
 * Busca productos parecidos. Exacto solo si TODAS las palabras y TODAS las
 * medidas dictadas están en el producto. Un parecido nunca es exacto: por
 * ejemplo, "foco de 59 watts" es parecido al Foco 9W (comparte "foco") pero
 * no exacto, porque 59 != 9.
 */
export function findCandidates(
	products: Product[],
	descriptionTokens: string[],
	measures: VoiceMeasure[]
): VoiceCandidate[] {
	const words = descriptionTokens.filter((token) => !isDigitToken(token));
	const numbers = descriptionTokens.filter((token) => isDigitToken(token));
	const scored: VoiceCandidate[] = [];

	for (const product of products) {
		const haystack = normalizeText(
			`${product.name} ${product.key} ${product.alternateKey ?? product.barcode ?? ''}`
		);
		const haystackTokens = haystack.split(/[^a-z0-9/]+/).filter(Boolean);
		let matchedTokens = 0;
		let wordsOk = true;
		for (const word of words) {
			if (haystackTokens.some((token) => token.includes(word) || word.includes(token))) {
				matchedTokens += 1;
			} else {
				wordsOk = false;
			}
		}
		let numbersOk = true;
		for (const number of numbers) {
			if (haystack.includes(number)) {
				matchedTokens += 1;
			} else {
				numbersOk = false;
			}
		}
		const measuresOk = measures.every((measure) => measureMatches(product, measure));
		const measuresMatched = measures.filter((measure) =>
			measureMatches(product, measure)
		).length;
		if (matchedTokens === 0 && measuresMatched === 0) continue;
		const exact =
			words.length + numbers.length + measures.length > 0 &&
			wordsOk &&
			numbersOk &&
			measuresOk;
		scored.push({ product, exact, matchedTokens: matchedTokens + measuresMatched });
	}

	return scored
		.sort((a, b) => {
			if (a.exact !== b.exact) return a.exact ? -1 : 1;
			return b.matchedTokens - a.matchedTokens;
		})
		.slice(0, 3);
}

export function parseVoiceCount(transcript: string, products: Product[]): VoiceInterpretation {
	const normalized = normalizeText(transcript ?? '');
	const rawTokens = normalized
		.split(/[\s,;]+/)
		.filter(Boolean)
		.map((token) => {
			// El reconocimiento suele oír "-abos" en vez de "-avos".
			const fixed = token.endsWith('abos') ? `${token.slice(0, -4)}avos` : token;
			return ALIASES[fixed] ?? fixed;
		});
	const consumed = new Array<boolean>(rawTokens.length).fill(false);
	const measures: VoiceMeasure[] = [];
	const take = (index: number) => {
		consumed[index] = true;
	};

	// 1. Fracciones escritas: "5/16", "1/2", "3/4".
	rawTokens.forEach((token, i) => {
		const match = token.match(/^(\d+)\/(\d+)$/);
		if (!match || consumed[i]) return;
		const fraction: VoiceFraction = {
			numerator: Number(match[1]),
			denominator: Number(match[2]),
			text: `${match[1]}/${match[2]}`
		};
		measures.push({ kind: 'fraction', ...fraction });
		take(i);
	});

	// 2. Fracciones habladas: "cinco dieciseisavos", "tres cuartos", "5 dieciseis".
	for (let i = 0; i < rawTokens.length; i += 1) {
		if (consumed[i]) continue;
		const number = readNumber(rawTokens, i);
		if (!number) continue;
		const next = rawTokens[i + number.consumed];
		if (next === undefined || consumed[i + number.consumed]) continue;
		const denominator = DENOMINATORS[next];
		if (denominator === undefined) continue;
		const fraction: VoiceFraction = {
			numerator: number.value,
			denominator,
			text: `${number.value}/${denominator}`
		};
		measures.push({ kind: 'fraction', ...fraction });
		for (let j = 0; j < number.consumed; j += 1) take(i + j);
		take(i + number.consumed);
	}

	// 3. Medidas en watts: "59 watts", "cincuenta y nueve watts", "59w".
	for (let i = 0; i < rawTokens.length; i += 1) {
		if (consumed[i]) continue;
		const glued = rawTokens[i].match(/^(\d+)w$/);
		if (glued) {
			measures.push({ kind: 'watts', value: Number(glued[1]) });
			take(i);
			continue;
		}
		const number = readNumber(rawTokens, i);
		if (!number) continue;
		const next = rawTokens[i + number.consumed];
		if (next !== undefined && !consumed[i + number.consumed] && WATTS_WORDS.has(next)) {
			measures.push({ kind: 'watts', value: number.value });
			for (let j = 0; j < number.consumed; j += 1) take(i + j);
			take(i + number.consumed);
		}
	}

	// 4. Cantidad: número (dígitos o palabras) justo antes de "piezas"/"unidades".
	let quantity: number | undefined;
	for (let i = 0; i < rawTokens.length; i += 1) {
		if (consumed[i]) continue;
		const number = readNumber(rawTokens, i);
		if (!number) continue;
		const next = rawTokens[i + number.consumed];
		if (next !== undefined && !consumed[i + number.consumed] && PIECE_WORDS.has(next)) {
			quantity = number.value;
			for (let j = 0; j < number.consumed; j += 1) take(i + j);
			take(i + number.consumed);
			break;
		}
	}

	// 5. Si no hay "piezas", un par "5 16" al final es fracción, no cantidad.
	if (quantity === undefined) {
		const rest = rawTokens.map((token, i) => ({ token, i })).filter(({ i }) => !consumed[i]);
		const last = rest[rest.length - 1];
		const beforeLast = rest[rest.length - 2];
		if (
			last &&
			beforeLast &&
			isDigitToken(last.token) &&
			isDigitToken(beforeLast.token) &&
			Number(beforeLast.token) < Number(last.token)
		) {
			const fraction: VoiceFraction = {
				numerator: Number(beforeLast.token),
				denominator: Number(last.token),
				text: `${beforeLast.token}/${last.token}`
			};
			measures.push({ kind: 'fraction', ...fraction });
			take(beforeLast.i);
			take(last.i);
		}
	}

	// 6. Si no hay cantidad todavía, el último número suelto es la cantidad.
	if (quantity === undefined) {
		for (let i = rawTokens.length - 1; i >= 0; i -= 1) {
			if (consumed[i]) continue;
			const number = readNumber(rawTokens, i);
			if (!number) continue;
			quantity = number.value;
			for (let j = 0; j < number.consumed; j += 1) take(i + j);
			break;
		}
	}

	// 7. Fracciones que quedaron: "5 16" pegado a la cantidad y "516" pegado.
	//    "516" solo se parte cuando YA hay cantidad; así "clavo, 116 piezas"
	//    sigue siendo 116 y nunca 1/16.
	for (let i = 0; i < rawTokens.length; i += 1) {
		if (consumed[i]) continue;
		if (isDigitToken(rawTokens[i]) && quantity !== undefined) {
			const glued = splitGluedFraction(rawTokens[i]);
			if (glued) {
				measures.push({ kind: 'fraction', ...glued });
				take(i);
				continue;
			}
		}
		if (
			!consumed[i] &&
			isDigitToken(rawTokens[i]) &&
			i + 1 < rawTokens.length &&
			!consumed[i + 1] &&
			isDigitToken(rawTokens[i + 1]) &&
			Number(rawTokens[i]) < Number(rawTokens[i + 1])
		) {
			const fraction: VoiceFraction = {
				numerator: Number(rawTokens[i]),
				denominator: Number(rawTokens[i + 1]),
				text: `${rawTokens[i]}/${rawTokens[i + 1]}`
			};
			measures.push({ kind: 'fraction', ...fraction });
			take(i);
			take(i + 1);
		}
	}

	const descriptionTokens = rawTokens.filter(
		(token, i) => !consumed[i] && !STOPWORDS.has(token)
	);
	const description = descriptionTokens.join(' ');
	const candidates = findCandidates(products, descriptionTokens, measures);
	const exactCandidate = candidates.find((candidate) => candidate.exact);
	const firstFraction = measures.find((measure) => measure.kind === 'fraction');
	const fraction: VoiceFraction | undefined =
		firstFraction && firstFraction.kind === 'fraction'
			? {
					numerator: firstFraction.numerator,
					denominator: firstFraction.denominator,
					text: firstFraction.text
				}
			: undefined;

	let conflict: number | undefined;
	if (!exactCandidate && measures.length > 0) {
		const unmatched = measures.find(
			(measure) => !candidates.some((candidate) => measureMatches(candidate.product, measure))
		);
		if (unmatched) conflict = measureValue(unmatched);
	}

	return {
		transcript,
		normalized,
		description,
		quantity,
		...(fraction ? { fraction } : {}),
		measures,
		...(exactCandidate ? { product: exactCandidate.product } : {}),
		exact: Boolean(exactCandidate),
		...(conflict !== undefined ? { conflict } : {}),
		candidates
	};
}
