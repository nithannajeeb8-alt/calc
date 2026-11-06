/* Aruvi PWA registration and optional Web Push client.
 * A server is required for notifications while Aruvi is closed.
 */
(() => {
  const status = window.pocketwisePwaStatus = { supported: 'serviceWorker' in navigator, registered: false, error: null };
  const PUSH_CONFIG = {
    publicKey: '', // Public VAPID key only. Generate it on your push server.
    apiBaseUrl: '' // HTTPS push API base URL, e.g. https://push-api.example.com
  };
  const TOKEN_KEY = 'pocketwise-push-installation-v1';
  const base64UrlToBytes = value => {
    const padding = '='.repeat((4 - value.length % 4) % 4);
    const raw = atob((value + padding).replace(/-/g, '+').replace(/_/g, '/'));
    return Uint8Array.from(raw, char => char.charCodeAt(0));
  };
  const endpoint = path => new URL(path, PUSH_CONFIG.apiBaseUrl.endsWith('/') ? PUSH_CONFIG.apiBaseUrl : `${PUSH_CONFIG.apiBaseUrl}/`).href;
  const installationToken = () => {
    let token = localStorage.getItem(TOKEN_KEY);
    if (!token) {
      const bytes = new Uint8Array(32);
      crypto.getRandomValues(bytes);
      token = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
      localStorage.setItem(TOKEN_KEY, token);
    }
    return token;
  };
  const localDate = date => `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
  const addOccurrence = (dateString, repeat, anchorDay) => {
    const date = new Date(`${dateString}T12:00:00`);
    if (repeat === 'weekly') date.setDate(date.getDate() + 7);
    else if (repeat === 'monthly') {
      const day = Math.max(1, Number(anchorDay) || date.getDate());
      date.setDate(1); date.setMonth(date.getMonth() + 1);
      date.setDate(Math.min(day, new Date(date.getFullYear(), date.getMonth()+1, 0).getDate()));
    } else if (repeat === 'yearly' || repeat === 'year') {
      const month = date.getMonth(), day = date.getDate();
      date.setFullYear(date.getFullYear() + 1);
      if (date.getMonth() !== month) date.setDate(0);
      if (day < date.getDate() && date.getMonth() === month) date.setDate(day);
    }
    return localDate(date);
  };
  const buildScheduledEvents = reminders => {
    const start = new Date();
    const cutoff = new Date(start); cutoff.setFullYear(cutoff.getFullYear() + 1);
    const events = [];
    for (const reminder of (Array.isArray(reminders) ? reminders : [])) {
      if (!reminder || !reminder.active || !reminder.date || !reminder.id) continue;
      const repeat = ['weekly','monthly','yearly','year'].includes(reminder.repeat) ? (reminder.repeat === 'year' ? 'yearly' : reminder.repeat) : 'once';
      const anchorDay = Number(reminder.anchorDay) || Number(String(reminder.date).slice(-2)) || 1;
      let date = String(reminder.date), guard = 0;
      while (guard++ < 400) {
        const due = new Date(`${date}T09:00:00`); // User-friendly default: 9:00 AM device-local time.
        if (due > cutoff) break;
        if (due >= new Date(start.getFullYear(), start.getMonth(), start.getDate())) {
          // If today's 9 AM passed before sync, deliver once shortly after sync.
          const scheduledAt = due <= start ? new Date(start.getTime() + 60000) : due;
          // Do not send reminder names or other user-entered details to the push server.
          events.push({ id: `${reminder.id}:${date}`, scheduledAt: scheduledAt.toISOString() });
        }
        if (repeat === 'once') break;
        date = addOccurrence(date, repeat, anchorDay);
        if (!date) break;
      }
      if (events.length > 5000) break;
    }
    return events.slice(0, 5000);
  };
  window.PocketWisePush = {
    isConfigured: () => Boolean(PUSH_CONFIG.publicKey && PUSH_CONFIG.apiBaseUrl),
    hasInstallation: () => Boolean(localStorage.getItem(TOKEN_KEY)),
    async subscribe() {
      if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return { ok: false, reason: 'unsupported' };
      if (!PUSH_CONFIG.publicKey || !PUSH_CONFIG.apiBaseUrl) return { ok: false, reason: 'server-not-configured' };
      const permission = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
      if (permission !== 'granted') return { ok: false, reason: 'permission-denied' };
      const registration = await navigator.serviceWorker.ready;
      let subscription = await registration.pushManager.getSubscription();
      if (!subscription) subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64UrlToBytes(PUSH_CONFIG.publicKey) });
      const token = installationToken();
      const response = await fetch(endpoint('api/push/subscribe'), {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'omit',
        body: JSON.stringify({ installationToken: token, subscription: subscription.toJSON() })
      });
      if (!response.ok) throw new Error(`Push subscription endpoint returned HTTP ${response.status}`);
      return { ok: true };
    },
    async syncReminders(reminders) {
      if (!this.isConfigured() || !this.hasInstallation()) return { ok: false, reason: 'not-enabled' };
      const response = await fetch(endpoint('api/push/reminders'), {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'omit',
        body: JSON.stringify({ installationToken: installationToken(), reminders: buildScheduledEvents(reminders) })
      });
      if (!response.ok) throw new Error(`Background reminder sync failed (HTTP ${response.status})`);
      return { ok: true };
    }
  };
  if (!status.supported || !/^https?:$/.test(location.protocol)) return;
  const script = document.currentScript;
  const base = new URL('./', script && script.src ? script.src : location.href);
  const worker = new URL('sw.js', base);
  navigator.serviceWorker.register(worker.href, { scope: base.pathname })
    .then(reg => { status.registered = true; status.scope = reg.scope; console.info('Aruvi service worker ready:', reg.scope); })
    .catch(error => { status.error = String(error && error.message || error); console.error('Aruvi service worker registration failed:', error); });
  window.addEventListener('beforeinstallprompt', event => { window.dispatchEvent(new CustomEvent('pocketwise:install-available', { detail: event })); });
})();
