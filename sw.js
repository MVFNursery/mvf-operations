// Species Trainer — Service Worker
// Scope: /mvf-operations/

const CACHE_NAME = 'species-trainer-v2';
const BASE = '/mvf-operations';

const APP_SHELL = [
  `${BASE}/mvf_trainer_v2.html`,
  `${BASE}/manifest.json`,
  `${BASE}/icon.svg`,
  'https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,500;0,700;1,400&family=Crimson+Pro:ital,wght@0,400;0,600;1,400&display=swap',
];

// ── INSTALL ──────────────────────────────────────────────────────────
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
      .catch(err => console.log('[sw] install cache failed:', err))
  );
});

// ── ACTIVATE ─────────────────────────────────────────────────────────
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

  // Anthropic API — network only
  if (url.hostname === 'api.anthropic.com') {
    e.respondWith(fetch(e.request));
    return;
  }

  // Photo / external APIs — network only, silent fail
  if (
    url.hostname.includes('inaturalist') ||
    url.hostname.includes('wikipedia') ||
    url.hostname.includes('wikimedia') ||
    url.hostname.includes('plants.usda.gov')
  ) {
    e.respondWith(
      fetch(e.request).catch(() => new Response('', { status: 503 }))
    );
    return;
  }

  // Google Fonts — cache first
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

  // App shell — network first, cache fallback
  e.respondWith(
    Promise.race([
      fetch(e.request).then(resp => {
        if (resp.ok) {
          const clone = resp.clone();
          caches.open(CACHE_NAME).then(c => c.put(e.request, clone));
        }
        return resp;
      }),
      new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 3000))
    ]).catch(() =>
      caches.match(e.request).then(cached => {
        if (cached) return cached;
        if (e.request.headers.get('accept')?.includes('text/html')) {
          return caches.match(`${BASE}/mvf_trainer_v2.html`);
        }
        return new Response('', { status: 503 });
      })
    )
  );
});
