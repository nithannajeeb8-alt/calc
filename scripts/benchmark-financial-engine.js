'use strict';
const { performance } = require('node:perf_hooks');
const wasm = require('../wasm/pocketwise-engine.js');
const analytics = require('../finance-analytics.js');

function median(values) {
  return values.slice().sort((a, b) => a - b)[Math.floor(values.length / 2)];
}

// Benchmark-only oracle from the Alpha 1 baseline. This is not imported by the
// app and is not a production fallback path.
function referenceCashMovement(rows) {
  const toMinor = value => {
    const n = Number(value);
    if (!Number.isFinite(n)) return 0;
    const rounded = Math.round((n + Math.sign(n) * Number.EPSILON) * 100);
    return Number.isSafeInteger(rounded) ? rounded : Math.sign(rounded) * Number.MAX_SAFE_INTEGER;
  };
  let total = 0;
  for (const row of rows) {
    const amount = toMinor(row.amount);
    if (row.type === 'income' || row.type === 'refund' || row.type === 'borrowed' || row.type === 'repay_in') total += amount;
    else if (row.type === 'expense' || row.type === 'lent' || row.type === 'repay_out') total -= amount;
  }
  return total;
}

function measure(callback, loops) {
  let checksum = 0;
  for (let i = 0; i < 20; i += 1) checksum += callback();
  const runs = [];
  for (let sample = 0; sample < 7; sample += 1) {
    const start = performance.now();
    for (let i = 0; i < loops; i += 1) checksum += callback();
    runs.push((performance.now() - start) / loops);
  }
  return { ms: median(runs), checksum };
}

(async () => {
  await wasm.load();
  global.PocketWiseWasm = wasm;
  const sizes = [100, 1000, 10000, 50000];
  for (const size of sizes) {
    const rows = Array.from({ length: size }, (_, index) => ({
      type: ['income', 'expense', 'refund', 'borrowed', 'lent', 'repay_in', 'repay_out'][index % 7],
      amount: (index % 997) + 0.13
    }));
    const reference = measure(() => referenceCashMovement(rows), 100);
    const compiled = measure(() => analytics.aggregateTransactions(rows).cashMovementMinor, 100);
    console.log(`${size} rows | test-only JS reference ${reference.ms.toFixed(4)} ms | Wasm adapter ${compiled.ms.toFixed(4)} ms | Wasm/reference ${(compiled.ms / reference.ms).toFixed(2)}x`);
  }
})().catch(error => { console.error(error); process.exit(1); });
