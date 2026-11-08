import { describe, expect, it } from 'vitest';
import {
	createSession,
	transitionSession,
	createSeedCatalog,
	computeMetrics,
	createInventoryExport,
	validateBackup,
	resetSessionCounts
} from './inventory';
import { createCountsExport } from './counts-export';
import {
	saveUnmatchedArticle,
	removeUnmatchedArticle,
	validateUnmatchedArticles,
	unmatchedExportRows,
	type UnmatchedDraft
} from './unmatched-articles';

const now = '2026-11-05T12:00:00.000Z';
const draft = (overrides: Partial<UnmatchedDraft> = {}): UnmatchedDraft => ({
	description: 'Tornillo especial',
	quantity: 1.25,
	key: '',
	alternateKey: '',
	location: '',
	notes: '',
	reviewStatus: 'pending',
	linkedProductKey: '',
	...overrides
});
const activeSession = () =>
	transitionSession({ ...createSession(), products: createSeedCatalog() }, 'active');

describe('unmatched articles', () => {
	it('records an article without keys, decimal and zero quantities with independent initial review state', () => {
		const session = activeSession();
		const items = saveUnmatchedArticle(
			session,
			[],
			draft({ reviewStatus: 'needs_creation' }),
			session.products,
			'F-1',
			now
		);
		expect(items[0]).toMatchObject({
			description: 'Tornillo especial',
			quantity: 1.25,
			key: '',
			alternateKey: '',
			reviewStatus: 'pending',
			createdAt: now,
			sessionId: session.id
		});
		const zero = saveUnmatchedArticle(
			session,
			items,
			draft({ description: 'Otro producto', quantity: 0 }),
			session.products,
			'F-2',
			now
		);
		expect(zero[1].quantity).toBe(0);
	});

	it('rejects empty records, invalid quantities and duplicates in the same location and session', () => {
		const session = activeSession();
		for (const value of [
			draft({ description: '  ' }),
			draft({ quantity: undefined }),
			draft({ quantity: -1 }),
			draft({ quantity: NaN }),
			draft({ quantity: Infinity })
		])
			expect(() => saveUnmatchedArticle(session, [], value, session.products, 'F', now)).toThrow();
		const items = saveUnmatchedArticle(
			session,
			[],
			draft({ location: 'A1' }),
			session.products,
			'F',
			now
		);
		expect(() =>
			saveUnmatchedArticle(
				session,
				items,
				draft({ description: ' torníllo especial ', location: 'a1', quantity: 5 }),
				session.products,
				'F-2',
				now
			)
		).toThrow('Ya existe');
		expect(
			saveUnmatchedArticle(session, items, draft({ location: 'A2' }), session.products, 'F-2', now)
		).toHaveLength(2);
	});

	it('edits and changes review status, links the main catalog key and never alters official progress or exports', () => {
		const session = activeSession();
		const before = JSON.stringify(session.products);
		const metrics = computeMetrics(session.products);
		let items = saveUnmatchedArticle(session, [], draft(), session.products, 'F', now);
		items = saveUnmatchedArticle(
			session,
			items,
			draft({ id: 'F', description: 'Revisado', quantity: 2.5, reviewStatus: 'needs_creation' }),
			session.products,
			'unused',
			'2026-11-05T13:00:00Z'
		);
		expect(items[0]).toMatchObject({
			description: 'Revisado',
			quantity: 2.5,
			reviewStatus: 'needs_creation',
			createdAt: now,
			updatedAt: '2026-11-05T13:00:00Z'
		});
		expect(() =>
			saveUnmatchedArticle(
				session,
				items,
				draft({ id: 'F', reviewStatus: 'identified', linkedProductKey: 'NO-EXISTE' }),
				session.products,
				'unused',
				now
			)
		).toThrow('clave principal');
		items = saveUnmatchedArticle(
			session,
			items,
			draft({
				id: 'F',
				reviewStatus: 'identified',
				linkedProductKey: session.products[0].key.toLowerCase()
			}),
			session.products,
			'unused',
			now
		);
		expect(items[0].linkedProductKey).toBe(session.products[0].key);
		expect(JSON.stringify(session.products)).toBe(before);
		expect(computeMetrics(session.products)).toEqual(metrics);
		expect(createCountsExport(session.products)).toEqual([]);
		expect(unmatchedExportRows(items)[0]).toMatchObject({
			'Cantidad física encontrada': 1.25,
			'Estado de revisión': 'Identificado en catálogo',
			'Clave relacionada': session.products[0].key
		});
	});

	it('locks paused, completed and historical sessions and preserves old findings when a new session is prepared', () => {
		const session = activeSession();
		const items = saveUnmatchedArticle(session, [], draft(), session.products, 'F', now);
		for (const status of ['paused', 'completed'] as const) {
			const locked = transitionSession(session, status);
			expect(() =>
				saveUnmatchedArticle(locked, items, draft({ id: 'F' }), session.products, 'unused', now)
			).toThrow();
			expect(() => removeUnmatchedArticle(locked, items, 'F')).toThrow();
		}
		const next = resetSessionCounts(transitionSession(session, 'completed'), 'new');
		expect(items[0].sessionId).toBe(session.id);
		expect(items.filter((item) => item.sessionId === next.id)).toEqual([]);
		expect(() =>
			saveUnmatchedArticle(
				transitionSession(next, 'active'),
				items,
				draft({ id: 'F' }),
				next.products,
				'unused',
				now
			)
		).toThrow('no pertenece');
		expect(removeUnmatchedArticle(session, items, 'F')).toEqual([]);
	});

	it('round-trips findings and historical sessions in JSON and accepts old backups without the module', () => {
		const session = activeSession();
		const items = saveUnmatchedArticle(session, [], draft(), session.products, 'F', now);
		const backup = createInventoryExport(session.products, session, [], items);
		expect(backup.version).toBe(3);
		expect(validateBackup(JSON.parse(JSON.stringify(backup))).value?.unmatchedArticles).toEqual(
			items
		);
		for (const version of [1, 2]) {
			const { unmatchedArticles: _unused, ...old } = backup;
			void _unused;
			expect(validateBackup({ ...old, version }).value?.unmatchedArticles).toEqual([]);
		}
		expect(
			validateBackup({ ...backup, unmatchedArticles: [{ ...items[0], quantity: null }] }).valid
		).toBe(false);
		expect(validateBackup({ ...backup, unmatchedArticles: undefined }).valid).toBe(false);
		expect(() => validateUnmatchedArticles([items[0], items[0]])).toThrow('duplicados');
	});
});
