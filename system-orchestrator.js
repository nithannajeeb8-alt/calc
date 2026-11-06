/* Generic, local-first capability routing and adaptive fallback orchestration. */
(function (root) {
  'use strict';

  const OUTCOME = Object.freeze({ success: 0, failure: 1, timeout: 2, quality: 3, unsupported: 4, permission: 5, resource: 6, crash: 7 });
  const BASE_COOLDOWN_MS = 30000;
  const MAX_COOLDOWN_MS = 6 * 60 * 60 * 1000;
  const ATTEMPT_LEASE_MS = 60000;
  const ATTEMPT_HEARTBEAT_MS = 15000;
  const SESSION_ID = Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 12);
  const registry = new Map();

  function timeoutError(label) {
    const error = new Error(label + ' exceeded its execution time limit.');
    error.name = 'TimeoutError';
    error.reliabilityOutcome = 'timeout';
    return error;
  }

  function classify(error) {
    if (error && error.reliabilityOutcome && OUTCOME[error.reliabilityOutcome] !== undefined) return OUTCOME[error.reliabilityOutcome];
    if (error && (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError')) return OUTCOME.permission;
    if (error && (error.name === 'TimeoutError' || /timed? ?out|timeout/i.test(String(error.message || '')))) return OUTCOME.timeout;
    if (error && (error.name === 'NotSupportedError' || error.code === 'UNSUPPORTED')) return OUTCOME.unsupported;
    if (error && (error.pocketWiseProviderCrash || /worker (?:crash(?:ed)?|error|failed|terminated)|uncaught worker|wasm worker exited/i.test(String(error.message || '')))) return OUTCOME.crash;
    if (error && (error.name === 'QuotaExceededError' || /out of memory|memory access out of bounds|allocation failed|device lost|device was lost|context lost/i.test(String(error.message || '')))) return OUTCOME.resource;
    if (error && error.name === 'PocketWiseQualityError') return OUTCOME.quality;
    if (error && error.name === 'AbortError' && error.pocketWiseProviderCrash) return OUTCOME.crash;
    return OUTCOME.failure;
  }

  function withTimeout(promise, milliseconds, label) {
    if (!Number.isFinite(milliseconds) || milliseconds <= 0) return Promise.resolve(promise);
    return new Promise((resolve, reject) => {
      let settled = false;
      const timer = root.setTimeout(() => {
        if (settled) return;
        settled = true;
        reject(timeoutError(label || 'Provider'));
      }, milliseconds);
      Promise.resolve(promise).then(value => {
        if (settled) return;
        settled = true; root.clearTimeout(timer); resolve(value);
      }, error => {
        if (settled) return;
        settled = true; root.clearTimeout(timer); reject(error);
      });
    });
  }

  function makeQualityError(reason) {
    const error = new Error(String(reason || 'The provider returned incomplete or low-confidence output.'));
    error.name = 'PocketWiseQualityError';
    error.reliabilityOutcome = 'quality';
    return error;
  }

  async function run(capability, providers, input, options) {
    options = options || {};
    if (!root.PocketWiseWasm || typeof root.PocketWiseWasm.orderProviders !== 'function' || typeof root.PocketWiseWasm.updateProviderHealth !== 'function') {
      const error = new Error('Aruvi adaptive routing requires its C++ WebAssembly system engine.');
      error.name = 'PocketWiseSystemError';
      throw error;
    }
    if (!Array.isArray(providers) || providers.length === 0) throw new TypeError('At least one provider must be registered.');

    const store = root.PocketWiseReliabilityStore;
    const profile = store && typeof store.capabilityKey === 'function' ? store.capabilityKey() : 'session-only';
    let healthById = store && typeof store.readCapability === 'function' ? await store.readCapability(capability, profile) : {};
    if (store && typeof store.listExpiredAttempts === 'function') {
      const expired = await store.listExpiredAttempts(profile, Date.now());
      for (const attempt of expired.filter(item => item.capability === capability)) {
        const elapsed = Math.max(0, Math.min(0xFFFFFFFF, Date.now() - Number(attempt.startedAt || Date.now())));
        const updated = Object.assign({}, healthById[String(attempt.providerId)] || {}, root.PocketWiseWasm.updateProviderHealth(healthById[String(attempt.providerId)], OUTCOME.crash, elapsed, Date.now(), BASE_COOLDOWN_MS, MAX_COOLDOWN_MS));
        if (store.writeHealth) await store.writeHealth(capability, attempt.providerId, updated, profile);
        if (store.finishAttempt) await store.finishAttempt(attempt.id);
        healthById[String(attempt.providerId)] = updated;
      }
    }
    const now = Date.now();
    const rememberedFallbacks = new Set(Object.values(healthById).filter(health =>
      health && Number(health.cooldownUntilMs) > now && Number(health.fallbackSuccessCount) > 0 && Number.isInteger(health.fallbackProviderId)
    ).map(health => health.fallbackProviderId));
    const candidates = providers.map(provider => ({
      id: provider.id,
      priority: provider.priority || 0,
      supported: provider.supported !== false,
      available: provider.available !== false,
      enabled: provider.enabled !== false,
      cooldownUntilMs: Number(healthById[String(provider.id)] && healthById[String(provider.id)].cooldownUntilMs) || 0,
      fallbackAffinity: rememberedFallbacks.has(provider.id),
      health: healthById[String(provider.id)] || {}
    }));
    const ordered = root.PocketWiseWasm.orderProviders(candidates, Date.now());
    if (!ordered.length) throw new Error('No compatible ' + capability + ' provider is available right now. Supported providers may be cooling down after earlier failures; try again after the recovery window.');
    const preferredProvider = providers.filter(provider => provider && provider.supported !== false && provider.available !== false && provider.enabled !== false)
      .slice().sort((a, b) => (Number(b.priority) || 0) - (Number(a.priority) || 0))[0];
    const preferredProviderId = preferredProvider ? preferredProvider.id : null;

    const attempts = [];
    let lastResort = null;
    for (let index = 0; index < ordered.length; index += 1) {
      const candidate = ordered[index];
      const provider = providers.find(item => item.id === candidate.id);
      if (!provider || typeof provider.run !== 'function') continue;
      const before = Date.now();
      const attemptId = capability + ':' + provider.id + ':' + before.toString(36) + ':' + Math.random().toString(36).slice(2, 8);
      const controller = typeof root.AbortController === 'function' ? new root.AbortController() : null;
      const timeoutMs = provider.timeoutMs || options.timeoutMs || 45000;
      let heartbeatTimer = null;
      let attemptFinished = false;
      const finishPendingAttempt = async () => {
        if (attemptFinished) return;
        attemptFinished = true;
        if (heartbeatTimer !== null && typeof root.clearInterval === 'function') root.clearInterval(heartbeatTimer);
        if (store && typeof store.finishAttempt === 'function') await store.finishAttempt(attemptId);
      };
      if (store && typeof store.beginAttempt === 'function') {
        await store.beginAttempt({
          id: attemptId, capability, providerId: provider.id, profile, startedAt: before,
          expiresAt: before + timeoutMs + ATTEMPT_LEASE_MS,
          leaseUntil: before + ATTEMPT_LEASE_MS,
          ownerSession: SESSION_ID
        });
        if (typeof store.renewAttempt === 'function' && typeof root.setInterval === 'function') {
          heartbeatTimer = root.setInterval(() => {
            store.renewAttempt(attemptId, Date.now() + ATTEMPT_LEASE_MS, SESSION_ID).catch(() => {});
          }, ATTEMPT_HEARTBEAT_MS);
        }
      }
      try {
        if (typeof options.onStatus === 'function') options.onStatus('Trying ' + (provider.label || provider.id) + '…');
        const providerContext = { capability, attempts: attempts.slice(), signal: controller ? controller.signal : null, providerId: provider.id, attemptId };
        const result = await withTimeout(provider.run(input, providerContext), timeoutMs, provider.label || String(provider.id));
        let assessment = { ok: true };
        if (typeof provider.assess === 'function') assessment = await provider.assess(result, input) || { ok: false, reason: 'Provider returned no quality assessment.' };
        if (assessment === false || assessment.ok === false) {
          const qualityError = makeQualityError(assessment.reason || 'Provider output did not pass quality checks.');
          const item = { providerId: provider.id, label: provider.label || String(provider.id), outcome: 'quality', reason: qualityError.message, latencyMs: Date.now() - before };
          attempts.push(item);
          const updated = Object.assign({}, healthById[String(provider.id)] || {}, root.PocketWiseWasm.updateProviderHealth(healthById[String(provider.id)], OUTCOME.quality, item.latencyMs, Date.now(), BASE_COOLDOWN_MS, MAX_COOLDOWN_MS));
          if (store && store.writeHealth) await store.writeHealth(capability, provider.id, updated, profile);
          await finishPendingAttempt();
          if (provider.keepLastResort && result && (result.text || result.items && result.items.length)) lastResort = { result, provider, assessment, attempts: attempts.slice() };
          continue;
        }
        const latencyMs = Date.now() - before;
        const updated = Object.assign({}, healthById[String(provider.id)] || {}, root.PocketWiseWasm.updateProviderHealth(healthById[String(provider.id)], OUTCOME.success, latencyMs, Date.now(), BASE_COOLDOWN_MS, MAX_COOLDOWN_MS));
        if (store && store.writeHealth) await store.writeHealth(capability, provider.id, updated, profile);
        await finishPendingAttempt();
        attempts.push({ providerId: provider.id, label: provider.label || String(provider.id), outcome: 'success', latencyMs });
        if (store && typeof store.recordFallback === 'function') {
          for (const prior of attempts.filter(item => item.providerId !== provider.id && item.outcome !== 'success')) {
            try { await store.recordFallback(capability, prior.providerId, provider.id, profile); } catch (_) { /* route learning must never block a valid result */ }
          }
        }
        return { result, providerId: provider.id, provider: provider.label || String(provider.id), fallbackUsed: provider.id !== preferredProviderId || index > 0 || attempts.some(item => item.outcome !== 'success'), attempts, assessment };
      } catch (error) {
        if (controller && error && error.name === 'TimeoutError') controller.abort();
        const latencyMs = Date.now() - before;
        const outcomeCode = classify(error);
        const outcomeName = Object.keys(OUTCOME).find(key => OUTCOME[key] === outcomeCode) || 'failure';
        const updated = Object.assign({}, healthById[String(provider.id)] || {}, root.PocketWiseWasm.updateProviderHealth(healthById[String(provider.id)], outcomeCode, latencyMs, Date.now(), BASE_COOLDOWN_MS, MAX_COOLDOWN_MS));
        if (store && store.writeHealth) await store.writeHealth(capability, provider.id, updated, profile);
        await finishPendingAttempt();
        attempts.push({ providerId: provider.id, label: provider.label || String(provider.id), outcome: outcomeName, reason: String(error && error.message || error).slice(0, 180), latencyMs });
        if (typeof options.onStatus === 'function') options.onStatus((provider.label || provider.id) + ' failed. Trying the next available method…');
      }
    }

    if (lastResort && options.keepLastResort !== false) {
      return {
        result: lastResort.result,
        providerId: lastResort.provider.id,
        provider: lastResort.provider.label || String(lastResort.provider.id),
        fallbackUsed: true,
        needsReview: true,
        assessment: lastResort.assessment,
        attempts,
        lastResort: true
      };
    }

    const error = new Error('Every available ' + capability + ' provider failed. ' + attempts.map(item => item.label + ': ' + item.reason).join(' | '));
    error.name = 'PocketWiseProviderFailure';
    error.attempts = attempts;
    throw error;
  }

  function registerProviders(capability, providers) {
    const key = String(capability || '').trim();
    if (!key || !Array.isArray(providers) || !providers.length) throw new TypeError('A capability name and at least one provider are required.');
    const current = registry.get(key) || new Map();
    providers.forEach(provider => {
      if (!provider || !Number.isInteger(provider.id) || typeof provider.run !== 'function') throw new TypeError('Registered providers require a numeric id and run function.');
      current.set(provider.id, provider);
    });
    registry.set(key, current);
    return () => {
      const registered = registry.get(key);
      if (!registered) return;
      providers.forEach(provider => registered.delete(provider.id));
      if (!registered.size) registry.delete(key);
    };
  }

  function execute(capability, input, options) {
    const registered = registry.get(String(capability || ''));
    if (!registered || !registered.size) throw new Error('No providers are registered for capability: ' + capability);
    return run(capability, Array.from(registered.values()), input, options);
  }

  function listProviders(capability) {
    const registered = registry.get(String(capability || ''));
    return registered ? Array.from(registered.values()).map(provider => ({ id: provider.id, label: provider.label || String(provider.id), priority: provider.priority || 0 })) : [];
  }

  function health(capability) {
    const store = root.PocketWiseReliabilityStore;
    return store && store.readCapability ? store.readCapability(capability) : Promise.resolve({});
  }

  root.PocketWiseSystem = Object.freeze({
    version: '1.0.0',
    outcomes: OUTCOME,
    run,
    registerProviders,
    execute,
    listProviders,
    health,
    clearHealth: capability => root.PocketWiseReliabilityStore && root.PocketWiseReliabilityStore.clear(capability)
  });
})(typeof window !== 'undefined' ? window : globalThis);
