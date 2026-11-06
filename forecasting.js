/* Aruvi Forecasting bridge. Worker-first with a deterministic local fallback. */
(function (root) {
  'use strict';

  let nextId = 0;

  function createClient(options) {
    options = options || {};
    let worker = null;
    let workerFailed = false;
    const pending = new Map();

    function ensureWorker() {
      if (worker || workerFailed || typeof Worker !== 'function') return worker;
      try {
        worker = new Worker(new URL('forecasting-worker.js', document.baseURI));
        worker.addEventListener('message', handleMessage);
        worker.addEventListener('error', handleWorkerError);
        return worker;
      } catch (error) {
        workerFailed = true;
        if (options.onFallback) options.onFallback(error);
        return null;
      }
    }

    function handleMessage(event) {
      const message = event.data || {};
      const request = pending.get(message.id);
      if (!request) return;
      if (message.type === 'progress') {
        if (request.onProgress) request.onProgress(message.payload);
        return;
      }
      pending.delete(message.id);
      if (message.type === 'error') request.reject(new Error(message.payload?.message || 'Forecasting worker failed.'));
      else if (message.type === 'cancelled') request.resolve({ cancelled: true, ...message.payload });
      else request.resolve(message.payload);
    }

    function handleWorkerError(event) {
      workerFailed = true;
      const error = new Error(event?.message || 'Forecasting worker could not run.');
      for (const request of pending.values()) {
        // A runtime Worker failure is not a forecasting failure. Retry each queued
        // request through the deterministic main-thread fallback.
        fallbackRequest(request.type, request.payload, request.onProgress).then(request.resolve, request.reject);
      }
      pending.clear();
      try { worker?.terminate(); } catch (_) { /* already terminated */ }
      worker = null;
      if (options.onFallback) options.onFallback(error);
    }

    function request(type, payload, onProgress) {
      const id = ++nextId;
      const activeWorker = ensureWorker();
      if (activeWorker) {
        return new Promise((resolve, reject) => {
          pending.set(id, { resolve, reject, onProgress, type, payload });
          try { activeWorker.postMessage({ id, type, payload }); }
          catch (error) {
            pending.delete(id);
            workerFailed = true;
            try { activeWorker.terminate(); } catch (_) {}
            worker = null;
            if (options.onFallback) options.onFallback(error);
            fallbackRequest(type, payload, onProgress).then(resolve, reject);
          }
        });
      }
      return fallbackRequest(type, payload, onProgress);
    }

    async function fallbackRequest(type, payload, onProgress) {
      const core = root.PocketWiseForecastCore;
      if (!core) throw new Error('Forecasting core is unavailable.');
      await new Promise(resolve => setTimeout(resolve, 0));
      if (type === 'forecast' || type === 'getForecast') {
        // Keep the degraded main-thread path lightweight if the browser cannot run Workers.
        const options = { ...(payload.options || {}), paths: Math.min(500, Number(payload.options?.paths) || 500) };
        return core.forecast(payload.transactions, options);
      }
      if (type === 'getInsights') {
        const options = { ...(payload.options || {}), paths: Math.min(500, Number(payload.options?.paths) || 500) };
        const result = core.forecast(payload.transactions, options);
        return { explanations: result.explanations, streams: result.streams, events: result.events };
      }
      if (type === 'runBacktest') {
        const jobs = core.backtestJobs(payload.transactions, payload.asOf), grades = [];
        const start = Date.now();
        for (let i = 0; i < jobs.length; i++) {
          const result = core.backtestJob(payload.transactions, payload.labels, jobs[i], (payload.seed || 0x51a7e) + i * 7919);
          if (result) grades.push(result);
          if (onProgress) onProgress({ completed: i + 1, total: jobs.length, origin: jobs[i].origin, window: jobs[i].window });
          if ((i + 1) % 2 === 0) await new Promise(resolve => setTimeout(resolve, 0));
        }
        const summary = core.summarizeGrades(grades);
        const selections = core.deriveSelections(summary);
        return { grades, summary, selections, calibration: core.calibrationStateFromGrades(grades, selections), jobs: jobs.length, completed: grades.length, elapsedMs: Date.now() - start };
      }
      if (type === 'runTeacher') {
        const teacher = root.PocketWiseForecastTeacher;
        if (!teacher) throw new Error('Forecast teacher module is unavailable.');
        await new Promise(resolve => setTimeout(resolve, 0));
        const result = teacher.runTeacherChunk(payload.transactions, payload.labels, payload.teacher, payload.today, { ...(payload.options || {}), chunkDays: 1 });
        if (onProgress) onProgress({ processed: result.processed, graded: result.graded, pending: result.pending, nextOrigin: result.nextOrigin });
        return result;
      }
      if (type === 'deleteAll') return { deleted: true };
      throw new Error(`Unsupported forecasting request: ${type}`);
    }

    return {
      forecast(transactions, options) { return request('forecast', { transactions, options }); },
      getInsights(transactions, options) { return request('getInsights', { transactions, options }); },
      runBacktest(transactions, labels, asOf, onProgress) { return request('runBacktest', { transactions, labels, asOf }, onProgress); },
      runTeacher(transactions, labels, teacher, today, options, onProgress) { return request('runTeacher', { transactions, labels, teacher, today, options }, onProgress); },
      cancel(requestId) { if (worker) worker.postMessage({ id: ++nextId, type: 'cancel', targetId: requestId }); },
      dispose() {
        for (const request of pending.values()) request.reject(new Error('Forecasting client disposed.'));
        pending.clear();
        try { worker?.terminate(); } catch (_) { /* best effort */ }
        worker = null;
      },
      get workerAvailable() { return !!worker && !workerFailed; }
    };
  }

  root.PocketWiseForecasting = { createClient };
})(typeof window !== 'undefined' ? window : globalThis);
