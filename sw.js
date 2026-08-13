// MVFN app suite — Service Worker
// Scope: /mvf-operations/
//
// IMPORTANT: only mvf_trainer_v3.html registers this worker, but the scope is
// the whole GitHub Pages path, so once installed it controls EVERY app here —
// household, inventory, field, driving, potting, close, all of them. Anything
// this file does casually, it does to all of them.

const CACHE_NAME = 'mvfn-shell-v5';
const BASE = '/mvf-operations';

const APP_SHELL = [
  `${BASE}/mvf_trainer_v3.html`,
  `${BASE}/manifest.json`,
  `${BASE}/icon.svg`,
  'https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,500;0,700;1,400&family=Crimson+Pro:ital,wght@0,400;0,600;1,400&display=swap',
];

// ── INSTALL ──────────────────────────────────────────────────────────
self.addEventListener('install', e => {
  // Unconditional, and NOT chained off addAll: precaching one 404 URL used to
  // mean skipWaiting() never ran, which strands the new worker in "waiting"
  // behind the old one forever. A broken shell list must not make this file
  // un-updatable.
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_SHELL))
      .catch(err => console.log('[sw] install cache failed:', err))
  );
});

// ── ACTIVATE ─────────────────────────────────────────────────────────
// Bumping CACHE_NAME above is what evicts a poisoned cache: every key that
// isn't the current one is deleted here.
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

// ── FETCH ─────────────────────────────────────────────────────────────
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // Writes are never ours to answer.
  if (e.request.method !== 'GET') return;

  // Google Fonts — cache first. Static, versioned, safe to keep.
  if (url.hostname.includes('fonts.googleapis.com') || url.hostname.includes('fonts.gstatic.com')) {
    e.respondWith(
      caches.match(e.request).then(cached => {
        if (cached) return cached;
        return fetch(e.request).then(resp => {
          const clone = resp.clone();
          caches.open(CACHE_NAME).then(c => c.put(e.request, clone));
          return resp;
        }).catch(() => new Response('', { status: 503 }));
      })
    );
    return;
  }

  // EVERY OTHER CROSS-ORIGIN REQUEST: hands off. No respondWith, so the browser
  // handles it normally and each app's own cache directives are honoured.
  //
  // This is the bug that hid household task 173 (2026-08-12). The old catch-all
  // branch cached n8n webhook responses -- live task and inventory JSON -- into
  // Cache Storage, then raced the network against a 3s timeout and served the
  // cached copy whenever the network lost. On megamachine the tailnet URL does
  // not resolve to itself, so the API call always hung, the 3s fallback always
  // won, and Firefox rendered a task list frozen at whenever the fetch last
  // succeeded. No error, no banner, just quietly old data. A page-level
  // cache:'no-store' cannot save you from this: Cache Storage is a separate
  // store the worker reads directly, before the HTTP cache is ever consulted.
  if (url.origin !== self.location.origin) return;

  // Same-origin app shell — network first, cache fallback only on a REAL
  // network failure. Deliberately no timeout race: offline fails fast and hits
  // the cache, while a slow-but-alive network waits for the true answer instead
  // of silently serving an old page. Racing the two is how edits to the
  // inventory app stopped reaching this browser.
  e.respondWith(
    fetch(e.request).then(resp => {
      if (resp.ok) {
        const clone = resp.clone();
        caches.open(CACHE_NAME).then(c => c.put(e.request, clone));
      }
      return resp;
    }).catch(() =>
      caches.match(e.request).then(cached => {
        if (cached) return cached;
        // Only the trainer gets the trainer shell as a fallback. Handing it to
        // a household or inventory navigation would render the wrong app.
        if (url.pathname === `${BASE}/mvf_trainer_v3.html`) {
          return caches.match(`${BASE}/mvf_trainer_v3.html`);
        }
        return new Response('', { status: 503 });
      })
    )
  );
});
