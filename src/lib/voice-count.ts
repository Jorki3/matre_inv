import {
	combineMixedTokens,
	countTokenMatches,
	normalizeText,
	productFractions,
	productWholeInches,
	type Product
} from './inventory';

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
 * - "brocha de media pulgada, tres piezas" -> Brocha practica 013mm 1/2
 *   exito, 3 piezas. "Media pulgada" es la medida 1/2 (Eduardo no dice
 *   los milímetros) y "1 pulgada y media" es 1 1/2 (Brocha 038mm 11/2).
 *   La coincidencia es por token completo: la "a" de la clave A-AZ110
 *   ya no hace que "brocha" case con el Lubricante en aerosol.
 * - Si varias brochas coinciden exacto ("brocha" sin medida), NO se
 *   preselecciona ninguna: quedan todas como parecidos y el usuario elige.
 */

export interface VoiceFraction {
	/** Parte entera de una mixta: 1 en "1 1/2". Ausente (o 0) en "1/2". */
	whole?: number;
	numerator: number;
	denominator: number;
	text: string;
}

export type VoiceMeasure =
	| {
			kind: 'fraction';
			/** Parte entera: 2 en "2 pulgadas", 1 en "1 1/2", 0 en "1/2". */
			whole: number;
			numerator: number;
			denominator: number;
			text: string;
	  }
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
	let sawNumber = false;
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
			sawNumber = true;
			i += 1;
			consumed += 1;
			continue;
		}
		const value = NUMBER_WORDS[token];
		if (value === undefined) break;
		sawNumber = true;
		current += value;
		i += 1;
		consumed += 1;
	}
	// Una "y" suelta no es un número: sin dígito ni palabra numérica no
	// se consume nada (antes "y media" se leía como el número 0).
	return { value: total + current, consumed: sawNumber ? consumed : 0 };
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
	return { whole: 0, numerator, denominator, text: `${numerator}/${denominator}` };
}

/** Una fracción dictada como medida (con parte entera 0 si no es mixta). */
function asMeasure(fraction: VoiceFraction): VoiceMeasure {
	return {
		kind: 'fraction',
		whole: fraction.whole ?? 0,
		numerator: fraction.numerator,
		denominator: fraction.denominator,
		text: fraction.text
	};
}

function productMeasures(product: Product): VoiceMeasure[] {
	const measures: VoiceMeasure[] = [];
	for (const fraction of productFractions(product)) {
		measures.push(asMeasure(fraction));
	}
	// El "2" de "Brocha practica 050mm 2 exito" es 2 pulgadas enteras.
	for (const inches of productWholeInches(product)) {
		measures.push({
			kind: 'fraction',
			whole: inches,
			numerator: 0,
			denominator: 1,
			text: `${inches}"`
		});
	}
	const haystack = normalizeText(
		`${product.name} ${product.key} ${product.alternateKey ?? product.barcode ?? ''}`
	);
	for (const match of haystack.matchAll(/(\d+)\s*w\b/g)) {
		measures.push({ kind: 'watts', value: Number(match[1]) });
	}
	return measures;
}

function measureMatches(product: Product, measure: VoiceMeasure): boolean {
	return productMeasures(product).some((candidate) => {
		if (measure.kind === 'fraction' && candidate.kind === 'fraction') {
			return (
				measure.whole === candidate.whole &&
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
	if (measure.kind === 'fraction') return measure.whole > 0 ? measure.whole : measure.denominator;
	return measure.value;
}

/**
 * Busca productos parecidos. Exacto solo si TODAS las palabras, números y
 * medidas dictadas están en el producto, con coincidencia por token
 * completo (ver countTokenMatches en inventory.ts): la "a" de la clave
 * A-AZ110 ya no hace que "brocha" coincida con el Lubricante, y un "2"
 * ya no coincide con "110ml" ni con el barcode "75022...".
 * Un parecido nunca es exacto: por ejemplo, "foco de 59 watts" es
 * parecido al Foco 9W (comparte "foco") pero no exacto, porque 59 != 9.
 */
export function findCandidates(
	products: Product[],
	descriptionTokens: string[],
	measures: VoiceMeasure[]
): VoiceCandidate[] {
	const scored: VoiceCandidate[] = [];

	for (const product of products) {
		const matchedTokens = countTokenMatches(product, descriptionTokens);
		const measuresMatched = measures.filter((measure) =>
			measureMatches(product, measure)
		).length;
		const measuresOk = measures.every((measure) => measureMatches(product, measure));
		if (matchedTokens === 0 && measuresMatched === 0) continue;
		const exact =
			combineMixedTokens(descriptionTokens).length + measures.length > 0 &&
			matchedTokens === combineMixedTokens(descriptionTokens).length &&
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
		// "1 1/2" escrito por separado: el dígito anterior es la parte entera.
		let whole = 0;
		if (i > 0 && !consumed[i - 1] && isDigitToken(rawTokens[i - 1])) {
			whole = Number(rawTokens[i - 1]);
			take(i - 1);
		}
		const fraction: VoiceFraction = {
			whole,
			numerator: Number(match[1]),
			denominator: Number(match[2]),
			text: whole ? `${whole} ${match[1]}/${match[2]}` : `${match[1]}/${match[2]}`
		};
		measures.push(asMeasure(fraction));
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
			whole: 0,
			numerator: number.value,
			denominator,
			text: `${number.value}/${denominator}`
		};
		measures.push(asMeasure(fraction));
		for (let j = 0; j < number.consumed; j += 1) take(i + j);
		take(i + number.consumed);
	}

	// 2c. Medidas con "media": "media pulgada" = 1/2, "1 pulgada y media"
	//     o "1 y media" = 1 1/2, "2 y media" = 2 1/2. Eduardo no dice
	//     los milímetros: dice "brocha de media pulgada" y es la de 013mm 1/2.
	const HALF_TOKENS = new Set(['media', 'medio', 'medias', 'medios']);
	for (let i = 0; i < rawTokens.length; i += 1) {
		if (consumed[i]) continue;
		const number = readNumber(rawTokens, i);
		if (number) {
			let j = i + number.consumed;
			if (rawTokens[j] === 'pulgada' || rawTokens[j] === 'pulgadas') j += 1;
			if (rawTokens[j] === 'y' && HALF_TOKENS.has(rawTokens[j + 1] ?? '')) {
				measures.push({
					kind: 'fraction',
					whole: number.value,
					numerator: 1,
					denominator: 2,
					text: `${number.value} 1/2`
				});
				for (let k = i; k <= j + 1; k += 1) take(k);
				if (rawTokens[j + 2] === 'pulgada' || rawTokens[j + 2] === 'pulgadas') take(j + 2);
				continue;
			}
		}
		if (HALF_TOKENS.has(rawTokens[i])) {
			measures.push({ kind: 'fraction', whole: 0, numerator: 1, denominator: 2, text: '1/2' });
			take(i);
			if (rawTokens[i + 1] === 'pulgada' || rawTokens[i + 1] === 'pulgadas') take(i + 1);
		}
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
				whole: 0,
				numerator: Number(beforeLast.token),
				denominator: Number(last.token),
				text: `${beforeLast.token}/${last.token}`
			};
			measures.push(asMeasure(fraction));
			take(beforeLast.i);
			take(last.i);
		}
	}

	// 6. Si no hay cantidad todavía, el último número suelto es la cantidad.
	//     Un número seguido de "pulgadas" es medida, no cantidad.
	if (quantity === undefined) {
		for (let i = rawTokens.length - 1; i >= 0; i -= 1) {
			if (consumed[i]) continue;
			const number = readNumber(rawTokens, i);
			if (!number) continue;
			const next = rawTokens[i + number.consumed];
			if (next === 'pulgada' || next === 'pulgadas') continue;
			quantity = number.value;
			for (let j = 0; j < number.consumed; j += 1) take(i + j);
			break;
		}
	}

	// 6b. Pulgadas enteras: "2 pulgadas" es medida, no cantidad ni descripción.
	for (let i = 0; i < rawTokens.length; i += 1) {
		if (consumed[i]) continue;
		const number = readNumber(rawTokens, i);
		if (!number) continue;
		const next = rawTokens[i + number.consumed];
		if (next === 'pulgada' || next === 'pulgadas') {
			measures.push({
				kind: 'fraction',
				whole: number.value,
				numerator: 0,
				denominator: 1,
				text: `${number.value}"`
			});
			for (let j = 0; j < number.consumed; j += 1) take(i + j);
			take(i + number.consumed);
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
				measures.push(asMeasure(glued));
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
				whole: 0,
				numerator: Number(rawTokens[i]),
				denominator: Number(rawTokens[i + 1]),
				text: `${rawTokens[i]}/${rawTokens[i + 1]}`
			};
			measures.push(asMeasure(fraction));
			take(i);
			take(i + 1);
		}
	}

	const descriptionTokens = rawTokens.filter(
		(token, i) => !consumed[i] && !STOPWORDS.has(token)
	);
	const description = descriptionTokens.join(' ');
	const candidates = findCandidates(products, descriptionTokens, measures);
	let exactCandidate = candidates.find((candidate) => candidate.exact);
	if (exactCandidate && candidates.filter((candidate) => candidate.exact).length > 1) {
		// Varios productos coinciden exacto (p. ej. "brocha" sin medida):
		// no se puede adivinar cuál es. Quedan todos como parecidos y el
		// usuario elige a mano.
		for (const candidate of candidates) candidate.exact = false;
		exactCandidate = undefined;
	}
	const firstFraction = measures.find((measure) => measure.kind === 'fraction');
	const fraction: VoiceFraction | undefined =
		firstFraction && firstFraction.kind === 'fraction'
			? {
					...(firstFraction.whole ? { whole: firstFraction.whole } : {}),
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
