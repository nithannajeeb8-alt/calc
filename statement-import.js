/* Bank statement import UI. All transaction extraction runs in this browser. */
(function(){
  'use strict';
  const $=s=>document.querySelector(s);
  const escapeHTML=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const parser=()=>window.PWStatementParser;
  let selectedFile=null,parsed=null,matrix=null,mapping=null,page=0,parseToken=0,sourceName='',lastFileType='',activePasswordCancel=null,pdfSourceText='';
  const PAGE_SIZE=25;
  function setStatus(message,kind='info'){const el=$('#pw-statement-status');if(el){el.textContent=message;el.dataset.kind=kind;}}
  function getBridge(){return window.PocketwiseStatementBridge||null;}
  function setModal(title,kicker,html){const dialog=$('#app-modal');if(!dialog)return;$('#modal-title').textContent=title;$('#modal-kicker').textContent=kicker;$('#modal-content').innerHTML=html;if(!dialog.open)dialog.showModal();}
  function open(){cancelActivePdfImport();selectedFile=null;parsed=null;matrix=null;mapping=null;page=0;sourceName='';lastFileType='';pdfSourceText='';const context=getBridge()?.getContext?.()||{accounts:[]};const accounts=(context.accounts||[]).map(a=>`<option value="${escapeHTML(a.id)}">${escapeHTML(a.name||a.id)}</option>`).join('');setModal('Import bank statement','LOCAL STATEMENT READER',`
    <div class="modal-body pw-statement-import">
      <button type="button" class="secondary-button pw-statement-back" id="pw-statement-back">← Back to payment import</button>
      <p>Import an Indian bank statement from a <strong>CSV, text-based PDF or Excel (.xlsx) workbook</strong>. Aruvi parses transactions locally, checks debit/credit direction and balances where available, then lets you review everything before saving.</p>
      <div class="pw-statement-filebox">
        <label class="pw-statement-filebox-title" for="pw-statement-file">BANK STATEMENT FILE</label>
        <input class="pw-statement-file-input" id="pw-statement-file" type="file" accept=".pdf,.csv,.tsv,.xlsx,.xls,application/pdf,text/csv,text/tab-separated-values,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel" aria-describedby="pw-statement-file-help">
        <label class="pw-statement-upload-card" for="pw-statement-file">
          <span class="icon-wrap pw-statement-pdf-icon" aria-hidden="true"><i class="bi bi-file-earmark-pdf-fill"></i><svg class="icon-fallback" viewBox="0 0 32 32"><path d="M7 2.5h12l7 7V29H7Z"/><path d="M19 2.5v7h7"/><path d="M10 21h12M10 24h9"/><path d="M10 15v4m0-4h2a2 2 0 0 1 0 4h-2m7 0v-4h1a2 2 0 0 1 0 4h-1m5-4h-3v4m0-2h2"/></svg></span>
          <span class="pw-statement-upload-copy"><strong>Choose a bank statement</strong><small>Tap here to browse your files</small></span>
          <span class="pw-statement-browse">Browse files <span aria-hidden="true">›</span></span>
        </label>
        <div id="pw-statement-file-name" class="pw-statement-file-name">No file selected yet</div>
        <small id="pw-statement-file-help">PDF, CSV, TSV or Excel XLSX · Legacy XLS must be resaved as XLSX · Maximum 50 MB. Scanned/image-only PDFs need a searchable bank export or CSV.</small>
      </div>
      <div class="form-field"><label for="pw-statement-account">IMPORT TO ACCOUNT</label><select id="pw-statement-account">${accounts||'<option value="bank">Bank / UPI</option>'}</select></div>
      <div class="pw-statement-privacy"><strong>Private by design</strong><span>Your statement stays on this device. If you choose local AI, Qwen can receive column labels and a small sample for mapping, or extracted text from an unusual searchable PDF for transaction transcription. Both run locally in your browser; statement data is not sent to an AI service.</span></div>
      <div id="pw-statement-status" class="pw-ocr-status" role="status" aria-live="polite">Tap the upload card to choose a statement, then analyze it.</div>
      <div id="pw-statement-password-area" class="pw-statement-password-area" hidden></div>
      <div id="pw-statement-mapping" class="pw-statement-mapping" hidden></div>
      <div class="form-actions pw-statement-first-actions"><button type="button" class="secondary-button" data-cancel-modal>Cancel</button><button type="button" class="primary-button" id="pw-statement-analyze" disabled>Analyze statement</button></div>
      <div id="pw-statement-preview" hidden></div>
      <p class="fine-print">Nothing is saved until you tap Import selected transactions. Review unusual transfers, card bill payments and uncertain directions manually. Existing payment screenshot/SMS import remains unchanged.</p>
    </div>`);
    $('#pw-statement-back')?.addEventListener('click',()=>window.dispatchEvent(new Event('pw-return-to-payment-import')));
    const dialog=$('#app-modal');dialog?.addEventListener('close',cancelActivePdfImport,{once:true});
    const input=$('#pw-statement-file');input?.addEventListener('change',()=>{if(input.disabled)return;selectedFile=input.files?.[0]||null;parsed=null;matrix=null;mapping=null;page=0;pdfSourceText='';$('#pw-statement-preview').hidden=true;$('#pw-statement-mapping').hidden=true;const passwordArea=$('#pw-statement-password-area');if(passwordArea){passwordArea.hidden=true;passwordArea.replaceChildren();}const name=$('#pw-statement-file-name');if(name)name.textContent=selectedFile?`${selectedFile.name} · ${(selectedFile.size/1024/1024).toFixed(2)} MB`:'No file selected.';const analyze=$('#pw-statement-analyze');if(analyze)analyze.disabled=!selectedFile;setStatus(selectedFile?'Ready to analyze. The file will be read locally.':'Choose a statement file.');});
    $('#pw-statement-analyze')?.addEventListener('click',analyzeSelected);
  }
  function identifyFormat(file){const name=(file?.name||'').toLowerCase(),mime=(file?.type||'').toLowerCase();if(name.endsWith('.pdf')||mime==='application/pdf')return 'pdf';if(name.endsWith('.xlsx')||mime==='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')return 'xlsx';if(name.endsWith('.xls')||mime==='application/vnd.ms-excel')return 'xls-legacy';if(/\.(csv|tsv)$/.test(name)||/text\/(?:csv|tab-separated-values)/.test(mime))return 'csv';return '';}
  async function analyzeSelected(){
    const file=selectedFile;if(!file)return;const type=identifyFormat(file);if(type==='xls-legacy'){setStatus('This is a legacy .xls workbook. Open it in Excel or Numbers and save/export it as .xlsx, then import the new file.','error');return;}if(!type){setStatus('Choose a PDF, CSV, TSV or Excel (.xlsx) statement.','error');return;}if(file.size>50*1024*1024){setStatus('This file is over 50 MB. Export a smaller date range or CSV statement.','error');return;}const token=++parseToken;
    const analyze=$('#pw-statement-analyze'),fileInput=$('#pw-statement-file');if(analyze){analyze.disabled=true;analyze.textContent='Analyzing…';}if(fileInput)fileInput.disabled=true;$('#pw-statement-preview').hidden=true;$('#pw-statement-mapping').hidden=true;setStatus('Reading statement locally…');sourceName=file.name;lastFileType=type;
    try{
      let result;
      if(type==='csv'){
        const csvText=await file.text();if(token!==parseToken)return;const parsedCSV=parser().parseCSV(csvText);if(!parsedCSV.rows.length)throw new Error('No rows were found in the file.');const detectedHeader=parser().findHeaderRow(parsedCSV.rows);if(detectedHeader>0)matrix=parsedCSV.rows.slice(detectedHeader);else matrix=parsedCSV.rows;mapping=parser().mapHeaders(matrix[0]);
        if(!parser().mappingUsable(mapping)){renderMappingControls(matrix[0],mapping,'Some column headings were unfamiliar. Let the local AI suggest a map, or choose the columns yourself.');setStatus('The file was read, but its columns need mapping.','warn');return;}
        result=parser().parseMatrix(matrix,mapping);
      }else if(type==='xlsx'){
        if(!window.PWXLSXReader?.read||!window.PWXLSXReader?.selectStatementSheet)throw new Error('The offline Excel reader is unavailable. Reload Aruvi and try again.');
        setStatus('Opening Excel workbook locally…');const workbook=await window.PWXLSXReader.read(await file.arrayBuffer());if(token!==parseToken)return;
        const chosen=window.PWXLSXReader.selectStatementSheet(workbook,parser());if(!chosen)throw new Error('No readable worksheets or transaction rows were found in this workbook.');
        matrix=chosen.matrix;mapping=chosen.mapping;result=chosen.result;result.sourceSheet=chosen.sheetName;result.sourceName=file.name;result.otherWorksheets=Math.max(0,workbook.sheets.length-1);
        if(!result.transactions?.length&&!result.error)result.error=`No transaction rows could be read from the “${chosen.sheetName}” worksheet. Check that it contains a transaction date, description and debit/credit or amount columns.`;
      }else result=await analyzePDF(file,token);
      if(token!==parseToken)return;parsed=result;mapping=result.mapping||mapping;
      if(result.error&&result.headers&&matrix){renderMappingControls(result.headers,result.mapping,result.error,matrix?.slice(1,9)||result.sampleRows||[]);setStatus(result.error,'warn');return;}
      if(result.error&&type==='pdf'&&pdfSourceText){renderPdfAIControls(result.error);setStatus('The normal PDF reader could not structure this statement. The optional on-device AI can try a second-pass transcription.','warn');return;}
      if(result.error)throw new Error(result.error);
      if(type==='pdf'&&!(result.transactions||[]).length&&pdfSourceText){renderPdfAIControls('The PDF contains searchable text, but the normal reader could not identify transaction rows safely.');setStatus('No transaction rows were identified by the standard parser. You can try the optional local AI fallback.','warn');return;}
      decorateRiskyRows(result.transactions||[]);renderPreview();const sheetLabel=result.sourceSheet?` from “${result.sourceSheet}”${result.otherWorksheets?` (other ${result.otherWorksheets} worksheet(s) not included)`:''}`:'';setStatus(`Analysis complete. ${result.transactions?.length||0} transaction rows detected${sheetLabel}. Review them before importing.`,'success');
    }catch(error){if(token!==parseToken)return;if(type==='pdf'&&pdfSourceText){renderPdfAIControls(error?.message||'The normal PDF reader could not structure this statement.');setStatus('The searchable PDF could not be parsed deterministically. The optional local AI fallback is available for a second pass.','warn');}else setStatus(error?.message||'The statement could not be read. Try a CSV export from your bank or an Excel (.xlsx) workbook.','error');}
    finally{if(token===parseToken){if(analyze){analyze.disabled=!selectedFile;analyze.textContent='Analyze statement';}if(fileInput)fileInput.disabled=false;}}
  }
  function cancelActivePdfImport(){
    // Invalidate page-loop work and reject a pending password request. The active analyzePDF
    // call owns the finally block that disposes the PDF.js task, preventing double-destroy races.
    parseToken++;
    pdfSourceText='';
    window.PocketwiseLocalAI?.cancelStatementExtraction?.();
    const cancelPassword=activePasswordCancel;
    if(cancelPassword)try{cancelPassword();}catch(error){}
  }
  function showPdfPasswordPrompt(pdfjs,updatePassword,reason,onCancel){
    const host=$('#pw-statement-password-area');
    if(!host){onCancel();return;}
    const incorrect=reason===pdfjs.PasswordResponses?.INCORRECT_PASSWORD;
    host.innerHTML=`<section class="pw-statement-password-card" aria-labelledby="pw-pdf-password-title">
      <div class="pw-statement-password-heading"><span class="icon-wrap pw-statement-lock-icon" aria-hidden="true"><i class="bi bi-shield-lock-fill"></i><svg class="icon-fallback" viewBox="0 0 24 24"><rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3"/></svg></span><div><strong id="pw-pdf-password-title">Unlock this bank statement</strong><small>Enter the PDF password once to read and analyze the document.</small></div></div>
      ${incorrect?'<p class="pw-statement-password-error" role="alert">That password did not unlock the PDF. Check it and try again.</p>':''}
      <form id="pw-statement-password-form" autocomplete="off">
        <label for="pw-statement-pdf-password">PDF password</label>
        <input id="pw-statement-pdf-password" type="password" autocomplete="off" autocapitalize="off" spellcheck="false" enterkeyhint="go" required>
        <div class="pw-statement-password-actions"><button type="button" class="secondary-button" id="pw-statement-password-cancel">Cancel</button><button type="submit" class="primary-button">Unlock &amp; analyze</button></div>
      </form>
      <small class="pw-statement-password-privacy">Password is used locally by PDF.js and is not saved or uploaded. No unlocked PDF copy is created.</small>
    </section>`;
    host.hidden=false;
    const form=$('#pw-statement-password-form'),input=$('#pw-statement-pdf-password');
    let responded=false;
    const cancel=()=>{
      if(responded)return;responded=true;
      host.hidden=true;host.replaceChildren();
      if(activePasswordCancel===cancel)activePasswordCancel=null;
      onCancel();
    };
    activePasswordCancel=cancel;
    form?.addEventListener('submit',event=>{
      event.preventDefault();
      if(!input?.value){input?.focus();return;}
      const password=input.value;input.value='';responded=true;
      host.hidden=true;host.replaceChildren();
      if(activePasswordCancel===cancel)activePasswordCancel=null;
      setStatus('Checking the PDF password locally…');
      try{updatePassword(password);}catch(error){setStatus('PDF.js could not accept that password. Try again.','error');}
    });
    $('#pw-statement-password-cancel')?.addEventListener('click',cancel);
    input?.focus();
    return cancel;
  }
  async function analyzePDF(file,token){
    setStatus('Loading the local PDF reader…');const pdfjs=await import('https://cdn.jsdelivr.net/npm/pdfjs-dist@6.4.299/build/pdf.mjs');pdfjs.GlobalWorkerOptions.workerSrc='https://cdn.jsdelivr.net/npm/pdfjs-dist@6.4.299/build/pdf.worker.min.mjs';
    const loadingTask=pdfjs.getDocument({data:new Uint8Array(await file.arrayBuffer()),isEvalSupported:false});let doc=null,passwordCancelled=false,passwordCancelForThisTask=null;
    loadingTask.onPassword=(updatePassword,reason)=>{
      if(token!==parseToken){passwordCancelled=true;try{updatePassword(new Error('Statement analysis cancelled'));}catch(error){}return;}
      passwordCancelForThisTask=showPdfPasswordPrompt(pdfjs,updatePassword,reason,()=>{
        passwordCancelled=true;
        // PDF.js supports rejecting its pending password request with an Error. Its promise
        // then settles and the finally block destroys the reader worker; no hidden prompt remains.
        try{updatePassword(new Error('PDF password entry cancelled'));}catch(error){}
      });
    };
    try{
      doc=await loadingTask.promise;
      if(token!==parseToken)throw new Error('Statement analysis was cancelled.');
      setStatus('PDF unlocked. Verifying the document and reading its pages locally…');
      if(doc.numPages>150)throw new Error('This PDF has more than 150 pages. Export the statement in smaller date ranges to protect device memory.');
      let anyText=false,matrices=[],textOnlyLines=[],allPdfLines=[],pageTextBlocks=[],previousLayout=null;
      for(let pageNo=1;pageNo<=doc.numPages;pageNo++){if(token!==parseToken)return {error:'Analysis cancelled.'};setStatus(`Reading PDF page ${pageNo} of ${doc.numPages}…`);const pageObj=await doc.getPage(pageNo);try{const content=await pageObj.getTextContent({includeMarkedContent:false});const lines=parser().pdfItemsToLines(content.items);if(lines.some(l=>l.items.length))anyText=true;textOnlyLines.push(...lines.map(l=>l.text));allPdfLines.push(...lines);const pageText=lines.map(l=>l.text).filter(Boolean).join('\n');if(pageText)pageTextBlocks.push(`Page ${pageNo}\n${pageText}`);const table=parser().pdfPageToMatrix(lines,previousLayout);if(table.layout?.length)previousLayout=table.layout;if(table.rows&&table.rows.length>1)matrices.push(table);}finally{if(typeof pageObj.cleanup==='function')pageObj.cleanup();}}
      if(!anyText)throw new Error('This looks like a scanned/image-only PDF. For reliable amounts, export a CSV statement or download a searchable/text PDF from your bank. Aruvi will not guess digits from a scan.');
      pdfSourceText=pageTextBlocks.join('\n\n').slice(0,150000);
      if(!matrices.length){
        const fallback=fallbackPdfMatrix(allPdfLines);
        if(!fallback)throw new Error('PDF.js found text, but could not separate enough transaction columns safely. Try your bank CSV export or another text-based statement format.');
        matrix=fallback;mapping=parser().mapHeaders(matrix[0]);const result=parser().parseMatrix(matrix,mapping);
        result.sourcePages=doc.numPages;result.sourceName=file.name;
        if(result.error&&result.headers)result.sampleRows=matrix.slice(1,9);
        return result;
      }
      const headers=matrices[0].rows[0];const rows=[headers];for(const table of matrices){const th=table.rows[0];const idx=headers.map(h=>th.findIndex(x=>parser().norm(x)===parser().norm(h)));for(const row of table.rows.slice(1)){rows.push(headers.map((_,i)=>idx[i]>=0?(row[idx[i]]||''):''));}}
      matrix=rows;mapping=parser().mapHeaders(headers);let result=parser().parseMatrix(rows,mapping);result.sourcePages=doc.numPages;result.sourceName=file.name;if(result.error&&result.headers)result.sampleRows=rows.slice(1,9);return result;
    }catch(error){
      if(passwordCancelled)throw new Error('PDF password entry was cancelled. Select Analyze statement to try again.');
      if(/password|encrypted|encrypt/i.test(String(error?.message||'')))throw new Error('PDF.js could not unlock this statement. Check the PDF password and try again.');
      throw error;
    }finally{
      if(activePasswordCancel&&activePasswordCancel===passwordCancelForThisTask)activePasswordCancel=null;
      // Destroy PDF.js worker/document resources after reading, including failures and cancellation.
      try{if(typeof loadingTask.destroy==='function')await loadingTask.destroy();else if(typeof doc?.cleanup==='function')await doc.cleanup();}catch(cleanupError){console.warn('PDF reader cleanup failed:',cleanupError);}
    }
  }
  function fallbackPdfMatrix(lines){
    // Fallback for searchable PDFs with unfamiliar headings: use text coordinates to
    // recover a best-effort grid, then require AI/manual mapping and normal review.
    const source=[];
    for(const line of (lines||[])){
      const items=(line.items||[]).slice().sort((a,b)=>a.x-b.x);if(!items.length)continue;
      const cells=[];
      for(const item of items){const last=cells[cells.length-1],gap=last?item.x-last.right:Infinity;
        if(last&&gap<=18){last.text=(last.text+' '+item.text).replace(/\s+/g,' ').trim();last.right=Math.max(last.right,item.right);}
        else cells.push({x:item.x,right:item.right,text:String(item.text||'').trim()});}
      if(cells.some(c=>c.text))source.push({y:line.y,cells});
    }
    if(source.length<2)return null;
    const anchors=[];for(const row of source)for(const cell of row.cells)if(!anchors.some(x=>Math.abs(x-cell.x)<=13))anchors.push(cell.x);
    anchors.sort((a,b)=>a-b);const cols=[];for(const x of anchors)if(!cols.length||x-cols[cols.length-1]>13)cols.push(x);
    if(cols.length<3)return null;
    const rows=source.map(row=>{const out=Array(cols.length).fill('');for(const cell of row.cells){let best=0,dist=Infinity;cols.forEach((x,i)=>{const d=Math.abs(x-cell.x);if(d<dist){dist=d;best=i;}});out[best]=(out[best]+' '+cell.text).trim();}return out;});
    const headerAt=parser().findHeaderRow(rows);if(headerAt>=0)return rows.slice(headerAt);
    // SBI and other banks often begin with an account-information page. Its generated
    // statement date and available balance are metadata, not transactions. In the fallback
    // path, require a date, a monetary value and meaningful narration before accepting a row.
    const data=rows.filter(row=>{
      const texts=row.map(cell=>String(cell||'').trim()).filter(Boolean);
      const hasDate=texts.some(cell=>parser().parseDate(cell));
      const moneyCount=texts.filter(cell=>parser().parseMoney(cell).value!==null).length;
      const meaningfulNarration=texts.some(cell=>cell.length>=3&&!parser().parseDate(cell)&&parser().parseMoney(cell).value===null&&!/^(?:date|statement date|account number|account no|cif no|ifsc|micr|available balance|uncleared balance|opening balance|closing balance|page no|customer name|branch|address|email|account description|currency)$/i.test(cell));
      return hasDate&&moneyCount>=1&&meaningfulNarration;
    });
    if(!data.length)return null;
    return [Array.from({length:cols.length},(_,i)=>`Column ${i+1}`),...data];
  }
  function decorateRiskyRows(rows){for(const row of rows){const d=String(row.description||'');if(/\b(?:own account|self transfer|transfer to own|transfer from own|between own|internal transfer|credit card payment|credit card bill|cc payment|card bill payment|atm cash withdrawal)\b/i.test(d)){row.transferReview=true;row.originalType=row.type;row.type='review';row.selected=false;row.issue=row.issue||'Possible transfer, card settlement or cash movement. Choose how to classify it.';}}}
  function renderPdfAIControls(message){
    const host=$('#pw-statement-mapping');if(!host)return;
    host.innerHTML=`<section class="pw-statement-map-card"><strong>AI-assisted statement reading</strong><p>${escapeHTML(message||'The standard reader could not structure this searchable PDF.')} The optional Qwen model can transcribe the text into transaction rows. It runs on this device and is only a fallback.</p><div class="form-actions"><button type="button" class="secondary-button" id="pw-statement-ai-extract">Extract with local AI</button></div><small class="fine-print">Prepare Qwen2.5 in Settings → Local AI first. AI output is checked against dates, amounts and nearby narration in the original PDF text, then sent through Aruvi’s existing balance and duplicate checks. Review every row before importing. Scanned/image-only PDFs are not supported by this text path.</small></section>`;
    host.hidden=false;
    $('#pw-statement-ai-extract')?.addEventListener('click',runPdfAIExtraction);
  }
  async function runPdfAIExtraction(event){
    const button=event?.currentTarget||$('#pw-statement-ai-extract');
    if(!pdfSourceText){setStatus('The original searchable PDF text is no longer available. Re-select the statement and analyze it again.','error');return;}
    if(!window.PocketwiseLocalAI?.extractStatement){setStatus('The on-device statement AI module is unavailable. Reload Aruvi and try again.','error');return;}
    if(!window.PWStatementAIGuard?.validate){setStatus('The statement evidence checker is unavailable. Reload Aruvi before using AI extraction.','error');return;}
    const token=++parseToken;
    const onAIStatus=event=>{if(token===parseToken&&event?.detail?.message)setStatus(String(event.detail.message).slice(0,240));};
    window.addEventListener('pocketwise:local-ai-status',onAIStatus);
    if(button){button.disabled=true;button.textContent='Reading locally…';}
    setStatus('Preparing the optional Qwen model and reading this PDF locally…');
    try{
      const aiResult=await window.PocketwiseLocalAI.extractStatement(pdfSourceText);
      if(token!==parseToken)return;
      const checked=window.PWStatementAIGuard.validate(aiResult,pdfSourceText,parser());
      if(!checked.transactions.length){
        const rejected=checked.issues.length;
        setStatus(`The local AI proposed ${checked.proposed} row(s), but none passed the source-text checks${rejected?` (${rejected} rejected)`:''}. No transactions were prepared. Try a CSV/XLSX export or map the statement manually.`,'warn');
        return;
      }
      const headers=['Date','Description','Amount','Direction','Balance','Reference'];
      const rows=[headers,...checked.transactions.map(row=>[
        row.date,row.description,Number(row.amount).toFixed(2),
        row.direction==='debit'?'debit':row.direction==='credit'?'credit':row.direction==='refund'?'refund received':'',
        row.balance===null?'':Number(row.balance).toFixed(2),row.reference||''
      ])];
      const aiMapping={date:0,description:1,debit:null,credit:null,amount:2,balance:4,reference:5,direction:3};
      const result=parser().parseMatrix(rows,aiMapping);
      if(result.error)throw new Error(result.error);
      result.aiAssisted=true;result.aiVerifiedRows=checked.verified;result.aiRejectedRows=checked.proposed-checked.verified;
      result.issues=[...(result.issues||[]),...(checked.issues||[])];
      parsed=result;matrix=rows;mapping=aiMapping;page=0;
      decorateRiskyRows(parsed.transactions||[]);renderPreview();
      setStatus(`AI-assisted reading complete. ${checked.verified} transaction row(s) passed source-text checks. Review the amounts, directions and running balances before importing.`,'success');
      pdfSourceText='';
    }catch(error){
      if(token!==parseToken)return;
      setStatus(`Local AI extraction did not complete: ${error?.message||error}. Your statement and existing transactions were not changed. Use the normal parser or a CSV/XLSX export.`,'error');
    }finally{
      window.removeEventListener('pocketwise:local-ai-status',onAIStatus);
      if(button?.isConnected){button.disabled=false;button.textContent='Extract with local AI';}
    }
  }
  function renderMappingControls(headers,suggested,message,sampleRows=[]){
    const fields=[['date','Date (required)'],['description','Description / narration (required)'],['debit','Debit / withdrawal'],['credit','Credit / deposit'],['amount','Single amount column'],['balance','Running balance'],['reference','Reference / UTR']];
    const selectOptions=selected=>`<option value="">Not mapped</option>`+headers.map((h,i)=>`<option value="${i}" ${selected===i?'selected':''}>${i+1}. ${escapeHTML(String(h||`Column ${i+1}`).slice(0,80))}</option>`).join('');
    const html=`<section class="pw-statement-map-card"><strong>Map statement columns</strong><p>${escapeHTML(message)}</p><div class="pw-statement-map-grid">${fields.map(([field,label])=>`<label for="pw-map-${field}">${label}<select id="pw-map-${field}" data-map-field="${field}">${selectOptions(suggested?.[field]??null)}</select></label>`).join('')}</div><div class="form-actions"><button type="button" class="secondary-button" id="pw-statement-map-ai">Use local AI</button><button type="button" class="primary-button" id="pw-statement-map-apply">Use these columns</button></div>${lastFileType==='pdf'&&pdfSourceText?'<div class="form-actions"><button type="button" class="secondary-button" id="pw-statement-ai-extract">Try full statement AI extraction</button></div>':''}<small class="fine-print">Qwen uses column headings and a small sample of extracted rows to suggest column roles on this device. The optional PDF fallback can transcribe full rows only when the standard reader fails; it never calculates amounts. Review all results before importing.</small></section>`;
    const host=$('#pw-statement-mapping');host.innerHTML=html;host.hidden=false;
    $('#pw-statement-map-apply')?.addEventListener('click',()=>{
      const map={date:null,description:null,debit:null,credit:null,amount:null,balance:null,reference:null};
      host.querySelectorAll('[data-map-field]').forEach(select=>{const value=select.value;map[select.dataset.mapField]=value===''?null:Number(value);});
      if(!parser().mappingUsable(map)){setStatus('Choose Date, Description, and either Amount or Debit/Credit columns.','error');return;}
      mapping=map;parsed=parser().parseMatrix(matrix,map);if(parsed.error){setStatus(parsed.error,'error');return;}
      decorateRiskyRows(parsed.transactions||[]);host.hidden=true;renderPreview();setStatus(`Analysis complete. ${parsed.transactions.length} transaction rows detected. Review them before importing.`,'success');
    });
    const aiButton=$('#pw-statement-map-ai');
    const runAI=async()=>{
      if(!window.PocketwiseLocalAI){setStatus('Local AI module is not available. Use the manual column selectors.','error');return;}
      aiButton.disabled=true;aiButton.textContent='Mapping…';setStatus('Using local Qwen2.5 to interpret column labels and sample row values on this device…');
      try{
        const proposed=await window.PocketwiseLocalAI.mapColumns(headers,sampleRows);const valid=parser().validateMapping(proposed,headers.length);
        if(!valid){setStatus('The model suggestion was incomplete or unsafe. Choose the columns manually.','warn');return;}
        host.querySelectorAll('[data-map-field]').forEach(select=>{const value=valid[select.dataset.mapField];select.value=value===null?'':String(value);});
        const route=window.PocketwiseLocalAI.getLastMappingRoute?.();
        setStatus(route?.fallbackUsed ? 'Qwen was unavailable or unreliable on this device. Aruvi used its deterministic local parser instead. Check every selected column before applying.' : 'Qwen suggestion ready. Check the selected columns, then tap “Use these columns”.','success');
      }catch(error){setStatus(`Local AI mapping failed: ${error.message||error}. Manual column mapping remains available.`,'error');}
      finally{if(aiButton.isConnected){aiButton.disabled=false;aiButton.textContent='Use local AI';}}
    };
    aiButton?.addEventListener('click',runAI);
    $('#pw-statement-ai-extract')?.addEventListener('click',runPdfAIExtraction);
    // When the optional model has already been prepared, use it for unfamiliar layouts without
    // requiring a second tap. It still only proposes column indexes and never imports anything.
    if(window.PocketwiseLocalAI?.isLoaded())queueMicrotask(()=>{if(!host.hidden&&aiButton?.isConnected)runAI();});
  }
  function renderPreview(){
    const host=$('#pw-statement-preview');if(!host)return;const rows=parsed?.transactions||[];const validSelected=rows.filter(r=>r.selected&&['expense','income','refund'].includes(r.type)&&r.date&&Number(r.amount)>0&&r.description);const expenses=validSelected.filter(r=>r.type==='expense').reduce((s,r)=>s+Number(r.amount),0);const income=validSelected.filter(r=>r.type==='income').reduce((s,r)=>s+Number(r.amount),0);const refunds=validSelected.filter(r=>r.type==='refund').reduce((s,r)=>s+Number(r.amount),0);const pages=Math.max(1,Math.ceil(rows.length/PAGE_SIZE));page=Math.max(0,Math.min(page,pages-1));const start=page*PAGE_SIZE;const visible=rows.slice(start,start+PAGE_SIZE);
    const issues=parsed?.issues||[];const unresolved=rows.filter(r=>r.type==='review'||!['expense','income','refund'].includes(r.type)||!r.date||!(Number(r.amount)>0)||!r.description).length;
    const aiNotice=parsed?.aiAssisted?`<div class="pw-statement-warning"><strong>AI-assisted extraction</strong><span>${parsed.aiVerifiedRows||0} row(s) passed checks against the original PDF text. ${parsed.aiRejectedRows||0} proposed row(s) were rejected. Verify every date, amount, direction and running balance before importing.</span></div>`:'';
    const warningHtml=issues.length||unresolved?`<div class="pw-statement-warning"><strong>Review required</strong><span>${issues.length?`${issues.length} row or parsing warning(s). `:''}${unresolved?`${unresolved} detected row(s) have an uncertain direction or need attention and will not be imported until resolved.`:''} Check the statement's opening/closing balance if available.</span>${issues.length?`<details><summary>Show ${issues.length} parser warning(s)</summary><ul>${issues.slice(0,30).map(x=>`<li>Row ${x.row}: ${escapeHTML(x.reason)}</li>`).join('')}</ul></details>`:''}</div>`:'';
    host.innerHTML=`<section class="pw-statement-results"><div class="pw-statement-result-heading"><strong>Statement preview</strong><span>${rows.length.toLocaleString('en-IN')} rows detected</span></div><div class="pw-statement-metrics"><div><small>Selected</small><strong>${validSelected.length.toLocaleString('en-IN')}</strong></div><div><small>Money out</small><strong>₹${expenses.toLocaleString('en-IN',{maximumFractionDigits:2})}</strong></div><div><small>Money in</small><strong>₹${income.toLocaleString('en-IN',{maximumFractionDigits:2})}</strong></div><div><small>Refunds</small><strong>₹${refunds.toLocaleString('en-IN',{maximumFractionDigits:2})}</strong></div></div>${aiNotice}${warningHtml}<div class="pw-statement-table-wrap"><table class="pw-statement-table"><thead><tr><th>Import</th><th>Date</th><th>Description</th><th>Amount</th><th>Direction</th></tr></thead><tbody>${visible.map((row,i)=>{const idx=start+i,valid=!!row.date&&Number(row.amount)>0&&!!row.description;const typeOptions=[['review','Choose…'],['expense','Expense'],['income','Income'],['refund','Refund']].map(([v,l])=>`<option value="${v}" ${row.type===v?'selected':''}>${l}</option>`).join('');return `<tr class="${row.issue?'has-warning':''}"><td><input type="checkbox" data-row-select="${idx}" aria-label="Import row ${row.sourceRow||idx+1}" ${row.selected?'checked':''} ${!valid?'disabled':''}></td><td>${escapeHTML(row.date||'Unreadable')}<small>Row ${row.sourceRow||idx+1}</small></td><td><span class="pw-statement-description">${escapeHTML(row.description||'No description')}</span>${row.issue?`<small class="pw-statement-row-warning">${escapeHTML(row.issue)}</small>`:''}</td><td class="pw-statement-amount">${Number(row.amount)>0?`₹${Number(row.amount).toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2})}`:'Unreadable'}</td><td><select data-row-type="${idx}" aria-label="Direction for row ${row.sourceRow||idx+1}" ${!valid?'disabled':''}>${typeOptions}</select></td></tr>`;}).join('')}</tbody></table></div><div class="pw-statement-pagination"><button type="button" class="secondary-button" id="pw-statement-prev" ${page===0?'disabled':''}>Previous</button><span>Page ${page+1} of ${pages}</span><button type="button" class="secondary-button" id="pw-statement-next" ${page>=pages-1?'disabled':''}>Next</button></div><div class="pw-statement-import-actions"><button type="button" class="secondary-button" id="pw-statement-deselect">Deselect all</button><button type="button" class="primary-button" id="pw-statement-import" ${validSelected.length?'':'disabled'}>Import ${validSelected.length.toLocaleString('en-IN')} selected</button></div><p class="fine-print">Imported rows are tagged with a stable fingerprint to prevent accidental re-imports. Transfers, credit-card payments and cash withdrawals are not automatically classified as ordinary spending.</p></section>`;
    host.hidden=false;host.querySelectorAll('[data-row-select]').forEach(control=>control.addEventListener('change',()=>{const row=rows[Number(control.dataset.rowSelect)];if(row)row.selected=control.checked;renderPreview();}));host.querySelectorAll('[data-row-type]').forEach(control=>control.addEventListener('change',()=>{const row=rows[Number(control.dataset.rowType)];if(!row)return;row.type=control.value;if(['expense','income','refund'].includes(row.type)&&row.date&&Number(row.amount)>0&&row.description)row.selected=true;else row.selected=false;if(row.transferReview&&row.type!=='review')row.issue='Manually classified. Check it is not an own-account transfer or card settlement.';renderPreview();}));$('#pw-statement-prev')?.addEventListener('click',()=>{page=Math.max(0,page-1);renderPreview();});$('#pw-statement-next')?.addEventListener('click',()=>{page=Math.min(pages-1,page+1);renderPreview();});$('#pw-statement-deselect')?.addEventListener('click',()=>{rows.forEach(r=>r.selected=false);renderPreview();});$('#pw-statement-import')?.addEventListener('click',importSelected);
  }
  async function importSelected(){const rows=(parsed?.transactions||[]).filter(r=>r.selected&&['expense','income','refund'].includes(r.type)&&r.date&&Number(r.amount)>0&&r.description);if(!rows.length){setStatus('Select at least one valid transaction and choose its direction.','error');return;}const accountId=$('#pw-statement-account')?.value;const occurrenceCounts=new Map(),ordinals=new Map();for(const row of (parsed?.transactions||[])){const key=parser().fingerprintKey(row,accountId);const next=(occurrenceCounts.get(key)||0)+1;occurrenceCounts.set(key,next);ordinals.set(row,next);}const fingerprints=rows.map(row=>({...row,fingerprint:parser().makeFingerprint(row,accountId,ordinals.get(row)||1)}));const button=$('#pw-statement-import');if(button){button.disabled=true;button.textContent='Saving…';}try{const bridge=getBridge();if(!bridge?.commit)throw new Error('Aruvi transaction storage is unavailable. Close and reopen the import screen.');const result=await bridge.commit(fingerprints,accountId);if(!result||result.ok===false){setStatus(result?.message||'The transactions were not saved. Your previous records are unchanged.','error');return;}setStatus(`Imported ${result.imported} transaction(s). ${result.duplicates?`${result.duplicates} duplicate row(s) were skipped.`:''}`,'success');}catch(error){setStatus(error.message||'Import failed. No transactions were saved.','error');}finally{if(button&&button.isConnected){button.disabled=false;button.textContent='Import selected';}}}
  window.PocketwiseStatementImporter={open};
})();
