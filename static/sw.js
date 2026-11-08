const CACHE_NAME = 'matre-inventario-v9';
const BASE_PATH = new URL(self.registration.scope).pathname.replace(/\/$/, '');
const APP_ROOT = `${BASE_PATH}/`;
const PRECACHE = [APP_ROOT, `${BASE_PATH}/manifest.webmanifest`, `${BASE_PATH}/favicon.svg`];

self.addEventListener('install', (event) => {
	event.waitUntil(
		caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting())
	);
});

self.addEventListener('activate', (event) => {
	event.waitUntil(
		caches.keys().then((keys) =>
			Promise.all(keys.filter((key) => key.startsWith('matre-inventario-') && key !== CACHE_NAME).map((key) => caches.delete(key)))
		)
			.then(() => self.clients.claim())
	);
});

self.addEventListener('fetch', (event) => {
	if (event.request.method !== 'GET') return;
	const url = new URL(event.request.url);
	if (url.origin !== self.location.origin) return;
	if (url.pathname === `${BASE_PATH}/sw.js`) return;

	event.respondWith(
		caches.match(event.request).then((cached) => {
			if (cached) return cached;
			return fetch(event.request)
				.then((response) => {
					const copy = response.clone();
					caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
					return response;
				})
				.catch(() => caches.match(APP_ROOT));
		})
	);
});
