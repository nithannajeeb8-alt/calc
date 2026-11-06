/* Required C++/Wasm and subsystem startup gate. The native first-paint shell is in index.html. */
(function () {
  'use strict';

  const APP_SCRIPTS = [
    'reliability-store.js',
    'system-orchestrator.js',
    'finance-analytics.js',
    'wasm/shared-costs-api.js',
    'forecasting-core.js',
    'forecasting-teacher.js',
    'forecasting.js',
    'receipt-media.js',
    'app.js',
    'onboarding.js',
    'statement-parser.js',
    'statement-ai-guard.js',
    'xlsx-reader.js',
    'local-ai.js',
    'statement-import.js'
  ];
  const SPLASH_EXIT_DURATION_MS = 190;
  let splashAnimationDone = window.__pwSplashAnimationDone === true;
  let splashHideStarted = false;
  let scriptsStarted = false;
  let scriptsLoaded = false;
  let appReady = false;
  let runtimeFailure = null;

  const gate = document.getElementById('pocketwise-boot-splash');
  const errorPanel = document.getElementById('pw-splash-error');
  const message = document.getElementById('pw-splash-message');
  const details = document.getElementById('pw-splash-details');
  const action = document.getElementById('pw-splash-retry');

  function maybeHideSplash() {
    if (!scriptsLoaded || !appReady || !splashAnimationDone || runtimeFailure || !gate || !gate.isConnected || splashHideStarted) return;
    splashHideStarted = true;
    gate.setAttribute('aria-busy', 'false');
    gate.classList.add('pw-splash-exiting');
    setTimeout(() => {
      if (gate.isConnected) gate.remove();
    }, SPLASH_EXIT_DURATION_MS);
  }

  function showFailure(error, failureType) {
    if (!gate) return;
    if (errorPanel) errorPanel.hidden = false;
    if (message) {
      message.textContent = failureType === 'app'
        ? 'Aruvi couldn’t finish loading your workspace.'
        : failureType === 'runtime'
          ? 'A required calculation could not finish. Reload before relying on financial figures.'
          : failureType === 'asset'
            ? 'A required Aruvi file could not be loaded. Check the deployment and reload.'
            : 'Aruvi couldn’t start. Check the app files and reload.';
    }
    if (details) {
      details.textContent = error && error.message ? error.message : String(error || 'Unknown startup error.');
      details.hidden = false;
    }
    if (action) {
      action.disabled = false;
      action.textContent = 'Reload Aruvi';
      action.hidden = false;
      action.onclick = () => location.reload();
    }
    gate.setAttribute('role', 'alert');
    gate.setAttribute('aria-busy', 'false');
  }

  function loadScript(path) {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.async = false;
      script.src = new URL(path, document.baseURI).href;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('Could not load required Aruvi application asset: ' + path));
      document.body.appendChild(script);
    });
  }

  async function start() {
    if (scriptsStarted) return;
    try {
      if (!window.PocketWiseWasm || typeof window.PocketWiseWasm.load !== 'function') {
        throw new Error('The WebAssembly bridge script is missing.');
      }
      await window.PocketWiseWasm.load();
      if (!window.PocketWiseWasm.isReady()) throw new Error('The C++ WebAssembly engine did not enter the ready state.');
    } catch (error) {
      showFailure(error, 'wasm');
      return;
    }

    if (scriptsStarted) return;
    scriptsStarted = true;
    try {
      for (const path of APP_SCRIPTS) await loadScript(path);
      scriptsLoaded = true;
      maybeHideSplash();
    } catch (error) {
      showFailure(error, 'asset');
    }
  }

  window.addEventListener('pocketwise:splash-animation-finished', () => {
    splashAnimationDone = true;
    maybeHideSplash();
  }, { once: true });

  window.addEventListener('pocketwise:app-ready', () => {
    appReady = true;
    maybeHideSplash();
  }, { once: true });

  // No timer may bypass the writing animation. splash-animation.js signals
  // completion only after every rolling character reaches its final position.
  window.addEventListener('pocketwise:financial-engine-error', event => {
    runtimeFailure = new Error(event && event.detail && event.detail.message || 'Unknown WebAssembly calculation failure.');
    showFailure(runtimeFailure, 'runtime');
  });

  window.addEventListener('pocketwise:app-init-error', event => {
    runtimeFailure = new Error(event && event.detail && event.detail.message || 'The workspace could not be initialized.');
    showFailure(runtimeFailure, 'app');
  }, { once: true });

  void start();
})();
