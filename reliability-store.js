/* Local provider-health persistence. No OCR text, images, amounts, or transaction data are stored here. */
(function (root) {
  'use strict';

  const DB_NAME = 'pocketwise-system-health';
  const DB_VERSION = 3;
  const STORE_NAME = 'provider-health';
  const PENDING_STORE = 'pending-attempts';
  const STORAGE_KEY = 'pocketwise-provider-health-v1';
  const PENDING_STORAGE_KEY = 'pocketwise-provider-pending-v1';
  const MAX_AGE_MS = 90 * 24 * 60 * 60 * 1000;
  /* Mobile browsers throttle background timers. A missed lease gets a grace window
     before it is treated as a crash; the hard provider deadline is always decisive. */
  const LEASE_CRASH_GRACE_MS = 2 * 60 * 1000;
  const memory = new Map();
  let databasePromise = null;

  function platformFamily() {
    const nav = root.navigator || {};
    const ua = String(nav.userAgent || '');
    const platform = String(nav.userAgentData && nav.userAgentData.platform || nav.platform || '');
    if (/Android/i.test(ua) || /Android/i.test(platform)) return 'android';
    if (/iPhone|iPad|iPod/i.test(ua) || (/Mac/i.test(platform) && Number(nav.maxTouchPoints || 0) > 1)) return 'ios';
    if (/Windows/i.test(platform) || /Windows/i.test(ua)) return 'windows';
    if (/Mac/i.test(platform) || /Macintosh/i.test(ua)) return 'macos';
    if (/Linux/i.test(platform) || /Linux/i.test(ua)) return 'linux';
    return 'other';
  }

  function browserFamily() {
    const ua = String((root.navigator && root.navigator.userAgent) || '');
    if (/Edg\//i.test(ua)) return 'edge';
    if (/Firefox\//i.test(ua)) return 'firefox';
    if (/CriOS\//i.test(ua)) return 'chrome-ios';
    if (/FxiOS\//i.test(ua)) return 'firefox-ios';
    if (/Chrome\//i.test(ua) && !/Edg\//i.test(ua)) return 'chromium';
    if (/Safari\//i.test(ua)) return 'safari';
    return 'other';
  }

  function capabilityKey() {
    const nav = root.navigator || {};
    const capabilities = [
      typeof root.WebAssembly === 'object' ? 'wasm' : 'no-wasm',
      nav.gpu ? 'webgpu' : 'no-webgpu',
      typeof root.Worker === 'function' ? 'worker' : 'no-worker',
      typeof root.OffscreenCanvas === 'function' ? 'offscreen' : 'no-offscreen',
      root.PocketWiseNativeOCR && typeof root.PocketWiseNativeOCR.recognize === 'function' ? 'native-ocr' : 'no-native-ocr'
    ].join('.');
    /* Deliberately coarse: no exact UA, device model, hardware counts, IP, or fingerprinting entropy. */
    return ['2.4.24', platformFamily(), browserFamily(), capabilities].join('|');
  }

  function keyFor(capability, providerId, profile) {
    return [profile || capabilityKey(), String(capability || 'general'), String(providerId)].join('::');
  }

  function openDatabase() {
    if (!root.indexedDB) return Promise.resolve(null);
    if (databasePromise) return databasePromise;
    databasePromise = new Promise(resolve => {
      let request;
      try { request = root.indexedDB.open(DB_NAME, DB_VERSION); }
      catch (_) { resolve(null); return; }
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME, { keyPath: 'key' });
      if (!db.objectStoreNames.contains(PENDING_STORE)) db.createObjectStore(PENDING_STORE, { keyPath: 'id' });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
      request.onblocked = () => resolve(null);
    }).catch(() => null);
    return databasePromise;
  }

  function requestValue(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('IndexedDB request failed.'));
    });
  }

  function readLocalFallback() {
    try {
      const raw = root.localStorage && root.localStorage.getItem(STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (_) { return {}; }
  }

  function writeLocalFallback(record) {
    try {
      const all = readLocalFallback();
      all[record.key] = record;
      const now = Date.now();
      Object.keys(all).forEach(key => { if (!all[key] || now - Number(all[key].updatedAt || 0) > MAX_AGE_MS) delete all[key]; });
      const keys = Object.keys(all);
      if (keys.length > 128) keys.sort((a, b) => Number(all[b].updatedAt || 0) - Number(all[a].updatedAt || 0)).slice(128).forEach(key => delete all[key]);
      if (root.localStorage) root.localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
    } catch (_) { /* In-memory operation remains available for this session. */ }
  }

  async function readCapability(capability, profile) {
    const prefix = [profile || capabilityKey(), String(capability || 'general')].join('::') + '::';
    const now = Date.now();
    const db = await openDatabase();
    let records = [];
    if (db) {
      try {
        const tx = db.transaction(STORE_NAME, 'readonly');
        records = await requestValue(tx.objectStore(STORE_NAME).getAll());
      } catch (_) { records = []; }
    }
    const fallbackRecords = Object.values(readLocalFallback());
    const byKey = new Map();
    // IndexedDB is authoritative when it is available; the localStorage copy is only a fallback.
    fallbackRecords.concat(records || []).forEach(record => { if (record && typeof record.key === 'string') byKey.set(record.key, record); });
    records = Array.from(byKey.values());
    const output = {};
    for (const record of records) {
      if (!record || typeof record.key !== 'string' || !record.key.startsWith(prefix)) continue;
      if (now - Number(record.updatedAt || 0) > MAX_AGE_MS) continue;
      output[String(record.providerId)] = Object.assign({}, record.health || {});
      memory.set(record.key, record);
    }
    for (const record of memory.values()) {
      if (record.key.startsWith(prefix) && now - Number(record.updatedAt || 0) <= MAX_AGE_MS) {
        output[String(record.providerId)] = Object.assign({}, record.health || {});
      }
    }
    return output;
  }

  async function writeHealth(capability, providerId, health, profile) {
    const key = keyFor(capability, providerId, profile);
    const record = {
      key,
      capability: String(capability || 'general'),
      providerId: Number(providerId),
      health: {
        consecutiveFailures: Number(health.consecutiveFailures) || 0,
        successCount: Number(health.successCount) || 0,
        failureCount: Number(health.failureCount) || 0,
        averageLatencyMs: Number(health.averageLatencyMs) || 0,
        lastOutcome: Number(health.lastOutcome) || 0,
        circuitState: Number(health.circuitState) || 0,
        cooldownUntilMs: Number(health.cooldownUntilMs) || 0,
        fallbackProviderId: Number.isInteger(health.fallbackProviderId) ? health.fallbackProviderId : null,
        fallbackSuccessCount: Math.max(0, Number(health.fallbackSuccessCount) || 0),
        lastFallbackAt: Math.max(0, Number(health.lastFallbackAt) || 0)
      },
      updatedAt: Date.now()
    };
    memory.set(key, record);
    const db = await openDatabase();
    if (db) {
      try {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).put(record);
        await new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error); });
        return true;
      } catch (_) { /* fall through to the non-sensitive localStorage record */ }
    }
    writeLocalFallback(record);
    return !!root.localStorage;
  }



  async function recordFallback(capability, failedProviderId, fallbackProviderId, profile) {
    if (!Number.isInteger(failedProviderId) || !Number.isInteger(fallbackProviderId) || failedProviderId === fallbackProviderId) return false;
    const healthById = await readCapability(capability, profile);
    const current = Object.assign({}, healthById[String(failedProviderId)] || {});
    current.fallbackProviderId = fallbackProviderId;
    current.fallbackSuccessCount = Math.min(0xFFFFFFFF, (Number(current.fallbackSuccessCount) || 0) + 1);
    current.lastFallbackAt = Date.now();
    return writeHealth(capability, failedProviderId, current, profile);
  }

  function readPendingFallback() {
    try {
      const raw = root.localStorage && root.localStorage.getItem(PENDING_STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (_) { return {}; }
  }

  function writePendingFallback(all) {
    try { root.localStorage && root.localStorage.setItem(PENDING_STORAGE_KEY, JSON.stringify(all)); }
    catch (_) { /* Crash recovery remains best-effort when storage is blocked or full. */ }
  }

  async function beginAttempt(attempt) {
    if (!attempt || typeof attempt.id !== 'string' || !attempt.id || typeof attempt.capability !== 'string' ||
        !Number.isInteger(attempt.providerId) || !Number.isFinite(attempt.startedAt) || !Number.isFinite(attempt.expiresAt)) return false;
    const record = {
      id: attempt.id.slice(0, 180),
      profile: String(attempt.profile || capabilityKey()).slice(0, 180),
      capability: attempt.capability.slice(0, 80),
      providerId: attempt.providerId,
      startedAt: Math.max(0, Math.trunc(attempt.startedAt)),
      expiresAt: Math.max(0, Math.trunc(attempt.expiresAt)),
      leaseUntil: Math.max(0, Math.trunc(Number(attempt.leaseUntil) || attempt.expiresAt)),
      ownerSession: String(attempt.ownerSession || '').slice(0, 100)
    };
    const db = await openDatabase();
    if (db) {
      try {
        const tx = db.transaction(PENDING_STORE, 'readwrite');
        tx.objectStore(PENDING_STORE).put(record);
        await new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error); });
        return true;
      } catch (_) { /* use the small metadata-only local fallback */ }
    }
    const all = readPendingFallback();
    all[record.id] = record;
    const entries = Object.values(all).sort((a, b) => Number(b.startedAt || 0) - Number(a.startedAt || 0)).slice(0, 64);
    writePendingFallback(Object.fromEntries(entries.map(item => [item.id, item])));
    return !!root.localStorage;
  }

  async function renewAttempt(id, leaseUntil, ownerSession) {
    const key = String(id || '');
    const nextLease = Math.max(0, Math.trunc(Number(leaseUntil) || 0));
    if (!key || !nextLease) return false;
    let found = false;
    const all = readPendingFallback();
    if (all[key]) {
      if (ownerSession && all[key].ownerSession && all[key].ownerSession !== ownerSession) return false;
      all[key].leaseUntil = nextLease;
      writePendingFallback(all);
      found = true;
    }
    const db = await openDatabase();
    if (db) {
      try {
        const tx = db.transaction(PENDING_STORE, 'readwrite');
        const store = tx.objectStore(PENDING_STORE);
        const current = await requestValue(store.get(key));
        if (current) {
          if (ownerSession && current.ownerSession && current.ownerSession !== ownerSession) {
            tx.abort();
            return false;
          }
          current.leaseUntil = nextLease;
          store.put(current);
          await new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error); });
          found = true;
        }
      } catch (_) { /* the local fallback remains best-effort */ }
    }
    return found;
  }

  async function finishAttempt(id) {
    const key = String(id || '');
    if (!key) return false;
    const all = readPendingFallback();
    delete all[key];
    writePendingFallback(all);
    const db = await openDatabase();
    if (db) {
      try {
        const tx = db.transaction(PENDING_STORE, 'readwrite');
        tx.objectStore(PENDING_STORE).delete(key);
        await new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error); });
        return true;
      } catch (_) { /* local fallback was already cleared */ }
    }
    return true;
  }

  async function listExpiredAttempts(profile, nowMs) {
    const targetProfile = String(profile || capabilityKey());
    const now = Number.isFinite(nowMs) ? nowMs : Date.now();
    const db = await openDatabase();
    let records = [];
    if (db) {
      try {
        const tx = db.transaction(PENDING_STORE, 'readonly');
        records = await requestValue(tx.objectStore(PENDING_STORE).getAll());
      } catch (_) { records = []; }
    }
    const byId = new Map();
    // Prefer the latest IndexedDB lease over a possibly stale fallback copy.
    Object.values(readPendingFallback()).concat(records || []).forEach(record => {
      if (record && typeof record.id === 'string') byId.set(record.id, record);
    });
    return Array.from(byId.values()).filter(record => {
      if (record.profile !== targetProfile || now - Number(record.startedAt || 0) > MAX_AGE_MS) return false;
      const leaseUntil = Number(record.leaseUntil);
      const expiresAt = Number(record.expiresAt);
      const leaseExpired = Number.isFinite(leaseUntil) && leaseUntil > 0 && leaseUntil + LEASE_CRASH_GRACE_MS <= now;
      const hardExpired = Number.isFinite(expiresAt) && expiresAt > 0 && expiresAt <= now;
      return leaseExpired || hardExpired;
    });
  }

  async function clear(capability) {
    const target = capability == null ? null : String(capability);
    for (const [key, record] of memory.entries()) if (!target || record.capability === target) memory.delete(key);
    const db = await openDatabase();
    if (db) {
      try {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const records = await requestValue(store.getAll());
        (records || []).forEach(record => { if (!target || record.capability === target) store.delete(record.key); });
      } catch (_) { /* best effort */ }
    }
    const all = readLocalFallback();
    Object.keys(all).forEach(key => { if (!target || all[key].capability === target) delete all[key]; });
    try { root.localStorage && root.localStorage.setItem(STORAGE_KEY, JSON.stringify(all)); } catch (_) {}
    const pending = readPendingFallback();
    Object.keys(pending).forEach(key => { if (!target || pending[key].capability === target) delete pending[key]; });
    writePendingFallback(pending);
    const pendingDb = await openDatabase();
    if (pendingDb) {
      try {
        const tx = pendingDb.transaction(PENDING_STORE, 'readwrite');
        const store = tx.objectStore(PENDING_STORE);
        const records = await requestValue(store.getAll());
        (records || []).forEach(record => { if (!target || record.capability === target) store.delete(record.id); });
      } catch (_) { /* best effort */ }
    }
  }

  root.PocketWiseReliabilityStore = Object.freeze({ capabilityKey, readCapability, writeHealth, recordFallback, beginAttempt, renewAttempt, finishAttempt, listExpiredAttempts, clear });
})(typeof window !== 'undefined' ? window : globalThis);
