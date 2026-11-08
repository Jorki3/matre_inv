import type { InventorySession, Product } from './inventory';

export const reviewLabels = {
	pending: 'Pendiente de revisar',
	identified: 'Identificado en catálogo',
	needs_creation: 'Requiere alta'
} as const;
export type ReviewStatus = keyof typeof reviewLabels;

export interface UnmatchedArticle {
	id: string;
	sessionId: string;
	sessionName: string;
	description: string;
	quantity: number;
	key: string;
	alternateKey: string;
	location: string;
	notes: string;
	createdAt: string;
	updatedAt?: string;
	reviewStatus: ReviewStatus;
	linkedProductKey?: string;
}
export interface UnmatchedDraft {
	id?: string;
	description: string;
	quantity: number | undefined;
	key: string;
	alternateKey: string;
	location: string;
	notes: string;
	reviewStatus: ReviewStatus;
	linkedProductKey: string;
}
const comparable = (value: string) =>
	value
		.normalize('NFD')
		.replace(/[\u0300-\u036f]/g, '')
		.trim()
		.toLowerCase();
const signature = (
	value: Pick<UnmatchedArticle, 'description' | 'key' | 'alternateKey' | 'location'>
) =>
	JSON.stringify([
		value.key
			? `key:${comparable(value.key)}`
			: value.alternateKey
				? `alt:${comparable(value.alternateKey)}`
				: `name:${comparable(value.description)}`,
		comparable(value.location)
	]);

export function saveUnmatchedArticle(
	session: InventorySession,
	articles: UnmatchedArticle[],
	draft: UnmatchedDraft,
	catalog: Product[],
	id: string,
	now: string
): UnmatchedArticle[] {
	if (session.status !== 'active')
		throw new Error('Comienza o reanuda la sesión para registrar o editar hallazgos.');
	if (!draft.description.trim()) throw new Error('Escribe la descripción del artículo.');
	if (draft.quantity === undefined || !Number.isFinite(draft.quantity) || draft.quantity < 0)
		throw new Error('Escribe una cantidad válida, mayor o igual a cero.');
	const previous = draft.id ? articles.find((article) => article.id === draft.id) : undefined;
	if (draft.id && (!previous || previous.sessionId !== session.id))
		throw new Error('El hallazgo no pertenece a esta sesión.');
	const status = previous ? draft.reviewStatus : 'pending';
	if (!Object.hasOwn(reviewLabels, status)) throw new Error('Estado de revisión inválido.');
	const linked =
		status === 'identified'
			? catalog.find((product) => comparable(product.key) === comparable(draft.linkedProductKey))
			: undefined;
	if (status === 'identified' && !linked)
		throw new Error('Relaciona el hallazgo con una clave principal existente en el catálogo.');
	const value: UnmatchedArticle = {
		id: previous?.id ?? id,
		sessionId: session.id,
		sessionName: previous?.sessionName ?? session.name,
		description: draft.description.trim(),
		quantity: draft.quantity,
		key: draft.key.trim(),
		alternateKey: draft.alternateKey.trim(),
		location: draft.location.trim(),
		notes: draft.notes.trim(),
		createdAt: previous?.createdAt ?? now,
		...(previous ? { updatedAt: now } : {}),
		reviewStatus: status,
		...(linked ? { linkedProductKey: linked.key } : {})
	};
	if (
		articles.some(
			(article) =>
				article.sessionId === session.id &&
				article.id !== previous?.id &&
				signature(article) === signature(value)
		)
	)
		throw new Error(
			'Ya existe un hallazgo con esa identificación y ubicación. Busca y edita el registro existente.'
		);
	if (!previous && articles.some((article) => article.id === id))
		throw new Error('El identificador ya existe. Intenta nuevamente.');
	return previous
		? articles.map((article) => (article.id === previous.id ? value : article))
		: [...articles, value];
}

export function removeUnmatchedArticle(
	session: InventorySession,
	articles: UnmatchedArticle[],
	id: string
): UnmatchedArticle[] {
	if (session.status !== 'active')
		throw new Error('La sesión debe estar En curso para eliminar un hallazgo.');
	const article = articles.find((value) => value.id === id);
	if (!article || article.sessionId !== session.id)
		throw new Error('El hallazgo no pertenece a esta sesión.');
	return articles.filter((value) => value.id !== id);
}

export function validateUnmatchedArticles(input: unknown): UnmatchedArticle[] {
	if (input === undefined) return [];
	if (!Array.isArray(input)) throw new Error('La lista de artículos no encontrados no es válida.');
	const ids = new Set<string>();
	return input.map((value) => {
		if (!value || typeof value !== 'object' || Array.isArray(value))
			throw new Error('Hallazgo inválido.');
		const article = value as Record<string, unknown>;
		for (const field of ['id', 'sessionId', 'sessionName', 'description', 'createdAt'])
			if (typeof article[field] !== 'string' || !(article[field] as string).trim())
				throw new Error('Faltan datos obligatorios del hallazgo.');
		for (const field of [
			'key',
			'alternateKey',
			'location',
			'notes',
			'linkedProductKey',
			'updatedAt'
		])
			if (article[field] !== undefined && typeof article[field] !== 'string')
				throw new Error('Datos del hallazgo inválidos.');
		if (
			typeof article.quantity !== 'number' ||
			!Number.isFinite(article.quantity) ||
			article.quantity < 0 ||
			!Number.isFinite(Date.parse(article.createdAt as string)) ||
			(article.updatedAt !== undefined &&
				!Number.isFinite(Date.parse(article.updatedAt as string))) ||
			!Object.hasOwn(reviewLabels, String(article.reviewStatus))
		)
			throw new Error('Cantidad, fecha o estado de revisión inválidos.');
		if (
			article.reviewStatus === 'identified' &&
			(typeof article.linkedProductKey !== 'string' || !article.linkedProductKey.trim())
		)
			throw new Error('Falta la clave del hallazgo identificado.');
		if (ids.has(article.id as string))
			throw new Error('Hay identificadores de hallazgos duplicados.');
		ids.add(article.id as string);
		return {
			...article,
			key: article.key ?? '',
			alternateKey: article.alternateKey ?? '',
			location: article.location ?? '',
			notes: article.notes ?? ''
		} as unknown as UnmatchedArticle;
	});
}

export function unmatchedExportRows(articles: UnmatchedArticle[]) {
	return articles.map((article) => ({
		Sesión: article.sessionName,
		'ID de sesión': article.sessionId,
		Descripción: article.description,
		'Cantidad física encontrada': article.quantity,
		Clave: article.key,
		'Clave alterna': article.alternateKey,
		Ubicación: article.location,
		Observaciones: article.notes,
		'Fecha de registro': article.createdAt,
		'Última edición': article.updatedAt ?? '',
		'Estado de revisión': reviewLabels[article.reviewStatus],
		'Clave relacionada': article.linkedProductKey ?? ''
	}));
}
