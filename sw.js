const CACHE_NAME = 'aruvi-shell-v2.4.72-ocr-csp-hash-fix';
const PADDLE_RUNTIME_CACHE = 'pocketwise-paddle-runtime-v243';
const PDF_RENDERER_URL = 'https://cdn.jsdelivr.net/npm/html2pdf.js@0.14.0/dist/html2pdf.bundle.min.js';
const IOS_PDF_RENDERER_URL = 'https://cdn.jsdelivr.net/npm/html3pdf@0.12.2/dist/html3pdf.bundle.min.js';
const BOOTSTRAP_ICONS_CSS_URL = 'https://cdn.jsdelivr.net/npm/bootstrap-icons@1.13.2/font/bootstrap-icons.min.css';
const BASE_URL = self.registration.scope;
const asset = path => new URL(path, BASE_URL).href;
const APP_SHELL = [
  BASE_URL,
  asset('index.html'),
  asset('theme-init.js'),
  asset('splash-animation.js'),
  asset('first-run-onboarding.js'),
  asset('styles.css'),
  asset('wasm/pocketwise-engine.js'),
  asset('wasm/financial-core-bootstrap.js'),
  asset('wasm/pocketwise-engine.wasm'),
  asset('reliability-store.js'),
  asset('system-orchestrator.js'),
  asset('finance-analytics.js'),
  asset('wasm/shared-costs-api.js'),
  asset('forecasting-core.js'),
  asset('forecasting-teacher.js'),
  asset('forecasting.js'),
  asset('forecasting-worker.js'),
  asset('receipt-media.js'),
  asset('app.js'),
  asset('paddleocr-pwa.js'),
  asset('paddleocr-sandbox.html'),
  asset('rupee-ocr.js'),
  asset('receipt-ocr-parser.js'),
  asset('statement-parser.js'),
  asset('statement-ai-guard.js'),
  asset('xlsx-reader.js'),
  asset('local-ai.js'),
  asset('local-ai-worker.js'),
  asset('local-ai-cache-recovery.js'),
  asset('statement-import.js'),
  asset('onboarding.js'),
  asset('pwa.js'),
  asset('viewport-guard.js'),
  asset('clipboard-import.js'),
  asset('manifest.webmanifest'),
  asset('share-target.html'),
  asset('assets/icons/icon.svg'),
  asset('assets/icons/icon-192.PNG'),
  asset('assets/icons/icon-512.PNG')
];
async function cacheRuntimeAsset(cache, url) {
  try {
    const request = new Request(url, { mode: 'cors', credentials: 'omit' });
    const cached = await cache.match(request);
    if (cached && cached.type !== 'opaque') return true;
    const response = await fetch(request);
    if (!response || !response.ok || response.type === 'opaque') return false;
    await cache.put(request, response.clone());

    // Bootstrap Icons loads its font from a relative URL in the stylesheet.
    // Cache those CORS-readable font files too, so the SVG fallbacks can be
    // replaced by the real glyphs after a successful first online load.
    const contentType = response.headers.get('content-type') || '';
    if (url === BOOTSTRAP_ICONS_CSS_URL && /text\/css/i.test(contentType)) {
      const css = await response.clone().text();
      const references = [...css.matchAll(/url\(\s*(['"]?)([^)'"]+)\1\s*\)/g)];
      await Promise.all(references.map(async match => {
        const source = String(match[2] || '').trim();
        if (!source || source.startsWith('data:')) return;
        const fontUrl = new URL(source, url);
        if (fontUrl.hostname !== 'cdn.jsdelivr.net' || !fontUrl.pathname.startsWith('/npm/')) return;
        await cacheRuntimeAsset(cache, fontUrl.href);
      }));
    }
    return true;
  } catch (_) {
    // This is a best-effort warm-up: a first install while offline must still work.
    return false;
  }
}

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME)
    .then(cache => cache.addAll(APP_SHELL.map(url => new Request(url, { cache: 'reload' }))))
    .then(async () => {
      const runtimeCache = await caches.open(PADDLE_RUNTIME_CACHE);
      await Promise.all([
        cacheRuntimeAsset(runtimeCache, PDF_RENDERER_URL),
        cacheRuntimeAsset(runtimeCache, IOS_PDF_RENDERER_URL),
        cacheRuntimeAsset(runtimeCache, BOOTSTRAP_ICONS_CSS_URL)
      ]);
      await self.skipWaiting();
    }));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(key => (key.startsWith('aruvi-shell-') || key.startsWith('pocketwise-shell-')) && key !== CACHE_NAME).map(key => caches.delete(key))))
    .then(() => self.clients.claim()));
});
const SHARE_INBOX_DB = 'PocketWiseShareInbox';
const SHARE_INBOX_STORE = 'shares';
const SHARE_TARGET_PATH = new URL('share-target.html', BASE_URL).pathname;
const SHARE_MAX_BYTES = 15 * 1024 * 1024;

function openShareInboxDb() {
  return new Promise((resolve, reject) => {
    let request;
    try { request = indexedDB.open(SHARE_INBOX_DB, 1); }
    catch (error) { reject(error); return; }
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(SHARE_INBOX_STORE)) {
        db.createObjectStore(SHARE_INBOX_STORE, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Could not open the local share inbox.'));
    request.onblocked = () => reject(new Error('The local share inbox is blocked by another tab.'));
  });
}

function makeShareId() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, value => value.toString(16).padStart(2, '0')).join('');
}

function inferSharedImageType(name) {
  const ext = String(name || '').toLowerCase().split('.').pop();
  return ({ jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', heic: 'image/heic', heif: 'image/heif' })[ext] || '';
}

async function storeSharedPayment(record) {
  const db = await openShareInboxDb();
  try {
    await new Promise((resolve, reject) => {
      let tx;
      try {
        tx = db.transaction(SHARE_INBOX_STORE, 'readwrite');
        tx.objectStore(SHARE_INBOX_STORE).put(record);
      } catch (error) { reject(error); return; }
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error || new Error('Could not save the shared image locally.'));
      tx.onabort = () => reject(tx.error || new Error('Saving the shared image was cancelled.'));
    });
  } finally { try { db.close(); } catch (_) {} }
}

async function receiveSharedPayment(request) {
  const id = makeShareId();
  let formData = null;
  let receiveError = '';
  try { formData = await request.formData(); }
  catch (_) { receiveError = 'invalid-share'; }

  const text = formData ? String(formData.get('text') || '').slice(0, 5000) : '';
  const title = formData ? String(formData.get('title') || '').slice(0, 240) : '';
  const sharedUrl = formData ? String(formData.get('url') || '').slice(0, 2000) : '';
  const candidates = formData ? [...formData.getAll('images'), ...formData.getAll('file')] : [];
  const file = candidates.find(value => value && typeof value.size === 'number' && typeof value.slice === 'function' && value.size > 0) || null;
  const record = {
    id,
    createdAt: Date.now(),
    title,
    text,
    url: sharedUrl,
    fileBlob: null,
    fileName: '',
    fileType: '',
    fileLastModified: 0,
    error: receiveError
  };

  if (!record.error && file) {
    const name = String(file.name || 'shared-payment-image').slice(0, 180);
    let type = String(file.type || '').toLowerCase();
    if (!type || type === 'application/octet-stream') type = inferSharedImageType(name);
    if (!type.startsWith('image/')) record.error = 'unsupported-file';
    else if (file.size > SHARE_MAX_BYTES) record.error = 'too-large';
    else {
      record.fileBlob = file.slice(0, file.size, type || 'application/octet-stream');
      record.fileName = name;
      record.fileType = type || 'application/octet-stream';
      record.fileLastModified = Number(file.lastModified) || Date.now();
    }
  } else if (!record.error) {
    record.error = 'missing-file';
  }

  try {
    await storeSharedPayment(record);
    const destination = new URL('./', BASE_URL);
    destination.searchParams.set('pwShare', id);
    return Response.redirect(destination.href, 303);
  } catch (error) {
    console.error('Aruvi could not store the incoming share locally.', error);
    const destination = new URL('./', BASE_URL);
    destination.searchParams.set('pwShareError', 'storage');
    return Response.redirect(destination.href, 303);
  }
}

self.addEventListener('fetch', event => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method === 'POST' && url.origin === self.location.origin && url.pathname === SHARE_TARGET_PATH) {
    event.respondWith(receiveSharedPayment(req));
    return;
  }
  if (req.method !== 'GET') return;
  // Cache approved jsDelivr runtime assets, including PaddleOCR.js, the PDF renderers (standard html2pdf and iOS page-wise html3pdf) and
  // Bootstrap Icons CSS/fonts. CORS-enabled requests are cacheable and reusable offline.
  // Receipt images are never sent to this cache or to a remote OCR endpoint.
  if (url.origin !== self.location.origin) {
    if (url.hostname === 'cdn.jsdelivr.net' && url.pathname.startsWith('/npm/')) {
      event.respondWith((async () => {
        const cache = await caches.open(PADDLE_RUNTIME_CACHE);
        const cached = await cache.match(req);
        if (cached) return cached;
        try {
          const response = await fetch(req);
          if (response && response.ok && response.type !== 'opaque') {
            try { await cache.put(req, response.clone()); } catch (_) { /* quota failures keep the network response usable */ }
          }
          return response;
        } catch (error) {
          const fallback = await cache.match(req);
          if (fallback) return fallback;
          throw error;
        }
      })());
    }
    return;
  }
  if (!url.pathname.startsWith(new URL(BASE_URL).pathname)) return;
  if (req.mode === 'navigate') {
    event.respondWith(fetch(req).then(res => {
      if (res && res.ok) caches.open(CACHE_NAME).then(cache => cache.put(asset('index.html'), res.clone()));
      return res;
    }).catch(() => caches.match(req).then(res => res || caches.match(asset('index.html')))));
    return;
  }
  event.respondWith(caches.match(req).then(cached => {
    if (cached) return cached;
    return fetch(req).then(res => {
      if (res && res.ok) caches.open(CACHE_NAME).then(cache => cache.put(req, res.clone()));
      return res;
    }).catch(() => {
      if (req.destination === 'image') return caches.match(asset('assets/icons/icon.svg'));
      return new Response('Offline', { status: 503, statusText: 'Offline' });
    });
  }));
});


// Push messages are delivered by a configured Web Push sender, including when the page is closed.
self.addEventListener('push', event => {
  let payload = {};
  try { payload = event.data ? event.data.json() : {}; }
  catch (_) { payload = { body: event.data ? event.data.text() : '' }; }
  const title = String(payload.title || 'Aruvi').slice(0, 100);
  const requestedUrl = new URL(String(payload.url || BASE_URL), BASE_URL);
  const scopeUrl = new URL(BASE_URL);
  const safeUrl = requestedUrl.origin === scopeUrl.origin && requestedUrl.pathname.startsWith(scopeUrl.pathname)
    ? requestedUrl.href : BASE_URL;
  const options = {
    body: String(payload.body || 'You have an update in Aruvi.').slice(0, 240),
    icon: asset('assets/icons/icon-192.PNG'),
    badge: asset('assets/icons/icon-192.PNG'),
    tag: String(payload.tag || 'pocketwise-push').slice(0, 100),
    renotify: Boolean(payload.renotify),
    data: { url: safeUrl }
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  let target = BASE_URL;
  try {
    const candidate = new URL(event.notification.data && event.notification.data.url || BASE_URL, BASE_URL);
    const scopeUrl = new URL(BASE_URL);
    if (candidate.origin === scopeUrl.origin && candidate.pathname.startsWith(scopeUrl.pathname)) target = candidate.href;
  } catch (_) { target = BASE_URL; }
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
    for (const client of clients) {
      const current = new URL(client.url);
      const scopeUrl = new URL(BASE_URL);
      if (current.origin === scopeUrl.origin && current.pathname.startsWith(scopeUrl.pathname) && 'focus' in client) return client.focus();
    }
    return self.clients.openWindow ? self.clients.openWindow(target) : undefined;
  }));
});
