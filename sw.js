/*
 * The service worker: what makes the app openable with no connection at all, on a plane or
 * anywhere else. It keeps a copy of the app's own files in the browser and serves them from
 * there, so the page loads without reaching the network.
 *
 * What it deliberately does NOT do is cache a market price. Prices come from a provider over
 * the network; with no network there are no prices, and serving yesterday's from a cache as
 * though it were current is the one thing this app must never do. Requests to a provider go
 * straight to the network and are allowed to fail, which the app already explains.
 */
const BUILD = 'dev';
const SHELL = 'bullpen-shell-' + BUILD;   // the app itself: small, cached on install
/*
 * The recorded history is NOT keyed to the build. It is thirteen megabytes of prices that
 * happened years ago and do not change, and someone who saved it before a flight must not lose
 * it to a deploy of the app's code. It carries its own version, bumped only if the data format
 * changes.
 */
const BULK = 'bullpen-data-v1';

// Everything needed to open the app and play the simulated market.
const SHELL_FILES = [
  './',
  'index.html',
  'styles.css',
  'js/data.js',
  'js/realdata.js',
  'js/holidays.js',
  'js/quotes.js',
  'js/engine.js',
  'js/charts.js',
  'js/stats.js',
  'js/indicators.js',
  'js/journal.js',
  'js/backtest.js',
  'js/calc.js',
  'js/firebase-config.js',
  'js/cloud.js',
  'js/learn.js',
  'js/academy-content.js',
  'js/app.js',
  'js/tour.js',
  'js/setup.js',
  'js/academy.js',
  'manifest.webmanifest',
  'icon-192.png',
  'icon-512.png',
];

// The recorded history behind replay mode. Thirteen megabytes, so it is fetched when asked for
// rather than forced on everyone who opens the page once.
const BULK_FILES = ['data/real-index.js', 'data/real-0.js', 'data/real-1.js', 'data/real-2.js', 'data/real-3.js'];

const isBulk = (p) => BULK_FILES.some((f) => p.endsWith(f));
// Only the app's own code is stamped; the history is addressed plainly so it survives a deploy.
const stamped = (f) => (BUILD === 'dev' || f === './' || isBulk(f) ? f : f + '?v=' + BUILD);

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(SHELL_FILES.map(stamped))).then(() => self.skipWaiting()));
});

// A new build gets new cache names, so the old ones are dropped rather than accumulating.
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys
        // Drop other builds' copies of the app, and keep the history, whatever build saved it.
        .filter((k) => k.startsWith('bullpen-') && k !== SHELL && k !== BULK)
        .map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('message', (e) => {
  // "Save for offline": fetch the recorded history too, and say how it went.
  if (e.data && e.data.type === 'cache-bulk') {
    e.waitUntil(caches.open(BULK).then(async (c) => {
      let done = 0;
      for (const f of BULK_FILES) {
        try { await c.add(stamped(f)); done++; } catch (err) { /* reported below as a shortfall */ }
        for (const client of await self.clients.matchAll()) client.postMessage({ type: 'bulk-progress', done, total: BULK_FILES.length });
      }
      for (const client of await self.clients.matchAll()) client.postMessage({ type: 'bulk-done', done, total: BULK_FILES.length });
    }));
  }
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // Anything off this site is the network's business: a market provider above all, which must
  // never be answered from a cache.
  if (url.origin !== self.location.origin) return;

  /*
   * The app's own files are served from the cache first. They are stamped with the build, so a
   * new deploy asks for URLs that are not in the old cache and fetches them; nothing stale can
   * be served past a deploy.
   */
  const bulk = isBulk(url.pathname);
  e.respondWith(
    // The history is stored without the build on it, so it is matched without one too.
    caches.match(req, { ignoreSearch: bulk }).then((hit) => hit || fetch(req).then((res) => {
      if (res && res.ok && res.type === 'basic') {
        const copy = res.clone();
        caches.open(bulk ? BULK : SHELL).then((c) => c.put(bulk ? new Request(url.pathname) : req, copy));
      }
      return res;
    }).catch(() => caches.match(req, { ignoreSearch: true }))),
  );
});
