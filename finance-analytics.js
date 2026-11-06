/* Aruvi financial analytics engine.
 * Pure calculations only: no DOM, storage, network, or mutation of source records.
 * Amounts are accumulated as integer paise; public result amounts are INR numbers.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.PocketWiseAnalytics = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const DAY_MS = 86400000;
  const TYPES = new Set(['week', 'month', 'year', 'custom']);
  const minor = value => {
    const number = Number(value);
    if (!Number.isFinite(number)) return 0;
    const rounded = Math.round((number + Math.sign(number) * Number.EPSILON) * 100);
    return Number.isSafeInteger(rounded) ? rounded : Math.sign(rounded) * Number.MAX_SAFE_INTEGER;
  };
  const major = value => Number((value / 100).toFixed(2));
  const sum = values => major(financialEngine().sum(values.map(minor)));
  const validISO = value => /^\d{4}-\d{2}-\d{2}$/.test(String(value || '')) && (() => {
    const [y, m, d] = String(value).split('-').map(Number);
    const date = new Date(y, m - 1, d, 12);
    return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d;
  })();
  const dateOf = value => {
    const raw = String(value || '');
    if (!validISO(raw)) return null;
    const [y, m, d] = raw.split('-').map(Number);
    return new Date(y, m - 1, d, 12);
  };
  const iso = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  const addDays = (value, amount) => { const d = dateOf(value); if (!d) return ''; d.setDate(d.getDate() + amount); return iso(d); };
  function addRecurringDate(value, repeat, anchorDay) {
    const d = dateOf(value); if (!d) return '';
    const day = clampDay(d.getFullYear(), d.getMonth(), anchorDay || d.getDate());
    if (repeat === 'weekly') d.setDate(d.getDate() + 7);
    else if (repeat === 'monthly') { d.setDate(1); d.setMonth(d.getMonth() + 1); d.setDate(clampDay(d.getFullYear(), d.getMonth(), anchorDay || day)); }
    else if (repeat === 'yearly' || repeat === 'year') { const month = d.getMonth(), year = d.getFullYear() + 1; d.setFullYear(year, month, clampDay(year, month, anchorDay || day)); }
    else return '';
    return iso(d);
  }
  const compareDate = (a, b) => String(a || '').localeCompare(String(b || ''));
  const clampDay = (year, month, day) => Math.min(Math.max(1, Number(day) || 1), new Date(year, month + 1, 0).getDate());
  const monthDate = (year, month, day) => iso(new Date(year, month, clampDay(year, month, day), 12));
  const monthBounds = value => {
    const d = dateOf(value);
    if (!d) return null;
    const start = iso(new Date(d.getFullYear(), d.getMonth(), 1, 12));
    const end = iso(new Date(d.getFullYear(), d.getMonth() + 1, 0, 12));
    return { start, end };
  };
  const yearBounds = value => {
    const d = dateOf(value);
    if (!d) return null;
    return { start: `${d.getFullYear()}-01-01`, end: `${d.getFullYear()}-12-31` };
  };
  const weekBounds = value => {
    const d = dateOf(value);
    if (!d) return null;
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    const start = iso(d);
    d.setDate(d.getDate() + 6);
    return { start, end: iso(d) };
  };
  function periodRange(type, anchor, customStart, customEnd) {
    const safeType = TYPES.has(type) ? type : 'month';
    if (safeType === 'custom') {
      if (!validISO(customStart) || !validISO(customEnd) || customStart > customEnd) return null;
      return { start: customStart, end: customEnd, type: safeType };
    }
    const bounds = safeType === 'week' ? weekBounds(anchor) : safeType === 'year' ? yearBounds(anchor) : monthBounds(anchor);
    return bounds ? { ...bounds, type: safeType } : null;
  }
  function previousRange(range) {
    if (!range) return null;
    if (range.type === 'week') return periodRange('week', addDays(range.start, -7));
    if (range.type === 'year') return periodRange('year', `${Number(range.start.slice(0, 4)) - 1}-06-15`);
    if (range.type === 'month') {
      const d = dateOf(range.start); d.setMonth(d.getMonth() - 1); return periodRange('month', iso(d));
    }
    const days = Math.max(1, Math.round((dateOf(range.end) - dateOf(range.start)) / DAY_MS) + 1);
    const end = addDays(range.start, -1);
    return { start: addDays(end, -(days - 1)), end, type: 'custom' };
  }
  function financialEngine() {
    const bridge = typeof globalThis !== 'undefined' ? globalThis.PocketWiseWasm : null;
    if (!bridge || ['cashDelta','accountBalance','sum','salaryAllocate','categoryBuckets','cashProjection','ratioRound'].some(name => typeof bridge[name] !== 'function')) {
      const error = new Error('The required C++ WebAssembly financial engine does not expose its complete calculation interface.');
      error.name = 'PocketWiseFinancialEngineError';
      throw error;
    }
    return bridge;
  }
  function cashDeltaMinor(tx) {
    const bridge = financialEngine();
    const code = bridge.typeCodes[String(tx && tx.type || '')] || 0;
    return bridge.cashDelta(minor(tx && tx.amount), code);
  }
  const txWithin = (tx, start, end) => validISO(tx && tx.date) && tx.date >= start && tx.date <= end;
  function accountBalanceAt(state, account, asOf) {
    const accountId = account.id;
    const openingDate = validISO(account.openingBalanceDate) ? account.openingBalanceDate : null;
    let complete = true;
    if (openingDate && asOf < openingDate) return { balanceMinor: null, complete: false, reason: `The opening date for ${account.name || account.id} is after the reporting date.` };
    const txs = Array.isArray(state.transactions) ? state.transactions : [];
    const accountTxs = txs.filter(tx => validISO(tx.date) && tx.date <= asOf && (tx.accountId === accountId || (tx.type === 'transfer' && tx.toAccountId === accountId)));
    // A zero opening amount does not prove that an account had no earlier
    // transactions. Require an explicit opening-balance date for verified history.
    if (!openingDate) complete = false;
    const bridge = financialEngine();
    const rows = accountTxs.filter(tx => !openingDate || tx.date >= openingDate).map(tx => ({
      amountMinor: minor(tx.amount),
      typeCode: bridge.typeCodes[String(tx.type || '')] || 0,
      fromAccount: tx.accountId === accountId,
      toAccount: tx.type === 'transfer' && tx.toAccountId === accountId
    }));
    const balance = bridge.accountBalance(minor(account.openingBalance || 0), rows);
    return { balanceMinor: balance, complete, reason: complete ? '' : `The opening date or complete pre-history for ${account.name || account.id} is not recorded.` };
  }
  function consolidatedBalanceAt(state, asOf) {
    const accounts = (Array.isArray(state.accounts) ? state.accounts : []).map(account => ({
      account, ...accountBalanceAt(state, account, asOf)
    }));
    const complete = accounts.every(row => row.complete && row.balanceMinor !== null);
    const balanceMinor = financialEngine().sum(accounts.map(row => row.balanceMinor === null ? 0 : row.balanceMinor));
    return { amount: major(balanceMinor), balanceMinor, complete, accounts };
  }
  function consolidatedOpeningBalanceAt(state, startDate) {
    const accounts = (Array.isArray(state.accounts) ? state.accounts : []).map(account => {
      if (validISO(account.openingBalanceDate) && account.openingBalanceDate === startDate) {
        return { account, balanceMinor: minor(account.openingBalance || 0), complete: true, reason: '' };
      }
      return { account, ...accountBalanceAt(state, account, addDays(startDate, -1)) };
    });
    const complete = accounts.every(row => row.complete && row.balanceMinor !== null);
    const balanceMinor = financialEngine().sum(accounts.map(row => row.balanceMinor === null ? 0 : row.balanceMinor));
    return { amount: major(balanceMinor), balanceMinor, complete, accounts };
  }
  function wasmAggregate(txs, bucketFor) {
    const bridge = typeof globalThis !== 'undefined' ? globalThis.PocketWiseWasm : null;
    if (!bridge || typeof bridge.aggregate !== 'function') {
      const error = new Error('The required WebAssembly financial engine does not expose its aggregation interface.');
      error.name = 'PocketWiseFinancialEngineError';
      throw error;
    }
    return bridge.aggregate(txs, minor, bucketFor);
  }
  function aggregateTransactions(txs) {
    if (!Array.isArray(txs)) throw new TypeError('Transactions must be an array.');
    const result = wasmAggregate(txs);
    const values = result.totalsPaise;
    return {
      income: major(values.income), grossExpenses: major(values.grossExpenses), refunds: major(values.refunds),
      expenses: major(values.grossExpenses), borrowed: major(values.borrowed), lent: major(values.lent),
      repaymentsReceived: major(values.repaymentsReceived), debtRepayments: major(values.debtRepayments),
      operatingCashFlow: major(values.operatingCashFlow), netCashMovement: major(values.netCashMovement),
      cashMovementMinor: values.netCashMovement, transactionCount: result.transactionCount
    };
  }
  function calculatePeriod(state, options) {
    const range = options && options.range ? options.range : periodRange(options && options.type, options && options.anchor, options && options.customStart, options && options.customEnd);
    if (!range) return null;
    const today = options && validISO(options.today) ? options.today : iso(new Date());
    const effectiveEnd = range.end > today ? today : range.end;
    const txs = (state.transactions || []).filter(tx => txWithin(tx, range.start, effectiveEnd));
    const beforeDate = addDays(range.start, -1);
    const opening = consolidatedOpeningBalanceAt(state, range.start);
    const closing = consolidatedBalanceAt(state, effectiveEnd);
    const totals = aggregateTransactions(txs);
    const previous = previousRange(range);
    const previousEnd = previous && previous.end > today ? today : previous && previous.end;
    const previousTxs = previous ? (state.transactions || []).filter(tx => txWithin(tx, previous.start, previousEnd)) : [];
    const previousTotals = aggregateTransactions(previousTxs);
    const previousClosing = previous ? consolidatedBalanceAt(state, previousEnd) : null;
    const earliest = (state.transactions || []).filter(tx => validISO(tx.date)).reduce((minDate, tx) => !minDate || tx.date < minDate ? tx.date : minDate, '');
    const openingCoverage = opening.complete;
    const closingCoverage = closing.complete;
    const historyCoverage = openingCoverage && closingCoverage;
    return {
      range: { ...range, effectiveEnd },
      openingBalance: opening.amount,
      closingBalance: closing.amount,
      openingBalanceComplete: openingCoverage,
      closingBalanceComplete: closingCoverage,
      historyComplete: historyCoverage,
      historyNote: historyCoverage
        ? 'Calculated from recorded opening balances and transactions. Check that all past transactions have been entered.'
        : 'Historical balance is provisional: at least one account has an undated opening balance or incomplete pre-history. Add its opening-balance date or review the records.',
      ...totals,
      reconciliationDifference: major((closing.balanceMinor - opening.balanceMinor) - totals.cashMovementMinor),
      previous: {
        range: previous,
        ...previousTotals,
        closingBalance: previousClosing ? previousClosing.amount : null,
        closingBalanceComplete: !!previousClosing && previousClosing.complete
      },
      delta: {
        income: major(minor(totals.income) - minor(previousTotals.income)),
        expenses: major(minor(totals.expenses) - minor(previousTotals.expenses)),
        netCashMovement: major(totals.cashMovementMinor - previousTotals.cashMovementMinor),
        closingBalance: previousClosing ? major(closing.balanceMinor - previousClosing.balanceMinor) : null
      },
      percentage: {
        income: previousTotals.income ? (totals.income - previousTotals.income) / previousTotals.income * 100 : null,
        expenses: previousTotals.expenses ? (totals.expenses - previousTotals.expenses) / previousTotals.expenses * 100 : null,
        netCashMovement: previousTotals.netCashMovement ? (totals.netCashMovement - previousTotals.netCashMovement) / Math.abs(previousTotals.netCashMovement) * 100 : null
      },
      earliestRecordedTransaction: earliest,
      transactions: txs
    };
  }
  function activityName(state, tx) {
    const activity = (state.activities || []).find(item => item.id === tx.activityId);
    return String(activity && activity.name || 'Other');
  }
  function cashFlowStatement(state, range) {
    const txs = (state.transactions || []).filter(tx => txWithin(tx, range.start, range.end));
    const activityNameFor = tx => activityName(state, tx).toLowerCase();
    const inflow = { salary: 0, otherIncome: 0, refunds: 0, repaymentsReceived: 0, borrowed: 0, other: 0 };
    const outflow = { everydayExpenses: 0, bills: 0, shopping: 0, subscriptions: 0, debtRepayments: 0, moneyLent: 0, other: 0 };
    let internalTransfers = 0;
    const wasmBuckets = wasmAggregate(txs, tx => {
      const name = activityNameFor(tx);
      if (tx.type === 'income') return (/salary|wage|payroll/i.test(name) || tx.activityId === 'salary') ? 1 : 2;
      if (tx.type === 'expense') {
        if (/bill|rent|utility|insurance|electric|water/i.test(name)) return 4;
        if (/shopping|purchase|retail/i.test(name)) return 5;
        if (/subscription|membership|streaming/i.test(name)) return 6;
        return 3;
      }
      return 0;
    });
    const c = wasmBuckets.cashFlowPaise;
    inflow.salary = c.salary; inflow.otherIncome = c.otherIncome; inflow.refunds = c.refunds;
    inflow.repaymentsReceived = c.repaymentsReceived; inflow.borrowed = c.borrowed; inflow.other = c.otherInflow;
    outflow.everydayExpenses = c.everydayExpenses; outflow.bills = c.bills; outflow.shopping = c.shopping;
    outflow.subscriptions = c.subscriptions; outflow.debtRepayments = c.debtRepayments;
    outflow.moneyLent = c.moneyLent; outflow.other = c.otherOutflow;
    internalTransfers = c.internalTransfers;
    const totalInflows = financialEngine().sum(Object.values(inflow));
    const totalOutflows = financialEngine().sum(Object.values(outflow));
    const opening = consolidatedOpeningBalanceAt(state, range.start);
    const closing = consolidatedBalanceAt(state, range.end);
    const net = financialEngine().sum([totalInflows, -totalOutflows]);
    return {
      range, openingBalance: opening.amount, closingBalance: closing.amount,
      openingComplete: opening.complete, closingComplete: closing.complete,
      inflows: Object.fromEntries(Object.entries(inflow).map(([k, v]) => [k, major(v)])),
      outflows: Object.fromEntries(Object.entries(outflow).map(([k, v]) => [k, major(v)])),
      totalInflows: major(totalInflows), totalOutflows: major(totalOutflows),
      netCashMovement: major(net), internalTransfers: major(internalTransfers),
      reconciliationDifference: major(financialEngine().sum([closing.balanceMinor, -opening.balanceMinor, -net])),
      transactions: txs
    };
  }
  function debtRemainingAt(state, debt, asOf) {
    if (!validISO(debt.date) || debt.date > asOf) return 0;
    const repayType = debt.direction === 'borrowed' ? 'repay_out' : debt.direction === 'lent' ? 'repay_in' : '';
    const repayments = (state.transactions || []).filter(tx => tx.debtId === debt.id && tx.type === repayType && validISO(tx.date) && tx.date >= debt.date && tx.date <= asOf).map(tx => minor(tx.amount));
    return financialEngine().debtRemaining(minor(debt.amount), repayments);
  }
  function balanceSheet(state, asOf) {
    const rows = (state.accounts || []).map(account => ({ account, ...accountBalanceAt(state, account, asOf) }));
    const cashAssets = financialEngine().sum(rows.filter(row => row.balanceMinor !== null && row.balanceMinor >= 0).map(row => row.balanceMinor));
    const accountLiabilities = financialEngine().sum(rows.filter(row => row.balanceMinor !== null && row.balanceMinor < 0).map(row => -row.balanceMinor));
    const receivables = [], debtsPayable = [];
    (state.debts || []).forEach(debt => {
      const outstanding = debtRemainingAt(state, debt, asOf);
      if (!outstanding) return;
      const item = { id: debt.id, person: debt.person || 'Unspecified', amount: major(outstanding), due: debt.due || '' };
      if (debt.direction === 'lent') receivables.push(item); else debtsPayable.push(item);
    });
    const receivableMinor = financialEngine().sum(receivables.map(d => minor(d.amount)));
    const payableMinor = financialEngine().sum(debtsPayable.map(d => minor(d.amount)));
    const assetsMinor = financialEngine().sum([cashAssets, receivableMinor]);
    const liabilitiesMinor = financialEngine().sum([accountLiabilities, payableMinor]);
    return {
      asOf,
      accounts: rows.map(row => ({ id: row.account.id, name: row.account.name || row.account.id, type: row.account.type || 'other', amount: row.balanceMinor === null ? null : major(row.balanceMinor), complete: row.complete })),
      cash: major(cashAssets), receivables: major(receivableMinor), liabilitiesFromAccounts: major(accountLiabilities), debtsPayable: major(payableMinor),
      receivablesList: receivables, debtsPayableList: debtsPayable,
      totalAssets: major(assetsMinor), totalLiabilities: major(liabilitiesMinor), netWorth: major(financialEngine().sum([assetsMinor, -liabilitiesMinor])),
      complete: rows.every(row => row.complete && row.balanceMinor !== null),
      coverageNote: rows.every(row => row.complete && row.balanceMinor !== null)
        ? 'Includes recorded account balances and tracked lending/borrowing only. External assets and liabilities are not included unless entered in Aruvi.'
        : 'Account position is provisional because one or more opening-balance dates or pre-history records are missing. External assets and liabilities are not included unless entered.'
    };
  }
  function compareCategories(state, type, anchor, selectedRange) {
    let current, previous, labels;
    const supplied = selectedRange && validISO(selectedRange.start) && validISO(selectedRange.end) ? selectedRange : null;
    if (type === 'custom' || (supplied && supplied.type === 'custom')) {
      type = 'custom';
      current = periodRange('custom', anchor, supplied && supplied.start, supplied && (supplied.effectiveEnd || supplied.end));
      previous = current ? previousRange(current) : null;
      labels = ['Period total'];
    } else if (type === 'week') {
      current = weekBounds(anchor);
      if (current && supplied) current.end = supplied.effectiveEnd || supplied.end;
      const elapsed = current ? Math.max(1, Math.round((dateOf(current.end) - dateOf(current.start)) / DAY_MS) + 1) : 7;
      previous = current ? { start: addDays(current.start, -7), end: addDays(addDays(current.start, -7), elapsed - 1), type: 'week' } : null;
      labels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    } else if (type === 'year') {
      current = yearBounds(anchor);
      if (current && supplied) current.end = supplied.effectiveEnd || supplied.end;
      if (current) {
        const priorYear = Number(current.start.slice(0, 4)) - 1;
        const endDate = dateOf(current.end);
        previous = { start: `${priorYear}-01-01`, end: monthDate(priorYear, endDate.getMonth(), endDate.getDate()), type: 'year' };
      } else previous = null;
      labels = Array.from({ length: 12 }, (_, i) => new Date(2020, i, 1).toLocaleDateString(undefined, { month: 'short' }));
    } else {
      current = monthBounds(anchor);
      if (current && supplied) current.end = supplied.effectiveEnd || supplied.end;
      if (current) {
        const d = dateOf(current.start); d.setMonth(d.getMonth() - 1);
        const priorStart = iso(new Date(d.getFullYear(), d.getMonth(), 1, 12));
        const selectedEnd = dateOf(current.end);
        const priorEnd = monthDate(d.getFullYear(), d.getMonth(), selectedEnd.getDate());
        previous = { start: priorStart, end: priorEnd, type: 'month' };
      } else previous = null;
      labels = ['W1', 'W2', 'W3', 'W4', 'W5', 'W6'];
      type = 'month';
    }
    if (!current || !previous) return { type, currentRange: current, previousRange: previous, labels, categories: [] };
    const categories = (state.activities || []).filter(a => a.kind === 'expense' || a.kind === 'both');
    const groups = categories.map(activity => ({ id: activity.id, name: activity.name }));
    const groupIndex = new Map(groups.map((row, index) => [row.id, index]));
    const getGroupIndex = tx => {
      if (groupIndex.has(tx.activityId)) return groupIndex.get(tx.activityId);
      if (groupIndex.has('other')) return groupIndex.get('other');
      if (!groupIndex.has('__uncategorised__')) {
        groupIndex.set('__uncategorised__', groups.length);
        groups.push({ id: '__uncategorised__', name: 'Uncategorised' });
      }
      return groupIndex.get('__uncategorised__');
    };
    const indexFor = (date, range) => {
      const d = dateOf(date); if (!d) return -1;
      if (type === 'custom') return 0;
      if (type === 'week') return Math.floor((d - dateOf(range.start)) / DAY_MS);
      if (type === 'year') return d.getMonth();
      return Math.min(5, Math.floor((d.getDate() - 1 + (dateOf(range.start).getDay() + 6) % 7) / 7));
    };
    const bucketRows = [];
    (state.transactions || []).forEach(tx => {
      if (!validISO(tx.date) || !['expense', 'refund'].includes(tx.type)) return;
      const periodIndex = tx.date >= current.start && tx.date <= current.end ? 0 : tx.date >= previous.start && tx.date <= previous.end ? 1 : -1;
      if (periodIndex < 0) return;
      const selected = periodIndex === 0 ? current : previous;
      const bucketIndex = indexFor(tx.date, selected);
      if (bucketIndex < 0 || bucketIndex >= labels.length) return;
      bucketRows.push({ amountMinor: minor(tx.amount), groupIndex: getGroupIndex(tx), bucketIndex, periodIndex, sign: tx.type === 'refund' ? -1 : 1 });
    });
    const totals = groups.length ? financialEngine().categoryBuckets(bucketRows, groups.length, labels.length) : [];
    const rows = groups.map((group, index) => {
      const offset = index * labels.length * 2;
      const current = totals.slice(offset, offset + labels.length).map(major);
      const previous = totals.slice(offset + labels.length, offset + labels.length * 2).map(major);
      return { ...group, current, previous, currentTotal: sum(current), previousTotal: sum(previous) };
    }).filter(row => row.currentTotal || row.previousTotal)
      .sort((a, b) => financialEngine().sum([minor(b.currentTotal), minor(b.previousTotal), -minor(a.currentTotal), -minor(a.previousTotal)]));
    const visible = rows.slice(0, 5);
    const hidden = rows.slice(5);
    if (hidden.length) visible.push({
      id: '__others__', name: 'Others',
      current: labels.map((_, i) => sum(hidden.map(row => row.current[i]))),
      previous: labels.map((_, i) => sum(hidden.map(row => row.previous[i]))),
      currentTotal: sum(hidden.map(row => row.currentTotal)), previousTotal: sum(hidden.map(row => row.previousTotal))
    });
    return { type, currentRange: current, previousRange: previous, labels, categories: visible };
  }
  function salaryCycleRange(plan, today) {
    const frequency = ['monthly', 'fortnightly', 'weekly'].includes(plan && plan.frequency) ? plan.frequency : 'monthly';
    const d = dateOf(today); if (!d) return null;
    if (frequency === 'monthly') {
      const day = clampDay(d.getFullYear(), d.getMonth(), plan && plan.paydayDay || d.getDate());
      let start = monthDate(d.getFullYear(), d.getMonth(), day);
      if (start > today) start = monthDate(d.getFullYear(), d.getMonth() - 1, plan && plan.paydayDay || day);
      const next = dateOf(start); next.setDate(1); next.setMonth(next.getMonth() + 1); next.setDate(clampDay(next.getFullYear(), next.getMonth(), plan && plan.paydayDay || day));
      return { start, end: addDays(iso(next), -1), frequency };
    }
    const interval = frequency === 'weekly' ? 7 : 14;
    if (validISO(plan && plan.paydayDate)) {
      const anchor = dateOf(plan.paydayDate);
      const daysFromAnchor = Math.round((d - anchor) / DAY_MS);
      const cycleOffset = Math.floor(daysFromAnchor / interval);
      anchor.setDate(anchor.getDate() + cycleOffset * interval);
      const start = iso(anchor);
      return { start, end: addDays(start, interval - 1), frequency, anchored: true };
    }
    const rawWeekday = Number(plan && plan.paydayDay);
    const weekday = Number.isFinite(rawWeekday) ? Math.max(0, Math.min(6, rawWeekday)) : 5;
    const lastPayday = new Date(d);
    lastPayday.setDate(lastPayday.getDate() - ((lastPayday.getDay() - weekday + 7) % 7));
    if (frequency === 'weekly') return { start: iso(lastPayday), end: addDays(iso(lastPayday), 6), frequency, anchored: false };
    while (addDays(iso(lastPayday), 14) <= today) lastPayday.setDate(lastPayday.getDate() + 14);
    return { start: iso(lastPayday), end: addDays(iso(lastPayday), 13), frequency, anchored: false };
  }
  function scheduledPaydays(plan, start, end, today) {
    const frequency = ['monthly', 'fortnightly', 'weekly'].includes(plan && plan.frequency) ? plan.frequency : 'monthly';
    if (!validISO(start) || !validISO(end) || start > end) return [];
    const results = [];
    if (frequency === 'monthly') {
      const first = dateOf(`${start.slice(0, 7)}-01`);
      const last = dateOf(`${end.slice(0, 7)}-01`);
      const cursor = new Date(first);
      while (cursor <= last && results.length < 240) {
        const payday = monthDate(cursor.getFullYear(), cursor.getMonth(), plan && plan.paydayDay || 1);
        if (payday >= start && payday <= end) results.push(payday);
        cursor.setMonth(cursor.getMonth() + 1);
      }
      return results;
    }
    const interval = frequency === 'weekly' ? 7 : 14;
    let anchor;
    if (validISO(plan && plan.paydayDate)) anchor = plan.paydayDate;
    else if (frequency === 'weekly') {
      const weekday = Number.isInteger(Number(plan && plan.paydayDay)) ? Math.max(0, Math.min(6, Number(plan.paydayDay))) : 5;
      const d = dateOf(start);
      d.setDate(d.getDate() + ((weekday - d.getDay() + 7) % 7));
      anchor = iso(d);
    } else {
      const cycle = salaryCycleRange(plan, today || end);
      anchor = cycle && cycle.start || start;
    }
    const offset = Math.floor((dateOf(start) - dateOf(anchor)) / DAY_MS);
    let payday = addDays(anchor, Math.floor(offset / interval) * interval);
    let guard = 0;
    while (payday < start && guard++ < 500) payday = addDays(payday, interval);
    while (payday <= end && results.length < 520 && guard++ < 1100) {
      results.push(payday);
      payday = addDays(payday, interval);
    }
    return results;
  }
  function salaryAllocationSummary(state, today, selectedRange) {
    const plan = state.settings && state.settings.salaryPlan || {};
    const expected = Math.max(0, minor(plan.expectedSalary || 0));
    const frequency = ['monthly', 'fortnightly', 'weekly'].includes(plan.frequency) ? plan.frequency : 'monthly';
    const cycle = salaryCycleRange(plan, today);
    const hasRange = selectedRange && validISO(selectedRange.start) && validISO(selectedRange.end);
    const rangeStart = hasRange ? selectedRange.start : cycle.start;
    const rangeEnd = hasRange ? (selectedRange.effectiveEnd || selectedRange.end) : today;
    const paydays = hasRange ? scheduledPaydays(plan, selectedRange.start, selectedRange.end, today) : [cycle.start];
    const salaryTransactions = (state.transactions || []).filter(tx => tx.type === 'income' && txWithin(tx, rangeStart, rangeEnd) && ((tx.activityId === 'salary') || /salary|wage|payroll/i.test(activityName(state, tx))));
    const actual = financialEngine().sum(salaryTransactions.map(tx => minor(tx.amount)));
    const payCycles = Math.max(paydays.length, actual > 0 && paydays.length === 0 ? 1 : 0);
    const expectedForPeriod = financialEngine().sum(Array(payCycles).fill(expected));
    const base = actual > 0 ? actual : (hasRange ? expectedForPeriod : expected);
    const enabledRules = (Array.isArray(plan.allocations) ? plan.allocations : []).filter(rule => rule && rule.enabled !== false);
    const rules = enabledRules.map(rule => {
      const value = Number(rule.value);
      if (rule.mode === 'percent') {
        if (!Number.isFinite(value)) throw new RangeError('A salary percentage rule contains an invalid number.');
        return { mode: 'percent', valueScaled: Math.round(value * 100) };
      }
      return { mode: 'fixed', valueScaled: Math.max(0, minor(value)) };
    });
    const useActualPerCycle = actual > 0 && hasRange && payCycles > 0;
    const perCycleNumerator = useActualPerCycle ? actual : expected;
    const perCyclePercentDenominator = useActualPerCycle ? 10000 * payCycles : 10000;
    const allocation = financialEngine().salaryAllocate(base, perCycleNumerator, payCycles, perCyclePercentDenominator, rules);
    const monthlyNumerator = frequency === 'weekly' ? 52 : frequency === 'fortnightly' ? 26 : 12;
    const monthlyDenominator = 12;
    const rows = enabledRules.map((rule, index) => {
      const amountMinor = allocation.rows[index].periodMinor;
      const perCycleMinor = allocation.rows[index].perCycleMinor;
      return { ...rule, amount: major(amountMinor), perCycleAmount: major(perCycleMinor), monthlyAmount: major(financialEngine().ratioRound(perCycleMinor, monthlyNumerator, monthlyDenominator)) };
    });
    const perCycleAllocated = financialEngine().sum(allocation.rows.map(row => row.perCycleMinor));
    const reportCycle = hasRange ? { start: selectedRange.start, end: selectedRange.end, frequency, payCycles } : cycle;
    const monthlyBaseDenominator = monthlyDenominator * (hasRange && payCycles ? payCycles : 1);
    return {
      expectedSalary: major(expected), expectedSalaryForPeriod: major(expectedForPeriod), actualSalary: major(actual), baseSalary: major(base), usesActual: actual > 0,
      monthlyBaseSalary: major(financialEngine().ratioRound(base, monthlyNumerator, monthlyBaseDenominator)), frequency, payCycles,
      cycle: reportCycle, allocations: rows, totalAllocated: major(allocation.allocatedMinor), monthlyAllocated: major(financialEngine().ratioRound(perCycleAllocated, monthlyNumerator, monthlyDenominator)), unallocated: major(financialEngine().sum([base, -allocation.allocatedMinor])),
      overAllocated: allocation.allocatedMinor > base, percentageTotal: allocation.percentageScaled / 100, fixedTotal: major(allocation.fixedMinor),
      percentageOver100: allocation.percentageScaled > 10000, salaryTransactions: salaryTransactions.length
    };
  }
  function periodBudgetRatio(range) {
    if (range.type === 'week') return { numerator: 3, denominator: 13 };
    if (range.type === 'year') return { numerator: 12, denominator: 1 };
    if (range.type === 'month') return { numerator: 1, denominator: 1 };
    const days = Math.max(1, Math.round((dateOf(range.end) - dateOf(range.start)) / DAY_MS) + 1);
    // 30.436875 days/month = 243495 / 8000 exactly.
    return { numerator: days * 8000, denominator: 243495 };
  }
  function projectionEvidence(state, start, end, today, activityId, observedEnd) {
    const stop = observedEnd && validISO(observedEnd) ? observedEnd : today;
    const isCurrentPeriod = validISO(end) && end >= today;
    const elapsed = Math.max(1, Math.round((dateOf(stop) - dateOf(start)) / DAY_MS) + 1);
    const txs = (state.transactions || []).filter(tx => tx.type === 'expense' && txWithin(tx, start, stop) && (!activityId || tx.activityId === activityId));
    const dayBuckets = new Map();
    txs.forEach(tx => {
      if (!dayBuckets.has(tx.date)) dayBuckets.set(tx.date, []);
      dayBuckets.get(tx.date).push(minor(tx.amount));
    });
    const dailyTotals = [...dayBuckets.values()].map(values => financialEngine().sum(values));
    const total = financialEngine().sum(dailyTotals);
    const largestDayShare = total ? Math.max(...dailyTotals) / total : 0;
    const enoughObservations = elapsed >= 7 && txs.length >= 5 && dayBuckets.size >= 3;
    const sufficientlyDistributed = largestDayShare <= 0.65;
    const totalDays = Math.max(1, Math.round((dateOf(end) - dateOf(start)) / DAY_MS) + 1);
    return {
      elapsed, totalDays, count: txs.length, distinctDays: dayBuckets.size, largestDayShare,
      reliable: isCurrentPeriod && enoughObservations && sufficientlyDistributed,
      projectedMinor: isCurrentPeriod && enoughObservations && sufficientlyDistributed ? financialEngine().ratioRound(total, totalDays, elapsed) : null
    };
  }
  function periodBudgetMultiplier(range) {
    if (range.type === 'week') return 12 / 52;
    if (range.type === 'year') return 12;
    const days = Math.max(1, Math.round((dateOf(range.end) - dateOf(range.start)) / DAY_MS) + 1);
    if (range.type === 'month') return 1;
    return days / 30.436875;
  }
  function budgetDashboard(state, range, today) {
    const fallback = periodRange('month', today);
    const selected = range && validISO(range.start) && validISO(range.end) && range.start <= range.end ? range : fallback;
    const periodEnd = selected.end;
    const observedEnd = selected.effectiveEnd && validISO(selected.effectiveEnd) ? selected.effectiveEnd : (periodEnd > today ? today : periodEnd);
    const end = observedEnd < selected.start ? addDays(selected.start, -1) : observedEnd;
    const current = { start: selected.start, end, periodEnd, type: selected.type || 'month' };
    const fullPrevious = previousRange({ start: selected.start, end: periodEnd, type: selected.type || 'month' }) || previousRange(fallback);
    const elapsedDays = end >= current.start ? Math.max(1, Math.round((dateOf(end) - dateOf(current.start)) / DAY_MS) + 1) : 0;
    const fullDays = Math.max(1, Math.round((dateOf(periodEnd) - dateOf(current.start)) / DAY_MS) + 1);
    const partial = end < periodEnd;
    const previous = partial && elapsedDays ? { ...fullPrevious, end: addDays(fullPrevious.start, elapsedDays - 1) > fullPrevious.end ? fullPrevious.end : addDays(fullPrevious.start, elapsedDays - 1) } : fullPrevious;
    const multiplier = periodBudgetMultiplier({ ...selected, end: periodEnd });
    const ratio = periodBudgetRatio({ ...selected, end: periodEnd });
    const salary = salaryAllocationSummary(state, today, { ...selected, effectiveEnd: end });
    const allocationBuckets = new Map();
    salary.allocations.forEach(rule => {
      if (rule.type !== 'category' || !rule.activityId) return;
      if (!allocationBuckets.has(rule.activityId)) allocationBuckets.set(rule.activityId, []);
      allocationBuckets.get(rule.activityId).push(minor(rule.amount));
    });
    const plannedByCategory = Object.fromEntries([...allocationBuckets.entries()].map(([id, amounts]) => [id, financialEngine().sum(amounts)]));
    const activities = (state.activities || []).filter(a => a.kind === 'expense' || a.kind === 'both');
    const categoryIndexes = new Map(activities.map((activity, index) => [activity.id, index]));
    const categoryInputs = activities.map(activity => ({
      monthlyBudgetMinor: Math.max(0, minor(Number(state.budgets && state.budgets.categories && state.budgets.categories[activity.id]) || 0)),
      salaryAllocationMinor: Math.max(0, plannedByCategory[activity.id] || 0)
    }));
    const budgetTransactions = [];
    (state.transactions || []).forEach(tx => {
      if (!tx || !validISO(tx.date)) return;
      const isCurrent = txWithin(tx, current.start, current.end);
      const isPrevious = txWithin(tx, previous.start, previous.end);
      if (isCurrent && ['income', 'expense', 'refund'].includes(tx.type)) {
        budgetTransactions.push({
          amountMinor: minor(tx.amount),
          categoryIndex: tx.type === 'income' ? null : (categoryIndexes.has(tx.activityId) ? categoryIndexes.get(tx.activityId) : null),
          periodIndex: 0,
          typeCode: financialEngine().typeCodes[tx.type]
        });
      } else if (isPrevious && ['expense', 'refund'].includes(tx.type)) {
        budgetTransactions.push({
          amountMinor: minor(tx.amount),
          categoryIndex: categoryIndexes.has(tx.activityId) ? categoryIndexes.get(tx.activityId) : null,
          periodIndex: 1,
          typeCode: financialEngine().typeCodes[tx.type]
        });
      }
    });
    const configuredTotalBudget = Math.max(0, minor(state.budgets && state.budgets.total || 0));
    const metrics = financialEngine().budgetMetrics(categoryInputs, budgetTransactions, ratio.numerator, ratio.denominator, configuredTotalBudget);
    const incomeBasis = metrics.actualIncomeMinor > 0 ? metrics.actualIncomeMinor : minor(salary.baseSalary);
    const rows = activities.map((activity, index) => {
      const value = metrics.rows[index];
      const spent = major(value.spentMinor);
      const previousSpent = major(value.previousSpentMinor);
      const evidence = projectionEvidence(state, current.start, periodEnd, today, activity.id, current.end);
      const projected = evidence.projectedMinor === null ? null : major(evidence.projectedMinor);
      return {
        id: activity.id, name: activity.name,
        plannedAllocation: major(value.plannedAllocationMinor),
        salaryAllocation: major(value.salaryAllocationMinor),
        budgetLimit: major(value.budgetLimitMinor), spent,
        remaining: major(value.remainingMinor),
        percentUsed: value.plannedAllocationMinor > 0 ? value.spentMinor / value.plannedAllocationMinor * 100 : null,
        projectedSpending: projected, previousSpent,
        change: major(financialEngine().sum([value.spentMinor, -value.previousSpentMinor])),
        incomeAllocationPct: incomeBasis ? value.plannedAllocationMinor / incomeBasis * 100 : null,
        spendingShareOfIncome: incomeBasis ? value.spentMinor / incomeBasis * 100 : null,
        canProject: evidence.reliable, projectionEvidence: evidence
      };
    }).filter(row => row.plannedAllocation > 0 || row.spent > 0)
      .sort((a, b) => (b.percentUsed || 0) - (a.percentUsed || 0));
    const projection = projectionEvidence(state, current.start, periodEnd, today, null, current.end);
    const label = current.type === 'week' ? 'week' : current.type === 'year' ? 'year' : current.type === 'custom' ? 'selected period' : 'month';
    return {
      range: current, previousRange: previous, periodLabel: label, rows, salary,
      totalBudget: major(metrics.totalBudgetMinor), totalSpent: major(metrics.totalSpentMinor),
      totalRemaining: major(metrics.totalRemainingMinor), actualIncome: major(metrics.actualIncomeMinor),
      totalPercentUsed: metrics.totalBudgetMinor ? metrics.totalSpentMinor / metrics.totalBudgetMinor * 100 : null,
      projectedTotal: projection.projectedMinor === null ? null : major(projection.projectedMinor),
      canProjectTotal: projection.reliable, projectionEvidence: projection,
      elapsedDays: projection.elapsed, periodDays: fullDays,
      categoryBudgetTotal: major(metrics.categoryBudgetTotalMinor),
      categoryBudgetsExceedTotal: metrics.totalBudgetMinor > 0 && metrics.categoryBudgetTotalMinor > metrics.totalBudgetMinor,
      budgetMultiplier: multiplier, isPartialPeriod: partial
    };
  }
  function priorityInsights(state, range, today) {
    const items = [];
    const budgets = budgetDashboard(state, range, today);
    const balance = consolidatedBalanceAt(state, today);
    const horizon7 = addDays(today, 7), horizon30 = addDays(today, 30);
    const reminders = [];
    (state.reminders || []).forEach(r => {
      if (!r || !r.active || !validISO(r.date)) return;
      const repeat = ['weekly', 'monthly', 'yearly', 'year'].includes(r.repeat) ? (r.repeat === 'year' ? 'yearly' : r.repeat) : 'once';
      const anchorDay = Number(r.anchorDay) || Number(r.date.slice(-2));
      let next = r.date, guard = 0;
      while (next < today && repeat !== 'once' && guard++ < 600) next = addRecurringDate(next, repeat, anchorDay);
      while (next && next <= horizon30 && guard++ < 1200) {
        if (next >= today) reminders.push({ ...r, date: next, kind: r.kind === 'income' ? 'income' : 'outflow', forecastSource: 'reminder' });
        if (repeat === 'once') break;
        next = addRecurringDate(next, repeat, anchorDay);
      }
    });
    // A configured payday is a forecast, not recorded income. Suppress it only when
    // an explicit income reminder already represents that same date.
    const salaryPlan = state.settings && state.settings.salaryPlan || {};
    if (minor(salaryPlan.expectedSalary) > 0) {
      const salaryCycle = salaryCycleRange(salaryPlan, today);
      let payday = salaryCycle ? addDays(salaryCycle.end, 1) : '';
      if (salaryCycle && salaryCycle.start === today && !salaryAllocationSummary(state, today).usesActual) payday = today;
      if (validISO(payday) && payday <= horizon30 && !reminders.some(r => r.kind === 'income' && r.date === payday)) {
        reminders.push({ id: 'salary-plan-next-payday', name: 'Expected salary (plan estimate)', amount: major(minor(salaryPlan.expectedSalary)), date: payday, kind: 'income', forecastSource: 'salary-plan' });
      }
    }
    (state.debts || []).forEach(debt => {
      if (!['borrowed', 'lent'].includes(debt.direction) || !validISO(debt.due) || debt.due < today || debt.due > horizon30) return;
      const outstanding = debtRemainingAt(state, debt, today);
      if (outstanding > 0) reminders.push({ id: `debt-${debt.id}`, name: debt.direction === 'lent' ? `Expected repayment · ${debt.person || 'borrower'}` : `Debt due · ${debt.person || 'lender'}`, amount: major(outstanding), date: debt.due, kind: debt.direction === 'lent' ? 'income' : 'outflow', forecastSource: 'debt' });
    });
    const orderReminders = list => list.slice().sort((a, b) => compareDate(a.date, b.date) || ((a.kind === 'income' ? 0 : 1) - (b.kind === 'income' ? 0 : 1)));
    const next7 = orderReminders(reminders.filter(r => r.date <= horizon7));
    const projectReminders = list => financialEngine().cashProjection(balance.balanceMinor || 0, list.map(r => r.kind === 'income' ? minor(r.amount) : -minor(r.amount)));
    const projection7 = projectReminders(next7);
    const shortage7 = projection7.shortageMinor;
    const shortageDate = projection7.shortageIndex >= 0 ? next7[projection7.shortageIndex].date : '';
    if (balance.complete && shortage7 > 0) {
      items.push({ priority: 1, kind: 'cash-shortage', amount: major(shortage7), title: 'A scheduled commitment may exceed available cash', detail: `The date-ordered reminder scenario first falls below zero on ${shortageDate}. Current tracked cash is ${balance.amount}; recorded recurring reminders, due debt entries and the configured next-payday estimate are included in date order.`, evidence: `Starting balance ${balance.amount}; reminder inflows and outflows in date order leave a minimum position of −${major(shortage7)}. Same-day income is applied before same-day outflows.`, action: 'Confirm the expected income date, review the payment timing, or adjust a commitment.' });
    }
    const next30 = orderReminders(reminders.filter(r => r.date <= horizon30));
    const projection30 = projectReminders(next30);
    const minimum30 = projection30.minimumMinor;
    const minimum30Date = projection30.minimumIndex >= 0 ? next30[projection30.minimumIndex].date : '';
    if (balance.complete && minimum30 < 0 && !shortageDate) items.push({ priority: 1, kind: 'negative-projection', amount: major(Math.abs(minimum30)), title: 'Projected cash position may turn negative', detail: `The date-ordered reminder scenario reaches a negative position on ${minimum30Date}.`, evidence: `Starting tracked cash ${balance.amount}; scheduled income and outflows in date order produce a minimum of ${major(minimum30)}. This is a reminder-based scenario, not a bank forecast.`, action: 'Confirm each reminder and review the timing of necessary payments.' });
    const majorOver = budgets.rows.filter(row => row.plannedAllocation > 0 && row.spent > row.plannedAllocation * 1.25);
    majorOver.forEach(row => items.push({ priority: 1, kind: 'major-budget-overrun', amount: major(row.spent - row.plannedAllocation), title: `${row.name} is materially over plan`, detail: `${row.name} spending is ${row.percentUsed.toFixed(0)}% of its planned allocation.`, evidence: `${row.spent} spent against ${row.plannedAllocation} planned (${row.percentUsed.toFixed(1)}%).`, action: 'Review recent transactions and update the plan only if the original limit no longer fits.' }));
    budgets.rows.forEach(row => {
      if (row.plannedAllocation <= 0 || row.spent <= row.plannedAllocation * 1.25) return;
      // Already surfaced as a priority-one material overrun.
    });
    budgets.rows.filter(row => row.plannedAllocation > 0 && row.spent >= row.plannedAllocation && row.spent <= row.plannedAllocation * 1.25).forEach(row => items.push({ priority: 2, kind: 'budget-overrun', amount: major(row.spent - row.plannedAllocation), title: `${row.name} has exceeded its plan`, detail: `${row.name} is above the planned amount for this month.`, evidence: `${row.spent} actual spending vs ${row.plannedAllocation} planned.`, action: 'Check whether the spending is necessary and whether the remaining month needs a tighter plan.' }));
    budgets.rows.filter(row => row.plannedAllocation > 0 && row.percentUsed >= 90 && row.spent < row.plannedAllocation).forEach(row => items.push({ priority: 2, kind: 'budget-near', amount: major(row.plannedAllocation - row.spent), title: `${row.name} is approaching its planned limit`, detail: `${row.percentUsed.toFixed(0)}% of the planned amount has been used.`, evidence: `${row.spent} spent / ${row.plannedAllocation} planned = ${row.percentUsed.toFixed(1)}%.`, action: 'Check upcoming essentials before deciding whether discretionary spending needs to slow.' }));
    budgets.rows.filter(row => row.plannedAllocation > 0 && row.canProject && row.projectedSpending > row.plannedAllocation && row.spent <= row.plannedAllocation).forEach(row => items.push({ priority: 2, kind: 'forecast-budget-overrun', amount: major(row.projectedSpending - row.plannedAllocation), title: `${row.name} may exceed its plan by month-end`, detail: 'A data-supported projection is above the planned category allocation.', evidence: `${row.projectedSpending} projected against ${row.plannedAllocation} planned, using ${row.projectionEvidence.count} entries over ${row.projectionEvidence.distinctDays} days.`, action: 'Review upcoming essential spending and consider adjusting discretionary purchases.' }));
    if (budgets.categoryBudgetsExceedTotal) items.push({ priority: 2, kind: 'category-plans-exceed-total', amount: major(minor(budgets.categoryBudgetTotal) - minor(budgets.totalBudget)), title: 'Category budgets add up to more than the total budget', detail: 'Your individual category limits are higher than the overall monthly limit.', evidence: `${budgets.categoryBudgetTotal} in category budgets vs ${budgets.totalBudget} total monthly budget.`, action: 'Review whether category budgets are overlapping or the overall budget needs updating.' });
    if (budgets.totalBudget > 0 && budgets.totalSpent > budgets.totalBudget) items.push({ priority: 2, kind: 'total-budget-overrun', amount: major(budgets.totalSpent - budgets.totalBudget), title: 'Monthly spending is above the total budget', detail: 'The combined spending limit has been exceeded.', evidence: `${budgets.totalSpent} net spending against ${budgets.totalBudget} total budget.`, action: 'Review category totals and revise the remaining-month plan.' });
    if (budgets.salary.overAllocated) items.push({ priority: 2, kind: 'salary-overallocated', amount: major(Math.abs(minor(budgets.salary.unallocated))), title: 'Salary allocations exceed available income', detail: `${budgets.salary.usesActual ? 'Actual salary received' : 'Expected salary'} does not cover all enabled allocations.`, evidence: `${budgets.salary.totalAllocated} allocated against ${budgets.salary.baseSalary} available; difference ${major(Math.abs(minor(budgets.salary.unallocated)))}.`, action: 'Reduce fixed amounts or percentages, or disable allocations you do not need.' });
    const current = range || monthBounds(today);
    const prior = previousRange({ ...current, type: current.type || 'month' });
    if (prior) {
      const previousTxs = (state.transactions || []).filter(tx => tx.type === 'expense' && txWithin(tx, prior.start, prior.end));
      const currentTxs = (state.transactions || []).filter(tx => tx.type === 'expense' && txWithin(tx, current.start, current.end));
      const currentIds = [...new Set(currentTxs.map(tx => tx.activityId))];
      const trendIndex = new Map(currentIds.map((id, index) => [id, index]));
      const trendRows = [];
      currentTxs.forEach(tx => trendRows.push({ amountMinor: minor(tx.amount), groupIndex: trendIndex.get(tx.activityId), bucketIndex: 0, periodIndex: 0, sign: 1 }));
      previousTxs.forEach(tx => {
        if (trendIndex.has(tx.activityId)) trendRows.push({ amountMinor: minor(tx.amount), groupIndex: trendIndex.get(tx.activityId), bucketIndex: 0, periodIndex: 1, sign: 1 });
      });
      const trendTotals = currentIds.length ? financialEngine().categoryBuckets(trendRows, currentIds.length, 1) : [];
      for (let index = 0; index < currentIds.length; index += 1) {
        const id = currentIds[index];
        const amount = trendTotals[index * 2];
        const old = trendTotals[index * 2 + 1];
        if (amount >= 3 * 100 && old >= 3 * 100 && amount >= old * 1.3) {
          const activity = (state.activities || []).find(a => a.id === id);
          items.push({ priority: 3, kind: 'category-jump', amount: major(financialEngine().sum([amount, -old])), title: `${activity && activity.name || 'A category'} spending increased`, detail: 'Recorded spending is at least 30% higher than the previous equivalent period.', evidence: `${major(amount)} current vs ${major(old)} previous (${((amount - old) / old * 100).toFixed(1)}% increase).`, action: 'Inspect the transactions in this category and decide whether the increase is temporary.' });
        }
      }
    }
    const incomeForPeriod = financialEngine().sum((state.transactions || []).filter(tx => tx.type === 'income' && txWithin(tx, current.start, current.end)).map(tx => minor(tx.amount)));
    if (incomeForPeriod > 0) {
      budgets.rows.filter(row => row.spendingShareOfIncome !== null && row.spendingShareOfIncome >= 35 && row.spent > 0).forEach(row => {
        items.push({ priority: 3, kind: 'income-concentration', amount: row.spent, title: `${row.name} is taking a large share of recorded income`, detail: `${row.name} represents ${row.spendingShareOfIncome.toFixed(1)}% of recorded take-home inflows in this period.`, evidence: `${row.spent} category spending ÷ ${major(incomeForPeriod)} recorded income × 100 = ${row.spendingShareOfIncome.toFixed(1)}%.`, action: 'Check whether this is an essential cost, a one-off, or an area where a different plan could help.' });
      });
    }
    const lookbackStart = addDays(today, -89);
    const expenseHistory = (state.transactions || []).filter(tx => tx.type === 'expense' && txWithin(tx, lookbackStart, today)).slice().sort((a, b) => compareDate(a.date, b.date) || String(a.id).localeCompare(String(b.id)));
    const byCategory = new Map();
    expenseHistory.forEach(tx => { if (!byCategory.has(tx.activityId)) byCategory.set(tx.activityId, []); byCategory.get(tx.activityId).push(minor(tx.amount)); });
    for (const [activityId, amounts] of byCategory) {
      if (amounts.length < 8) continue;
      const sorted = amounts.slice().sort((a, b) => a - b), middle = Math.floor(sorted.length / 2);
      const median = sorted.length % 2 ? sorted[middle] : Math.round((sorted[middle - 1] + sorted[middle]) / 2);
      const recent = amounts[amounts.length - 1];
      if (median > 0 && recent >= median * 3) {
        const tx = expenseHistory.filter(item => item.activityId === activityId).slice(-1)[0];
        const activity = (state.activities || []).find(a => a.id === activityId);
        items.push({ priority: 3, kind: 'large-transaction', amount: major(recent), title: `A recent ${activity && activity.name || 'category'} transaction is unusually large`, detail: `This transaction is at least three times the category's median expense across the last 90 days.`, evidence: `${major(recent)} transaction compared with a historical median of ${major(median)} across ${amounts.length} transactions.`, action: 'Check the transaction details and confirm that the amount and category are correct.', transactionId: tx && tx.id });
      }
      const last7 = expenseHistory.filter(tx => tx.activityId === activityId && tx.date >= addDays(today, -6));
      const days = new Set(last7.map(tx => tx.date));
      if (days.size >= 5 && last7.length >= 7) {
        const activity = (state.activities || []).find(a => a.id === activityId);
        items.push({ priority: 3, kind: 'repeated-spending', amount: major(financialEngine().sum(last7.map(tx => minor(tx.amount)))), title: `${activity && activity.name || 'A category'} has repeated activity this week`, detail: `Transactions were recorded on ${days.size} of the last 7 days.`, evidence: `${last7.length} expense entries across ${days.size} distinct days in the trailing seven-day window.`, action: 'Review whether these repeat purchases are planned essentials or small costs adding up.' });
      }
    }
    const goals = (state.goals || []).filter(goal => Number(goal.target) > 0 && Number(goal.saved) > 0);
    goals.forEach(goal => items.push({ priority: 4, kind: 'goal-progress', amount: Number(goal.saved), title: `Progress on ${goal.name || 'a savings goal'}`, detail: `${Math.min(100, Number(goal.saved) / Number(goal.target) * 100).toFixed(0)}% of the target is recorded.`, evidence: `${goal.saved} saved out of ${goal.target}.`, action: 'Keep recording contributions; this is tracking progress, not a separate cash transfer.' }));
    const actualSpending = budgets.totalSpent;
    const priorMonth = previousRange({ ...monthBounds(today), type: 'month' });
    const priorSpend = financialEngine().sum((state.transactions || []).filter(tx => txWithin(tx, priorMonth.start, priorMonth.end) && ['expense', 'refund'].includes(tx.type)).map(tx => tx.type === 'expense' ? minor(tx.amount) : -minor(tx.amount)));
    if (priorSpend > 0 && minor(actualSpending) < priorSpend * 0.9) items.push({ priority: 4, kind: 'spending-down', amount: major(priorSpend - minor(actualSpending)), title: 'Recorded spending is lower than last month', detail: 'Spending so far is at least 10% below the previous calendar month.', evidence: `${actualSpending} current net spending vs ${major(priorSpend)} previous.`, action: 'Notice which choices helped, without treating every lower-spend period as a target.' });
    return items.sort((a, b) => a.priority - b.priority || minor(b.amount) - minor(a.amount));
  }
  return {
    minor, major, sum, validISO, dateOf, iso, addDays, periodRange, previousRange,
    cashDeltaMinor, accountBalanceAt, consolidatedBalanceAt, consolidatedOpeningBalanceAt, aggregateTransactions,
    calculatePeriod, cashFlowStatement, debtRemainingAt, balanceSheet, compareCategories,
    salaryCycleRange, salaryAllocationSummary, budgetDashboard, priorityInsights
  };
});
