/* Optional PocketWise background reminder sender. Deploy separately over HTTPS. */
'use strict';
const express = require('express');
const webpush = require('web-push');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const PORT = Number(process.env.PORT || 8787);
const APP_ORIGIN = process.env.APP_ORIGIN;
const APP_URL = process.env.APP_URL;
const DATA_FILE = process.env.DATA_FILE || path.join(__dirname, 'data.json');
const PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY;
const PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
const SUBJECT = process.env.VAPID_SUBJECT;
const MAX_INSTALLATIONS = 10000;
const MAX_SUBSCRIPTIONS_PER_INSTALLATION = 3;
const MAX_REMINDERS = 5000;
const MAX_JSON_BYTES = '2mb';
const MAX_ENDPOINT_LENGTH = 2048;
const ALLOWED_PUSH_HOSTS = new Set([
  'fcm.googleapis.com',
  'updates.push.services.mozilla.com',
  'push.services.mozilla.com',
  'web.push.apple.com'
]);

if (!APP_ORIGIN || !APP_URL || !PUBLIC_KEY || !PRIVATE_KEY || !SUBJECT) {
  throw new Error('Set APP_ORIGIN, APP_URL, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY and VAPID_SUBJECT before starting the push server.');
}
let appOriginUrl, appUrl;
try {
  appOriginUrl = new URL(APP_ORIGIN);
  appUrl = new URL(APP_URL);
} catch {
  throw new Error('APP_ORIGIN and APP_URL must be valid URLs.');
}
if (appOriginUrl.protocol !== 'https:' || appOriginUrl.origin !== APP_ORIGIN || appUrl.protocol !== 'https:' || appUrl.origin !== APP_ORIGIN || appUrl.username || appUrl.password) {
  throw new Error('APP_ORIGIN must be an HTTPS origin and APP_URL must be an HTTPS URL on that same origin.');
}
webpush.setVapidDetails(SUBJECT, PUBLIC_KEY, PRIVATE_KEY);

const app = express();
app.disable('x-powered-by');
app.disable('etag');

// Exact-origin CORS only. CORS is not authentication, so mutation routes also require
// the expected Origin header and each installation must present its random local token.
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && origin === APP_ORIGIN) {
    res.setHeader('Access-Control-Allow-Origin', APP_ORIGIN);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Max-Age', '600');
  }
  if (req.method === 'OPTIONS') return res.sendStatus(origin === APP_ORIGIN ? 204 : 403);
  if (origin && origin !== APP_ORIGIN) return res.sendStatus(403);
  next();
});
app.use(express.json({ limit: MAX_JSON_BYTES, strict: true, type: 'application/json' }));
app.use((req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  next();
});

// Lightweight in-process limits. Use edge/proxy limits too if more than one server
// instance is deployed, because each process has its own counters.
const rateBuckets = new Map();
function rateLimit({ windowMs, max, key }) {
  return (req, res, next) => {
    const ip = String(req.socket?.remoteAddress || req.ip || 'unknown').slice(0, 100);
    const id = `${key}:${ip}`;
    const now = Date.now();
    let bucket = rateBuckets.get(id);
    if (!bucket || now - bucket.start >= windowMs) bucket = { start: now, count: 0 };
    bucket.count += 1;
    rateBuckets.set(id, bucket);
    // Bound memory even during bursts from many source addresses without clearing every active counter.
    while (rateBuckets.size > 20000) rateBuckets.delete(rateBuckets.keys().next().value);
    res.setHeader('RateLimit-Limit', String(max));
    res.setHeader('RateLimit-Remaining', String(Math.max(0, max - bucket.count)));
    if (bucket.count > max) {
      res.setHeader('Retry-After', String(Math.max(1, Math.ceil((bucket.start + windowMs - now) / 1000))));
      return res.status(429).json({ error: 'Too many requests. Try again later.' });
    }
    next();
  };
}
const apiLimit = rateLimit({ windowMs: 60_000, max: 120, key: 'api' });
const subscribeLimit = rateLimit({ windowMs: 60 * 60_000, max: 10, key: 'subscribe' });
const reminderLimit = rateLimit({ windowMs: 60_000, max: 30, key: 'reminders' });
setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of rateBuckets) if (now - bucket.start > 2 * 60 * 60_000) rateBuckets.delete(key);
  while (rateBuckets.size > 20000) rateBuckets.delete(rateBuckets.keys().next().value);
}, 10 * 60_000).unref();

function readStore() {
  try {
    const value = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    return value && value.installations && typeof value.installations === 'object' && !Array.isArray(value.installations)
      ? value : { installations: {} };
  } catch (error) {
    if (error.code !== 'ENOENT') console.error('Could not read push data file:', error.message);
    return { installations: {} };
  }
}
let store = readStore();
function saveStore() {
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true, mode: 0o700 });
  const temporary = `${DATA_FILE}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(store), { mode: 0o600 });
  fs.chmodSync(temporary, 0o600);
  fs.renameSync(temporary, DATA_FILE);
  try { fs.chmodSync(DATA_FILE, 0o600); } catch (error) { console.error('Could not restrict push store permissions:', error.message); }
}
function isToken(value) { return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value); }
function getInstallation(token) { return isToken(token) ? store.installations[token] : null; }
function checkToken(req, res) {
  const token = req.body && req.body.installationToken;
  if (!isToken(token)) { res.status(400).json({ error: 'Invalid installation token.' }); return null; }
  return token;
}
function requireAppOrigin(req, res, next) {
  if (req.headers.origin !== APP_ORIGIN) return res.status(403).json({ error: 'Request origin is not allowed.' });
  next();
}
function decodeBase64Url(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]+$/.test(value)) return null;
  try { return Buffer.from(value, 'base64url'); } catch { return null; }
}
function isAllowedPushEndpoint(value) {
  if (typeof value !== 'string' || value.length > MAX_ENDPOINT_LENGTH) return false;
  let endpoint;
  try { endpoint = new URL(value); } catch { return false; }
  if (endpoint.protocol !== 'https:' || (endpoint.port && endpoint.port !== '443') || endpoint.username || endpoint.password || endpoint.hash) return false;
  const host = endpoint.hostname.toLowerCase().replace(/\.$/, '');
  return ALLOWED_PUSH_HOSTS.has(host) || host.endsWith('.notify.windows.com');
}
function isValidSubscription(subscription) {
  if (!subscription || typeof subscription !== 'object' || Array.isArray(subscription)) return false;
  if (!isAllowedPushEndpoint(subscription.endpoint)) return false;
  const keys = subscription.keys;
  if (!keys || typeof keys !== 'object' || Array.isArray(keys)) return false;
  const p256dh = decodeBase64Url(keys.p256dh);
  const auth = decodeBase64Url(keys.auth);
  return !!p256dh && p256dh.length === 65 && p256dh[0] === 4 && !!auth && auth.length === 16;
}
app.get('/health', apiLimit, (_req, res) => res.json({ ok: true, service: 'pocketwise-push' }));
app.get('/api/push/public-key', apiLimit, (_req, res) => res.json({ publicKey: PUBLIC_KEY }));
app.post('/api/push/subscribe', apiLimit, subscribeLimit, requireAppOrigin, (req, res) => {
  const token = checkToken(req, res); if (!token) return;
  const sub = req.body && req.body.subscription;
  if (!isValidSubscription(sub)) return res.status(400).json({ error: 'Invalid Web Push subscription.' });
  let installation = store.installations[token];
  if (!installation) {
    if (Object.keys(store.installations).length >= MAX_INSTALLATIONS) return res.status(503).json({ error: 'Push service installation capacity has been reached.' });
    installation = { subscriptions: {}, reminders: [], sent: {} };
  }
  installation.subscriptions = installation.subscriptions && typeof installation.subscriptions === 'object' ? installation.subscriptions : {};
  if (!Object.prototype.hasOwnProperty.call(installation.subscriptions, sub.endpoint) && Object.keys(installation.subscriptions).length >= MAX_SUBSCRIPTIONS_PER_INSTALLATION) {
    return res.status(429).json({ error: 'This installation has reached its device subscription limit.' });
  }
  // Persist only the Web Push fields needed by the sender, not arbitrary caller-supplied fields.
  installation.subscriptions[sub.endpoint] = { endpoint: sub.endpoint, keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth } };
  store.installations[token] = installation;
  saveStore();
  return res.status(201).json({ ok: true });
});
app.post('/api/push/reminders', apiLimit, reminderLimit, requireAppOrigin, (req, res) => {
  const token = checkToken(req, res); if (!token) return;
  const installation = getInstallation(token);
  if (!installation || !Object.keys(installation.subscriptions || {}).length) return res.status(409).json({ error: 'Subscribe this device before syncing reminders.' });
  if (!Array.isArray(req.body && req.body.reminders) || req.body.reminders.length > MAX_REMINDERS) return res.status(400).json({ error: `Reminder schedule must be an array of at most ${MAX_REMINDERS} entries.` });
  const now = Date.now();
  const seen = new Set();
  const reminders = [];
  for (const item of req.body.reminders) {
    if (!item || typeof item.id !== 'string' || !/^[a-zA-Z0-9:_-]{1,180}$/.test(item.id)) continue;
    // Reminder names stay on the user's device. The server stores only an opaque ID and time.
    const scheduled = Date.parse(item.scheduledAt);
    if (!Number.isFinite(scheduled) || scheduled > now + 367 * 86400000) continue;
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    if (installation.sent && installation.sent[item.id]) continue;
    reminders.push({ id: item.id, scheduledAt: new Date(Math.max(now, scheduled)).toISOString() });
  }
  installation.reminders = reminders;
  installation.sent = installation.sent || {};
  saveStore();
  return res.json({ ok: true, scheduled: reminders.length });
});

let deliveryRunning = false;
async function deliverDueReminders() {
  if (deliveryRunning) return;
  deliveryRunning = true;
  try {
    const now = Date.now();
    let changed = false;
    for (const [token, installation] of Object.entries(store.installations)) {
      installation.sent = installation.sent || {};
      for (const [id, sentAt] of Object.entries(installation.sent)) if (now - Number(sentAt) > 30 * 86400000) delete installation.sent[id];
      const scheduled = Array.isArray(installation.reminders) ? installation.reminders : [];
      const due = scheduled.filter(item => Date.parse(item.scheduledAt) <= now);
      if (!due.length) continue;
      if (!Object.keys(installation.subscriptions || {}).length) {
        installation.reminders = [];
        changed = true;
        continue;
      }
      const pending = scheduled.filter(item => Date.parse(item.scheduledAt) > now);
      for (const reminder of due) {
        if (installation.sent[reminder.id]) continue;
        const payload = JSON.stringify({
          title: 'PocketWise payment reminder',
          body: 'A saved reminder is due. Open PocketWise to view details.',
          tag: `pocketwise-${crypto.createHash('sha256').update(reminder.id).digest('hex').slice(0, 24)}`,
          url: APP_URL
        });
        let delivered = false;
        let retryableFailure = false;
        for (const [endpoint, subscription] of Object.entries(installation.subscriptions || {})) {
          try {
            await webpush.sendNotification(subscription, payload, { TTL: 3600 });
            delivered = true;
          } catch (error) {
            const code = Number(error.statusCode || error.status);
            if (code === 404 || code === 410) delete installation.subscriptions[endpoint];
            else { retryableFailure = true; console.error('Web Push delivery failed:', code || error.message); }
          }
        }
        if (delivered) {
          installation.sent[reminder.id] = now;
          changed = true;
        } else if (retryableFailure && Object.keys(installation.subscriptions || {}).length) {
          pending.push({ ...reminder, scheduledAt: new Date(now + 5 * 60000).toISOString() });
          changed = true;
        }
      }
      installation.reminders = pending.filter(item => !installation.sent[item.id]);
      if (!Object.keys(installation.subscriptions || {}).length) installation.reminders = [];
    }
    if (changed) saveStore();
  } finally {
    deliveryRunning = false;
  }
}
setInterval(() => { deliverDueReminders().catch(error => console.error('Reminder delivery loop failed:', error)); }, 15000).unref();

app.use((error, _req, res, _next) => {
  if (error && (error.type === 'entity.too.large' || error.status === 413)) return res.status(413).json({ error: 'Request body is too large.' });
  if (error && error.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON request body.' });
  console.error('Push API request failed:', error && error.message || 'unknown error');
  return res.status(500).json({ error: 'The push service could not complete the request.' });
});
app.listen(PORT, () => console.log(`PocketWise push server listening on ${PORT}`));
