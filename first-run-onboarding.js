/* Aruvi 2.4.33 — first-install profile and privacy flow.
   No account, email, password or bank credentials are collected. Persistence is
   delegated to the application so the onboarding never writes financial storage. */
(function attachPocketWiseFirstRun(root) {
  'use strict';

  const TOUR_KEY = 'pocketwise-onboarding-complete-v1';
  const colors = [
    { id: 'mint', label: 'Mint', hex: '#2f8f67' },
    { id: 'ocean', label: 'Ocean', hex: '#3478c8' },
    { id: 'plum', label: 'Plum', hex: '#8756b5' },
    { id: 'sunset', label: 'Sunset', hex: '#d46b43' }
  ];

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[char]);
  }

  function privacyMarkup() {
    return `
      <h3>What Aruvi stores</h3>
      <p>Your display name, avatar colour, appearance preferences, transactions, accounts, budgets, debts, reminders, goals, event plans and import rules are stored in this browser on this device using local browser storage such as IndexedDB and localStorage.</p>
      <ul>
        <li>Aruvi does not require an account, email address, phone number or password.</li>
        <li>This app does not provide cloud sync. Your records remain in the browser profile where you created them.</li>
        <li>The app does not intentionally send transaction records to a Aruvi application server.</li>
      </ul>

      <h3>Imports and processing</h3>
      <p>Payment screenshots, pasted bank SMS messages, receipts and bank statements are processed in the app using its local parsing, categorisation and OCR tools. The financial calculations and merchant matching run in the local application, including its WebAssembly engine. Review imported details before saving them.</p>
      <p>Optional OCR or local AI model files may be downloaded when you choose to use or prepare those features. Those downloads are software/model assets; they are not an upload of your transaction history.</p>

      <h3>Network requests and third-party services</h3>
      <p>Aruvi may request fonts, icons, tutorial images and optional PDF, OCR or model assets from providers such as Google Fonts, jsDelivr, Unsplash and model-hosting services. Those providers can receive normal connection information such as your IP address, browser and request metadata. Aruvi does not include your transaction records in those asset requests.</p>
      <p>If a deployment separately configures a push-notification service, its provider may receive the subscription and notification data needed to deliver alerts. Background push delivery is not cloud synchronisation of your financial records.</p>

      <h3>Your device and your responsibility</h3>
      <ul>
        <li>Anyone with access to your unlocked device and browser profile may be able to open the app and view its locally stored records.</li>
        <li>Browser storage is not a substitute for encrypted storage or a secure backup. Use your device lock and keep exported backups somewhere private.</li>
        <li>Clearing website data, uninstalling/resetting the browser, private-browsing limits or device failure may remove local records.</li>
        <li>Export a full backup from Settings regularly. A backup contains sensitive financial information and should be protected.</li>
        <li>Notifications may appear on your lock screen depending on your device settings.</li>
      </ul>

      <h3>Your controls</h3>
      <p>You can export and restore a full backup, export CSV files, manage categories and merchant rules, change appearance preferences, and clear local records from Settings. Clearing records is destructive, so export a backup first.</p>

      <h3>Scope of this notice</h3>
      <p>This notice describes the current local-first Aruvi application. Browser vendors, operating systems and third-party providers have their own privacy practices. This notice is not a guarantee about device security, third-party services or data recovery.</p>
    `;
  }

  root.PocketwisePrivacyPolicy = Object.freeze({ markup: privacyMarkup });

  let overlay = null;
  let settings = null;
  let profileDraft = { name: '', color: 'mint' };
  let active = false;
  let busy = false;
  let previousBodyOverflow = '';

  function setStatusBarForSetup(enabled) {
    const themeMeta = document.querySelector('meta[name="theme-color"]');
    const statusMeta = document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]');
    if (enabled) {
      if (themeMeta) themeMeta.content = '#000000';
      if (statusMeta) statusMeta.content = 'black';
    }
  }

  function lockApp(locked) {
    const targets = [
      document.querySelector('.app-shell'),
      document.querySelector('.mobile-tabbar'),
      document.querySelector('.toast-region'),
      document.querySelector('#app-modal'),
      document.querySelector('#notifications-modal')
    ].filter(Boolean);

    targets.forEach(element => {
      if (locked) {
        element.inert = true;
        element.setAttribute('aria-hidden', 'true');
      } else {
        element.inert = false;
        element.removeAttribute('aria-hidden');
      }
    });
  }

  function ensureOverlay() {
    if (overlay?.isConnected) return overlay;
    overlay = document.createElement('div');
    overlay.id = 'pw-first-run';
    overlay.hidden = true;
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', 'Aruvi first-time setup');
    document.body.appendChild(overlay);
    overlay.addEventListener('submit', onSubmit);
    overlay.addEventListener('click', onClick);
    return overlay;
  }

  function colorOptions(selected) {
    return colors.map(color => `
      <label class="pw-first-run-color" title="${color.label}">
        <input type="radio" name="profileColor" value="${color.id}" ${selected === color.id ? 'checked' : ''} aria-label="${color.label}">
        <span style="--pw-profile-color:${color.hex}"></span>
      </label>
    `).join('');
  }

  function renderProfileStep() {
    const element = ensureOverlay();
    const name = escapeHtml(profileDraft.name);
    element.innerHTML = `
      <div class="pw-first-run-scroll">
        <section class="pw-first-run-panel" aria-labelledby="pw-first-run-title">
          <div class="pw-first-run-brand"><span class="pw-first-run-mark" aria-hidden="true">₹</span><span>Aruvi</span></div>
          <span class="pw-first-run-kicker">WELCOME · 01 / 02</span>
          <h1 class="pw-first-run-title" id="pw-first-run-title">Make this space yours.</h1>
          <p class="pw-first-run-lead">Start with a simple local profile. Your name and avatar help personalise the app, and stay on this device.</p>
          <form class="pw-first-run-form" id="pw-first-run-profile-form" novalidate>
            <div class="pw-first-run-field">
              <label for="pw-first-run-name">WHAT SHOULD WE CALL YOU?</label>
              <input id="pw-first-run-name" name="profileName" type="text" maxlength="48" autocomplete="nickname" placeholder="Your display name" value="${name}" required>
            </div>
            <div class="pw-first-run-field">
              <label>CHOOSE YOUR PROFILE COLOUR</label>
              <div class="pw-first-run-colors" role="radiogroup" aria-label="Profile colour">${colorOptions(profileDraft.color)}</div>
            </div>
            <p class="pw-first-run-note">No email, password, phone number or bank credentials are needed. This is a device-local profile, not an online account.</p>
            <p class="pw-first-run-error" id="pw-first-run-error" role="alert" aria-live="polite"></p>
          </form>
          <div class="pw-first-run-actions">
            <button class="primary-button" type="submit" form="pw-first-run-profile-form" id="pw-first-run-continue">Continue</button>
          </div>
        </section>
      </div>
    `;
    overlay.hidden = false;
    requestAnimationFrame(() => {
      const input = overlay.querySelector('#pw-first-run-name');
      input?.focus({ preventScroll: true });
    });
  }

  function renderPrivacyStep() {
    const element = ensureOverlay();
    element.innerHTML = `
      <div class="pw-first-run-scroll">
        <section class="pw-first-run-panel" aria-labelledby="pw-first-run-title">
          <div class="pw-first-run-brand"><span class="pw-first-run-mark" aria-hidden="true">₹</span><span>Aruvi</span></div>
          <span class="pw-first-run-kicker">YOUR DATA · 02 / 02</span>
          <h1 class="pw-first-run-title" id="pw-first-run-title">Your money stays yours.</h1>
          <p class="pw-first-run-lead">Before entering Aruvi, review how your records are stored, how imports are processed and what happens when optional services are used.</p>
          <div class="pw-first-run-policy-scroll" id="pw-first-run-policy" tabindex="0" aria-label="Aruvi privacy notice">
            <h3>Privacy notice · Updated 2 November 2026</h3>
            ${privacyMarkup()}
          </div>
          <div class="pw-first-run-policy-meta"><span>LOCAL-FIRST · ON THIS DEVICE</span><span>No sign-in required</span></div>
          <div class="pw-first-run-actions">
            <button class="pw-first-run-back" type="button" id="pw-first-run-back">Back</button>
            <button class="primary-button" type="button" id="pw-first-run-accept">I understand & continue</button>
          </div>
          <p class="pw-first-run-error" id="pw-first-run-error" role="alert" aria-live="polite"></p>
        </section>
      </div>
    `;
    overlay.hidden = false;
    requestAnimationFrame(() => {
      overlay.querySelector('#pw-first-run-policy')?.focus({ preventScroll: true });
    });
  }

  function showError(message) {
    const target = overlay?.querySelector('#pw-first-run-error');
    if (target) target.textContent = String(message || 'That step could not be saved. Please try again.');
  }

  async function onSubmit(event) {
    const form = event.target;
    if (!(form instanceof HTMLFormElement) || form.id !== 'pw-first-run-profile-form') return;
    event.preventDefault();
    if (busy) return;

    const name = String(new FormData(form).get('profileName') || '').trim().slice(0, 48);
    const color = String(new FormData(form).get('profileColor') || profileDraft.color || 'mint');
    if (!name) {
      showError('Enter a display name to continue.');
      overlay.querySelector('#pw-first-run-name')?.focus();
      return;
    }

    busy = true;
    const button = overlay.querySelector('#pw-first-run-continue');
    if (button) { button.disabled = true; button.textContent = 'Saving…'; }
    profileDraft = { name, color: colors.some(item => item.id === color) ? color : 'mint' };
    try {
      const saved = await settings?.saveProfile?.({ ...profileDraft });
      if (!saved) {
        showError('Your profile was not saved. Your previous data has been kept.');
        return;
      }
      settings.profileComplete = true;
      renderPrivacyStep();
    } catch (error) {
      showError(error?.message || 'Your profile could not be saved. Please try again.');
    } finally {
      busy = false;
    }
  }

  async function acceptPrivacy() {
    if (busy) return;
    busy = true;
    const button = overlay.querySelector('#pw-first-run-accept');
    if (button) { button.disabled = true; button.textContent = 'Saving…'; }
    try {
      const accepted = await settings?.acceptPrivacy?.();
      if (!accepted) {
        showError('Your privacy acknowledgement could not be saved. Please try again.');
        return;
      }
      finish();
    } catch (error) {
      showError(error?.message || 'Your privacy acknowledgement could not be saved. Please try again.');
    } finally {
      busy = false;
      const retry = overlay?.querySelector('#pw-first-run-accept');
      if (retry && active) { retry.disabled = false; retry.textContent = 'I understand & continue'; }
    }
  }

  function onClick(event) {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;
    if (target.closest('#pw-first-run-back')) {
      if (busy) return;
      renderProfileStep();
      return;
    }
    if (target.closest('#pw-first-run-accept')) {
      event.preventDefault();
      acceptPrivacy();
    }
  }

  function finish() {
    if (!active) return;
    active = false;
    overlay.hidden = true;
    overlay.remove();
    overlay = null;
    document.documentElement.removeAttribute('data-first-run');
    document.body.style.overflow = previousBodyOverflow;
    lockApp(false);
    try { localStorage.setItem(TOUR_KEY, '1'); } catch (_) {}
    try { settings?.onComplete?.(); } catch (_) {}
    document.dispatchEvent(new CustomEvent('pocketwise:first-run-complete'));
  }

  function start(options) {
    if (active) return;
    settings = options && typeof options === 'object' ? options : {};
    profileDraft = {
      name: String(settings.profileName || ''),
      color: colors.some(item => item.id === settings.profileColor) ? settings.profileColor : 'mint'
    };
    active = true;
    previousBodyOverflow = document.body.style.overflow;
    document.documentElement.dataset.firstRun = 'on';
    document.body.style.overflow = 'hidden';
    setStatusBarForSetup(true);
    lockApp(true);
    ensureOverlay();
    if (settings.profileComplete) renderPrivacyStep();
    else renderProfileStep();
  }

  root.PocketwiseFirstRun = Object.freeze({ start });
})(window);
