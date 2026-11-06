/* Aruvi Forecasting Core v1.0
 * Pure, deterministic local forecasting primitives. No network and no ambient clock.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.PocketWiseForecastCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const QUANTILE_LEVELS = Object.freeze([0.1,0.2,0.3,0.4,0.5,0.6,0.7,0.8,0.9]);
  const WINDOW_DEFS = Object.freeze([{key:'day',days:1},{key:'week',days:7},{key:'month',days:28}]);
  const DAY_MS = 86400000;

  function validISO(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const [y,m,d] = value.split('-').map(Number);
    const date = new Date(Date.UTC(y,m-1,d));
    return date.getUTCFullYear() === y && date.getUTCMonth() === m-1 && date.getUTCDate() === d;
  }
  function dayNumber(value) {
    if (!validISO(value)) return NaN;
    const [y,m,d] = value.split('-').map(Number);
    return Math.floor(Date.UTC(y,m-1,d) / DAY_MS);
  }
  function isoFromDay(number) {
    if (!Number.isFinite(number)) return '';
    const d = new Date(Math.trunc(number) * DAY_MS);
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}-${String(d.getUTCDate()).padStart(2,'0')}`;
  }
  function addDays(value, amount) { return isoFromDay(dayNumber(value) + Math.trunc(amount)); }
  function daysBetween(a,b) { return dayNumber(b) - dayNumber(a); }
  function weekday(value) { const day = new Date(dayNumber(value) * DAY_MS).getUTCDay(); return day; }
  function minor(value) {
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? Math.round((n + Number.EPSILON) * 100) : 0;
  }
  function median(values) {
    if (!values.length) return 0;
    const sorted = values.map(Number).filter(Number.isFinite).sort((a,b)=>a-b);
    if (!sorted.length) return 0;
    const mid = Math.floor(sorted.length/2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid-1] + sorted[mid]) / 2;
  }
  function quantile(values, p) {
    if (!values.length) return 0;
    const sorted = values.map(Number).filter(Number.isFinite).sort((a,b)=>a-b);
    if (!sorted.length) return 0;
    const position = Math.max(0,Math.min(1,p)) * (sorted.length-1);
    const lower = Math.floor(position), upper = Math.ceil(position), weight = position-lower;
    return sorted[lower] * (1-weight) + sorted[upper] * weight;
  }
  function quantileVector(values) { return QUANTILE_LEVELS.map(level => quantile(values,level)); }
  function enforceMonotone(values) {
    const next = values.map(v => Math.max(0,Number(v)||0));
    for (let i=1;i<next.length;i++) next[i] = Math.max(next[i],next[i-1]);
    return next;
  }
  function mulberry32(seed) {
    let state = (Number(seed) >>> 0) || 0x6d2b79f5;
    return function () {
      state = (state + 0x6D2B79F5) >>> 0;
      let t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function hashString(value) {
    let hash = 2166136261;
    for (let i=0;i<value.length;i++) { hash ^= value.charCodeAt(i); hash = Math.imul(hash,16777619); }
    return (hash >>> 0).toString(36);
  }
  function normalizeMerchant(value) {
    return String(value || '')
      .normalize('NFKD')
      .toLowerCase()
      .replace(/^(?:upi|imps|neft|rtgs|pos)[\s/*:_-]*(?:cr|dr)?[\s/*:_-]*/g,' ')
      .replace(/\b(?:upi|imps|neft|rtgs|pos|ecs|nach|mandate|card|debit|credit|cr|dr)\b[\s/*:_-]*/g,' ')
      .replace(/\b(?:utr|rrn|ref(?:erence)?|txn|transaction|id)\s*[:#-]?\s*[a-z0-9-]+/g,' ')
      .replace(/[a-z0-9._%+-]+@[a-z0-9.-]+/g,' ')
      .replace(/(?:^|\s)@[a-z0-9._-]+/g,' ')
      .replace(/\b\d{4,}\b/g,' ')
      .replace(/\b(?:india|kerala|kochi|calicut|kozhikode|malappuram|nilambur)\b/g,' ')
      .replace(/\b(?:private limited|pvt ltd|limited|ltd|llp|payments|payment|online|services)\b/g,' ')
      .replace(/[^a-z0-9]+/g,' ')
      .trim().replace(/\s+/g,' ')
      .slice(0,100);
  }
  function jaroWinkler(a,b) {
    a=String(a||''); b=String(b||'');
    if (a===b) return 1;
    if (!a||!b) return 0;
    const range=Math.max(0,Math.floor(Math.max(a.length,b.length)/2)-1);
    const am=new Array(a.length).fill(false), bm=new Array(b.length).fill(false);
    let matches=0, transpositions=0;
    for(let i=0;i<a.length;i++){
      const start=Math.max(0,i-range), end=Math.min(i+range+1,b.length);
      for(let j=start;j<end;j++) if(!bm[j]&&a[i]===b[j]){am[i]=true;bm[j]=true;matches++;break;}
    }
    if(!matches)return 0;
    let k=0;
    for(let i=0;i<a.length;i++) if(am[i]){while(!bm[k])k++;if(a[i]!==b[k])transpositions++;k++;}
    const m=matches, t=transpositions/2;
    const jaro=(m/a.length+m/b.length+(m-t)/m)/3;
    let prefix=0;while(prefix<Math.min(4,a.length,b.length)&&a[prefix]===b[prefix])prefix++;
    return jaro+prefix*0.1*(1-jaro);
  }
  function extractMerchant(tx) {
    if (tx && tx.merchantName) return String(tx.merchantName).trim().slice(0,120);
    const note=String(tx && tx.note || '');
    const labelled=note.match(/(?:^|[·|;])\s*Merchant:\s*([^·|;]+)/i);
    return labelled ? labelled[1].trim().slice(0,120) : '';
  }
  function normalizeTransactions(transactions, asOf) {
    const origin=dayNumber(asOf);
    const txs=[];
    for(const tx of Array.isArray(transactions)?transactions:[]) {
      const date=String(tx && tx.date || '');
      const day=dayNumber(date);
      if(!Number.isFinite(day)||day>=origin) continue; // origin day is incomplete; only data before asOf is usable
      const type=String(tx && tx.type || '').toLowerCase();
      if(!['expense','income','refund'].includes(type)) continue; // transfers, lending and debt principal are deliberately excluded
      const amountMinor=minor(tx && tx.amount);
      if(!amountMinor) continue;
      const merchantRaw=extractMerchant(tx);
      const merchantNorm=normalizeMerchant(merchantRaw);
      txs.push({id:String(tx.id||`${date}:${type}:${amountMinor}:${tx.activityId||''}`),date,day,type,amountMinor,merchantRaw,merchantNorm,activityId:String(tx.activityId||'other'),accountId:String(tx.accountId||''),tags:Array.isArray(tx.tags)?tx.tags.slice(0,12):[]});
    }
    txs.sort((a,b)=>a.day-b.day || a.id.localeCompare(b.id));
    // Refunds reduce the nearest matching expense within the preceding 30 days.
    const expenses=txs.filter(t=>t.type==='expense');
    for(const refund of txs.filter(t=>t.type==='refund')) {
      if(!refund.merchantNorm) continue;
      let best=null,bestDistance=31;
      for(const expense of expenses) {
        if(expense.merchantNorm!==refund.merchantNorm) continue;
        const distance=refund.day-expense.day;
        if(distance>=0&&distance<=30&&distance<bestDistance){best=expense;bestDistance=distance;}
      }
      if(best){best.amountMinor=Math.max(0,best.amountMinor-refund.amountMinor);best.refundedMinor=(best.refundedMinor||0)+refund.amountMinor;}
    }
    return txs.filter(t=>t.type!=='refund' && t.amountMinor>0);
  }
  function buildDailySeries(transactions, asOf, options) {
    options=options||{};
    const txs=normalizeTransactions(transactions,asOf);
    const origin=dayNumber(asOf);
    if(!Number.isFinite(origin)) throw new TypeError('asOf must be a valid local YYYY-MM-DD date.');
    if(!txs.length) return {asOf,historyDays:0,rows:[],transactions:txs,loggingCoverage:0,gaps:[]};
    const maxDays=Math.max(14,Math.min(730,Number(options.maxDays)||365));
    const first=Math.max(Math.min(...txs.map(t=>t.day)),origin-maxDays);
    const byDay=new Map();
    for(const tx of txs){
      if(tx.day<first)continue;
      const row=byDay.get(tx.date)||{date:tx.date,day:tx.day,expenseMinor:0,incomeMinor:0,expenseCount:0,incomeCount:0,logged:false};
      if(tx.type==='expense'){row.expenseMinor+=tx.amountMinor;row.expenseCount++;}
      else if(tx.type==='income'){row.incomeMinor+=tx.amountMinor;row.incomeCount++;}
      row.logged=true;byDay.set(tx.date,row);
    }
    const rows=[];
    for(let day=first;day<origin;day++){
      const date=isoFromDay(day);
      rows.push(byDay.get(date)||{date,day,expenseMinor:0,incomeMinor:0,expenseCount:0,incomeCount:0,logged:false});
    }
    const recent=rows.slice(-28);
    const loggingCoverage=recent.length?recent.filter(row=>row.logged).length/recent.length:0;
    const gapDays=[];
    if(loggingCoverage>=0.55){
      let run=[];
      for(const row of rows){
        if(!row.logged)run.push(row.date);
        else {if(run.length>=5)gapDays.push(...run);run=[];}
      }
      if(run.length>=5)gapDays.push(...run);
    }
    const gapSet=new Set(gapDays);
    rows.forEach(row=>{row.observed=!gapSet.has(row.date);row.isGap=gapSet.has(row.date);});
    return {asOf,historyDays:rows.length,rows,transactions:txs,loggingCoverage,gaps:gapDays};
  }
  function amountClusters(txs) {
    if(txs.length>2){
      const dates=txs.map(tx=>tx.day).sort((a,b)=>a-b);
      const spanMonths=Math.max(1,(dates[dates.length-1]-dates[0]+1)/30.4375);
      // Frequent merchants are variable-spend habits, not several subscriptions.
      // Keep them together; separate amount bands only for genuinely sparse merchants.
      if(txs.length/spanMonths>1.6)return [txs.slice()];
    }
    const sorted=txs.slice().sort((a,b)=>a.amountMinor-b.amountMinor);
    const clusters=[];
    for(const tx of sorted){
      let cluster=clusters[clusters.length-1];
      if(!cluster || Math.abs(tx.amountMinor-median(cluster.map(x=>x.amountMinor)))>Math.max(median(cluster.map(x=>x.amountMinor))*0.15,2500)){
        cluster=[];clusters.push(cluster);
      }
      cluster.push(tx);
    }
    // Split only when several amount bands have enough independent repetitions.
    // Otherwise preserve the variable-amount stream (e.g. groceries or electricity).
    const repeated=clusters.filter(c=>c.length>=3);
    return repeated.length>=2 ? repeated : [txs.slice()];
  }
  function splitSemiMonthly(txs) {
    const monthMap=new Map();
    for(const tx of txs){const month=tx.date.slice(0,7);if(!monthMap.has(month))monthMap.set(month,[]);monthMap.get(month).push(tx);}
    const days=new Map();
    for(const list of monthMap.values()) if(list.length>=2){
      for(const tx of list){const dom=Number(tx.date.slice(8,10));days.set(dom,(days.get(dom)||0)+1);}
    }
    const candidates=[...days.entries()].filter(([day,count])=>count>=3&&(day<=3||(day>=13&&day<=17))).sort((a,b)=>b[1]-a[1]).slice(0,6).map(([day])=>day).sort((a,b)=>a-b);
    for(let i=0;i<candidates.length;i++)for(let j=i+1;j<candidates.length;j++){
      if(candidates[j]-candidates[i]<8)continue;
      const left=txs.filter(tx=>Math.abs(Number(tx.date.slice(8,10))-candidates[i])<=2);
      const right=txs.filter(tx=>Math.abs(Number(tx.date.slice(8,10))-candidates[j])<=2);
      if(left.length>=3&&right.length>=3)return [left,right];
    }
    return [txs];
  }
  function cadenceFor(txs) {
    const dates=[...new Set(txs.map(tx=>tx.date))].sort();
    if(dates.length<2)return null;
    const days=dates.map(dayNumber), gaps=[];
    for(let i=1;i<days.length;i++)gaps.push(days[i]-days[i-1]);
    const mid=median(gaps), mad=median(gaps.map(v=>Math.abs(v-mid)));
    const doms=dates.map(d=>Number(d.slice(8,10)));
    const domMid=median(doms), domSpread=Math.max(...doms)-Math.min(...doms);
    const monthlySpacing=dates.length>=3&&gaps.every(gap=>gap>=25&&gap<=35)&&mad<=3.5;
    const monthEnds=dates.every(d=>{
      const day=Number(d.slice(8,10)),[y,m]=d.slice(0,7).split('-').map(Number);
      return day>=28 && day===new Date(Date.UTC(y,m,0)).getUTCDate();
    });
    const lastWorking=dates.every(d=>{
      const day=Number(d.slice(8,10)),[y,m]=d.slice(0,7).split('-').map(Number);
      const lastDay=new Date(Date.UTC(y,m,0)).getUTCDate();
      const wd=weekday(d);
      return day>=lastDay-3 && wd!==0 && wd!==6;
    });
    if(mid>=6&&mid<=8&&mad<=1.2&&dates.length>=4)return {type:'weekly',period:7,anchorDay:weekday(dates[dates.length-1]),tolerance:1,medianGap:mid,mad};
    if(mid>=12&&mid<=16&&mad<=2.2&&dates.length>=3)return {type:'fortnightly',period:14,anchorDay:weekday(dates[dates.length-1]),tolerance:2,medianGap:mid,mad};
    if((mid>=27&&mid<=32&&mad<=2.8&&domSpread<=4&&dates.length>=3) || (domSpread<=2&&monthlySpacing) || (monthEnds&&monthlySpacing) || (lastWorking&&monthlySpacing))return {type:'monthly',period:1,anchorDay:Math.round(domMid),tolerance:3,medianGap:mid,mad,monthEnd:monthEnds,lastWorking};
    if(mid>=86&&mid<=96&&mad<=5&&domSpread<=5&&dates.length>=3)return {type:'quarterly',period:3,anchorDay:Math.round(domMid),tolerance:5,medianGap:mid,mad};
    if(mid>=172&&mid<=192&&mad<=10&&dates.length>=3)return {type:'semiannual',period:6,anchorDay:Math.round(domMid),tolerance:10,medianGap:mid,mad};
    if(mid>=355&&mid<=375&&mad<=10&&dates.length>=3)return {type:'annual',period:12,anchorDay:Math.round(domMid),tolerance:10,medianGap:mid,mad};
    // Low-confidence exact monthly pair. Never promote two weekly observations.
    if(dates.length===2&&mid>=28&&mid<=31&&txs[0].amountMinor===txs[1].amountMinor)return {type:'monthly',period:1,anchorDay:Math.round(domMid),tolerance:2,medianGap:mid,mad,possible:true};
    return null;
  }
  function addCadence(value,cadence) {
    if(cadence.type==='weekly')return addDays(value,7);
    if(cadence.type==='fortnightly')return addDays(value,14);
    const [y,m,d]=value.split('-').map(Number);
    const months=cadence.type==='monthly'?1:cadence.type==='quarterly'?3:cadence.type==='semiannual'?6:12;
    const monthIndex=(m-1)+months, year=y+Math.floor(monthIndex/12), targetMonth=monthIndex%12;
    const lastDay=new Date(Date.UTC(year,targetMonth+1,0)).getUTCDate();
    const anchor=Math.max(1,Math.min(31,Number(cadence.anchorDay)||d));
    let targetDay=cadence.monthEnd||cadence.lastWorking?lastDay:Math.min(anchor,lastDay);
    if(cadence.lastWorking){
      const wd=new Date(Date.UTC(year,targetMonth,targetDay)).getUTCDay();
      if(wd===6)targetDay-=1;else if(wd===0)targetDay-=2;
    }
    return `${year}-${String(targetMonth+1).padStart(2,'0')}-${String(targetDay).padStart(2,'0')}`;
  }
  function streamOffsetDistribution(txs,cadence) {
    const ordered=txs.slice().sort((a,b)=>a.day-b.day);
    if(ordered.length<2)return [0];
    let expected=ordered[0].date;const offsets=[];
    for(let i=1;i<ordered.length;i++){
      expected=addCadence(expected,cadence);
      offsets.push(Math.max(-7,Math.min(7,daysBetween(expected,ordered[i].date))));
    }
    return offsets.length?offsets:[0];
  }
  function streamFeedbackKey(kind, merchantNorm, activityId, cadence) {
    const identity = merchantNorm ? `m:${merchantNorm}` : `a:${activityId || 'other'}`;
    const timing = cadence && cadence.type === 'monthly'
      ? `${cadence.type}:${cadence.monthEnd ? 'end' : cadence.lastWorking ? 'working' : (cadence.anchorDay || 0)}`
      : `${cadence?.type || 'unknown'}:${cadence?.anchorDay ?? ''}`;
    return `${kind}|${identity}|${timing}`.slice(0, 240);
  }

  function detectStreams(transactions, asOf, labels, streamStats) {
    labels=labels&&typeof labels==='object'?labels:{};
    streamStats=streamStats&&typeof streamStats==='object'?streamStats:{};
    const txs=normalizeTransactions(transactions,asOf);
    const groups=new Map();
    for(const tx of txs){
      const merchantKey=tx.merchantNorm?`merchant:${tx.merchantNorm}`:`activity:${tx.activityId}`;
      const key=`${tx.type}|${merchantKey}`;
      if(!groups.has(key))groups.set(key,[]);groups.get(key).push(tx);
    }
    // Merge only near-identical normalized merchant labels; preserve category-only groups separately.
    const names=[...new Set([...groups.keys()].filter(k=>k.includes('|merchant:')))].sort();
    const alias=new Map(names.map(name=>[name,name]));
    for(let i=0;i<names.length;i++)for(let j=i+1;j<names.length;j++){
      const a=names[i].split('|merchant:')[1],b=names[j].split('|merchant:')[1];
      if(jaroWinkler(a,b)>=0.92)alias.set(names[j],alias.get(names[i]));
    }
    const merged=new Map();
    for(const [key,list] of groups){const target=alias.get(key)||key;if(!merged.has(target))merged.set(target,[]);merged.get(target).push(...list);}
    const streams=[];
    for(const [groupKey,list] of merged){
      const split=splitSemiMonthly(list);
      const amountGroups=split.flatMap(group=>amountClusters(group));
      for(const cluster of amountGroups){
        const cadence=cadenceFor(cluster);
        if(!cadence)continue;
        const dates=[...new Set(cluster.map(t=>t.date))].sort();
        const n=dates.length;
        const amounts=cluster.map(t=>t.amountMinor);
        const amountMedian=median(amounts);
        const amountMad=median(amounts.map(v=>Math.abs(v-amountMedian)));
        const relativeMad=amountMad/Math.max(1,amountMedian);
        const regularity=1-Math.min(1,(cadence.mad||0)/Math.max(1,cadence.tolerance));
        const amountStability=1-Math.min(1,relativeMad/0.2);
        const hits=Math.max(0,n-1);
        const periodDays={weekly:7,fortnightly:14,monthly:30.4375,quarterly:91.3125,semiannual:182.625,annual:365.25}[cadence.type]||30.4375;
        const expectedIntervals=Math.max(0,Math.floor(daysBetween(dates[0],asOf)/periodDays));
        const misses=Math.max(0,expectedIntervals-hits);
        const hit=(hits+1)/(hits+misses+2);
        const confidence=Math.max(0,Math.min(1,(n/(n+2))*(0.5*regularity+0.3*amountStability+0.2*hit)));
        const merchant=cluster.find(t=>t.merchantRaw)?.merchantRaw||'';
        const merchantNorm=cluster.find(t=>t.merchantNorm)?.merchantNorm||'';
        const activityId=cluster[0].activityId;
        const flow=cluster[0].type;
        const signature=`${flow}|${groupKey}|${cadence.type}|${Math.round(amountMedian/100)}`;
        const key=signature;
        const id=`stream_${hashString(signature)}`;
        const label=labels[key]||{};
        const feedbackKey=streamFeedbackKey(flow,cluster.find(t=>t.merchantNorm)?.merchantNorm||'',cluster[0].activityId,cadence);
        const candidateFeedback=streamStats[feedbackKey]||null;
        const feedback=candidateFeedback&&validISO(candidateFeedback.lastEvaluatedOn)&&candidateFeedback.lastEvaluatedOn<=asOf?candidateFeedback:null;
        const lastDate=dates[dates.length-1];
        let nextExpected=addCadence(lastDate,cadence),guard=0;
        while(nextExpected<=asOf&&guard++<500)nextExpected=addCadence(nextExpected,cadence);
        const logAmounts=amounts.map(v=>Math.log(Math.max(1,v)));
        const logMid=median(logAmounts);
        const logMad=median(logAmounts.map(v=>Math.abs(v-logMid)));
        const sigma=Math.max(0.025,Math.min(0.55,logMad*1.4826));
        const status=['confirmed','rejected','muted'].includes(label.status)?label.status:'auto';
        const consecutiveMisses=Math.max(0,Number(feedback?.consecutiveMisses)||0);
        const lifecycleStatus=consecutiveMisses>=2?'dormant':consecutiveMisses===1?'suspected_dormant':'active';
        streams.push({id,key,feedbackKey,kind:flow,merchant,merchantNorm,activityId,cadence,amountModel:{medianMinor:Math.round(Number(label.amountMinor)||amountMedian),sigma,minMinor:Math.min(...amounts),maxMinor:Math.max(...amounts),fixed:relativeMad<0.03},offsetDist:streamOffsetDistribution(cluster,cadence),confidence:status==='confirmed'?Math.max(0.8,confidence):confidence,hits,misses,lastSeen:lastDate,nextExpected,status,lifecycleStatus,feedback:feedback?{n:(Number(feedback.liveHits)||0)+(Number(feedback.liveMisses)||0),hits:Number(feedback.liveHits)||0,misses:Number(feedback.liveMisses)||0,amountErrorPct:Number(feedback.amountErrorEwma)||null,timingErrorDays:Number(feedback.timingErrorEwma)||null}:null,possible:!!cadence.possible,matchedTransactionIds:cluster.map(t=>t.id),occurrences:n,reason:`${merchant||'This category'} · ${cadence.type} · ${n} recorded payments`,labelOverride:label});
      }
    }
    return streams.filter(stream=>stream.confidence>=0.4||stream.possible||stream.status!=='auto').sort((a,b)=>b.confidence-a.confidence);
  }
  function scheduledEvents(streams, asOf, days, streamStats) {
    const start=addDays(asOf,1),end=addDays(asOf,days),events=[];
    streamStats=streamStats&&typeof streamStats==='object'?streamStats:{};
    for(const stream of streams){
      if(stream.status==='rejected'||stream.status==='muted'||stream.confidence<0.4)continue;
      const candidateFeedback=streamStats[stream.feedbackKey]||{};
      const feedback=validISO(candidateFeedback.lastEvaluatedOn)&&candidateFeedback.lastEvaluatedOn<=asOf?candidateFeedback:{};
      const liveHits=Math.max(0,Number(feedback.liveHits)||0),liveMisses=Math.max(0,Number(feedback.liveMisses)||0);
      const catchupHits=Math.max(0,Number(feedback.catchupHits)||0),catchupMisses=Math.max(0,Number(feedback.catchupMisses)||0);
      const effectiveHits=liveHits+catchupHits*0.25,effectiveMisses=liveMisses+catchupMisses*0.25;
      const effectiveN=effectiveHits+effectiveMisses;
      const feedbackProbability=(effectiveHits+1)/(effectiveN+2);
      const feedbackWeight=effectiveN/(effectiveN+6);
      const baseProbability=(stream.hits+1)/(stream.hits+stream.misses+2);
      let probability=baseProbability*(1-feedbackWeight)+feedbackProbability*feedbackWeight;
      const consecutiveMisses=Math.max(0,Number(feedback.consecutiveMisses)||0);
      if(stream.status==='confirmed'&&consecutiveMisses<2)probability=Math.max(0.8,probability);
      if(consecutiveMisses===1)probability=Math.min(probability,0.65);
      if(consecutiveMisses>=2)probability=Math.min(probability,0.3);
      let date=stream.nextExpected,guard=0;
      while(date&&date<=end&&guard++<100){
        const offsets=stream.offsetDist&&stream.offsetDist.length?stream.offsetDist:[0];
        events.push({date,streamId:stream.id,streamKey:stream.key,feedbackKey:stream.feedbackKey,flow:stream.kind,p:Math.max(0,Math.min(1,probability)),confidence:stream.confidence,amountMedianMinor:stream.amountModel.medianMinor,sigma:stream.amountModel.sigma,offsetDist:offsets,toleranceDays:Math.max(1,Number(stream.cadence?.tolerance)||2),merchant:stream.merchant,merchantNorm:stream.merchantNorm,activityId:stream.activityId,cadenceType:stream.cadence?.type||'unknown',reason:stream.reason,lifecycleStatus:consecutiveMisses>=2?'dormant':consecutiveMisses===1?'suspected_dormant':'active'});
        date=addCadence(date,stream.cadence);
      }
    }
    return events.filter(event=>event.date>=start&&event.date<=end).sort((a,b)=>a.date.localeCompare(b.date));
  }
  function subtractMatchedStreams(series, streams) {
    const rows=series.rows.map(row=>({...row}));
    const byDate=new Map(rows.map(row=>[row.date,row]));
    const matched=new Set(streams.filter(stream=>!['rejected','muted'].includes(stream.status)).flatMap(stream=>stream.matchedTransactionIds||[]));
    for(const tx of series.transactions){
      if(!matched.has(tx.id))continue;
      const row=byDate.get(tx.date);if(!row)continue;
      if(tx.type==='expense')row.expenseMinor=Math.max(0,row.expenseMinor-tx.amountMinor);
      if(tx.type==='income')row.incomeMinor=Math.max(0,row.incomeMinor-tx.amountMinor);
    }
    return rows;
  }
  function makeWeekBlocks(rows, flowKey) {
    const byDate=new Map(rows.map(row=>[row.date,row]));
    const blocks=[];
    for(const row of rows){
      if(weekday(row.date)!==1)continue;
      const block=[];let complete=true;
      for(let i=0;i<7;i++){
        const date=addDays(row.date,i),item=byDate.get(date);
        if(!item||!item.observed){complete=false;break;}
        block.push(item[flowKey]);
      }
      if(complete)blocks.push(block);
    }
    return blocks;
  }
  function sampleLogNormal(medianMinor,sigma,rng) {
    const u1=Math.max(1e-12,rng()),u2=rng();
    const z=Math.sqrt(-2*Math.log(u1))*Math.cos(2*Math.PI*u2);
    return Math.max(0,Math.round(medianMinor*Math.exp(z*sigma)));
  }
  function sampleHistoricalSize(values,rng) {
    if(!values.length)return 0;
    return values[Math.min(values.length-1,Math.floor(rng()*values.length))];
  }
  function flowSamples(rows,flowKey,horizon,asOf,N,rng,lookbackDays) {
    const cutoff=Number(lookbackDays)>0?addDays(asOf,-Math.max(14,Math.min(365,Number(lookbackDays)))):null;
    const observed=rows.filter(row=>row.observed&&(!cutoff||row.date>=cutoff)).slice(-84);
    const allValues=observed.map(row=>Math.max(0,Number(row[flowKey])||0));
    const positive=allValues.filter(v=>v>0);
    const overallP=(positive.length+1)/(allValues.length+2);
    const buckets=Array.from({length:7},()=>[]), weekdayTotals=Array.from({length:7},()=>({n:0,k:0}));
    observed.forEach(row=>{const wd=weekday(row.date),v=Math.max(0,Number(row[flowKey])||0);weekdayTotals[wd].n++;if(v>0){weekdayTotals[wd].k++;buckets[wd].push(v);}});
    const blocks=makeWeekBlocks(observed,flowKey);
    const hurdle=new Array(N),blockSample=new Array(N);
    for(let p=0;p<N;p++){
      let h=0,b=0;
      let chosenBlock=-1;
      for(let d=0;d<horizon;d++){
        const targetDate=addDays(asOf,d+1);
        const wd=weekday(targetDate),stats=weekdayTotals[wd];
        const priorStrength=4;
        const probability=(stats.k+overallP*priorStrength)/(stats.n+priorStrength||1);
        if(rng()<probability){const pool=buckets[wd].length?buckets[wd]:positive;h+=sampleHistoricalSize(pool,rng);}
        if(d%7===0)chosenBlock=blocks.length?Math.floor(rng()*blocks.length):-1;
        if(chosenBlock>=0){const source=blocks[chosenBlock];b+=Math.max(0,Number(source[wd===0?6:wd-1])||0);}
        else {const pool=buckets[wd].length?buckets[wd]:allValues;b+=sampleHistoricalSize(pool,rng);}
      }
      hurdle[p]=h;blockSample[p]=b;
    }
    return {hurdle,block:blockSample};
  }
  function eventOffset(event,rng) {
    const offsets=Array.isArray(event.offsetDist)&&event.offsetDist.length?event.offsetDist:[0];
    return Number(offsets[Math.min(offsets.length-1,Math.floor(rng()*offsets.length))])||0;
  }
  function allHistoryFlow(rows,flowKey,lookbackDays,asOf) {
    const cutoff=Number(lookbackDays)>0?addDays(asOf,-Math.max(14,Math.min(365,Number(lookbackDays)))):null;
    return rows.filter(row=>row.observed&&(!cutoff||row.date>=cutoff)).slice(-28).map(row=>Math.max(0,Number(row[flowKey])||0));
  }
  function historicalWindowSamples(rows,flowKey,days,asOf,lookbackDays) {
    const cutoff=Number(lookbackDays)>0?addDays(asOf,-Math.max(14,Math.min(365,Number(lookbackDays)))):null;
    const observed=rows.filter(row=>row.observed&&(!cutoff||row.date>=cutoff));
    const samples=[];
    if(days===1){
      const targetWeekday=weekday(addDays(asOf,1));
      for(let i=observed.length-1;i>=0&&samples.length<12;i--){
        if(weekday(observed[i].date)===targetWeekday)samples.push(Math.max(0,Number(observed[i][flowKey])||0));
      }
    } else {
      for(let end=observed.length-1;end>=days-1&&samples.length<12;end-=7){
        const window=observed.slice(end-days+1,end+1);
        if(window.length!==days)continue;
        const continuous=window.every((row,index)=>index===0||row.day===window[index-1].day+1);
        if(continuous)samples.push(window.reduce((sum,row)=>sum+Math.max(0,Number(row[flowKey])||0),0));
      }
    }
    return samples;
  }
  function weightedRecentWIS(stat,asOf) {
    const history=Array.isArray(stat?.history)?stat.history:[];
    const cutoff=addDays(asOf,-84),now=dayNumber(asOf),halfLife=42;
    let sum=0,weightSum=0,count=0;
    for(const item of history){
      if(item?.source!=='live'||!validISO(item.gradedOn)||item.gradedOn<cutoff||item.gradedOn>asOf||!Number.isFinite(Number(item.wis)))continue;
      const age=Math.max(0,now-dayNumber(item.gradedOn));
      const weight=Math.pow(0.5,age/halfLife);
      sum+=Number(item.wis)*weight;weightSum+=weight;count++;
    }
    return {wis:weightSum?sum/weightSum:null,n:count};
  }
  function capAndNormalizeWeights(raw,cap,floor) {
    const n=raw.length;if(!n)return [];
    const safe=raw.map(value=>Math.max(1e-9,Number(value)||0));
    const limit=Math.max(1/n,Math.min(1,Number(cap)||1));
    let active=safe.map((_,index)=>index),out=new Array(n).fill(0),remaining=1;
    for(let pass=0;pass<n+1&&active.length;pass++){
      const total=active.reduce((sum,index)=>sum+safe[index],0)||active.length;
      const capped=active.filter(index=>safe[index]/total*remaining>limit+1e-12);
      if(!capped.length){for(const index of active)out[index]=safe[index]/total*remaining;break;}
      for(const index of capped){out[index]=limit;remaining-=limit;}
      active=active.filter(index=>!capped.includes(index));
    }
    const min=Math.max(0,Math.min(0.2,Number(floor)||0));
    out=out.map(value=>Math.max(min,value));
    let total=out.reduce((sum,value)=>sum+value,0)||1;
    out=out.map(value=>value/total);
    // A final projection keeps the cap true after the minimum-weight floor.
    for(let pass=0;pass<4;pass++){
      const over=out.map((value,index)=>value>limit+1e-10?index:-1).filter(index=>index>=0);
      if(!over.length)break;
      let excess=0;for(const index of over){excess+=out[index]-limit;out[index]=limit;}
      const under=out.map((value,index)=>value<limit-1e-10?index:-1).filter(index=>index>=0);
      const underTotal=under.reduce((sum,index)=>sum+out[index],0)||under.length;
      for(const index of under)out[index]+=excess*(out[index]||1)/underTotal;
      total=out.reduce((sum,value)=>sum+value,0)||1;out=out.map(value=>value/total);
    }
    return out;
  }
  function learnedEnsembleWeights(expertStats,windowKey,flow,asOf,circuitBreaker) {
    const ids=['hurdle','blockBootstrap','seasonalNaive'];
    const stats=expertStats&&typeof expertStats==='object'?expertStats:{};
    const equal=weightedRecentWIS(stats[`equalWeight|${windowKey}|${flow}`],asOf);
    const candidates=ids.map(id=>({id,...weightedRecentWIS(stats[`${id}|${windowKey}|${flow}`],asOf)}));
    const ready=equal.n>=8&&Number.isFinite(equal.wis)&&equal.wis>0&&candidates.every(item=>item.n>=8&&Number.isFinite(item.wis));
    if(!ready)return {ready:false,active:false,n:equal.n||0,weights:{},ratios:{},reason:'Need at least 8 live ensemble grades and 8 live grades per expert before the learned tilt can begin.'};
    const ratios={};
    for(const item of candidates)ratios[item.id]=Math.max(0,Math.min(10,item.wis/Math.max(1e-9,equal.wis)));
    const logits=ids.map(id=>-2*ratios[id]),max=Math.max(...logits),exp=logits.map(value=>Math.exp(value-max));
    const softmaxTotal=exp.reduce((sum,value)=>sum+value,0)||1;
    const lambda=Math.min(1,equal.n/30);
    const raw=exp.map(value=>(1-lambda)/ids.length+lambda*value/softmaxTotal);
    const maxWeight=Math.max(0.3,2/ids.length);
    const capped=capAndNormalizeWeights(raw,maxWeight,0.03);
    const weights=Object.fromEntries(ids.map((id,index)=>[id,capped[index]]));
    const breakerCurrent=!!circuitBreaker?.tripped&&(!validISO(circuitBreaker.lastEvaluatedOn)||circuitBreaker.lastEvaluatedOn<=asOf);
    return {ready:true,active:!breakerCurrent,n:equal.n,lambda,weights,ratios,maxWeight,tripped:breakerCurrent,reason:breakerCurrent?'Circuit breaker disabled learned weighting.':'Learned weights are active.'};
  }

  function forecastFlow(rows,rawRows,flow,events,asOf,days,N,seed,selection,context) {
    context=context||{};
    const flowKey=flow==='expense'?'expenseMinor':'incomeMinor';
    const ablation=context.ablation||{};
    const windowKey=context.windowKey|| (days===1?'day':days===7?'week':'month');
    const lookbackDays=context.lookbackDays===0?0:(Number(context.lookbackDays)||84);
    const rng=mulberry32(seed);
    const samples=flowSamples(rows,flowKey,days,asOf,N,rng,lookbackDays);
    const start=addDays(asOf,1),scheduled=[];
    for(let i=0;i<N;i++){
      let total=0;
      for(const event of events){
        if(event.flow!==flow||rng()>=event.p)continue;
        const shifted=addDays(event.date,eventOffset(event,rng));
        if(shifted<start||shifted>addDays(asOf,days))continue;
        total+=sampleLogNormal(event.amountMedianMinor,event.sigma,rng);
      }
      scheduled.push(total);
    }
    const h=samples.hurdle.map((value,i)=>value+scheduled[i]);
    const b=samples.block.map((value,i)=>value+scheduled[i]);
    const qh=quantileVector(h),qb=quantileVector(b);
    const rawSamples=historicalWindowSamples(rawRows,flowKey,days,asOf,lookbackDays);
    const qnaive=rawSamples.length?quantileVector(rawSamples):quantileVector(allHistoryFlow(rows,flowKey,lookbackDays,asOf));
    // The equal-weight blend remains the unlearned default and challenger.
    const experts=[...(!ablation.hurdle?[qh]:[]),...(!ablation.blockBootstrap?[qb]:[]),qnaive];
    const equalWeight=enforceMonotone(qnaive.map((_,i)=>experts.reduce((sum,values)=>sum+values[i],0)/experts.length));
    const ensemble=learnedEnsembleWeights(context.expertStats,windowKey,flow,asOf,context.circuitBreaker);
    const baseVectors={hurdle:qh,blockBootstrap:qb,seasonalNaive:qnaive};
    const tiltVectors=ensemble.ready?enforceMonotone(qnaive.map((_,i)=>Object.entries(ensemble.weights).reduce((sum,[id,weight])=>sum+baseVectors[id][i]*weight,0))):null;
    const useTilt=selection!=='seasonalNaive'&&ensemble.ready&&ensemble.active;
    const selected=selection==='seasonalNaive'?'seasonalNaive':useTilt?'learnedTilt':'equalWeight';
    const combined=selected==='seasonalNaive'?qnaive:selected==='learnedTilt'?tiltVectors:equalWeight;
    const expertVectors={hurdle:qh,blockBootstrap:qb,seasonalNaive:qnaive,equalWeight};
    if(tiltVectors)expertVectors.learnedTilt=tiltVectors;
    return {quantiles:combined,medianMinor:combined[4],lowerMinor:combined[0],upperMinor:combined[8],selection:selected,experts:expertVectors,ensemble:{...ensemble,selected},scheduledMedianMinor:quantile(scheduled,0.5),variableMedianMinor:Math.max(0,combined[4]-quantile(scheduled,0.5))};
  }
  function deriveSelections(summary,minGrades) {
    const threshold=Math.max(4,Number(minGrades)||8),selections={};
    for(const window of WINDOW_DEFS)for(const flow of ['expense','income']){
      const key=`${window.key}_${flow}`,row=summary&&summary[key];
      selections[key]=row&&row.n>=threshold&&(row.naiveWis===0||Number(row.skillVsNaive)<=0)?'seasonalNaive':'equalWeight';
    }
    return selections;
  }
  function wilsonInterval(successes,total,z) {
    const n=Math.max(0,Number(total)||0);if(!n)return null;
    const p=Math.max(0,Math.min(1,(Number(successes)||0)/n)),critical=Number(z)||1.96;
    const denominator=1+critical*critical/n,center=(p+critical*critical/(2*n))/denominator;
    const margin=critical*Math.sqrt((p*(1-p)+critical*critical/(4*n))/n)/denominator;
    return [Math.max(0,center-margin),Math.min(1,center+margin)];
  }
  function calibrationStateFromGrades(grades,selections) {
    const result={};selections=selections||{};
    for(const window of WINDOW_DEFS)for(const flow of ['expense','income']){
      const key=`${window.key}_${flow}`,selected=selections[key]==='seasonalNaive'?'seasonalNaive':'equalWeight';
      const forecastKey=selected==='seasonalNaive'?`${flow}NaiveForecast`:`${flow}Forecast`;
      const gradeKey=selected==='seasonalNaive'?`naive${flow[0].toUpperCase()+flow.slice(1)}`:flow;
      const records=(grades||[]).filter(g=>g&&g.window===window.key&&g[gradeKey]&&Array.isArray(g[forecastKey])).slice(-52);
      const scores=records.map(g=>Math.max(g[forecastKey][0]-g[gradeKey].actual,g[gradeKey].actual-g[forecastKey][8]));
      const covered=records.filter(g=>g[gradeKey].inOuter).length;
      result[key]={n:records.length,scores,delta:scores.length?quantile(scores,0.8):null,coverage:records.length?covered/records.length:null,coverageWilson:records.length>=20?wilsonInterval(covered,records.length):null,source:'backtest',expert:selected};
    }
    return result;
  }
  function applyCalibration(forecastResult,calibrator) {
    const n=Number(calibrator&&calibrator.n)||0;
    if(n<20||!Number.isFinite(Number(calibrator.delta)))return {...forecastResult,calibration:{state:'learning',graded:n,coverage:calibrator?.coverage??null,source:calibrator?.source||null}};
    const q=forecastResult.quantiles.slice(),delta=Number(calibrator.delta),medianValue=q[4];
    const lower=Math.min(medianValue,Math.max(0,q[0]-delta));
    const upper=Math.max(medianValue,q[8]+delta);
    q[0]=lower;q[8]=upper;
    const source=calibrator.source==='live'?'live':'backtest';
    return {...forecastResult,quantiles:q,lowerMinor:lower,upperMinor:upper,calibration:{state:`${source}-calibrated`,graded:n,coverage:calibrator.coverage,deltaMinor:delta,source}};
  }

  function weekStart(date) { return addDays(date,-((weekday(date)+6)%7)); }
  function detectRegimeChanges(rows,asOf) {
    const buckets=new Map();
    for(const row of rows||[]){
      if(!row?.observed||!validISO(row.date)||row.date>=asOf)continue;
      const start=weekStart(row.date);
      if(!buckets.has(start))buckets.set(start,[]);
      buckets.get(start).push(row);
    }
    const weeks=[];
    for(const [start,items] of [...buckets.entries()].sort((a,b)=>a[0].localeCompare(b[0]))){
      if(items.length!==7)continue;
      const unique=new Set(items.map(item=>item.date));
      if(unique.size!==7)continue;
      weeks.push({start,expenseMinor:items.reduce((sum,item)=>sum+Math.max(0,Number(item.expenseMinor)||0),0),incomeMinor:items.reduce((sum,item)=>sum+Math.max(0,Number(item.incomeMinor)||0),0)});
    }
    const results=[];
    if(weeks.length<8)return results;
    const sample=weeks.slice(-12);
    for(const flow of ['expense','income']){
      const field=flow==='expense'?'expenseMinor':'incomeMinor';
      const baselineWeeks=sample.slice(0,-3),recentWeeks=sample.slice(-3);
      if(baselineWeeks.length<5)continue;
      const baselineRaw=baselineWeeks.map(item=>item[field]);
      const recentRaw=recentWeeks.map(item=>item[field]);
      const baselineLog=baselineRaw.map(value=>Math.log1p(value/100));
      const recentLog=recentRaw.map(value=>Math.log1p(value/100));
      const center=median(baselineLog);
      const mad=median(baselineLog.map(value=>Math.abs(value-center)));
      const scale=Math.max(0.08,1.4826*mad,Math.abs(center)*0.08);
      let positive=0,negative=0,maxPositive=0,maxNegative=0;
      const k=0.5*scale;
      for(const value of recentLog){
        positive=Math.max(0,positive+(value-center)-k);
        negative=Math.max(0,negative+(center-value)-k);
        maxPositive=Math.max(maxPositive,positive);maxNegative=Math.max(maxNegative,negative);
      }
      const recentMedian=median(recentLog);
      const upCount=recentLog.filter(value=>value>center+1.25*scale).length;
      const downCount=recentLog.filter(value=>value<center-1.25*scale).length;
      const direction=upCount>=2?'up':downCount>=2?'down':null;
      const score=direction==='up'?maxPositive/scale:direction==='down'?maxNegative/scale:Math.max(maxPositive,maxNegative)/scale;
      if(!direction||score<4.5)continue;
      const idx=recentLog.findIndex(value=>direction==='up'?value>center+1.25*scale:value<center-1.25*scale);
      const startDate=recentWeeks[Math.max(0,idx)].start;
      results.push({flow,direction,startDate,detectedOn:asOf,baselineMedianMinor:Math.round(median(baselineRaw)),recentMedianMinor:Math.round(median(recentRaw)),relativeChange:median(baselineRaw)>0?median(recentRaw)/median(baselineRaw)-1:null,score:Number(score.toFixed(3)),lookbackDays:42,lookbackUntil:addDays(asOf,42),calibrationUntil:addDays(asOf,28),weeks:sample.length,reason:`${flow==='expense'?'Spending':'Income'} shifted ${direction==='up'?'up':'down'} over recent complete weeks.`});
    }
    return results;
  }

  function forecast(transactions, options) {
    options=options||{};
    const asOf=String(options.asOf||'');
    const seed=Number(options.seed)||0x51a7e;
    const paths=Math.max(200,Math.min(4000,Number(options.paths)||2000));
    const series=buildDailySeries(transactions,asOf,{maxDays:365});
    const labels=options.labels||{};
    const ablation=options.ablation||{};
    const streamStats=options.streamStats||{};
    const streams=ablation.recurrence?[]:detectStreams(transactions,asOf,labels,streamStats);
    const residualRows=subtractMatchedStreams(series,streams);
    const events=scheduledEvents(streams,asOf,28,streamStats);
    const detectedRegimeChanges=ablation.regime?[]:detectRegimeChanges(residualRows,asOf);
    const priorRegimeEvents=Array.isArray(options.regimeEvents)?options.regimeEvents:[];
    const rememberedRegime=priorRegimeEvents.some(event=>validISO(event.detectedOn)&&event.detectedOn<=asOf&&validISO(event.lookbackUntil)&&event.lookbackUntil>=asOf);
    const regimeActive=options.enableRegimeAdaptation===true&&(detectedRegimeChanges.length>0||rememberedRegime);
    const lookbackDays=regimeActive?42:0;
    const historyDays=series.historyDays;
    const windows=[];
    for(const window of WINDOW_DEFS){
      let status='learning',message='Log at least 14 days of transactions to start a useful estimate.';
      if(historyDays>=14&&window.days===7){status=historyDays<28?'early':'ready';message=historyDays<28?'Early estimate from recent spending. It is not calibrated yet.':'Based on recent spending and detected recurring activity.';}
      else if(historyDays>=28){status='ready';message='Based on recent spending and detected recurring activity.';}
      if(historyDays<14 || (window.days===1&&historyDays<28) || (window.days===28&&historyDays<28)){
        windows.push({key:window.key,days:window.days,status,message,expense:null,income:null,calibration:{state:'learning',graded:0,coverage:null}});continue;
      }
      const selections=options.selections||{},calibration=options.calibration||{};
      const expertStats=options.expertStats||{},circuitBreakers=options.circuitBreakers||{};
      const expenseRaw=forecastFlow(residualRows,series.rows,'expense',events,asOf,window.days,paths,(seed+window.days*31+1)>>>0,selections[`${window.key}_expense`],{ablation,windowKey:window.key,lookbackDays,expertStats,circuitBreaker:circuitBreakers[`${window.key}_expense`]});
      const incomeRaw=forecastFlow(residualRows,series.rows,'income',events,asOf,window.days,paths,(seed+window.days*31+2)>>>0,selections[`${window.key}_income`],{ablation,windowKey:window.key,lookbackDays,expertStats,circuitBreaker:circuitBreakers[`${window.key}_income`]});
      const expense=ablation.calibration?{...expenseRaw,calibration:{state:'disabled',graded:0,source:null}}:applyCalibration(expenseRaw,calibration[`${window.key}_expense`]);
      const income=ablation.calibration?{...incomeRaw,calibration:{state:'disabled',graded:0,source:null}}:applyCalibration(incomeRaw,calibration[`${window.key}_income`]);
      windows.push({key:window.key,days:window.days,status,message,expense,income,calibration:{expense:expense.calibration,income:income.calibration}});
    }
    const activeStreams=streams.filter(s=>s.status!=='muted');
    return {version:2,asOf,historyDays,tier:historyDays<14?'learning':historyDays<28?'early':historyDays<90?'basic':'candidate',loggingCoverage:series.loggingCoverage,gapDays:series.gaps,windows,streams,events,regimeChanges:detectedRegimeChanges,regimeActive,lookbackDays,explanations:buildExplanations(windows,streams,events,asOf),samplePaths:paths};
  }
  function buildExplanations(windows,streams,events,asOf) {
    return windows.filter(w=>w.status!=='learning').map(window=>({window:window.key,scheduled:events.filter(event=>event.date>=addDays(asOf,1)&&event.date<=addDays(asOf,window.days)),patterns:streams.filter(s=>s.confidence>=0.4).slice(0,4).map(s=>({name:s.merchant||'Recurring category',cadence:s.cadence.type,confidence:s.confidence,nextExpected:s.nextExpected,amountMinor:s.amountModel.medianMinor})),uncertainty:window.expense?Math.max(0,window.expense.upperMinor-window.expense.lowerMinor):null}));
  }
  function intervalScore(alpha,lower,upper,actual) {
    return (upper-lower)+(2/alpha)*Math.max(0,lower-actual)+(2/alpha)*Math.max(0,actual-upper);
  }
  function wis(quantiles,actual) {
    if(!Array.isArray(quantiles)||quantiles.length!==9||!Number.isFinite(Number(actual)))return NaN;
    const y=Number(actual),medianForecast=Number(quantiles[4]);
    let total=Math.abs(y-medianForecast);
    for(let k=1;k<=4;k++){
      const alpha=0.2*k,lower=Number(quantiles[k-1]),upper=Number(quantiles[9-k]);
      if(![lower,upper].every(Number.isFinite))return NaN;
      total+=alpha*intervalScore(alpha,lower,upper,y);
    }
    return total/9;
  }
  function pinball(tau,forecastValue,actual) {
    const error=actual-forecastValue;
    return Math.max(tau*error,(tau-1)*error);
  }
  function grade(quantiles,actual) {
    const score=wis(quantiles,actual),q=quantiles||[];
    const inCore=actual>=q[2]&&actual<=q[6],inOuter=actual>=q[0]&&actual<=q[8];
    const pinballScores=q.map((value,index)=>pinball(QUANTILE_LEVELS[index],value,actual));
    const width=Math.max(0,q[8]-q[0]),medianValue=Math.max(1,Math.abs(q[4]));
    const nearMissTolerance=Math.max(1,width*0.15);
    const distance=inCore||inOuter?0:actual<q[0]?q[0]-actual:actual>q[8]?actual-q[8]:0;
    let points=inCore?2:inOuter?1:distance<=nearMissTolerance?0:-1;
    if(!inOuter&&points===-1&&width/medianValue<0.3)points=-2;
    return {actual, wis:score, pinball:pinballScores, inCore, inOuter, points, bias:Math.sign(q[4]-actual)};
  }
  function expectedActual(transactions,startDate,days,flow) {
    const endDate=addDays(startDate,days-1);
    const txs=normalizeTransactions(transactions,addDays(endDate,1));
    const targetType=flow==='expense'?'expense':'income';
    return txs.filter(tx=>tx.type===targetType&&tx.date>=startDate&&tx.date<=endDate).reduce((sum,tx)=>sum+tx.amountMinor,0);
  }
  function backtestJobs(transactions,asOf) {
    const dates=normalizeTransactions(transactions,asOf).map(tx=>tx.date).sort();
    if(!dates.length)return [];
    const first=dates[0],jobs=[];
    for(const window of WINDOW_DEFS){
      const requiredHistory=window.key==='week'?14:28;
      const earliest=addDays(first,requiredHistory),latest=addDays(asOf,-window.days);
      if(earliest>latest)continue;
      let origin=earliest;
      while(origin<=latest){jobs.push({origin,window:window.key,days:window.days});origin=addDays(origin,7);}
      const relevant=jobs.filter(job=>job.window===window.key);
      if(relevant.length>26){const keep=new Set(relevant.slice(-26));for(let i=jobs.length-1;i>=0;i--)if(jobs[i].window===window.key&&!keep.has(jobs[i]))jobs.splice(i,1);}
    }
    return jobs;
  }
  function rollingBaselineQuantiles(transactions, origin, days, flow) {
    const series=buildDailySeries(transactions,origin,{maxDays:365});
    const flowKey=flow==='expense'?'expenseMinor':'incomeMinor';
    const samples=historicalWindowSamples(series.rows,flowKey,days,origin);
    return samples.length?quantileVector(samples):quantileVector(allHistoryFlow(series.rows,flowKey));
  }
  function backtestJob(transactions,labels,job,seed) {
    // Historical jobs have no timestamped user-decision log. Ignore present-day labels
    // rather than leaking a future confirm/reject decision into an earlier origin.
    const result=forecast(transactions,{asOf:job.origin,labels:{},seed,paths:300});
    const window=result.windows.find(item=>item.key===job.window);
    if(!window||window.status==='learning'||!window.expense||!window.income)return null;
    const start=addDays(job.origin,1);
    const actualExpense=expectedActual(transactions,start,job.days,'expense');
    const actualIncome=expectedActual(transactions,start,job.days,'income');
    const naiveExpense=rollingBaselineQuantiles(transactions,job.origin,job.days,'expense');
    const naiveIncome=rollingBaselineQuantiles(transactions,job.origin,job.days,'income');
    return {origin:job.origin,window:job.window,days:job.days,source:'backtest',expense:grade(window.expense.quantiles,actualExpense),income:grade(window.income.quantiles,actualIncome),naiveExpense:grade(naiveExpense,actualExpense),naiveIncome:grade(naiveIncome,actualIncome),expenseForecast:window.expense.quantiles,incomeForecast:window.income.quantiles,expenseNaiveForecast:naiveExpense,incomeNaiveForecast:naiveIncome};
  }
  function summarizeGrades(grades) {
    const summary={};
    for(const window of WINDOW_DEFS){
      for(const flow of ['expense','income']){
        const rows=grades.map(g=>g&&g.window===window.key&&g[flow]&&{score:g[flow].wis,covered:g[flow].inOuter,naive:g[`naive${flow[0].toUpperCase()+flow.slice(1)}`]?.wis}).filter(Boolean);
        const modelWis=rows.length?rows.reduce((sum,row)=>sum+row.score,0)/rows.length:null;
        const naiveWis=rows.length&&rows.every(row=>Number.isFinite(row.naive))?rows.reduce((sum,row)=>sum+row.naive,0)/rows.length:null;
        summary[`${window.key}_${flow}`]={n:rows.length,wis:modelWis,naiveWis,skillVsNaive:modelWis!==null&&naiveWis>0?1-modelWis/naiveWis:null,coverage:rows.length?rows.filter(x=>x.covered).length/rows.length:null};
      }
    }
    return summary;
  }
  function assertNoLeakage(transactions,asOf,options) {
    const base=forecast(transactions,{...options,asOf});
    const future=(transactions||[]).concat([{id:'leak-test',type:'expense',amount:987654321,date:addDays(asOf,1),merchantName:'Future secret purchase',activityId:'other'}]);
    const changed=forecast(future,{...options,asOf});
    return JSON.stringify(base)===JSON.stringify(changed);
  }
  function createSeededPersona(options) {
    options=options||{};
    const start=String(options.start||'2026-01-01'),days=Math.max(30,Number(options.days)||210),seed=Number(options.seed)||12345;
    const rng=mulberry32(seed),txs=[];
    const add=(date,type,amount,merchant,activityId)=>txs.push({id:`${type}_${merchant}_${date}_${txs.length}`,date,type,amount:Math.round(amount*100)/100,merchantName:merchant,activityId:activityId||'other',accountId:'bank',note:merchant});
    for(let i=0;i<days;i++){
      const date=addDays(start,i),wd=weekday(date),dom=Number(date.slice(8,10));
      const [year,month]=date.slice(0,7).split('-').map(Number);
      const lastDay=new Date(Date.UTC(year,month,0)).getUTCDate();
      let lastWorkingDate=`${date.slice(0,7)}-${String(lastDay).padStart(2,'0')}`;
      const lastWeekday=weekday(lastWorkingDate);
      if(lastWeekday===6)lastWorkingDate=addDays(lastWorkingDate,-1);
      else if(lastWeekday===0)lastWorkingDate=addDays(lastWorkingDate,-2);
      if(date===lastWorkingDate)add(date,'income',30000,'Salary','salary');
      if(dom===5)add(date,'expense',12000,'Home Rent','bills-rent');
      if(dom===10)add(date,'expense',3000,'SIP','savings-investing');
      if(dom===22)add(date,'expense',1000+Math.round(rng()*125),'Electricity Bill','bills-rent');
      if(wd>=1&&wd<=5&&rng()<0.82)add(date,'expense',24+Math.round(rng()*4),'College Chai','food');
      if(wd===5&&rng()<0.95)add(date,'expense',350+Math.round(rng()*40),'Friday Dinner','food');
      if(wd===6&&rng()<0.9)add(date,'expense',1300+Math.round(rng()*150),'Saturday Groceries','groceries');
      if(rng()<0.12)add(date,'expense',100+Math.round(rng()*1000),'Misc Purchase','other');
    }
    return txs;
  }

  return {QUANTILE_LEVELS,WINDOW_DEFS,validISO,dayNumber,isoFromDay,addDays,daysBetween,weekday,minor,median,quantile,quantileVector,enforceMonotone,mulberry32,normalizeMerchant,jaroWinkler,normalizeTransactions,buildDailySeries,detectStreams,scheduledEvents,flowSamples,forecast,detectRegimeChanges,learnedEnsembleWeights,capAndNormalizeWeights,intervalScore,wis,pinball,grade,expectedActual,backtestJobs,backtestJob,summarizeGrades,deriveSelections,wilsonInterval,calibrationStateFromGrades,applyCalibration,assertNoLeakage,createSeededPersona};
});
