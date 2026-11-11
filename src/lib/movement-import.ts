import * as XLSX from 'xlsx';
import type { ImportedMovementType, MovementCandidate } from './imported-movements';
import { localMovementInstant } from './movement-time';

const COLUMNS = ['Folio', 'Clave', 'Fecha', 'Hora', 'Cantidad'];
export interface MovementFile {
	rows: MovementCandidate[];
	blankRows: number[];
}

function identifier(cell: XLSX.CellObject | undefined): string {
	if (!cell || cell.v === undefined || cell.v === null) return '';
	if (cell.f) throw new Error('Folio y Clave no pueden contener fórmulas.');
	if (cell.t === 's') return String(cell.v);
	if (
		cell.t === 'n' &&
		typeof cell.v === 'number' &&
		Number.isSafeInteger(cell.v) &&
		cell.v >= 0 &&
		String(cell.v).length <= 15
	) {
		const formatted = XLSX.utils.format_cell(cell);
		if (/^\d+$/.test(formatted)) return formatted;
	}
	throw new Error('Folio y Clave deben ser texto o enteros exactos, sin notación científica.');
}

function dateCell(cell: XLSX.CellObject | undefined, date1904: boolean): string {
	if (!cell || cell.v === undefined || cell.v === '') throw new Error('Fecha obligatoria.');
	if (cell.f) throw new Error('Fecha no puede contener fórmulas.');
	if (cell.t === 's') return String(cell.v);
	if (cell.t === 'n' && XLSX.SSF.is_date(cell.z ?? '')) {
		const parsed = XLSX.SSF.parse_date_code(cell.v, { date1904 });
		if (parsed && !(parsed.y === 1900 && parsed.m === 2 && parsed.d === 29))
			return `${String(parsed.d).padStart(2, '0')}/${String(parsed.m).padStart(2, '0')}/${parsed.y}`;
	}
	throw new Error('Fecha inválida: usa DD/MM/AAAA o una celda de fecha de Excel.');
}

function timeCell(cell: XLSX.CellObject | undefined): string {
	if (!cell || cell.v === undefined || cell.v === '')
		throw new Error('Hora obligatoria con segundos.');
	if (cell.f) throw new Error('Hora no puede contener fórmulas.');
	if (cell.t === 's') return String(cell.v);
	const format = String(cell.z ?? '').replace(/"[^"]*"|\\./g, '');
	if (
		cell.t === 'n' &&
		typeof cell.v === 'number' &&
		cell.v >= 0 &&
		cell.v < 1 &&
		/h/i.test(format) &&
		/s/i.test(format) &&
		!/am\/pm|a\/p/i.test(format)
	) {
		const seconds = cell.v * 86400;
		if (Math.abs(seconds - Math.round(seconds)) > 0.001)
			throw new Error('La hora de Excel contiene fracciones de segundo; revisa su precisión.');
		const rounded = Math.round(seconds);
		if (rounded >= 86400) throw new Error('Hora fuera del día.');
		return `${String(Math.floor(rounded / 3600)).padStart(2, '0')}:${String(Math.floor(rounded / 60) % 60).padStart(2, '0')}:${String(rounded % 60).padStart(2, '0')}`;
	}
	throw new Error('Hora inválida: usa HH:mm:ss de 24 horas, con segundos visibles.');
}

export function readMovementWorkbook(
	workbook: XLSX.WorkBook,
	type: ImportedMovementType,
	timeZone: string
): MovementFile {
	if (workbook.SheetNames.length !== 1)
		throw new Error('El archivo debe contener una sola hoja de movimientos.');
	const sheet = workbook.Sheets[workbook.SheetNames[0]];
	const range = XLSX.utils.decode_range(sheet['!ref'] ?? 'A1');
	if (range.e.r - range.s.r > 50000)
		throw new Error('El archivo excede 50,000 filas; divídelo en archivos más pequeños.');
	const headers: string[] = [];
	for (let c = range.s.c; c <= range.e.c; c++)
		headers.push(String(sheet[XLSX.utils.encode_cell({ r: range.s.r, c })]?.v ?? ''));
	if (
		headers.length !== COLUMNS.length ||
		COLUMNS.some((column) => headers.filter((h) => h === column).length !== 1)
	)
		throw new Error(
			'Usa exactamente las columnas Folio, Clave, Fecha, Hora y Cantidad, sin encabezados repetidos.'
		);
	const rows: MovementCandidate[] = [];
	const blankRows: number[] = [];
	for (let r = range.s.r + 1; r <= range.e.r; r++) {
		const cells = Object.fromEntries(
			headers.map((h, index) => [
				h,
				sheet[XLSX.utils.encode_cell({ r, c: range.s.c + index })] as XLSX.CellObject | undefined
			])
		);
		if (
			Object.values(cells).every(
				(cell) => !cell || cell.v === '' || cell.v === undefined || cell.v === null
			)
		) {
			blankRows.push(r + 1);
			continue;
		}
		const row: MovementCandidate = {
			row: r + 1,
			type,
			folio: '',
			key: '',
			date: '',
			time: '',
			errors: []
		};
		const read = <T>(operation: () => T, fallback: T): T => {
			try {
				return operation();
			} catch (error) {
				row.errors.push((error as Error).message);
				return fallback;
			}
		};
		row.folio = read(() => identifier(cells.Folio), '');
		row.key = read(() => identifier(cells.Clave), '');
		row.date = read(() => dateCell(cells.Fecha, Boolean(workbook.Workbook?.WBProps?.date1904)), '');
		row.time = read(() => timeCell(cells.Hora), '');
		if (!row.folio.trim() || row.folio !== row.folio.trim())
			row.errors.push('Folio obligatorio y sin espacios al inicio o final.');
		if (!row.key.trim() || row.key !== row.key.trim())
			row.errors.push('Clave principal obligatoria y sin espacios al inicio o final.');
		const quantity = cells.Cantidad;
		if (
			quantity?.f ||
			!quantity ||
			(quantity.t !== 'n' && !/^\d+(?:\.\d+)?$/.test(String(quantity.v)))
		)
			row.errors.push(
				'Cantidad debe ser un número positivo; usa una celda numérica de Excel o punto decimal.'
			);
		else {
			row.quantity = Number(quantity.v);
			if (!Number.isFinite(row.quantity) || row.quantity <= 0)
				row.errors.push('Cantidad debe ser mayor que cero.');
		}
		if (row.date && row.time)
			row.occurredAt = read(() => localMovementInstant(row.date, row.time, timeZone), undefined);
		rows.push(row);
	}
	return { rows, blankRows };
}

export function readMovementFile(
	data: ArrayBuffer,
	filename: string,
	type: ImportedMovementType,
	timeZone: string
): MovementFile {
	if (!/\.xlsx$/i.test(filename)) throw new Error('Selecciona un archivo .xlsx.');
	if (data.byteLength > 20 * 1024 * 1024) throw new Error('El archivo excede 20 MB.');
	return readMovementWorkbook(
		XLSX.read(data, { type: 'array', cellDates: false, cellNF: true, cellText: true }),
		type,
		timeZone
	);
}
