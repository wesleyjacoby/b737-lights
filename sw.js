// Offline support. The app shell is cached on first visit. Pages, scripts and data try the network first
// (so a new deploy shows up as soon as you are online) and fall back to the cache when offline or slow.
// Fonts, icons and pdf.js never change, so they come straight from the cache.
// Bump VERSION when files are added or renamed, so the new list is cached.
const VERSION = "v10";
const CACHE = "lights-" + VERSION;
const SHELL = [
	"./",
	"index.html",
	"manifest.webmanifest",
	"css/app.css",
	"js/app.js",
	"js/store.js",
	"js/pdfdocs.js",
	"js/viewer.js",
	"js/motion.js",
	"js/plain.js",
	"vendor/pdfjs/pdf.min.js",
	"vendor/pdfjs/pdf.worker.min.js",
	"fonts/barlow-condensed-latin-500-normal.woff2",
	"fonts/barlow-condensed-latin-600-normal.woff2",
	"fonts/ibm-plex-sans-latin-400-normal.woff2",
	"fonts/ibm-plex-sans-latin-500-normal.woff2",
	"fonts/ibm-plex-sans-latin-600-normal.woff2",
	"fonts/ibm-plex-mono-latin-400-normal.woff2",
	"fonts/ibm-plex-mono-latin-500-normal.woff2",
	"icons/icon-192.png",
	"icons/icon-512.png",
	"icons/icon-maskable-512.png",
	"icons/apple-touch-icon.png",
];

self.addEventListener("install", function (e) {
	e.waitUntil(
		caches
			.open(CACHE)
			.then(function (c) {
				return c.addAll(SHELL);
			})
			.then(function () {
				return self.skipWaiting();
			}),
	);
});

self.addEventListener("activate", function (e) {
	e.waitUntil(
		caches
			.keys()
			.then(function (keys) {
				return Promise.all(
					keys
						.filter(function (k) {
							return k !== CACHE;
						})
						.map(function (k) {
							return caches.delete(k);
						}),
				);
			})
			.then(function () {
				return self.clients.claim();
			}),
	);
});

function cacheFirst(req) {
	return caches.match(req).then(function (hit) {
		return (
			hit ||
			fetch(req).then(function (res) {
				if (res && res.ok) {
					const copy = res.clone();
					caches.open(CACHE).then(function (c) {
						c.put(req, copy);
					});
				}
				return res;
			})
		);
	});
}

function networkFirst(req) {
	return new Promise(function (resolve) {
		let settled = false;
		const finish = function (res) {
			if (!settled && res) {
				settled = true;
				resolve(res);
			}
		};
		const timer = setTimeout(function () {
			caches.match(req, { ignoreSearch: true }).then(finish);
		}, 3000);
		fetch(req)
			.then(function (res) {
				clearTimeout(timer);
				if (res && res.ok) {
					const copy = res.clone();
					caches.open(CACHE).then(function (c) {
						c.put(req, copy);
					});
				}
				finish(res);
			})
			.catch(function () {
				clearTimeout(timer);
				caches.match(req, { ignoreSearch: true }).then(function (hit) {
					finish(hit || Response.error());
				});
			});
	});
}

self.addEventListener("fetch", function (e) {
	const req = e.request;
	if (req.method !== "GET") return;
	const url = new URL(req.url);
	if (url.origin !== self.location.origin) return;
	const path = url.pathname;
	if (/\/(fonts|icons|vendor)\//.test(path)) e.respondWith(cacheFirst(req));
	else e.respondWith(networkFirst(req));
});
