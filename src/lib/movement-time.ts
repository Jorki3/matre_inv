const formatters = new Map<string, Intl.DateTimeFormat>();
const dayOffsets = new Map<string, number[]>();
/** Date conversion independent of the browser's timezone. Historical values are never rewritten. */
export function validateTimeZone(timeZone: string): void {
	if (typeof timeZone !== 'string' || !timeZone.trim())
		throw new Error('Confirma una zona horaria válida.');
	try {
		new Intl.DateTimeFormat('en', { timeZone }).format();
	} catch {
		throw new Error('Zona horaria inválida. Usa un identificador como America/Mexico_City.');
	}
}

function calendarEpoch(year: number, month: number, day: number): number {
	const epoch = Date.UTC(year, month - 1, day);
	const date = new Date(epoch);
	if (
		year < 1900 ||
		year > 9999 ||
		date.getUTCFullYear() !== year ||
		date.getUTCMonth() !== month - 1 ||
		date.getUTCDate() !== day
	)
		throw new Error('Fecha inválida. Usa DD/MM/AAAA y una fecha real.');
	return epoch;
}

export function localMovementInstant(date: string, time: string, timeZone: string): string {
	validateTimeZone(timeZone);
	const d = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(date);
	const t = /^(\d{2}):(\d{2}):(\d{2})$/.exec(time);
	if (!d) throw new Error('Fecha obligatoria con formato DD/MM/AAAA.');
	if (!t || Number(t[1]) > 23 || Number(t[2]) > 59 || Number(t[3]) > 59)
		throw new Error('Hora obligatoria en formato HH:mm:ss de 24 horas, con segundos.');
	const wall =
		calendarEpoch(Number(d[3]), Number(d[2]), Number(d[1])) +
		(Number(t[1]) * 3600 + Number(t[2]) * 60 + Number(t[3])) * 1000;
	const formatter =
		formatters.get(timeZone) ??
		new Intl.DateTimeFormat('en-CA', {
			timeZone,
			year: 'numeric',
			month: '2-digit',
			day: '2-digit',
			hour: '2-digit',
			minute: '2-digit',
			second: '2-digit',
			hourCycle: 'h23',
			calendar: 'gregory',
			numberingSystem: 'latn'
		});
	if (formatters.size > 32) formatters.clear();
	formatters.set(timeZone, formatter);
	const localEpoch = (epoch: number) => {
		const parts = Object.fromEntries(formatter.formatToParts(epoch).map((p) => [p.type, p.value]));
		return Date.UTC(
			Number(parts.year),
			Number(parts.month) - 1,
			Number(parts.day),
			Number(parts.hour),
			Number(parts.minute),
			Number(parts.second)
		);
	};
	const cacheKey = JSON.stringify([timeZone, date]);
	let offsets = dayOffsets.get(cacheKey);
	if (!offsets) {
		const possible = new Set<number>();
		for (let hour = -36; hour <= 36; hour += 6) {
			const sample = wall + hour * 3600000;
			possible.add(localEpoch(sample) - sample);
		}
		offsets = [...possible];
		if (dayOffsets.size > 4096) dayOffsets.clear();
		dayOffsets.set(cacheKey, offsets);
	}
	const candidates = offsets
		.map((offset) => wall - offset)
		.filter((epoch) => localEpoch(epoch) === wall);
	if (candidates.length !== 1)
		throw new Error(
			candidates.length
				? 'Hora local ambigua por cambio de horario. Requiere revisión.'
				: 'La hora local no existe en esta zona por cambio de horario. Requiere revisión.'
		);
	return new Date(candidates[0]).toISOString();
}

/** Comparisons deliberately use seconds. An ISO string without offset is ambiguous. */
export function historicalSecond(value: string | undefined): number | undefined {
	if (!value || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value))
		return undefined;
	const datePart = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/.exec(value)!;
	const year = Number(datePart[1]),
		month = Number(datePart[2]),
		day = Number(datePart[3]);
	const calendar = new Date(Date.UTC(year, month - 1, day));
	if (
		calendar.getUTCFullYear() !== year ||
		calendar.getUTCMonth() !== month - 1 ||
		calendar.getUTCDate() !== day ||
		Number(datePart[4]) > 23 ||
		Number(datePart[5]) > 59 ||
		Number(datePart[6]) > 59
	)
		return undefined;
	const epoch = Date.parse(value);
	return Number.isFinite(epoch) ? Math.floor(epoch / 1000) : undefined;
}
