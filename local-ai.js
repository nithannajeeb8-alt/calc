/* Optional WebLLM bridge for Qwen2.5-1.5B. Model execution is isolated in a worker. */
(function(){
  'use strict';
  const READY_KEY='pocketwise-webllm-qwen25-15b-v1';
  const LEGACY_READY_KEYS=['pocketwise-qwen3-last-prepared-v1','pocketwise-smollm2-last-prepared-v1'];
  const LEGACY_CACHE_NAMES=['pocketwise-qwen3-06b-v1','pocketwise-smollm2-135m-v1'];
  let worker=null,seq=0,requests=new Map(),loadPromise=null,loadState='idle',currentIntent='prepare';
  const $=s=>document.querySelector(s);
  function settingStatus(message){const el=$('#pw-local-ai-status');if(el)el.textContent=message;}
  function setActionButtons(){const busy=loadState==='loading';const dl=$('#pw-local-ai-download'),remove=$('#pw-local-ai-remove');if(dl){dl.disabled=busy;dl.textContent=busy?'Downloading / loading…':loadState==='ready'?'Qwen cached · Prepare again':'Download Qwen2.5 AI';}if(remove)remove.disabled=busy;}
  function progressText(detail){
    const label=String(detail?.text||detail?.status||detail?.file||'Preparing model files…');
    const n=Number(detail?.progress);
    return Number.isFinite(n)&&n>=0?`${label} · ${Math.max(0,Math.min(100,Math.round(n*100)))}%`:label;
  }
  function releaseWorker(){const old=worker;worker=null;try{old?.terminate();}catch(_){}}
  function ensureWorker(){
    if(worker)return worker;
    worker=new Worker(new URL('local-ai-worker.js',document.baseURI),{type:'module',name:'pocketwise-local-ai'});
    worker.addEventListener('message',event=>{
      const msg=event.data||{};
      if(msg.type==='status'){const message=msg.message||'Preparing Qwen2.5 locally…';settingStatus(message);window.dispatchEvent(new CustomEvent('pocketwise:local-ai-status',{detail:{message}}));return;}
      if(msg.type==='progress'){const message=progressText(msg.detail);settingStatus(message);window.dispatchEvent(new CustomEvent('pocketwise:local-ai-status',{detail:{message}}));return;}
      if(msg.type==='loaded'){
        loadState='ready';try{localStorage.setItem(READY_KEY,'1');}catch(_){}
        settingStatus('Qwen2.5-1.5B is prepared in this browser cache. Its runtime is released after preparation and each mapping to reduce memory pressure.');setActionButtons();
        if(loadPromise){const resolve=loadPromise.resolve;loadPromise=null;resolve(msg);}
        if(currentIntent==='prepare')releaseWorker();
        return;
      }
      if(msg.type==='error'){
        loadState='error';try{localStorage.removeItem(READY_KEY);}catch(_){}const message=String(msg.message||'Local AI could not be loaded.').slice(0,500);
        settingStatus(`Could not prepare local AI: ${message} Statement parsing and manual column mapping remain available.`);setActionButtons();
        if(loadPromise){const reject=loadPromise.reject;loadPromise=null;reject(new Error(message));}
        releaseWorker();return;
      }
      if(msg.type==='cache-removed')return;
      if(msg.type==='response'||msg.type==='response-error'){
        const request=requests.get(msg.id);if(!request)return;requests.delete(msg.id);if(request.timer)clearTimeout(request.timer);
        if(msg.type==='response')request.resolve(msg.mapping??msg.result);else {const message=String(msg.message||'Local AI operation failed.');if(/model files are missing from this browser cache|could not verify the saved Qwen model cache/i.test(message)){loadState='idle';currentIntent='prepare';try{localStorage.removeItem(READY_KEY);}catch(_){}settingStatus('Qwen model cache is missing or could not be verified. Tap Download / prepare in Settings before using local AI.');setActionButtons();}request.reject(new Error(message));}
        releaseWorker();
      }
    });
    worker.addEventListener('error',event=>{
      const message=String(event.message||'The local AI worker failed.').slice(0,400);loadState='error';try{localStorage.removeItem(READY_KEY);}catch(_){}settingStatus(`Local AI unavailable: ${message} Manual column mapping remains available.`);setActionButtons();
      const crashError=new Error(message);crashError.name='WorkerCrashError';crashError.pocketWiseProviderCrash=true;
      if(loadPromise){loadPromise.reject(crashError);loadPromise=null;}releaseWorker();
      for(const [id,request] of requests){if(request.timer)clearTimeout(request.timer);request.reject(crashError);requests.delete(id);}
    });
    return worker;
  }
  function isDownloaded(){try{return localStorage.getItem(READY_KEY)==='1';}catch(_){return false;}}
  async function ensureLoaded(intent='prepare'){
    currentIntent=intent;
    if(loadState==='ready')return true;
    if(loadPromise)return loadPromise.promise;
    loadState='loading';setActionButtons();settingStatus('Starting the optional on-device Qwen model. First use downloads about 880 MB; Wi-Fi is recommended.');
    const w=ensureWorker();let resolve,reject;const promise=new Promise((res,rej)=>{resolve=res;reject=rej;});loadPromise={promise,resolve,reject};w.postMessage({type:'load',intent});return promise;
  }
  async function clearModelCache(){
    releaseWorker();loadPromise=null;loadState='idle';
    for(const [id,request] of requests){if(request.timer)clearTimeout(request.timer);request.reject(new Error('Local AI cache removal started.'));requests.delete(id);}
    const cleaner=new Worker(new URL('local-ai-worker.js',document.baseURI),{type:'module',name:'pocketwise-model-cache-cleaner'});
    try{
      await new Promise((resolve,reject)=>{
        const timeout=setTimeout(()=>reject(new Error('Cache removal timed out.')),45000);
        cleaner.addEventListener('message',event=>{const msg=event.data||{};if(msg.type==='cache-removed'){clearTimeout(timeout);resolve();}else if(msg.type==='error'){clearTimeout(timeout);reject(new Error(msg.message||'Unable to remove model cache.'));}}, {once:false});
        cleaner.addEventListener('error',event=>{clearTimeout(timeout);reject(new Error(event.message||'Cache cleanup worker failed.'));},{once:true});
        cleaner.postMessage({type:'removeCache'});
      });
      if('caches'in window)await Promise.all(LEGACY_CACHE_NAMES.map(name=>caches.delete(name).catch(()=>false)));
      try{localStorage.removeItem(READY_KEY);for(const key of LEGACY_READY_KEYS)localStorage.removeItem(key);}catch(_){}
      settingStatus('Qwen2.5 model cache removed. Existing Aruvi transactions and other app data were not changed.');setActionButtons();
    }finally{cleaner.terminate();}
  }
  function initializeSettings(){
    // Clean only prior model caches/flags. Never clear the origin's general storage or transactions.
    if('caches'in window)Promise.all(LEGACY_CACHE_NAMES.map(name=>caches.delete(name).catch(()=>false))).catch(()=>{});
    try{for(const key of LEGACY_READY_KEYS)localStorage.removeItem(key);}catch(_){}
    if(isDownloaded())settingStatus('Qwen2.5-1.5B was prepared on this browser before. Aruvi checks the cache when the model is used; the browser can evict cached files.');
    else settingStatus('Optional Qwen2.5-1.5B-Instruct · about 880 MB download and about 1.63 GB GPU memory. Requires WebGPU; there is no CPU fallback. Download is user-triggered; statement rows remain on-device.');
    setActionButtons();
    $('#pw-local-ai-download')?.addEventListener('click',async()=>{try{await ensureLoaded('prepare');}catch(_){/* status explains the safe fallback */}});
    $('#pw-local-ai-remove')?.addEventListener('click',async()=>{
      if(!confirm('Remove the Qwen2.5 model files from this browser? Your Aruvi transactions and other app data will not be changed.'))return;
      const button=$('#pw-local-ai-remove');if(button)button.disabled=true;
      try{await clearModelCache();}catch(error){settingStatus(`Could not fully remove model cache: ${error.message||error}. Aruvi transaction data was not changed.`);setActionButtons();}
    });
  }
  let lastMappingRoute = null;
  async function mapColumnsWithQwen(headers, sampleRows = []) {
    currentIntent='map';await ensureLoaded('map');const w=ensureWorker(),id=++seq;
    const safeHeaders=(headers||[]).slice(0,80).map(v=>String(v).slice(0,100));
    const safeRows=(Array.isArray(sampleRows)?sampleRows:[]).slice(0,8).map(row=>(Array.isArray(row)?row:[]).slice(0,12).map(v=>String(v??'').slice(0,100)));
    return new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>{const request=requests.get(id);if(request){requests.delete(id);request.reject(new Error('The local AI took too long to respond. Use deterministic local column detection instead.'));releaseWorker();}},90000);
      requests.set(id,{resolve,reject,timer});w.postMessage({type:'mapColumns',id,headers:safeHeaders,sampleRows:safeRows});
    });
  }
  function validateMappingProposal(mapping, headers) {
    const parser = window.PWStatementParser;
    if (!parser || typeof parser.validateMapping !== 'function') return { ok: false, reason: 'Statement validation is unavailable.' };
    const checked = parser.validateMapping(mapping, headers.length, headers);
    return checked ? { ok: true, mapping: checked } : { ok: false, reason: 'The suggested mapping did not pass the required date, description and amount/debit/credit checks.' };
  }
  async function mapColumns(headers, sampleRows = []) {
    const safeHeaders=(headers||[]).slice(0,80).map(v=>String(v).slice(0,100));
    const safeRows=(Array.isArray(sampleRows)?sampleRows:[]).slice(0,8).map(row=>(Array.isArray(row)?row:[]).slice(0,12).map(v=>String(v??'').slice(0,100)));
    const parser = window.PWStatementParser;
    const deterministic = () => {
      if (!parser || typeof parser.mapHeaders !== 'function') throw new Error('The deterministic statement parser is unavailable. Use manual column mapping.');
      return parser.mapHeaders(safeHeaders);
    };
    const system = window.PocketWiseSystem;
    if (!system || typeof system.run !== 'function') {
      if (isDownloaded() && navigator.gpu) return mapColumnsWithQwen(safeHeaders, safeRows);
      return deterministic();
    }
    const providers = [
      {
        id: 101, priority: 110, label: 'Qwen2.5 local AI', timeoutMs: 90000,
        // Qwen downloads are explicitly user-triggered from Settings. Do not silently
        // start an ~880 MB model download just because a statement was imported.
        supported: !!(navigator && navigator.gpu), available: isDownloaded(), enabled: true,
        run: async input => mapColumnsWithQwen(input.headers, input.sampleRows),
        assess: (result, input) => validateMappingProposal(result, input.headers)
      },
      {
        id: 102, priority: 70, label: 'Deterministic local statement parser', timeoutMs: 5000,
        supported: true, available: true, enabled: true, keepLastResort: true,
        run: input => deterministic(),
        assess: (result, input) => validateMappingProposal(result, input.headers)
      }
    ];
    const routed = await system.run('statement-column-mapping', providers, { headers: safeHeaders, sampleRows: safeRows }, {
      timeoutMs: 90000,
      keepLastResort: true,
      onStatus: message => settingStatus(message)
    });
    const validation = validateMappingProposal(routed && routed.result, safeHeaders);
    if (!validation.ok) throw new Error(validation.reason);
    lastMappingRoute = {
      providerId: routed.providerId,
      provider: routed.provider,
      fallbackUsed: !!routed.fallbackUsed,
      needsReview: !!routed.needsReview,
      attempts: (routed.attempts || []).map(item => ({ providerId: item.providerId, outcome: item.outcome, latencyMs: item.latencyMs, reason: String(item.reason || '').slice(0, 160) }))
    };
    return validation.mapping;
  }

  function chunkStatementText(rawText){
    const source=String(rawText||'').replace(/\u0000/g,'').trim();
    if(!source)throw new Error('No searchable PDF text is available for AI extraction.');
    if(source.length>60000)throw new Error('This statement contains too much extracted text for the on-device AI fallback. Export a shorter date range or use the CSV/XLSX reader.');
    const lines=source.split(/\r?\n/).map(line=>line.trim()).filter(Boolean);
    const headers=lines.filter(line=>line.length<220&&/(?:txn|trans|date|particular|narration|description|withdrawal|deposit|debit|credit|balance|reference|utr)/i.test(line)).slice(0,8).join('\n');
    const chunks=[];let current='';
    for(const line of lines){
      const safeLine=line.length>1200?line.match(/.{1,1000}(?:\s|$)/g)||[line.slice(0,1200)]:[line];
      for(const part of safeLine){
        if(current&&current.length+part.length+1>3200){chunks.push(current);current='';}
        current+=(current?'\n':'')+part;
      }
    }
    if(current)chunks.push(current);
    if(!chunks.length)throw new Error('The PDF did not contain readable transaction text.');
    if(chunks.length>20)throw new Error('This statement needs more than 20 AI chunks. Export a shorter statement to keep on-device processing manageable.');
    return chunks.map((chunk,index)=>`Statement column/header clues:\n${headers||'No clear header detected.'}\n\nText segment ${index+1} of ${chunks.length}:\n${chunk}`);
  }
  async function extractStatement(rawText){
    if(!navigator?.gpu)throw new Error('This browser does not expose WebGPU. The optional local model cannot run here; the normal parser and manual review remain available.');
    if(!isDownloaded())throw new Error('Prepare Qwen2.5 in Settings → Local AI first. Aruvi will not download a large model automatically during statement import.');
    const chunks=chunkStatementText(rawText);
    currentIntent='extract';await ensureLoaded('extract');const w=ensureWorker(),id=++seq;
    return new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>{const request=requests.get(id);if(request){requests.delete(id);request.reject(new Error('Local AI statement extraction timed out. Use the normal parser or a CSV/XLSX export.'));releaseWorker();}},300000);
      requests.set(id,{resolve,reject,timer});w.postMessage({type:'extractStatement',id,chunks});
    });
  }
  function cancelStatementExtraction(){
    if(currentIntent!=='extract')return false;
    for(const [id,request] of requests){if(request.timer)clearTimeout(request.timer);request.reject(new Error('AI statement extraction was cancelled.'));requests.delete(id);}
    if(loadPromise){try{loadPromise.reject(new Error('AI statement extraction was cancelled.'));}catch(_){}loadPromise=null;}
    releaseWorker();loadState='idle';currentIntent='prepare';setActionButtons();return true;
  }
  window.PocketwiseLocalAI={ensureLoaded,mapColumns,extractStatement,cancelStatementExtraction,getLastMappingRoute:()=>lastMappingRoute,isLoaded:()=>loadState==='ready',isDownloaded,modelName:'Qwen2.5-1.5B-Instruct-q4f16_1-MLC',initializeSettings};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',initializeSettings,{once:true});else initializeSettings();
})();
