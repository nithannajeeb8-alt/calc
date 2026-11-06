/* Aruvi Forecast Teacher v1.0
 * Deterministic, on-device live grading and adaptive interval calibration.
 * All dates are explicit inputs. No ambient clock or network access.
 */
(function (root, factory) {
  const core = typeof module === 'object' && module.exports
    ? require('./forecasting-core.js')
    : root.PocketWiseForecastCore;
  const api = factory(core);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.PocketWiseForecastTeacher = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (core) {
  'use strict';
  if (!core) throw new Error('Aruvi forecasting core must load before the teacher.');

  const FLOWS = ['expense', 'income'];
  const MAX_FORECASTS = 1800;
  const MAX_GRADES = 600;
  const MAX_SCORE_BUFFER = 52;
  const MAX_STREAM_PREDICTIONS = 2400;
  const MAX_STREAM_STATS = 600;
  const MAX_REGIME_EVENTS = 36;
  const MAX_BREAKER_HISTORY = 56;
  const DEFAULT_GAMMA = 0.02;

  function clone(value) { return JSON.parse(JSON.stringify(value)); }
  function gradeKey(window, flow) { return `${window}_${flow}`; }
  function emptyCalibration() {
    return { alphaT: 0.2, gamma: DEFAULT_GAMMA, scores: [], seededN: 0, covered: 0, catchupN: 0, catchupCovered: 0, n: 0, liveN: 0, delta: null, coverage: null, coverageWilson: null, updatedOn: null };
  }
  function createTeacherState(initializedOn) {
    return {
      version: 3,
      initializedOn: initializedOn || null,
      lastOrigin: null,
      forecasts: [],
      grades: [],
      calibration: {},
      expertStats: {},
      streamPredictions: [],
      streamStats: {},
      regimeEvents: [],
      circuitBreakers: {},
      points: 0,
      streak: 0,
      longestStreak: 0,
      brain: { tier: 'Learning', graded: 0, skillVsNaive: null, coverage: null, coverageWilson: null, calibrationReady: false, points: 0, streak: 0 }
    };
  }
  function normalizeState(input) {
    const state = input && typeof input === 'object' ? clone(input) : createTeacherState();
    state.version = 3;
    state.forecasts = (Array.isArray(state.forecasts) ? state.forecasts : []).filter(row =>
      row && typeof row === 'object' && typeof row.key === 'string' && row.key.length <= 240 &&
      core.validISO(row.asOf) && core.validISO(row.targetStart) && core.validISO(row.targetEnd) &&
      ['day', 'week', 'month'].includes(row.window) && FLOWS.includes(row.flow) &&
      Number.isFinite(Number(row.days)) && Number(row.days) > 0 && Number(row.days) <= 28 &&
      Array.isArray(row.quantiles) && row.quantiles.length === 9 && row.quantiles.every(Number.isFinite) &&
      Array.isArray(row.naiveQuantiles) && row.naiveQuantiles.length === 9 && row.naiveQuantiles.every(Number.isFinite)
    ).slice(-MAX_FORECASTS);
    state.grades = (Array.isArray(state.grades) ? state.grades : []).filter(row =>
      row && typeof row === 'object' && typeof row.key === 'string' && core.validISO(row.asOf) &&
      core.validISO(row.gradedOn) && ['day', 'week', 'month'].includes(row.window) && FLOWS.includes(row.flow) &&
      row.grade && Number.isFinite(Number(row.grade.wis)) && row.naiveGrade && Number.isFinite(Number(row.naiveGrade.wis))
    ).slice(-MAX_GRADES);
    const calibration = state.calibration && typeof state.calibration === 'object' && !Array.isArray(state.calibration) ? state.calibration : {};
    state.calibration = {};
    for (const window of core.WINDOW_DEFS) for (const flow of FLOWS) {
      const key = gradeKey(window.key, flow), row = calibration[key];
      if (!row || typeof row !== 'object' || Array.isArray(row)) continue;
      const scores = (Array.isArray(row.scores) ? row.scores : []).slice(-MAX_SCORE_BUFFER).map(Number).filter(Number.isFinite);
      state.calibration[key] = {
        alphaT: Math.max(0.01, Math.min(0.99, Number(row.alphaT) || 0.2)),
        gamma: Math.max(0.005, Math.min(0.05, Number(row.gamma) || DEFAULT_GAMMA)),
        scores, seededN: Math.max(0, Number(row.seededN) || 0), covered: Math.max(0, Number(row.covered) || 0), catchupN: Math.max(0, Number(row.catchupN) || 0), catchupCovered: Math.max(0, Number(row.catchupCovered) || 0), liveN: Math.max(0, row.liveN !== undefined && row.liveN !== null && Number.isFinite(Number(row.liveN)) ? Number(row.liveN) : scores.length),
        n: Math.max(0, row.liveN !== undefined && row.liveN !== null && Number.isFinite(Number(row.liveN)) ? Number(row.liveN) : scores.length), delta: row.delta !== null && row.delta !== undefined && Number.isFinite(Number(row.delta)) ? Number(row.delta) : null,
        coverage: row.coverage !== null && row.coverage !== undefined && Number.isFinite(Number(row.coverage)) ? Number(row.coverage) : null,
        coverageWilson: Array.isArray(row.coverageWilson) && row.coverageWilson.length === 2 && row.coverageWilson.every(Number.isFinite) ? row.coverageWilson : null,
        updatedOn: core.validISO(row.updatedOn) ? row.updatedOn : null
      };
    }
    const rawExpertStats = state.expertStats && typeof state.expertStats === 'object' && !Array.isArray(state.expertStats) ? state.expertStats : {};
    state.expertStats = {};
    for (const [key, value] of Object.entries(rawExpertStats).slice(0, 120)) {
      if (typeof key !== 'string' || key.length > 300 || !value || typeof value !== 'object' || Array.isArray(value)) continue;
      const history = (Array.isArray(value.history) ? value.history : []).filter(item => item && core.validISO(item.gradedOn) && ['live','catchup'].includes(item.source) && Number.isFinite(Number(item.wis))).slice(-120).map(item => ({ gradedOn:item.gradedOn, source:item.source, wis:Math.max(0,Number(item.wis)||0), naiveWis:Number.isFinite(Number(item.naiveWis))?Math.max(0,Number(item.naiveWis)):null }));
      state.expertStats[key] = { n:Math.max(0,Number(value.n)||history.length), ewWIS:Number.isFinite(Number(value.ewWIS))?Math.max(0,Number(value.ewWIS)):null, ewNaiveWIS:Number.isFinite(Number(value.ewNaiveWIS))?Math.max(0,Number(value.ewNaiveWIS)):null, wins:Math.max(0,Number(value.wins)||0), history };
    }
    const rawStreamStats = state.streamStats && typeof state.streamStats === 'object' && !Array.isArray(state.streamStats) ? state.streamStats : {};
    state.streamStats = {};
    const streamStatsSource = rawStreamStats && typeof rawStreamStats === 'object' && !Array.isArray(rawStreamStats) ? rawStreamStats : {};
    for (const [key,value] of Object.entries(streamStatsSource).slice(0,MAX_STREAM_STATS)) {
      if (typeof key !== 'string' || key.length > 240 || !value || typeof value !== 'object' || Array.isArray(value)) continue;
      state.streamStats[key] = {
        liveHits:Math.max(0,Number(value.liveHits)||0), liveMisses:Math.max(0,Number(value.liveMisses)||0),
        catchupHits:Math.max(0,Number(value.catchupHits)||0), catchupMisses:Math.max(0,Number(value.catchupMisses)||0),
        consecutiveMisses:Math.max(0,Number(value.consecutiveMisses)||0), amountErrorEwma:value.amountErrorEwma!==null&&value.amountErrorEwma!==undefined&&Number.isFinite(Number(value.amountErrorEwma))?Math.max(0,Number(value.amountErrorEwma)):null,
        timingErrorEwma:value.timingErrorEwma!==null&&value.timingErrorEwma!==undefined&&Number.isFinite(Number(value.timingErrorEwma))?Math.max(0,Number(value.timingErrorEwma)):null,
        lastEvaluatedOn:core.validISO(value.lastEvaluatedOn)?value.lastEvaluatedOn:null, lastHitOn:core.validISO(value.lastHitOn)?value.lastHitOn:null,
        lifecycleStatus:['active','suspected_dormant','dormant'].includes(value.lifecycleStatus)?value.lifecycleStatus:'active'
      };
    }
    state.streamPredictions = (Array.isArray(state.streamPredictions)?state.streamPredictions:[]).filter(row => row && typeof row.key==='string' && row.key.length<=400 && typeof row.feedbackKey==='string' && row.feedbackKey.length<=240 && core.validISO(row.asOf) && core.validISO(row.expectedDate) && FLOWS.includes(row.flow) && Number.isFinite(Number(row.amountMedianMinor)) && Number(row.amountMedianMinor)>=0 && Number.isFinite(Number(row.toleranceDays)) && ['live','catchup'].includes(row.source)).slice(-MAX_STREAM_PREDICTIONS);
    state.regimeEvents = (Array.isArray(state.regimeEvents)?state.regimeEvents:[]).filter(row => row && typeof row.key==='string' && ['expense','income'].includes(row.flow) && core.validISO(row.detectedOn) && core.validISO(row.startDate) && core.validISO(row.lookbackUntil) && core.validISO(row.calibrationUntil)).slice(-MAX_REGIME_EVENTS);
    const rawBreakers = state.circuitBreakers && typeof state.circuitBreakers==='object' && !Array.isArray(state.circuitBreakers)?state.circuitBreakers:{};
    state.circuitBreakers = {};
    for (const [key,value] of Object.entries(rawBreakers).slice(0,12)) {
      if (typeof key!=='string' || !value || typeof value!=='object' || Array.isArray(value)) continue;
      const recent=(Array.isArray(value.recent)?value.recent:[]).filter(row=>row&&core.validISO(row.gradedOn)&&Number.isFinite(Number(row.equalWIS))&&Number.isFinite(Number(row.tiltWIS))).slice(-MAX_BREAKER_HISTORY).map(row=>({gradedOn:row.gradedOn,equalWIS:Math.max(0,Number(row.equalWIS)),tiltWIS:Math.max(0,Number(row.tiltWIS))}));
      state.circuitBreakers[key]={tripped:!!value.tripped,recent,tripCount:Math.max(0,Number(value.tripCount)||0),recoveryCount:Math.max(0,Number(value.recoveryCount)||0),lastEvaluatedOn:core.validISO(value.lastEvaluatedOn)?value.lastEvaluatedOn:null,reason:typeof value.reason==='string'?value.reason.slice(0,240):''};
    }
    state.points = Number.isFinite(Number(state.points)) ? Number(state.points) : 0;
    state.streak = Math.max(0, Number(state.streak) || 0);
    state.longestStreak = Math.max(state.streak, Number(state.longestStreak) || 0);
    return state;
  }
  function seedCalibrationFromBacktest(state, backtestCalibration) {
    const source = backtestCalibration && typeof backtestCalibration === 'object' ? backtestCalibration : {};
    for (const window of core.WINDOW_DEFS) for (const flow of FLOWS) {
      const key = gradeKey(window.key, flow), backtest = source[key];
      if (!backtest || !Array.isArray(backtest.scores) || !backtest.scores.length) continue;
      const current = state.calibration[key] || emptyCalibration();
      if (current.liveN > 0 || current.seededN > 0) continue;
      const scores = backtest.scores.slice(-MAX_SCORE_BUFFER).map(Number).filter(Number.isFinite);
      if (!scores.length) continue;
      current.scores = scores;
      current.seededN = scores.length;
      current.delta = backtest.delta !== null && backtest.delta !== undefined && Number.isFinite(Number(backtest.delta)) ? Number(backtest.delta) : null;
      state.calibration[key] = current;
    }
  }

  function toLiveCalibration(state, backtestCalibration) {
    const result = {};
    for (const window of core.WINDOW_DEFS) for (const flow of FLOWS) {
      const key = gradeKey(window.key, flow);
      const live = state.calibration[key];
      if (live && live.liveN >= 20 && live.scores.length >= 20) {
        const delta = core.quantile(live.scores, 1 - live.alphaT);
        result[key] = { n: live.liveN, delta, coverage: live.coverage, source: 'live', alphaT: live.alphaT };
      } else {
        const backtest = backtestCalibration && backtestCalibration[key];
        result[key] = backtest && Number(backtest.n) >= 20
          ? { n: Number(backtest.n), delta: Number(backtest.delta), coverage: backtest.coverage, source: 'backtest' }
          : { n: 0, delta: null, source: 'learning' };
      }
    }
    return result;
  }
  function updateCalibration(state, record, gradedOn) {
    const key = gradeKey(record.window, record.flow);
    const current = state.calibration[key] || emptyCalibration();
    const q = record.quantiles;
    const actual = record.actual;
    const conformity = Math.max(Number(q[0]) - actual, actual - Number(q[8]));
    current.scores.push(conformity);
    if (current.scores.length > MAX_SCORE_BUFFER) current.scores.splice(0, current.scores.length - MAX_SCORE_BUFFER);
    const isLive = record.source === 'live';
    if (isLive) {
      current.liveN = (Number(current.liveN) || 0) + 1;
      current.covered = (Number(current.covered) || 0) + (record.grade.inOuter ? 1 : 0);
    } else {
      current.catchupN = (Number(current.catchupN) || 0) + 1;
      current.catchupCovered = (Number(current.catchupCovered) || 0) + (record.grade.inOuter ? 1 : 0);
    }
    current.n = current.liveN;
    const miss = record.grade.inOuter ? 0 : 1;
    const alpha = 0.2;
    current.gamma = record.regimeActive ? 0.04 : DEFAULT_GAMMA;
    current.alphaT = Math.max(0.01, Math.min(0.99, (Number(current.alphaT) || alpha) + current.gamma * (alpha - miss)));
    current.coverage = current.liveN ? current.covered / current.liveN : null;
    current.coverageWilson = current.liveN >= 20 ? core.wilsonInterval(current.covered, current.liveN) : null;
    current.delta = current.liveN >= 20 ? core.quantile(current.scores, 1 - current.alphaT) : null;
    current.updatedOn = gradedOn;
    state.calibration[key] = current;
  }
  function updateExpertStats(state, record) {
    const candidates = record.expertGrades && Object.keys(record.expertGrades).length
      ? Object.entries(record.expertGrades)
      : [[record.expertId, record.grade]];
    const alpha = 0.15;
    for (const [expertId, grade] of candidates) {
      if (!grade || !Number.isFinite(Number(grade.wis))) continue;
      const key = `${expertId}|${record.window}|${record.flow}`;
      const previous = state.expertStats[key] || { n: 0, ewWIS: null, ewNaiveWIS: null, wins: 0, history: [] };
      previous.ewWIS = previous.ewWIS === null ? grade.wis : previous.ewWIS * (1 - alpha) + grade.wis * alpha;
      previous.ewNaiveWIS = previous.ewNaiveWIS === null ? record.naiveGrade.wis : previous.ewNaiveWIS * (1 - alpha) + record.naiveGrade.wis * alpha;
      previous.n += 1;
      previous.wins += grade.wis < record.naiveGrade.wis ? 1 : 0;
      if (!Array.isArray(previous.history)) previous.history = [];
      previous.history.push({ gradedOn:record.gradedOn, source:record.source, wis:Math.max(0,Number(grade.wis)||0), naiveWis:Math.max(0,Number(record.naiveGrade.wis)||0) });
      if (previous.history.length > 120) previous.history.splice(0,previous.history.length-120);
      state.expertStats[key] = previous;
    }
  }
  function updateCircuitBreaker(state, record) {
    if (record.source !== 'live') return;
    const equal=record.expertGrades?.equalWeight,tilt=record.expertGrades?.learnedTilt;
    if (!equal || !tilt || !Number.isFinite(Number(equal.wis)) || !Number.isFinite(Number(tilt.wis))) return;
    const key=gradeKey(record.window,record.flow),entry=state.circuitBreakers[key]||{tripped:false,recent:[],tripCount:0,recoveryCount:0,lastEvaluatedOn:null,reason:''};
    entry.recent=(Array.isArray(entry.recent)?entry.recent:[]).filter(item=>item&&item.gradedOn>=core.addDays(record.gradedOn,-56)&&item.gradedOn<=record.gradedOn);
    if (!entry.recent.some(item=>item.gradedOn===record.gradedOn)) entry.recent.push({gradedOn:record.gradedOn,equalWIS:Number(equal.wis),tiltWIS:Number(tilt.wis)});
    entry.recent=entry.recent.slice(-MAX_BREAKER_HISTORY);
    entry.lastEvaluatedOn=record.gradedOn;
    const n=entry.recent.length;
    const average=field=>entry.recent.reduce((sum,item)=>sum+Number(item[field]||0),0)/Math.max(1,n);
    const equalMean=average('equalWIS'),tiltMean=average('tiltWIS');
    if(!entry.tripped&&n>=8&&tiltMean>equalMean*1.02){
      entry.tripped=true;entry.tripCount+=1;entry.recoveryCount=0;entry.reason='Learned weighting underperformed equal weighting over the recent live grading window.';
    }else if(entry.tripped&&n>=14&&tiltMean<equalMean*0.95){
      entry.tripped=false;entry.recoveryCount+=1;entry.reason='Learned weighting recovered and beat equal weighting over the recent live grading window.';
    }
    state.circuitBreakers[key]=entry;
  }

  function streamTransactionMatch(event, transaction) {
    if (event.flow !== transaction.type) return false;
    if (event.merchantNorm) {
      if (!transaction.merchantNorm) return false;
      return transaction.merchantNorm===event.merchantNorm || core.jaroWinkler(transaction.merchantNorm,event.merchantNorm)>=0.92;
    }
    return String(event.activityId||'other')===String(transaction.activityId||'other');
  }
  function gradeStreamPredictions(state, transactions, evaluationDate) {
    const pending=state.streamPredictions.filter(item=>!item.graded&&core.addDays(item.expectedDate,Math.max(1,Number(item.toleranceDays)||1))<evaluationDate).sort((a,b)=>a.expectedDate.localeCompare(b.expectedDate)||a.asOf.localeCompare(b.asOf));
    if(!pending.length)return 0;
    const normalized=core.normalizeTransactions(transactions,evaluationDate);
    const used=new Set(state.streamPredictions.filter(item=>item.graded&&item.matchedTxId).map(item=>item.matchedTxId));
    const byMerchant=new Map(),byFlow=new Map();
    for(const tx of normalized){
      const flowKey=tx.type;
      if(!byFlow.has(flowKey))byFlow.set(flowKey,[]);
      byFlow.get(flowKey).push(tx);
      if(tx.merchantNorm){const key=`${tx.type}|${tx.merchantNorm}`;if(!byMerchant.has(key))byMerchant.set(key,[]);byMerchant.get(key).push(tx);}
    }
    let changed=0;
    for(const prediction of pending){
      const tolerance=Math.max(1,Math.min(10,Number(prediction.toleranceDays)||2));
      const targetDay=core.dayNumber(prediction.expectedDate);
      let merchantCandidates=prediction.merchantNorm?byMerchant.get(`${prediction.flow}|${prediction.merchantNorm}`)||[]:byFlow.get(prediction.flow)||[];
      if(prediction.merchantNorm&&!merchantCandidates.length){
        merchantCandidates=[];
        for(const [key,items] of byMerchant){
          if(!key.startsWith(`${prediction.flow}|`))continue;
          if(core.jaroWinkler(key.slice(prediction.flow.length+1),prediction.merchantNorm)>=0.92)merchantCandidates.push(...items);
        }
      }
      const candidates=merchantCandidates.filter(tx=>!used.has(tx.id)&&Math.abs(tx.day-targetDay)<=tolerance&&streamTransactionMatch(prediction,tx));
      let match=null,matchScore=Infinity;
      for(const tx of candidates){
        const dayError=Math.abs(tx.day-targetDay)/tolerance;
        const amountRatio=Math.max(0.01,tx.amountMinor/Math.max(1,Number(prediction.amountMedianMinor)||1));
        const amountError=Math.abs(Math.log(amountRatio));
        const score=dayError+Math.min(2,amountError*0.35);
        if(score<matchScore){match=tx;matchScore=score;}
      }
      const hit=!!match;
      if(match)used.add(match.id);
      const amountErrorPct=match?Math.abs(match.amountMinor-Number(prediction.amountMedianMinor))/Math.max(1,Number(prediction.amountMedianMinor)):null;
      const timingErrorDays=match?Math.abs(core.daysBetween(prediction.expectedDate,match.date)):null;
      prediction.graded=true;prediction.gradedOn=evaluationDate;prediction.hit=hit;
      prediction.matchedTxId=match?.id||null;prediction.actualDate=match?.date||null;prediction.actualAmountMinor=match?.amountMinor||null;
      const stat=state.streamStats[prediction.feedbackKey]||{liveHits:0,liveMisses:0,catchupHits:0,catchupMisses:0,consecutiveMisses:0,amountErrorEwma:null,timingErrorEwma:null,lastEvaluatedOn:null,lastHitOn:null,lifecycleStatus:'active'};
      const sourcePrefix=prediction.source==='live'?'live':'catchup';
      const hitKey=sourcePrefix+'Hits',missKey=sourcePrefix+'Misses';
      stat[hit?hitKey:missKey]=(Number(stat[hit?hitKey:missKey])||0)+1;
      if(prediction.source==='live'){
        if(hit){stat.consecutiveMisses=0;stat.lastHitOn=evaluationDate;}
        else stat.consecutiveMisses=(Number(stat.consecutiveMisses)||0)+1;
        stat.lifecycleStatus=stat.consecutiveMisses>=2?'dormant':stat.consecutiveMisses===1?'suspected_dormant':'active';
      }
      if(hit){
        const a=Number(amountErrorPct)||0,t=Number(timingErrorDays)||0;
        stat.amountErrorEwma=stat.amountErrorEwma===null?a:stat.amountErrorEwma*0.8+a*0.2;
        stat.timingErrorEwma=stat.timingErrorEwma===null?t:stat.timingErrorEwma*0.8+t*0.2;
      }
      stat.lastEvaluatedOn=evaluationDate;
      state.streamStats[prediction.feedbackKey]=stat;
      changed++;
    }
    if(state.streamPredictions.length>MAX_STREAM_PREDICTIONS){
      state.streamPredictions=state.streamPredictions.filter(item=>!item.graded).concat(state.streamPredictions.filter(item=>item.graded).slice(-(MAX_STREAM_PREDICTIONS))).slice(-MAX_STREAM_PREDICTIONS);
    }
    return changed;
  }
  function registerRegimeChanges(state,changes,origin){
    if(!Array.isArray(changes)||!changes.length)return;
    for(const change of changes){
      if(!change||!['expense','income'].includes(change.flow)||!core.validISO(change.startDate))continue;
      const key=`${change.flow}|${change.startDate}`;
      if(state.regimeEvents.some(item=>item.key===key))continue;
      state.regimeEvents.push({...change,key,detectedOn:origin,lookbackUntil:core.addDays(origin,42),calibrationUntil:core.addDays(origin,28)});
    }
    state.regimeEvents=state.regimeEvents.slice(-MAX_REGIME_EVENTS);
  }

  function gradeDue(state, transactions, evaluationDate) {
    let changed = 0;
    for (const forecastRecord of state.forecasts) {
      if (forecastRecord.graded || core.addDays(forecastRecord.asOf, forecastRecord.days) >= evaluationDate) continue;
      const actual = core.expectedActual(transactions, forecastRecord.targetStart, forecastRecord.days, forecastRecord.flow);
      const grade = core.grade(forecastRecord.quantiles, actual);
      const naiveGrade = core.grade(forecastRecord.naiveQuantiles, actual);
      const expertGrades = {};
      if (forecastRecord.components && typeof forecastRecord.components === 'object') {
        for (const [expertId, quantiles] of Object.entries(forecastRecord.components)) {
          if (Array.isArray(quantiles) && quantiles.length === 9 && quantiles.every(Number.isFinite)) expertGrades[expertId] = core.grade(quantiles, actual);
        }
      }
      const record = {
        key: forecastRecord.key,
        source: forecastRecord.source === 'catchup' ? 'catchup' : 'live',
        asOf: forecastRecord.asOf,
        gradedOn: evaluationDate,
        window: forecastRecord.window,
        days: forecastRecord.days,
        flow: forecastRecord.flow,
        expertId: forecastRecord.expertId,
        actual,
        quantiles: forecastRecord.quantiles,
        naiveQuantiles: forecastRecord.naiveQuantiles,
        grade,
        naiveGrade,
        expertGrades,
        regimeActive:!!forecastRecord.regimeActive,
        skillVsNaive: naiveGrade.wis > 0 ? 1 - grade.wis / naiveGrade.wis : null
      };
      forecastRecord.graded = true;
      forecastRecord.gradedOn = evaluationDate;
      forecastRecord.actual = actual;
      forecastRecord.grade = grade;
      state.grades.push(record);
      if (record.source === 'live') {
        state.points += grade.points;
        if (grade.inOuter) state.streak += 1;
        else state.streak = 0;
        state.longestStreak = Math.max(state.longestStreak, state.streak);
      }
      updateCalibration(state, record, evaluationDate);
      updateExpertStats(state, record);
      updateCircuitBreaker(state, record);
      changed += 1;
    }
    if (state.grades.length > MAX_GRADES) state.grades.splice(0, state.grades.length - MAX_GRADES);
    return changed;
  }
  function summarizeTeacher(state, asOf) {
    const cutoff = core.addDays(asOf, -56);
    const recentAll = state.grades.filter(row => row && row.gradedOn >= cutoff && row.gradedOn < asOf && row.window === 'week');
    const recent = recentAll.filter(row => row.source === 'live');
    const n = recent.length;
    const catchupGraded = state.grades.filter(row => row && row.gradedOn >= cutoff && row.gradedOn < asOf && row.source === 'catchup').length;
    const totalWis = recent.reduce((sum, row) => sum + Number(row.grade?.wis || 0), 0);
    const totalNaive = recent.reduce((sum, row) => sum + Number(row.naiveGrade?.wis || 0), 0);
    const skill = totalNaive > 0 ? 1 - totalWis / totalNaive : null;
    const covered = recent.filter(row => row.grade?.inOuter).length;
    const coverage = n ? covered / n : null;
    const wilson = n >= 20 ? core.wilsonInterval(covered, n) : null;
    const oldest = recent.reduce((min, row) => !min || row.gradedOn < min ? row.gradedOn : min, null);
    const calibrationReady = ['week_expense', 'week_income'].every(key => Number(state.calibration[key]?.liveN) >= 20);
    let tier = 'Learning';
    if (n >= 8 && Number.isFinite(skill) && skill > 0) tier = 'Basic';
    if (n >= 8 && Number.isFinite(skill) && skill >= 0.1 && coverage >= 0.7 && coverage <= 0.9) tier = 'Good';
    if (Number.isFinite(skill) && skill >= 0.2 && calibrationReady && oldest && core.daysBetween(oldest, asOf) >= 84) tier = 'Sharp';
    return { tier, graded: n, catchupGraded, skillVsNaive: skill, coverage, coverageWilson: wilson, calibrationReady, points: state.points, streak: state.streak, longestStreak: state.longestStreak, window: 'week', basedOn: 'live' };
  }
  function forecastOrigin(state, transactions, labels, origin, today, options) {
    // When reconstructing days missed by the app, do not use user decisions,
    // ensemble selections, or backtest calibration that were learned later.
    // Only the current origin can use today's available labels and backtest state.
    const isCurrentOrigin = origin === today;
    const originLabels = isCurrentOrigin ? (labels || {}) : {};
    const backtestState = isCurrentOrigin ? options.backtestCalibration : {};
    const calibration = toLiveCalibration(state, backtestState);
    const result = core.forecast(transactions, {
      asOf: origin,
      labels: originLabels,
      seed: 0x51a7e ^ core.dayNumber(origin),
      paths: Math.max(200, Math.min(800, Number(options.paths) || 300)),
      selections: isCurrentOrigin ? (options.selections || {}) : {},
      calibration,
      streamStats:state.streamStats,
      expertStats:state.expertStats,
      circuitBreakers:state.circuitBreakers,
      regimeEvents:state.regimeEvents,
      enableRegimeAdaptation:options.enableRegimeAdaptation===true
    });
    registerRegimeChanges(state,result.regimeChanges,origin);
    const regimeActive=options.enableRegimeAdaptation===true&&(!!result.regimeActive||state.regimeEvents.some(event=>event.detectedOn<=origin&&event.lookbackUntil>=origin));
    for (const event of result.events || []) {
      if(!event?.feedbackKey||!core.validISO(event.date))continue;
      const eventKey=`${event.feedbackKey}|${event.date}`;
      if(state.streamPredictions.some(row=>row.key===eventKey))continue;
      state.streamPredictions.push({key:eventKey,feedbackKey:event.feedbackKey,streamId:event.streamId,asOf:origin,expectedDate:event.date,flow:event.flow,toleranceDays:Math.max(1,Number(event.toleranceDays)||2),merchantNorm:event.merchantNorm||'',activityId:event.activityId||'other',amountMedianMinor:Math.max(0,Number(event.amountMedianMinor)||0),pAtForecast:Math.max(0,Math.min(1,Number(event.p)||0)),source:isCurrentOrigin?'live':'catchup',graded:false});
    }
    state.streamPredictions=state.streamPredictions.slice(-MAX_STREAM_PREDICTIONS);
    for (const window of result.windows || []) {
      if (!window || window.status === 'learning') continue;
      for (const flow of FLOWS) {
        const prediction = window[flow];
        if (!prediction || !Array.isArray(prediction.quantiles) || prediction.quantiles.length !== 9) continue;
        const expertId = prediction.selection || 'equalWeight';
        const key = `${origin}|${window.key}|${flow}|${expertId}`;
        if (state.forecasts.some(row => row.key === key)) continue;
        const naive = prediction.experts && prediction.experts.seasonalNaive;
        state.forecasts.push({
          key, source: isCurrentOrigin ? 'live' : 'catchup', asOf: origin, targetStart: core.addDays(origin, 1), targetEnd: core.addDays(origin, window.days),
          window: window.key, days: window.days, flow, expertId,
          quantiles: prediction.quantiles.slice(),
          naiveQuantiles: Array.isArray(naive) && naive.length === 9 ? naive.slice() : prediction.quantiles.slice(),
          components: prediction.experts ? clone(prediction.experts) : null,
          ensemble:prediction.ensemble?clone(prediction.ensemble):null,
          regimeActive,
          graded: false
        });
      }
    }
  }
  function runTeacherChunk(transactions, labels, previousState, today, options) {
    options = options || {};
    if (!core.validISO(today)) throw new TypeError('Teacher today must be a valid YYYY-MM-DD date.');
    const state = normalizeState(previousState);
    const wasUninitialized = !core.validISO(state.lastOrigin);
    if (wasUninitialized) {
      state.initializedOn = today;
      state.lastOrigin = core.addDays(today, -1);
      seedCalibrationFromBacktest(state, options.backtestCalibration);
    }
    const chunkDays = Math.max(1, Math.min(30, Number(options.chunkDays) || 7));
    const firstOrigin = core.addDays(state.lastOrigin, 1);
    const totalPending = Math.max(0, core.daysBetween(firstOrigin, today) + 1);
    const processCount = Math.min(chunkDays, totalPending);
    let processed = 0, graded = 0;
    for (let i = 0; i < processCount; i++) {
      const origin = core.addDays(firstOrigin, i);
      graded += gradeDue(state, transactions, origin);
      gradeStreamPredictions(state, transactions, origin);
      forecastOrigin(state, transactions, labels, origin, today, options);
      state.lastOrigin = origin;
      processed += 1;
    }
    // Grade forecasts whose target windows finished before today's incomplete calendar day.
    graded += gradeDue(state, transactions, today);
    gradeStreamPredictions(state, transactions, today);
    if (state.forecasts.length > MAX_FORECASTS) {
      const keep = state.forecasts.filter(row => !row.graded).concat(state.forecasts.filter(row => row.graded).slice(-(MAX_FORECASTS)));
      state.forecasts = keep.slice(-MAX_FORECASTS);
    }
    state.brain = summarizeTeacher(state, today);
    const pending = state.lastOrigin < today;
    return {
      teacher: state,
      processed,
      graded,
      pending,
      nextOrigin: pending ? core.addDays(state.lastOrigin, 1) : null,
      brain: state.brain,
      calibration: state.calibration
    };
  }

  return { createTeacherState, runTeacherChunk, summarizeTeacher, toLiveCalibration, gradeDue, gradeStreamPredictions, updateCircuitBreaker, seedCalibrationFromBacktest };
});
