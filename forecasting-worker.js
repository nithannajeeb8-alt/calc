/* Aruvi Forecast Worker v1.0. All forecasting math stays on-device. */
'use strict';
importScripts('./forecasting-core.js', './forecasting-teacher.js');

const core = self.PocketWiseForecastCore;
const teacher = self.PocketWiseForecastTeacher;
const cancelled = new Set();

function send(id, type, payload) {
  self.postMessage({ id, type, payload });
}

async function runBacktest(id, payload) {
  const jobs = core.backtestJobs(payload.transactions, payload.asOf);
  const grades = [];
  const started = Date.now();
  for (let index = 0; index < jobs.length; index++) {
    if (cancelled.has(id)) {
      cancelled.delete(id);
      send(id, 'cancelled', { completed: index, total: jobs.length });
      return;
    }
    const result = core.backtestJob(payload.transactions, payload.labels, jobs[index], (payload.seed || 0x51a7e) + index * 7919);
    if (result) grades.push(result);
    send(id, 'progress', {
      completed: index + 1,
      total: jobs.length,
      origin: jobs[index].origin,
      window: jobs[index].window,
      elapsedMs: Date.now() - started
    });
    // Yield after each origin. A worker does not block the UI, and this also
    // makes cancellation and progress events responsive on weaker devices.
    await new Promise(resolve => setTimeout(resolve, 0));
  }
  send(id, 'result', {
    grades,
    summary: core.summarizeGrades(grades),
    selections: core.deriveSelections(core.summarizeGrades(grades)),
    calibration: core.calibrationStateFromGrades(grades, core.deriveSelections(core.summarizeGrades(grades))),
    jobs: jobs.length,
    completed: grades.length,
    elapsedMs: Date.now() - started
  });
}


async function runTeacher(id, payload) {
  const result = teacher.runTeacherChunk(
    payload.transactions,
    payload.labels,
    payload.teacher,
    payload.today,
    { ...(payload.options || {}), chunkDays: Math.max(1, Math.min(14, Number(payload.options?.chunkDays) || 7)) }
  );
  send(id, 'progress', { processed: result.processed, graded: result.graded, pending: result.pending, nextOrigin: result.nextOrigin });
  send(id, 'result', result);
}

self.addEventListener('message', async event => {
  const message = event.data || {};
  const id = message.id;
  try {
    if (message.type === 'cancel') {
      cancelled.add(message.targetId);
      return;
    }
    if (message.type === 'init') {
      send(id, 'result', { ready: true, version: 1 });
      return;
    }
    if (message.type === 'forecast' || message.type === 'getForecast') {
      send(id, 'result', core.forecast(message.payload.transactions, message.payload.options));
      return;
    }
    if (message.type === 'runBacktest') {
      await runBacktest(id, message.payload);
      return;
    }
    if (message.type === 'runTeacher') {
      await runTeacher(id, message.payload);
      return;
    }
    if (message.type === 'getInsights') {
      const result = core.forecast(message.payload.transactions, message.payload.options);
      send(id, 'result', { explanations: result.explanations, streams: result.streams, events: result.events });
      return;
    }
    if (message.type === 'deleteAll') {
      send(id, 'result', { deleted: true });
      return;
    }
    throw new Error(`Unsupported forecasting worker message: ${message.type}`);
  } catch (error) {
    send(id, 'error', { message: error && error.message ? error.message : String(error) });
  }
});
