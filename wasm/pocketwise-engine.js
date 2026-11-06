/* Aruvi WebAssembly adapter. Migrated financial aggregation is Wasm-only. */
(function (root, factory) {
  const sourceScriptUrl = typeof document !== 'undefined' && document.currentScript ? document.currentScript.src : '';
  const api = factory(root, sourceScriptUrl);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.PocketWiseWasm = api;
  // Prewarm the engine. The app bootstrap separately awaits this promise and
  // refuses to start the application if the required financial core is absent.
  api.load().catch(() => {});
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root, sourceScriptUrl) {
  'use strict';
  const TYPE_CODES = Object.freeze({ income: 1, expense: 2, refund: 3, borrowed: 4, lent: 5, repay_in: 6, repay_out: 7, transfer: 8 });
  const RESULT_FIELDS = 23;
  const RESULT_BYTES = 192;
  let instancePromise = null;
  let engine = null;
  let loadError = null;

  function wasmUrl() {
    if (sourceScriptUrl) return new URL('pocketwise-engine.wasm', sourceScriptUrl).href;
    if (typeof __dirname !== 'undefined') return __dirname + '/pocketwise-engine.wasm';
    return 'wasm/pocketwise-engine.wasm';
  }

  function notifyFailure(error) {
    try {
      if (root && typeof root.dispatchEvent === 'function' && typeof root.CustomEvent === 'function') {
        root.dispatchEvent(new root.CustomEvent('pocketwise:financial-engine-error', {
          detail: { message: error.message }
        }));
      }
    } catch (_) { /* Error reporting must never mask the calculation failure. */ }
    return error;
  }

  function failure(message, cause) {
    const error = new Error(message);
    error.name = 'PocketWiseFinancialEngineError';
    error.pocketWiseFinancialCore = true;
    if (cause) error.cause = cause;
    return notifyFailure(error);
  }

  async function instantiate() {
    if (typeof WebAssembly === 'undefined') throw new Error('This browser does not support WebAssembly.');
    let result;
    if (typeof module === 'object' && module.exports && typeof require === 'function') {
      const fs = require('fs');
      const bytes = fs.readFileSync(wasmUrl());
      result = await WebAssembly.instantiate(bytes, {});
    } else {
      const response = await fetch(wasmUrl(), { cache: 'force-cache', credentials: 'same-origin' });
      if (!response.ok) throw new Error('Financial engine asset could not be loaded (' + response.status + ').');
      if (WebAssembly.instantiateStreaming && /application\/wasm/i.test(response.headers.get('content-type') || '')) {
        try {
          result = await WebAssembly.instantiateStreaming(Promise.resolve(response), {});
        } catch (_) {
          const retry = await fetch(wasmUrl(), { cache: 'force-cache', credentials: 'same-origin' });
          if (!retry.ok) throw new Error('Financial engine asset could not be reloaded (' + retry.status + ').');
          result = await WebAssembly.instantiate(await retry.arrayBuffer(), {});
        }
      } else {
        result = await WebAssembly.instantiate(await response.arrayBuffer(), {});
      }
    }
    const exports = result.instance ? result.instance.exports : result.exports;
    const required = ['pw_alloc', 'pw_reset', 'pw_aggregate', 'pw_equal_split', 'pw_percentage_split', 'pw_amount_split', 'pw_sum_minor', 'pw_cash_delta_minor', 'pw_account_balance', 'pw_debt_remaining', 'pw_salary_allocate', 'pw_category_buckets', 'pw_cash_projection', 'pw_ratio_round_minor', 'pw_budget_metrics', 'pw_debt_amortize', 'pw_reliability_order', 'pw_reliability_update', 'pw_extract_merchant', 'pw_merchant_lookup', 'pw_contains_text', 'pw_find_duplicate', 'pw_filter_transactions', 'pw_next_recurrence'];
    if (!exports || !exports.memory || required.some(name => typeof exports[name] !== 'function')) {
      throw new Error('Financial engine exports are incomplete.');
    }
    engine = exports;
    return true;
  }

  function load() {
    if (engine) return Promise.resolve(true);
    if (!instancePromise) {
      instancePromise = instantiate().then(value => {
        loadError = null;
        return value;
      }).catch(error => {
        loadError = error;
        instancePromise = null;
        throw error;
      });
    }
    return instancePromise;
  }

  function requireEngine() {
    if (!engine) throw failure(loadError
      ? 'The required C++ WebAssembly financial engine is unavailable. Reload or reinstall Aruvi after its engine assets are available.'
      : 'The required C++ WebAssembly financial engine has not finished loading.');
    return engine;
  }

  function ensureScratch(inputBytes, outputBytes) {
    const wasm = requireEngine();
    wasm.pw_reset();
    const inputPtr = wasm.pw_alloc(Math.max(1, inputBytes));
    const outputPtr = wasm.pw_alloc(Math.max(1, outputBytes));
    if (!inputPtr || !outputPtr) throw new Error('WebAssembly linear-memory allocation failed.');
    const requiredEnd = Math.max(inputPtr + Math.max(1, inputBytes), outputPtr + Math.max(1, outputBytes));
    if (!Number.isSafeInteger(requiredEnd) || requiredEnd > 0xFFFFFFFF) throw new Error('WebAssembly memory address calculation overflowed.');
    if (requiredEnd > wasm.memory.buffer.byteLength) {
      wasm.memory.grow(Math.ceil((requiredEnd - wasm.memory.buffer.byteLength) / 65536));
    }
    if (requiredEnd > wasm.memory.buffer.byteLength) throw new Error('WebAssembly memory could not be expanded for this operation.');
    return { wasm, inputPtr, outputPtr, buffer: wasm.memory.buffer };
  }

  function writeI64(words, index, value) {
    if (!Number.isSafeInteger(value)) throw new RangeError('Money must be represented as an exact integer number of paise.');
    const high = Math.floor(value / 4294967296);
    const low = value - high * 4294967296;
    words[index * 2] = low >>> 0;
    words[index * 2 + 1] = high >>> 0;
  }

  function readI64(words, index) {
    const high = words[index * 2 + 1] | 0;
    const value = high * 4294967296 + words[index * 2];
    if (!Number.isSafeInteger(value)) throw new RangeError('C++ returned an amount outside JavaScript exact-integer range.');
    return value;
  }

  function readStatus(status, operation) {
    if (status === 0) return;
    let message = ({
      1: 'Invalid arguments or unsupported input size',
      2: 'Invalid value or arithmetic overflow',
      3: 'Allocation percentages or totals do not reconcile',
      4: 'The calculation could not be reconciled exactly'
    })[status] || ('status ' + status);
    if (operation === 'percentage split' && status === 3) message = 'Percentages must add up to exactly 100%.';
    if (operation === 'exact-amount split' && status === 4) message = 'The entered shares must add up to the full amount';
    throw new Error('C++ ' + operation + ' failed: ' + message + '.');
  }

  function equalSplit(totalMinor, count) {
    try {
      const { wasm, outputPtr, buffer } = ensureScratch(1, count * 8);
      const status = wasm.pw_equal_split(BigInt(totalMinor), count, outputPtr);
      readStatus(status, 'equal split');
      const values = new Uint32Array(buffer, outputPtr, count * 2);
      return Array.from({ length: count }, (_, i) => readI64(values, i));
    } catch (error) { throw failure('WebAssembly equal-split calculation failed: ' + error.message, error); }
  }

  function percentageSplit(totalMinor, basisPoints) {
    try {
      const count = basisPoints.length;
      const { wasm, inputPtr, outputPtr, buffer } = ensureScratch(count * 4, count * 8);
      const input = new Int32Array(buffer, inputPtr, count);
      basisPoints.forEach((value, i) => { input[i] = value; });
      const status = wasm.pw_percentage_split(BigInt(totalMinor), inputPtr, count, outputPtr);
      readStatus(status, 'percentage split');
      const output = new Uint32Array(buffer, outputPtr, count * 2);
      return Array.from({ length: count }, (_, i) => readI64(output, i));
    } catch (error) { throw failure('WebAssembly percentage allocation failed: ' + error.message, error); }
  }

  function amountSplit(totalMinor, amounts) {
    try {
      const count = amounts.length;
      const { wasm, inputPtr, outputPtr, buffer } = ensureScratch(count * 8, count * 8);
      const input = new Uint32Array(buffer, inputPtr, count * 2);
      amounts.forEach((value, i) => writeI64(input, i, value));
      const status = wasm.pw_amount_split(BigInt(totalMinor), inputPtr, count, outputPtr);
      readStatus(status, 'exact-amount split');
      const output = new Uint32Array(buffer, outputPtr, count * 2);
      return Array.from({ length: count }, (_, i) => readI64(output, i));
    } catch (error) { throw failure('WebAssembly exact-amount allocation failed: ' + error.message, error); }
  }

  function sum(values) {
    try {
      if (!Array.isArray(values) || values.length > 1000000) throw new TypeError('The sum input must be an array with at most 1,000,000 values.');
      const count = values.length;
      const { wasm, inputPtr, outputPtr, buffer } = ensureScratch(count * 8, 8);
      const input = new Uint32Array(buffer, inputPtr, Math.max(1, count * 2));
      values.forEach((value, i) => writeI64(input, i, value));
      const status = wasm.pw_sum_minor(inputPtr, count, outputPtr);
      readStatus(status, 'integer-paise sum');
      return readI64(new Uint32Array(buffer, outputPtr, 2), 0);
    } catch (error) { throw failure('WebAssembly sum failed: ' + error.message, error); }
  }

  function cashDelta(amountMinor, typeCode) {
    try {
      if (!Number.isSafeInteger(amountMinor) || !Number.isInteger(typeCode)) throw new TypeError('Cash-flow delta input is invalid.');
      const { wasm, outputPtr, buffer } = ensureScratch(1, 8);
      const status = wasm.pw_cash_delta_minor(BigInt(amountMinor), typeCode, outputPtr);
      readStatus(status, 'cash-flow delta');
      return readI64(new Uint32Array(buffer, outputPtr, 2), 0);
    } catch (error) { throw failure('WebAssembly cash-flow delta failed: ' + error.message, error); }
  }

  function accountBalance(openingMinor, rows) {
    try {
      if (!Array.isArray(rows) || rows.length > 1000000) throw new TypeError('Account-balance input is invalid or too large.');
      const count = rows.length;
      const { wasm, inputPtr, outputPtr, buffer } = ensureScratch(count * 16, 8);
      const words = new Uint32Array(buffer, inputPtr, Math.max(1, count * 4));
      rows.forEach((row, i) => {
        if (!row || !Number.isInteger(row.typeCode) || !Number.isSafeInteger(row.amountMinor)) throw new TypeError('Invalid account transaction at row ' + i + '.');
        writeI64(words, i * 2, row.amountMinor);
        words[i * 4 + 2] = row.typeCode >>> 0;
        words[i * 4 + 3] = ((row.fromAccount ? 1 : 0) | (row.toAccount ? 2 : 0)) >>> 0;
      });
      const status = wasm.pw_account_balance(BigInt(openingMinor), inputPtr, count, outputPtr);
      readStatus(status, 'account balance');
      return readI64(new Uint32Array(buffer, outputPtr, 2), 0);
    } catch (error) { throw failure('WebAssembly account-balance calculation failed: ' + error.message, error); }
  }

  function debtRemaining(originalMinor, repayments) {
    try {
      if (!Array.isArray(repayments) || repayments.length > 1000000) throw new TypeError('Debt repayment input is invalid or too large.');
      const count = repayments.length;
      const { wasm, inputPtr, outputPtr, buffer } = ensureScratch(count * 8, 8);
      const input = new Uint32Array(buffer, inputPtr, Math.max(1, count * 2));
      repayments.forEach((value, i) => writeI64(input, i, value));
      const status = wasm.pw_debt_remaining(BigInt(originalMinor), inputPtr, count, outputPtr);
      readStatus(status, 'debt remaining');
      return readI64(new Uint32Array(buffer, outputPtr, 2), 0);
    } catch (error) { throw failure('WebAssembly debt calculation failed: ' + error.message, error); }
  }

  function salaryAllocate(baseMinor, perCycleBaseMinor, payCycles, perCyclePercentDenominator, rules) {
    try {
      if (!Array.isArray(rules) || rules.length > 1000 || !Number.isInteger(payCycles) || payCycles < 0 || payCycles > 520) {
        throw new TypeError('Salary allocation input is invalid or too large.');
      }
      const count = rules.length;
      const { wasm, inputPtr, outputPtr, buffer } = ensureScratch(count * 16, count * 16 + 24);
      const input = new Uint32Array(buffer, inputPtr, Math.max(1, count * 4));
      rules.forEach((rule, i) => {
        if (!rule || !Number.isSafeInteger(rule.valueScaled) || !['percent', 'fixed'].includes(rule.mode) || (rule.mode === 'percent' && Math.abs(rule.valueScaled) > 100000000) || (rule.mode === 'fixed' && (rule.valueScaled < 0 || rule.valueScaled > Number.MAX_SAFE_INTEGER))) throw new TypeError('Invalid salary allocation rule at row ' + i + '.');
        writeI64(input, i * 2, rule.valueScaled);
        input[i * 4 + 2] = rule.mode === 'percent' ? 1 : 0;
        input[i * 4 + 3] = 0;
      });
      const summaryPtr = outputPtr + count * 16;
      const status = wasm.pw_salary_allocate(BigInt(baseMinor), BigInt(perCycleBaseMinor), payCycles, perCyclePercentDenominator, inputPtr, count, outputPtr, summaryPtr);
      readStatus(status, 'salary allocation');
      const output = new Uint32Array(buffer, outputPtr, Math.max(1, count * 4));
      const summary = new Uint32Array(buffer, summaryPtr, 6);
      return {
        rows: Array.from({ length: count }, (_, i) => ({ periodMinor: readI64(output, i * 2), perCycleMinor: readI64(output, i * 2 + 1) })),
        allocatedMinor: readI64(summary, 0),
        fixedMinor: readI64(summary, 1),
        percentageScaled: readI64(summary, 2)
      };
    } catch (error) { throw failure('WebAssembly salary-allocation calculation failed: ' + error.message, error); }
  }

  function categoryBuckets(rows, groupCount, bucketCount) {
    try {
      if (!Array.isArray(rows) || rows.length > 1000000 || !Number.isInteger(groupCount) || groupCount < 1 || groupCount > 5000 || !Number.isInteger(bucketCount) || bucketCount < 1 || bucketCount > 12) {
        throw new TypeError('Category comparison input is invalid or too large.');
      }
      const count = rows.length;
      const outputCount = groupCount * bucketCount * 2;
      const { wasm, inputPtr, outputPtr, buffer } = ensureScratch(count * 24, outputCount * 8);
      const input = new Uint32Array(buffer, inputPtr, Math.max(1, count * 6));
      rows.forEach((row, i) => {
        if (!row || !Number.isSafeInteger(row.amountMinor) || !Number.isInteger(row.groupIndex) || !Number.isInteger(row.bucketIndex) || !Number.isInteger(row.periodIndex) || ![1, -1].includes(row.sign)) {
          throw new TypeError('Invalid category comparison transaction at row ' + i + '.');
        }
        writeI64(input, i * 3, row.amountMinor);
        input[i * 6 + 2] = row.groupIndex >>> 0;
        input[i * 6 + 3] = row.bucketIndex >>> 0;
        input[i * 6 + 4] = row.periodIndex >>> 0;
        input[i * 6 + 5] = row.sign >>> 0;
      });
      const status = wasm.pw_category_buckets(inputPtr, count, groupCount, bucketCount, outputPtr);
      readStatus(status, 'category comparison');
      const output = new Uint32Array(buffer, outputPtr, outputCount * 2);
      return Array.from({ length: outputCount }, (_, i) => readI64(output, i));
    } catch (error) { throw failure('WebAssembly category-comparison calculation failed: ' + error.message, error); }
  }

  function cashProjection(openingMinor, deltas) {
    try {
      if (!Array.isArray(deltas) || deltas.length > 1000000) throw new TypeError('Cash projection input is invalid or too large.');
      const count = deltas.length;
      const { wasm, inputPtr, outputPtr, buffer } = ensureScratch(count * 8, 40);
      const input = new Uint32Array(buffer, inputPtr, Math.max(1, count * 2));
      deltas.forEach((value, i) => writeI64(input, i, value));
      const status = wasm.pw_cash_projection(BigInt(openingMinor), inputPtr, count, outputPtr);
      readStatus(status, 'cash projection');
      const output = new Uint32Array(buffer, outputPtr, 10);
      return { endingMinor: readI64(output, 0), minimumMinor: readI64(output, 1), shortageMinor: readI64(output, 2), shortageIndex: readI64(output, 3), minimumIndex: readI64(output, 4) };
    } catch (error) { throw failure('WebAssembly cash projection failed: ' + error.message, error); }
  }

  function ratioRound(amountMinor, numerator, denominator) {
    try {
      if (!Number.isSafeInteger(amountMinor) || !Number.isInteger(numerator) || !Number.isInteger(denominator)) throw new TypeError('Rounded ratio input is invalid.');
      const { wasm, outputPtr, buffer } = ensureScratch(1, 8);
      const status = wasm.pw_ratio_round_minor(BigInt(amountMinor), numerator, denominator, outputPtr);
      readStatus(status, 'rounded monetary ratio');
      return readI64(new Uint32Array(buffer, outputPtr, 2), 0);
    } catch (error) { throw failure('WebAssembly monetary projection failed: ' + error.message, error); }
  }

  function budgetMetrics(categories, transactions, multiplierNumerator, multiplierDenominator, configuredTotalBudgetMinor) {
    try {
      if (!Array.isArray(categories) || categories.length > 5000 || !Array.isArray(transactions) || transactions.length > 1000000 ||
          !Number.isInteger(multiplierNumerator) || multiplierNumerator < 0 || multiplierNumerator > 4000000000 ||
          !Number.isInteger(multiplierDenominator) || multiplierDenominator < 1 || multiplierDenominator > 5200000 ||
          !Number.isSafeInteger(configuredTotalBudgetMinor) || configuredTotalBudgetMinor < 0) {
        throw new TypeError('Budget calculation input is invalid or too large.');
      }
      const categoryBytes = categories.length * 16;
      const transactionBytes = transactions.length * 24;
      const outputBytes = categories.length * 64 + 56;
      const { wasm, inputPtr, outputPtr, buffer } = ensureScratch(categoryBytes + transactionBytes, outputBytes);
      const input = new Uint32Array(buffer, inputPtr, Math.max(1, (categoryBytes + transactionBytes) / 4));
      categories.forEach((category, i) => {
        if (!category || !Number.isSafeInteger(category.monthlyBudgetMinor) || category.monthlyBudgetMinor < 0 ||
            !Number.isSafeInteger(category.salaryAllocationMinor) || category.salaryAllocationMinor < 0) {
          throw new TypeError('Invalid budget category at row ' + i + '.');
        }
        writeI64(input, i * 2, category.monthlyBudgetMinor);
        writeI64(input, i * 2 + 1, category.salaryAllocationMinor);
      });
      const txWordOffset = categoryBytes / 4;
      transactions.forEach((tx, i) => {
        if (!tx || !Number.isSafeInteger(tx.amountMinor) || !Number.isInteger(tx.periodIndex) || ![0, 1].includes(tx.periodIndex) ||
            !Number.isInteger(tx.typeCode) || ![TYPE_CODES.income, TYPE_CODES.expense, TYPE_CODES.refund].includes(tx.typeCode) ||
            !(tx.categoryIndex === null || (Number.isInteger(tx.categoryIndex) && tx.categoryIndex >= 0 && tx.categoryIndex < categories.length))) {
          throw new TypeError('Invalid budget transaction at row ' + i + '.');
        }
        const base = txWordOffset + i * 6;
        writeI64(input, base / 2, tx.amountMinor);
        input[base + 2] = tx.categoryIndex === null ? 0xFFFFFFFF : tx.categoryIndex >>> 0;
        input[base + 3] = tx.periodIndex >>> 0;
        input[base + 4] = tx.typeCode >>> 0;
        input[base + 5] = 0;
      });
      const rowsPtr = outputPtr;
      const summaryPtr = outputPtr + categories.length * 64;
      const status = wasm.pw_budget_metrics(inputPtr, categories.length, inputPtr + categoryBytes, transactions.length,
        multiplierNumerator, multiplierDenominator, BigInt(configuredTotalBudgetMinor), configuredTotalBudgetMinor > 0 ? 1 : 0,
        rowsPtr, summaryPtr);
      readStatus(status, 'budget metrics');
      const output = new Uint32Array(buffer, rowsPtr, Math.max(1, categories.length * 16));
      const summary = new Uint32Array(buffer, summaryPtr, 14);
      return {
        rows: Array.from({ length: categories.length }, (_, i) => ({
          budgetLimitMinor: readI64(output, i * 8),
          salaryAllocationMinor: readI64(output, i * 8 + 1),
          plannedAllocationMinor: readI64(output, i * 8 + 2),
          spentMinor: readI64(output, i * 8 + 3),
          previousSpentMinor: readI64(output, i * 8 + 4),
          remainingMinor: readI64(output, i * 8 + 5)
        })),
        grossExpenseMinor: readI64(summary, 0),
        refundsMinor: readI64(summary, 1),
        actualIncomeMinor: readI64(summary, 2),
        totalBudgetMinor: readI64(summary, 3),
        totalSpentMinor: readI64(summary, 4),
        totalRemainingMinor: readI64(summary, 5),
        categoryBudgetTotalMinor: readI64(summary, 6)
      };
    } catch (error) { throw failure('WebAssembly budget calculation failed: ' + error.message, error); }
  }

  function debtAmortize(debts, monthlyPaymentMinor, strategy) {
    try {
      if (!Array.isArray(debts) || debts.length > 2000 || !Number.isSafeInteger(monthlyPaymentMinor) || monthlyPaymentMinor <= 0 ||
          !['snowball', 'avalanche'].includes(strategy)) throw new TypeError('Debt payoff calculation input is invalid or too large.');
      const count = debts.length;
      const { wasm, inputPtr, outputPtr, buffer } = ensureScratch(count * 16, count * 16 + 24);
      const input = new Uint32Array(buffer, inputPtr, Math.max(1, count * 4));
      debts.forEach((debt, i) => {
        if (!debt || !Number.isSafeInteger(debt.balanceMinor) || debt.balanceMinor < 0 ||
            !Number.isInteger(debt.annualRateBasisPoints) || debt.annualRateBasisPoints < 0 || debt.annualRateBasisPoints > 10000000) {
          throw new TypeError('Invalid debt plan row ' + i + '.');
        }
        writeI64(input, i * 2, debt.balanceMinor);
        input[i * 4 + 2] = debt.annualRateBasisPoints >>> 0;
        input[i * 4 + 3] = 0;
      });
      const summaryPtr = outputPtr + count * 16;
      const status = wasm.pw_debt_amortize(inputPtr, count, BigInt(monthlyPaymentMinor), strategy === 'avalanche' ? 1 : 0, outputPtr, summaryPtr);
      readStatus(status, 'debt amortisation');
      const output = new Uint32Array(buffer, outputPtr, Math.max(1, count * 4));
      const summary = new Uint32Array(buffer, summaryPtr, 6);
      return {
        rows: Array.from({ length: count }, (_, i) => ({ balanceMinor: readI64(output, i * 2), interestMinor: readI64(output, i * 2 + 1) })),
        months: readI64(summary, 0),
        interestMinor: readI64(summary, 1),
        outcome: readI64(summary, 2)
      };
    } catch (error) { throw failure('WebAssembly debt-amortisation calculation failed: ' + error.message, error); }
  }

  function extractMerchant(text) {
    try {
      const bytes = new TextEncoder().encode(String(text || ''));
      if (!bytes.length || bytes.length > 200000) return null;
      const outputCapacity = 128;
      const { wasm, inputPtr, outputPtr, buffer } = ensureScratch(bytes.length, outputCapacity + 8);
      new Uint8Array(buffer, inputPtr, bytes.length).set(bytes);
      const confidencePtr = outputPtr + outputCapacity;
      const directionPtr = confidencePtr + 4;
      const status = wasm.pw_extract_merchant(inputPtr, bytes.length, outputPtr, outputCapacity, confidencePtr, directionPtr);
      if (status === 2) return null;
      readStatus(status, 'merchant extraction');
      const memory = new Uint8Array(buffer, outputPtr, outputCapacity);
      let end = memory.indexOf(0);
      if (end < 0) end = memory.length;
      const name = new TextDecoder().decode(memory.subarray(0, end)).trim();
      const words = new Int32Array(buffer, confidencePtr, 2);
      if (!name || words[0] <= 0) return null;
      return { name, confidence: Math.min(1, words[0] / 100), direction: words[1] === 1 ? 'outgoing' : words[1] === 2 ? 'incoming' : 'unknown', source: 'cpp-wasm' };
    } catch (error) {
      if (error && error.pocketWiseFinancialCore) throw error;
      throw failure('WebAssembly merchant extraction failed: ' + (error && error.message ? error.message : 'unknown engine error'), error);
    }
  }

  function writeCString(view, base, capacity, value) {
    const bytes = new TextEncoder().encode(String(value == null ? '' : value));
    if (bytes.length >= capacity) throw new RangeError('Text value exceeds the C++ engine field capacity.');
    new Uint8Array(view.buffer, base, capacity).fill(0);
    new Uint8Array(view.buffer, base, bytes.length).set(bytes);
  }

  function merchantLookup(merchant) {
    const bytes = new TextEncoder().encode(String(merchant || ''));
    if (!bytes.length || bytes.length > 4096) return null;
    try {
      const categoryCapacity = 32, canonicalCapacity = 128;
      const { wasm, inputPtr, outputPtr, buffer } = ensureScratch(bytes.length, categoryCapacity + canonicalCapacity + 4);
      new Uint8Array(buffer, inputPtr, bytes.length).set(bytes);
      const canonicalPtr = outputPtr + categoryCapacity;
      const confidencePtr = canonicalPtr + canonicalCapacity;
      const status = wasm.pw_merchant_lookup(inputPtr, bytes.length, outputPtr, categoryCapacity, canonicalPtr, canonicalCapacity, confidencePtr);
      if (status === 2) return null;
      readStatus(status, 'merchant categorisation');
      const read = (ptr, size) => {
        const view = new Uint8Array(buffer, ptr, size);
        const end = view.indexOf(0);
        return new TextDecoder().decode(view.subarray(0, end < 0 ? size : end));
      };
      const confidence = new Int32Array(buffer, confidencePtr, 1)[0];
      const category = read(outputPtr, categoryCapacity), canonical = read(canonicalPtr, canonicalCapacity);
      return category && canonical ? { category, canonical, confidence: Math.max(0, Math.min(1, confidence / 100)), source: 'builtin-cpp-wasm' } : null;
    } catch (error) {
      if (error && error.pocketWiseFinancialCore) throw error;
      throw failure('WebAssembly merchant categorisation failed: ' + (error && error.message ? error.message : 'unknown engine error'), error);
    }
  }

  function containsText(text, needle) {
    const source = new TextEncoder().encode(String(text || ''));
    const pattern = new TextEncoder().encode(String(needle || ''));
    if (!source.length || !pattern.length || source.length > 200000 || pattern.length > 512) return false;
    try {
      const { wasm, inputPtr, outputPtr, buffer } = ensureScratch(source.length + pattern.length, 4);
      new Uint8Array(buffer, inputPtr, source.length).set(source);
      new Uint8Array(buffer, inputPtr + source.length, pattern.length).set(pattern);
      return wasm.pw_contains_text(inputPtr, source.length, inputPtr + source.length, pattern.length) === 1;
    } catch (error) {
      if (error && error.pocketWiseFinancialCore) throw error;
      throw failure('WebAssembly learned-rule matching failed: ' + error.message, error);
    }
  }

  function findDuplicate(rows, candidate) {
    if (!Array.isArray(rows) || rows.length > 100000 || !candidate) throw new TypeError('Duplicate detection input is invalid.');
    const rowBytes = 144;
    try {
      const { wasm, inputPtr, outputPtr, buffer } = ensureScratch((rows.length + 1) * rowBytes, 4);
      const view = new DataView(buffer);
      const writeRow = (ptr, row) => {
        const amount = Number(row.amountMinor);
        if (!Number.isSafeInteger(amount) || amount < 0) throw new TypeError('Duplicate detection amount must be exact integer paise.');
        view.setBigInt64(ptr, BigInt(amount), true);
        view.setInt32(ptr + 8, Number(row.dateKey) | 0, true);
        writeCString(view, ptr + 12, 128, row.merchant || '');
      };
      rows.forEach((row, index) => writeRow(inputPtr + index * rowBytes, row));
      writeRow(inputPtr + rows.length * rowBytes, candidate);
      const status = wasm.pw_find_duplicate(inputPtr, rows.length, inputPtr + rows.length * rowBytes, outputPtr);
      if (status === 2) return -1;
      readStatus(status, 'duplicate detection');
      return new Int32Array(buffer, outputPtr, 1)[0];
    } catch (error) {
      if (error && error.pocketWiseFinancialCore) throw error;
      throw failure('WebAssembly duplicate detection failed: ' + error.message, error);
    }
  }

  function filterTransactions(rows, filters) {
    if (!Array.isArray(rows) || rows.length > 100000) throw new TypeError('Activity search input is invalid.');
    const rowBytes = 792, filterBytes = 240;
    try {
      const { wasm, inputPtr, outputPtr, buffer } = ensureScratch(rows.length * rowBytes + filterBytes, rows.length || 1);
      const view = new DataView(buffer);
      const enc = new TextEncoder();
      const writeText = (ptr, cap, value) => {
        const bytes = enc.encode(String(value == null ? '' : value));
        if (bytes.length >= cap) throw new RangeError('Search text exceeds the C++ engine field capacity.');
        new Uint8Array(buffer, ptr, cap).fill(0);
        new Uint8Array(buffer, ptr, bytes.length).set(bytes);
      };
      rows.forEach((row, i) => {
        const base = inputPtr + i * rowBytes;
        const amount = Number(row.amountMinor || 0);
        if (!Number.isSafeInteger(amount)) throw new TypeError('Activity amount must be exact integer paise.');
        view.setBigInt64(base, BigInt(amount), true);
        view.setInt32(base + 8, Number(row.dateKey) || 0, true);
        view.setInt32(base + 12, Number.isInteger(row.accountIndex) ? row.accountIndex : -1, true);
        view.setInt32(base + 16, Number.isInteger(row.categoryIndex) ? row.categoryIndex : -1, true);
        view.setInt32(base + 20, Number(row.typeCode) || 0, true);
        writeText(base + 24, 512, row.searchText || '');
        writeText(base + 536, 256, Array.isArray(row.tags) ? row.tags.join(' ') : (row.tags || ''));
      });
      const fp = inputPtr + rows.length * rowBytes;
      const min = filters && filters.minMinor != null ? Number(filters.minMinor) : 0;
      const max = filters && filters.maxMinor != null ? Number(filters.maxMinor) : 0;
      if ((filters && filters.minMinor != null && !Number.isSafeInteger(min)) || (filters && filters.maxMinor != null && !Number.isSafeInteger(max))) throw new TypeError('Amount filter must be exact integer paise.');
      view.setBigInt64(fp, BigInt(min), true);
      view.setBigInt64(fp + 8, BigInt(max), true);
      view.setInt32(fp + 16, filters && filters.minMinor != null ? 1 : 0, true);
      view.setInt32(fp + 20, filters && filters.maxMinor != null ? 1 : 0, true);
      view.setInt32(fp + 24, filters && Number.isInteger(filters.accountIndex) ? filters.accountIndex : -1, true);
      view.setInt32(fp + 28, filters && Number.isInteger(filters.categoryIndex) ? filters.categoryIndex : -1, true);
      view.setInt32(fp + 32, filters && Number.isInteger(filters.typeCode) ? filters.typeCode : 0, true);
      view.setInt32(fp + 36, filters && Number(filters.dateFrom) || 0, true);
      view.setInt32(fp + 40, filters && Number(filters.dateTo) || 0, true);
      writeText(fp + 44, 128, filters && filters.query || '');
      writeText(fp + 172, 64, filters && filters.tag || '');
      const status = wasm.pw_filter_transactions(inputPtr, rows.length, fp, outputPtr);
      readStatus(status, 'activity filtering');
      return Array.from(new Uint8Array(buffer, outputPtr, rows.length));
    } catch (error) {
      if (error && error.pocketWiseFinancialCore) throw error;
      throw failure('WebAssembly activity filtering failed: ' + error.message, error);
    }
  }

  function nextRecurrence(dateKey, frequency, anchorDay) {
    const code = frequency === 'weekly' ? 1 : frequency === 'monthly' ? 2 : frequency === 'yearly' ? 3 : 0;
    if (!code) throw new TypeError('Unsupported recurring frequency.');
    try {
      const { wasm, inputPtr, outputPtr, buffer } = ensureScratch(4, 4);
      const status = wasm.pw_next_recurrence(Number(dateKey) || 0, code, Number(anchorDay) || 0, outputPtr);
      readStatus(status, 'recurrence date calculation');
      return new DataView(buffer).getInt32(outputPtr, true);
    } catch (error) {
      if (error && error.pocketWiseFinancialCore) throw error;
      throw failure('WebAssembly recurrence calculation failed: ' + error.message, error);
    }
  }

  function orderProviders(candidates, nowMs) {
    if (!Array.isArray(candidates) || candidates.length > 64) throw new TypeError('Provider route list is invalid or too large.');
    if (!candidates.length) return [];
    try {
      const { wasm, inputPtr, outputPtr, buffer } = ensureScratch(candidates.length * 40, candidates.length * 4);
      const view = new DataView(buffer);
      candidates.forEach((candidate, index) => {
        if (!candidate || !Number.isInteger(candidate.id) || candidate.id < 0 || candidate.id > 0xFFFFFFFF ||
            !Number.isInteger(candidate.priority) || !Number.isSafeInteger(candidate.cooldownUntilMs || 0)) {
          throw new TypeError('Invalid provider route at index ' + index + '.');
        }
        const base = inputPtr + index * 40;
        const health = candidate.health || {};
        let flags = 0;
        if (candidate.supported !== false) flags |= 1;
        if (candidate.available !== false) flags |= 2;
        if (candidate.enabled !== false) flags |= 4;
        view.setUint32(base, candidate.id >>> 0, true);
        view.setInt32(base + 4, candidate.priority | 0, true);
        view.setUint32(base + 8, flags >>> 0, true);
        view.setUint32(base + 12, Math.max(0, Number(health.consecutiveFailures) || 0) >>> 0, true);
        view.setUint32(base + 16, Math.max(0, Number(health.averageLatencyMs) || 0) >>> 0, true);
        view.setUint32(base + 20, Math.max(0, Number(health.lastOutcome) || 0) >>> 0, true);
        view.setBigUint64(base + 24, BigInt(Math.max(0, Math.trunc(candidate.cooldownUntilMs || health.cooldownUntilMs || 0))), true);
        view.setUint32(base + 32, candidate.fallbackAffinity ? 1 : 0, true);
      });
      const status = wasm.pw_reliability_order(inputPtr, candidates.length, BigInt(Math.max(0, Math.trunc(nowMs || Date.now()))), outputPtr);
      if (status < 0 || status > candidates.length) throw new Error('C++ provider route selection returned an invalid count.');
      const count = status;
      const indices = new Uint32Array(buffer, outputPtr, count);
      return Array.from(indices, index => candidates[index]).filter(Boolean);
    } catch (error) {
      if (error && error.pocketWiseFinancialCore) throw error;
      throw failure('WebAssembly provider route selection failed: ' + (error && error.message ? error.message : 'unknown engine error'), error);
    }
  }

  function updateProviderHealth(health, outcome, latencyMs, nowMs, baseCooldownMs, maxCooldownMs) {
    const value = Object.assign({ consecutiveFailures: 0, successCount: 0, failureCount: 0, averageLatencyMs: 0, lastOutcome: 0, circuitState: 0, cooldownUntilMs: 0 }, health || {});
    try {
      const { wasm, inputPtr, buffer } = ensureScratch(32, 4);
      const view = new DataView(buffer);
      view.setUint32(inputPtr, value.consecutiveFailures >>> 0, true);
      view.setUint32(inputPtr + 4, value.successCount >>> 0, true);
      view.setUint32(inputPtr + 8, value.failureCount >>> 0, true);
      view.setUint32(inputPtr + 12, value.averageLatencyMs >>> 0, true);
      view.setUint32(inputPtr + 16, value.lastOutcome >>> 0, true);
      view.setUint32(inputPtr + 20, value.circuitState >>> 0, true);
      view.setBigUint64(inputPtr + 24, BigInt(Math.max(0, Math.trunc(value.cooldownUntilMs))), true);
      const status = wasm.pw_reliability_update(inputPtr, outcome >>> 0, Math.max(0, Math.trunc(latencyMs || 0)) >>> 0,
        BigInt(Math.max(0, Math.trunc(nowMs || Date.now()))), Math.max(1, Math.trunc(baseCooldownMs || 30000)) >>> 0,
        Math.max(1, Math.trunc(maxCooldownMs || 21600000)) >>> 0);
      readStatus(status, 'provider health update');
      return {
        consecutiveFailures: view.getUint32(inputPtr, true), successCount: view.getUint32(inputPtr + 4, true),
        failureCount: view.getUint32(inputPtr + 8, true), averageLatencyMs: view.getUint32(inputPtr + 12, true),
        lastOutcome: view.getUint32(inputPtr + 16, true), circuitState: view.getUint32(inputPtr + 20, true),
        cooldownUntilMs: Number(view.getBigUint64(inputPtr + 24, true))
      };
    } catch (error) {
      if (error && error.pocketWiseFinancialCore) throw error;
      throw failure('WebAssembly provider health update failed: ' + (error && error.message ? error.message : 'unknown engine error'), error);
    }
  }

  function aggregate(transactions, toMinor, bucketFor) {
    if (!engine) {
      throw failure(loadError
        ? 'The required WebAssembly financial engine is unavailable. Reload or reinstall Aruvi after its engine assets are available.'
        : 'The required WebAssembly financial engine has not finished loading.');
    }
    if (!Array.isArray(transactions)) throw failure('Financial engine input must be an array of transactions.');
    if (transactions.length > 1000000) throw failure('Financial engine input exceeds the supported limit of 1,000,000 transactions.');
    if (typeof toMinor !== 'function') throw failure('Financial engine amount converter is missing.');

    try {
      engine.pw_reset();
      const count = transactions.length;
      const inputBytes = Math.max(1, count * 16);
      const inputPtr = engine.pw_alloc(inputBytes);
      const outputPtr = engine.pw_alloc(RESULT_BYTES);
      if (!inputPtr || !outputPtr) throw new Error('WebAssembly linear-memory allocation failed.');
      const inputEnd = inputPtr + inputBytes;
      const outputEnd = outputPtr + RESULT_BYTES;
      if (!Number.isSafeInteger(inputEnd) || !Number.isSafeInteger(outputEnd) || inputEnd > 0xFFFFFFFF || outputEnd > 0xFFFFFFFF) {
        throw new Error('WebAssembly memory address calculation overflowed.');
      }

      const memory = engine.memory;
      const requiredEnd = Math.max(inputEnd, outputEnd);
      if (requiredEnd > memory.buffer.byteLength) {
        const pages = Math.ceil((requiredEnd - memory.buffer.byteLength) / 65536);
        memory.grow(pages);
      }
      if (requiredEnd > memory.buffer.byteLength) throw new Error('WebAssembly memory could not be expanded for this calculation.');

      const buffer = memory.buffer;
      const words = new Uint32Array(buffer, inputPtr, count * 4);
      let absoluteTotal = 0;
      for (let i = 0; i < count; i += 1) {
        const tx = transactions[i];
        if (!tx || typeof tx !== 'object') throw new TypeError('Transaction row ' + i + ' is not a valid object.');
        const amount = Number(toMinor(tx.amount));
        if (!Number.isSafeInteger(amount)) throw new RangeError('Transaction row ' + i + ' is outside the safe integer-paise range.');
        absoluteTotal += Math.abs(amount);
        // JS-facing rupee numbers cannot preserve a total larger than MAX_SAFE_INTEGER paise.
        // Stop rather than silently substituting a JavaScript calculation.
        if (!Number.isSafeInteger(absoluteTotal)) throw new RangeError('This transaction batch exceeds the exact paise range supported by Aruvi.');

        const type = TYPE_CODES[String(tx.type || '')] || 0;
        let bucket = 0;
        if (typeof bucketFor === 'function') {
          const rawBucket = Number(bucketFor(tx));
          if (!Number.isInteger(rawBucket) || rawBucket < 0 || rawBucket > 6) {
            throw new TypeError('Transaction row ' + i + ' produced an invalid cash-flow bucket.');
          }
          bucket = rawBucket;
        }
        // Pack signed safe-integer paise into the C++ int64_t ABI without BigInt marshalling.
        words[i * 4] = amount >>> 0;
        words[i * 4 + 1] = Math.floor(amount / 4294967296) >>> 0;
        words[i * 4 + 2] = type;
        words[i * 4 + 3] = bucket;
      }

      const status = engine.pw_aggregate(inputPtr, count, outputPtr);
      if (status !== 0) throw new Error('C++ financial engine rejected the calculation (status ' + status + ').');
      const statusView = new Uint32Array(buffer, outputPtr + 188, 1);
      if (statusView[0] !== 0) throw new Error('C++ financial engine returned a non-zero result status.');
      const values = new Uint32Array(buffer, outputPtr, RESULT_FIELDS * 2);
      const numbers = Array.from({ length: RESULT_FIELDS }, (_, index) => {
        const high = values[index * 2 + 1] | 0;
        const number = high * 4294967296 + values[index * 2];
        return Number.isSafeInteger(number) ? number : null;
      });
      if (numbers.some(value => value === null)) throw new RangeError('C++ financial engine returned a value outside JavaScript exact-integer range.');
      const countView = new Uint32Array(buffer, outputPtr + 184, 1);
      if (countView[0] !== count) throw new Error('C++ financial engine returned an inconsistent transaction count.');

      return {
        totalsPaise: {
          income: numbers[0], grossExpenses: numbers[1], refunds: numbers[2], borrowed: numbers[3],
          lent: numbers[4], repaymentsReceived: numbers[5], debtRepayments: numbers[6],
          operatingCashFlow: numbers[7], netCashMovement: numbers[8]
        },
        cashFlowPaise: {
          salary: numbers[9], otherIncome: numbers[10], refunds: numbers[11], repaymentsReceived: numbers[12],
          borrowed: numbers[13], otherInflow: numbers[14], everydayExpenses: numbers[15], bills: numbers[16],
          shopping: numbers[17], subscriptions: numbers[18], debtRepayments: numbers[19], moneyLent: numbers[20],
          otherOutflow: numbers[21], internalTransfers: numbers[22]
        },
        transactionCount: countView[0]
      };
    } catch (error) {
      if (error && error.pocketWiseFinancialCore) throw error;
      throw failure('WebAssembly financial calculation failed: ' + (error && error.message ? error.message : 'unknown engine error') + '. No JavaScript calculation was substituted.', error);
    }
  }

  return Object.freeze({
    load,
    isReady: () => !!engine,
    getLoadError: () => loadError,
    aggregate,
    equalSplit, percentageSplit, amountSplit, sum, cashDelta, accountBalance, debtRemaining,
    salaryAllocate, categoryBuckets, cashProjection, ratioRound, budgetMetrics, debtAmortize,
    extractMerchant, merchantLookup, containsText, findDuplicate, filterTransactions, nextRecurrence, orderProviders, updateProviderHealth,
    typeCodes: TYPE_CODES
  });
});
