/* Aruvi statement parser. Deterministic extraction first; no network or AI dependency. */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.PWStatementParser=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const MAX_ROWS=20000;
  const clean=value=>String(value??'').replace(/\u00a0/g,' ').replace(/[\u200b-\u200f\ufeff]/g,'').trim();
  const norm=value=>clean(value).toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
  function parseDate(value){
    let s=clean(value).replace(/^date\s*:?\s*/i,'').replace(/\s+/g,' ').trim();
    if(!s)return null;
    // PDF text extraction can append a timestamp after the date; parse the leading date only.
    const candidates=[s];
    const leading=s.match(/^(?:\d{1,2}[./-]\d{1,2}[./-]\d{2,4}|\d{4}[./-]\d{1,2}[./-]\d{1,2}|\d{8}|\d{1,2}\s+[A-Za-z]{3,9}(?:,?\s+\d{2,4})?|[A-Za-z]{3,9}\s+\d{1,2},?\s+\d{2,4})(?=\s|T|$)/i);
    if(leading&&leading[0]!==s)candidates.push(leading[0]);
    const monthNames=['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
    const yearOf=y=>{let year=Number(y);if(year<100)year+=year<70?2000:1900;return year;};
    for(let candidate of candidates){
      candidate=candidate.replace(/,/g,' ').replace(/\s*([/.-])\s*/g,'$1').replace(/\s+/g,' ').trim();
      let m=candidate.match(/^(\d{4})[./-](\d{1,2})[./-](\d{1,2})$/);
      if(m)return validDate(+m[1],+m[2],+m[3]);
      // Some PDF extractors split date separators into separate text blocks.
      m=candidate.match(/^(\d{4})(\d{2})(\d{2})$/);
      if(m)return validDate(+m[1],+m[2],+m[3]);
      m=candidate.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})$/);
      if(m)return validDate(yearOf(m[3]),+m[2],+m[1]); // Indian statements default to DMY.
      m=candidate.match(/^(\d{1,2})\s+(\d{1,2})\s+(\d{2,4})$/);
      if(m)return validDate(yearOf(m[3]),+m[2],+m[1]);
      m=candidate.match(/^(\d{1,2})[ /.-]([A-Za-z]{3,9})[ /.-]+(\d{2,4})$/);
      if(m){const month=monthNames.indexOf(m[2].slice(0,3).toLowerCase())+1;if(month)return validDate(yearOf(m[3]),month,+m[1]);}
      m=candidate.match(/^([A-Za-z]{3,9})[ /.-](\d{1,2})[, /.-]+(\d{2,4})$/);
      if(m){const month=monthNames.indexOf(m[1].slice(0,3).toLowerCase())+1;if(month)return validDate(yearOf(m[3]),month,+m[2]);}
    }
    return null;
  }
  function validDate(y,m,d){const dt=new Date(y,m-1,d);if(dt.getFullYear()!==y||dt.getMonth()!==m-1||dt.getDate()!==d||y<1900||y>2200)return null;return `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;}
  function parseMoney(value){
    let s=clean(value).replace(/\s+/g,' ').replace(/^(?:INR|Rs\.?|₹)\s*/i,'').replace(/\bINR\b/ig,'').trim();
    if(!s||/^(?:-|–|—|n\/?a|nil|none)$/i.test(s))return {value:null,sign:null,explicit:false};
    const negParen=/^\(.*\)$/.test(s);if(negParen)s=s.slice(1,-1);
    let sign=null,explicit=false;
    if(/\bDR\.?\s*$/i.test(s)){sign=-1;explicit=true;s=s.replace(/\bDR\.?\s*$/i,'').trim();}
    else if(/\bCR\.?\s*$/i.test(s)){sign=1;explicit=true;s=s.replace(/\bCR\.?\s*$/i,'').trim();}
    if(/-$/.test(s)){sign=-1;explicit=true;s=s.slice(0,-1).trim();}
    if(/^\+/.test(s)){sign=1;explicit=true;s=s.slice(1).trim();}
    else if(/^-/ .test(s)){sign=-1;explicit=true;s=s.slice(1).trim();}
    const numeric=s.replace(/[₹,\s]/g,'');
    if(!/^(?:\d+(?:\.\d{1,2})?|\.\d{1,2})$/.test(numeric))return {value:null,sign:null,explicit:false};
    const amount=Math.round((Number(numeric)+Number.EPSILON)*100)/100;if(!Number.isFinite(amount))return {value:null,sign:null,explicit:false};
    if(negParen){sign=-1;explicit=true;}
    return {value:amount,sign,explicit};
  }
  function parseCSV(text){
    const source=String(text??'').replace(/^\uFEFF/,'');
    const sample=source.slice(0,20000);const counts=[',',';','\t','|'].map(delim=>({delim,count:countDelimiter(sample,delim)})).sort((a,b)=>b.count-a.count);
    const delimiter=counts[0]?.count?counts[0].delim:',';const rows=[];let row=[],field='',quoted=false;
    for(let i=0;i<source.length;i++){const ch=source[i];if(quoted){if(ch==='"'&&source[i+1]==='"'){field+='"';i++;}else if(ch==='"')quoted=false;else field+=ch;}else if(ch==='"'&&!field){quoted=true;}else if(ch===delimiter){row.push(field);field='';}else if(ch==='\n'||ch==='\r'){if(ch==='\r'&&source[i+1]==='\n')i++;row.push(field);if(row.some(c=>clean(c)))rows.push(row);row=[];field='';}else field+=ch;}
    row.push(field);if(row.some(c=>clean(c)))rows.push(row);
    return {rows,delimiter};
  }
  function countDelimiter(text,delimiter){let n=0,quoted=false;for(let i=0;i<text.length;i++){const c=text[i];if(c==='"'&&text[i+1]==='"'){i++;continue;}if(c==='"')quoted=!quoted;else if(c===delimiter&&!quoted)n++;}return n;}
  function headerType(value,profileId='generic'){
    const raw=clean(value);if(/^(?:ignored|other column|unmapped)\b/i.test(raw))return null;
    const h=norm(raw);if(!h)return null;
    if(/^(?:direction|transaction type|txn type|tran type|dr cr|cr dr|type|credit debit|debit credit)$/.test(h)||/^(?:paid to received from)$/.test(h))return 'direction';
    if(/^(?:transaction )?(?:date|txn date|tran date|value date|post date|posting date|transaction date|date of transaction|txn dt|tran dt|trans date|value dt|post dt|posting dt|transaction dt|entry date|dt)$/.test(h)||/\b(value date|post date|transaction date|txn date|tran date|posting date|transaction dt)\b/.test(h))return 'date';
    if(/\b(opening balance|closing balance|running balance|available balance|balance amount|balance|closing bal|balance rs|ledger balance|available bal|running bal|closing bal)\b/.test(h)||/^bal(?:ance)?$/.test(h))return 'balance';
    if(/\b(withdrawal|withdrawals|withdrawn|withdrawl|debit|debits|debit amount|withdrawal amount|paid out|money out|dr amount|withdrawal amt|withdrawal dr|debit dr|outflow|money withdrawn|withdra)\b/.test(h)||/^(?:dr|amount dr|amt dr|dr amount|dr amt|withdrawal amt|withdra|withdra wal|withdraw|withdrawl|debit amt)$/.test(h))return 'debit';
    if(/\b(deposit|deposits|deposited|deposite|credit|credits|credit amount|deposit amount|paid in|money in|cr amount|deposit amt|deposit cr|credit cr|inflow|money received|depos)\b/.test(h)||/^(?:cr|amount cr|amt cr|cr amount|cr amt|deposit amt|depos|credit amt)$/.test(h))return 'credit';
    if(/\b(particulars|description|narration|transaction details|transaction description|remarks|transaction particulars|payee|merchant|beneficiary|particular|transaction remarks|details of transaction|transaction narration|remarks narration|particulars details)\b/.test(h)||/^details$/.test(h))return 'description';
    if(/\b(reference|reference no|ref no|ref cheque|ref cheque no|rrn|utr|cheque no|cheque number|chq no|chq number|transaction id|txn id|tran id|instrument id|instrument no|utr no|bank reference|transaction reference|reference number|chq|cheque ref)\b/.test(h)||/^ref$/.test(h)||/^ref cheque$/.test(h))return 'reference';
    if(/\b(amount|transaction amount|txn amount|amount rs|amount inr|withdrawal amount|deposit amount|debit amount|credit amount|transaction value|txn value|paid amount|transfer amount|amount rs)\b/.test(h)||/^(?:value|amount|amt|transaction amt)$/.test(h))return 'amount';
    if(profileId==='gpay'&&/^(?:account|payment source|payment method)$/.test(h))return 'reference';
    return null;
  }
  function detectBankProfile(value){
    const text=(Array.isArray(value)?value.map(clean).join(' '):String(value??'')).toLowerCase();
    const compact=norm(text);
    if(/\bicici bank\b/.test(text)||(/\btran id\b/.test(compact)&&/withdra|deposit/.test(compact)))return {id:'icici',name:'ICICI Bank',narrationFlow:'post'};
    if(/\bstate bank of india\b/.test(text)||(/\btxn date\b/.test(compact)&&/ref no cheque|withdrawal amt/.test(compact))||(/\bpost date\b/.test(compact)&&/ref no cheque no/.test(compact)&&/\bdebit\b/.test(compact)))return {id:'sbi',name:'State Bank of India',narrationFlow:'post'};
    if(/\bcanara bank\b/.test(text)||(/opening balance/.test(compact)&&/particulars/.test(compact)&&/chq/.test(compact)))return {id:'canara',name:'Canara Bank',narrationFlow:'post'};
    if(/\bkotak mahindra\b/.test(text)||(/transaction details/.test(compact)&&/cheque reference/.test(compact)))return {id:'kotak',name:'Kotak Mahindra Bank',narrationFlow:'post'};
    if(/\bgoogle pay\b|\bgpay\b/.test(text)||/upi transaction id/.test(compact)&&/paid to|received from/.test(compact))return {id:'gpay',name:'Google Pay',narrationFlow:'post'};
    if(/\btamilnad mercantile bank\b|\btmb bank\b/.test(text))return {id:'tmb',name:'Tamilnad Mercantile Bank',narrationFlow:'post'};
    if(/\bkarur vysya bank\b|\bkvb bank\b/.test(text))return {id:'kvb',name:'Karur Vysya Bank',narrationFlow:'post'};
    if(/\baxis bank\b/.test(text))return {id:'axis',name:'Axis Bank',narrationFlow:'pre'};
    if(/\bhdfc bank\b/.test(text))return {id:'hdfc',name:'HDFC Bank',narrationFlow:'post'};
    if(/\bpunjab national bank\b|\bpnb bank\b/.test(text))return {id:'pnb',name:'Punjab National Bank',narrationFlow:'post'};
    return {id:'generic',name:'Generic bank statement',narrationFlow:'post'};
  }
  function parseDirection(value){
    const h=norm(value);
    if(!h)return null;
    if(/^(?:debit|dr|withdrawal|withdrawn|paid to|payment sent|sent|money out|outgoing)$/.test(h)||/\bpaid to\b/.test(h))return 'expense';
    if(/\brefund(?:ed)?\b/.test(h)&&/received|from|credit/.test(h))return 'refund';
    if(/^(?:credit|cr|deposit|received|received from|money in|incoming)$/.test(h)||/\breceived from\b/.test(h))return 'income';
    return null;
  }
  function splitTrailingReference(description,reference){
    const desc=clean(description),existing=clean(reference);
    if(existing||!desc)return {description:desc,reference:existing};
    // GPay narration often embeds a labelled transaction ID rather than placing it in a cell.
    const labelled=desc.match(/^(.*?)\s+(?:UPI\s+)?(?:transaction\s+id|txn\s+id)\s*[:#/-]?\s*([A-Z0-9][A-Z0-9/-]{5,})$/i);
    if(labelled&&labelled[1].trim())return {description:labelled[1].trim(),reference:labelled[2].trim().slice(0,100)};
    // Peel explicit rail-prefixed codes (UPI-/FCM-/IMPS- etc.).
    const prefixed=desc.match(/^(.*\S)\s+((?:UPI|FCM|IMPS|NEFT|RTGS)[\s/-]*[A-Z0-9][A-Z0-9/-]{5,})$/i);
    if(prefixed)return {description:prefixed[1].trim(),reference:prefixed[2].trim().slice(0,100)};
    // A bare long numeric suffix can be a reference, but don't split it away from a label like "UTR".
    const numeric=desc.match(/^(.*\S)\s+(\d{12,})$/);
    if(numeric&&!/\b(?:UTR|RRN|REF|REFERENCE)\s*$/i.test(numeric[1]))return {description:numeric[1].trim(),reference:numeric[2].trim().slice(0,100)};
    return {description:desc,reference:''};
  }
  function mapHeaders(headers,profileId='generic'){
    const map={date:null,description:null,debit:null,credit:null,amount:null,balance:null,reference:null,direction:null};
    headers.forEach((header,index)=>{const kind=headerType(header,profileId);if(kind&&Object.prototype.hasOwnProperty.call(map,kind)){
      if(map[kind]===null)map[kind]=index;
      // A value/posting date is secondary when the statement also exposes a transaction date.
      if(kind==='date'&&map.date!==index){const existing=norm(headers[map.date]||''),candidate=norm(header);
        const primary=/\b(?:txn|tran|transaction|post|posting|entry) date\b|\b(?:txn|tran|post|posting) dt\b/.test(candidate);
        const existingSecondary=/\b(?:value|effective) date\b|\bvalue dt\b/.test(existing);
        if(primary&&existingSecondary)map.date=index;
      }
    }});
    if(map.date===null){const i=headers.findIndex(h=>/date|dt/i.test(clean(h)));if(i>=0)map.date=i;}
    if(map.description===null){const i=headers.findIndex(h=>/description|narration|particular|remarks|details of transaction|transaction details|payee|merchant|beneficiary/i.test(clean(h))&&!/date|amount|id|reference|balance|account/i.test(clean(h)));if(i>=0)map.description=i;}
    return map;
  }
  function mappingUsable(map){return map&&Number.isInteger(map.date)&&Number.isInteger(map.description)&&(Number.isInteger(map.amount)||(Number.isInteger(map.debit)&&Number.isInteger(map.credit)));}
  function findHeaderRow(rows){const limit=Math.min(Array.isArray(rows)?rows.length:0,25);for(let i=0;i<limit;i++){const headers=(rows[i]||[]).map(clean),map=mapHeaders(headers);const likelyDate=headers.some(h=>headerType(h)==='date'||/date|txn.?dt|trans.?dt/i.test(h));const likelyDesc=headers.some(h=>headerType(h)==='description'||/description|narration|particular|transaction details|remarks/i.test(h));const likelyMoney=headers.some(h=>['amount','debit','credit','balance'].includes(headerType(h))||/debit|credit|withdraw|deposit|amount|balance/i.test(h));if(likelyDate&&likelyDesc&&likelyMoney)return i;}return -1;}
  function validateMapping(map,headersLength,headers=[]){const out={date:null,description:null,debit:null,credit:null,amount:null,balance:null,reference:null,direction:null};for(const k of Object.keys(out)){const i=map?.[k];if(Number.isInteger(i)&&i>=0&&i<headersLength)out[k]=i;}if(out.direction===null&&Array.isArray(headers)){const auto=mapHeaders(headers).direction;if(Number.isInteger(auto)&&auto>=0&&auto<headersLength)out.direction=auto;}if(!mappingUsable(out))return null;const active=[out.date,out.description,out.amount!==null?out.amount:out.debit,out.amount!==null?null:out.credit,out.balance,out.reference,out.direction].filter(v=>v!==null);if(new Set(active).size!==active.length)return null;return out;}
  function parseMatrix(rows,mapping){
    if(!Array.isArray(rows)||rows.length<2)return {transactions:[],issues:[],error:'The statement does not contain a header row and transactions.'};
    const headers=rows[0].map(clean),autoMap=mapHeaders(headers),map=validateMapping(mapping||autoMap,headers.length,headers);
    if(!map)return {transactions:[],issues:[],headers, mapping:mapHeaders(headers), error:'Could not reliably identify the date, description and amount/debit/credit columns. Map the columns before continuing.'};
    const parsed=[],issues=[];let candidateCount=0;
    for(let ri=1;ri<rows.length&&ri<=MAX_ROWS;ri++){
      const cells=rows[ri]||[];if(!cells.some(v=>clean(v)))continue;const date=parseDate(cells[map.date]);
      if(!date){if(looksLikeTransaction(cells,map)){candidateCount++;issues.push({row:ri+1,reason:'Could not read transaction date.'});}continue;}
      let description=clean(cells[map.description]).replace(/\s+/g,' ').slice(0,500);let debit=map.debit===null?{value:null}:parseMoney(cells[map.debit]);let credit=map.credit===null?{value:null}:parseMoney(cells[map.credit]);let amount=map.amount===null?{value:null,sign:null,explicit:false}:parseMoney(cells[map.amount]);const balance=map.balance===null?{value:null}:parseMoney(cells[map.balance]);let reference=map.reference===null?'':clean(cells[map.reference]).slice(0,100);const splitReference=splitTrailingReference(description,reference);description=splitReference.description;reference=splitReference.reference;const direction=map.direction===null?null:parseDirection(cells[map.direction]);
      const hasSeparate=map.debit!==null||map.credit!==null;let val=null,type=null,confidence='normal',reason='';
      if(hasSeparate){const d=Number(debit.value||0),c=Number(credit.value||0);if(d>0&&c>0){reason='Both debit and credit columns contain amounts.';}else if(d>0){val=d;type='expense';}else if(c>0){val=c;type='income';}else if(d===0&&c===0&&amount.value!==null){val=amount.value;type=direction||(amount.explicit?(amount.sign<0?'expense':'income'):null);}else if(d===0&&c===0){continue;}else reason='Could not read a debit or credit amount.';}
      else if(amount.value!==null){val=amount.value;if(amount.explicit)type=amount.sign<0?'expense':'income';else if(direction)type=direction;else {const header=norm(headers[map.amount]||'');if(/debit|withdrawal|paid out|money out/.test(header))type='expense';else if(/credit|deposit|paid in|money in/.test(header))type='income';else if(/\bpaid to\b/i.test(description))type='expense';else if(/\breceived from\b/i.test(description))type='income';}}
      if(val===null||!Number.isFinite(val)||val<=0){reason=reason||'Could not read a non-zero transaction amount.';}
      if(!description){reason=reason||'Transaction description is empty.';}
      parsed.push({date,description,amount:val,type,balance:balance.value,reference,sourceRow:ri+1,rawCells:cells.map(clean),confidence,issue:reason,selected:!reason&&!!type});
      if(reason)issues.push({row:ri+1,reason});
    }
    if(rows.length-1>MAX_ROWS)issues.push({row:MAX_ROWS+1,reason:`Only the first ${MAX_ROWS.toLocaleString('en-IN')} data rows were processed for safety.`});
    // Reconcile transaction direction and amounts against running balances whenever a neighboring
    // balance exists. This is a warning gate, never a license to rewrite a parsed amount silently.
    const dateOrder=detectDateOrder(parsed);for(let i=0;i<parsed.length;i++){const tx=parsed[i];if(tx.amount===null||tx.balance===null)continue;let adjacent=null;if(dateOrder==='ascending'&&i>0)adjacent=parsed[i-1].balance;else if(dateOrder==='descending'&&i+1<parsed.length)adjacent=parsed[i+1].balance;else if(dateOrder==='ascending'&&i===0)adjacent=findOpeningBalance(rows);if(adjacent===null||adjacent===undefined)continue;const delta=Math.round((tx.balance-adjacent)*100)/100;if(Math.abs(delta)<0.005)continue;if(!tx.type){if(Math.abs(Math.abs(delta)-tx.amount)<=0.03){tx.type=delta<0?'expense':'income';tx.selected=!tx.issue;tx.directionFromBalance=true;}else{tx.issue=tx.issue||'Amount does not reconcile with the balance change.';tx.confidence='review';tx.selected=false;}}else if(Math.abs(Math.abs(delta)-tx.amount)>0.03||(tx.type==='expense'&&delta>0)||(tx.type!=='expense'&&delta<0)){tx.issue=tx.issue||'Running-balance change does not match the amount or direction.';tx.confidence='review';tx.selected=false;issues.push({row:tx.sourceRow,reason:tx.issue});}}
    for(const tx of parsed){if(!tx.type&&tx.amount!==null){tx.issue=tx.issue||'Direction is unclear; choose income or expense manually.';tx.confidence='review';tx.selected=false;if(!issues.some(x=>x.row===tx.sourceRow))issues.push({row:tx.sourceRow,reason:tx.issue});}}
    const transactions=parsed.filter(t=>t.amount!==null&&t.date&&t.description);
    return {transactions,issues,headers,mapping:map,unparsedRows:issues.length,detectedRows:transactions.length,sourceRows:rows.length-1,dateOrder,hasBalance:map.balance!==null};
  }
  function detectDateOrder(parsed){const dates=parsed.filter(x=>x.date).map(x=>x.date);if(dates.length<2)return 'unknown';let asc=0,desc=0;for(let i=1;i<dates.length;i++){if(dates[i]>dates[i-1])asc++;else if(dates[i]<dates[i-1])desc++;}if(asc>desc)return 'ascending';if(desc>asc)return 'descending';return 'unknown';}
  function findOpeningBalance(rows){for(const row of rows.slice(0,5)){const text=row.map(norm).join(' ');if(/opening balance|balance b f|balance brought forward/.test(text)){for(const cell of row){const v=parseMoney(cell);if(v.value!==null)return v.value;}}}return null;}
  function looksLikeTransaction(cells,map){return cells.some(c=>parseDate(c))||cells.some(c=>/\b(?:NEFT|RTGS|IMPS|UPI|ATM|POS|ACH|NACH|CHEQUE|CHQ)\b/i.test(clean(c)));}
  // Keep duplicate-looking legitimate payments separate when a statement has no bank reference.
  // When a reference exists, it remains the primary idempotency key across repeated imports.
  function fingerprintKey(row,accountId){const reference=clean(row?.reference).toLowerCase();const identity=reference||norm(row?.description);return [String(accountId||''),String(row?.date||''),String(row?.type||''),Number(row?.amount).toFixed(2),identity].join('|');}
  function makeFingerprint(row,accountId,occurrence=1){const key=fingerprintKey(row,accountId);const input=clean(row?.reference)?key:`${key}|occurrence:${Math.max(1,Math.trunc(Number(occurrence)||1))}`;let hash=2166136261;for(let i=0;i<input.length;i++){hash^=input.charCodeAt(i);hash=Math.imul(hash,16777619);}return `stmt_${(hash>>>0).toString(16)}`;}
  function pdfItemsToLines(items){
    const kept=(items||[]).filter(x=>x&&typeof x.str==='string'&&clean(x.str)).map(item=>{
      const x=Number(item.transform?.[4]||0),y=Number(item.transform?.[5]||0),text=clean(item.str);
      const width=Math.max(0,Number(item.width)||text.length*4.2);
      const height=Math.max(1,Math.abs(Number(item.transform?.[3])||Number(item.height)||8));
      return {x,y,width,height,right:x+width,text};
    }).sort((a,b)=>b.y-a.y||a.x-b.x);
    const lines=[];
    for(const item of kept){
      // Fixed baseline anchors prevent gradual row drift; tolerance scales slightly with font size.
      let line=lines.find(l=>Math.abs(l.y-item.y)<=Math.max(2.5,Math.min(3.8,Math.min(l.height,item.height)*0.32)));
      if(!line){line={y:item.y,height:item.height,items:[]};lines.push(line);}
      line.items.push(item);line.height=Math.max(line.height,item.height);
    }
    for(const line of lines){line.items.sort((a,b)=>a.x-b.x);line.text=line.items.map(x=>x.text).join(' ').replace(/\s+/g,' ').trim();}
    return lines.sort((a,b)=>b.y-a.y);
  }
  function joinCellFragments(items,kind){
    const parts=(items||[]).slice().sort((a,b)=>b.y-a.y||a.x-b.x);
    let value=parts.map(item=>item.text).filter(Boolean).join(' ').replace(/\s+/g,' ').trim();
    if(kind==='date'){
      value=value.replace(/\s*([/.\-])\s*/g,'$1').replace(/\b(19\d{2}|20\d{2})\s+(\d)\b/g,'$1$2');
      return value;
    }
    if(['debit','credit','amount','balance'].includes(kind)){
      // PDF engines sometimes split decimal punctuation and cents into independent text blocks.
      value=value.replace(/(\d)\s*([.,])\s*(\d)/g,'$1$2$3').replace(/^([+-])\s+(?=\d)/,'$1');
    }
    return value;
  }
  function dateCellText(items){
    const parts=(items||[]).slice().sort((a,b)=>a.x-b.x).map(item=>clean(item.text)).filter(Boolean);
    let value=parts.join(' ').replace(/\s*([/.\-])\s*/g,'$1').replace(/\s+/g,' ').trim();
    // Rejoin split year tokens (e.g. "202" + "5") only inside the date column.
    value=value.replace(/\b(19\d|20\d)\s+(\d)\b/g,'$1$2');
    return value;
  }
  function dateFromColumnLine(line,bounds,headerY,hasHeader){
    if(hasHeader&&headerY!==null&&line.y>=headerY-2)return null;
    const items=(line.items||[]).filter(item=>item.x>=bounds.left&&item.x<bounds.right).sort((a,b)=>a.x-b.x);
    if(!items.length)return null;
    const text=dateCellText(items);
    let date=parseDate(text);
    if(date)return {date,y:line.y,item:items[0],text};
    // Some SBI PDFs put a partial date on the transaction baseline and the year below it.
    const partial=text.match(/^(\d{1,2})\s+([A-Za-z]{3,9})$/);
    if(partial){
      const companion=(line._allLines||[]).filter(other=>other.y<line.y&&line.y-other.y<=18)
        .sort((a,b)=>b.y-a.y).map(other=>({line:other,text:dateCellText((other.items||[]).filter(item=>item.x>=bounds.left&&item.x<bounds.right))}))
        .find(entry=>/^20\d{2}$|^19\d{2}$|^(?:19|20)\d\s+\d$/.test(entry.text));
      if(companion){const year=companion.text.replace(/\s/g,'');date=parseDate(`${partial[1]} ${partial[2]} ${year}`);if(date)return {date,y:line.y,item:items[0],text};}
    }
    return null;
  }
  function pdfHeaderSegments(items){
    const sorted=(items||[]).slice().sort((a,b)=>a.x-b.x);const segments=[];
    for(const item of sorted){
      const prior=segments[segments.length-1];
      const right=Number.isFinite(item.right)?item.right:item.x+Math.max(0,Number(item.width)||item.text.length*4.2);
      const gap=prior?item.x-prior.right:Infinity;
      // Column captions are often emitted as separate PDF text fragments, e.g. "Txn" + "Date".
      // Merge close fragments before classifying them so "Value Date" cannot become an Amount column.
      if(prior&&gap<=4){prior.text=`${prior.text} ${item.text}`.trim();prior.right=Math.max(prior.right,right);}
      else segments.push({x:item.x,right,text:item.text});
    }
    return segments;
  }
  function pdfPageToMatrix(lines,previousLayout=null){
    const allItems=(lines||[]).flatMap(line=>line.items||[]).sort((a,b)=>b.y-a.y||a.x-b.x);
    let layout=null,headerY=null,hasHeader=false;
    const bankProfile=detectBankProfile((lines||[]).map(line=>line.text).join(' '));
    for(const line of (lines||[])){
      // Some bank PDFs render a wrapped table caption (for example Ref/Cheque / No.) on
      // neighboring baselines. Inspect a narrow band around each candidate header line.
      const nearbyItems=(lines||[]).filter(other=>Math.abs(other.y-line.y)<=10).flatMap(other=>other.items||[]);
      const rawSegments=pdfHeaderSegments(nearbyItems);
      const labelled=rawSegments.map(segment=>({...segment,kind:headerType(segment.text,bankProfile.id)}));
      const dateSegments=labelled.filter(s=>s.kind==='date');
      const dateCaption=dateSegments.find(s=>/txn|trans|transaction|post|posting|entry/.test(norm(s.text))&&!/value date|effective date/.test(norm(s.text)))||dateSegments.find(s=>!/value date|effective date/.test(norm(s.text)))||dateSegments[0];
      if(!dateCaption)continue;
      const description=labelled.find(s=>s.kind==='description');
      const money=labelled.some(s=>['amount','debit','credit'].includes(s.kind));
      // If money captions are unfamiliar, allow a plausible 3+ column table through to preview/mapping.
      // This lets an already-cached local AI or the user map unusual labels instead of hard failing.
      if(!description||(!money&&labelled.length<3))continue;
      // Preserve unknown header cells as physical boundaries too. Bank captions vary widely,
      // and dropping a reference or instrument column can shift debit/credit data into the wrong cell.
      const ordered=labelled.slice().sort((a,b)=>a.x-b.x);let assignedPrimary=false;
      layout=ordered.map(segment=>{
        let kind=segment.kind||'ignored';
        if(kind==='date'){
          const primary=segment===dateCaption&&!assignedPrimary;
          if(primary){kind='date';assignedPrimary=true;}else kind='ignored';
        }
        return {kind,x:segment.x,label:segment.text};
      });
      // Duplicate semantic columns are left as separators rather than merged into adjacent cells.
      // This particularly matters for statements with both Txn Date and Value Date.
      const seen=new Set();layout=layout.map(col=>{
        if(col.kind==='ignored')return col;
        if(seen.has(col.kind))return {...col,kind:'ignored'};
        seen.add(col.kind);return col;
      });
      headerY=line.y;hasHeader=true;break;
    }
    if(!layout&&Array.isArray(previousLayout)&&previousLayout.length>=3){
      layout=previousLayout.map(c=>({...c}));
    }
    if(!layout)return {rows:null,lines:(lines||[]).map(l=>l.text),issues:['No recognizable table header was detected in the PDF.'],layout:null};
    layout=layout.slice().sort((a,b)=>a.x-b.x);
    const dateIndex=layout.findIndex(c=>c.kind==='date');
    if(dateIndex<0)return {rows:null,lines:(lines||[]).map(l=>l.text),issues:['A transaction-date column could not be identified.'],layout};
    const xBounds=layout.map((col,i)=>({kind:col.kind,left:i===0?-Infinity:(layout[i-1].x+col.x)/2,right:i===layout.length-1?Infinity:(col.x+layout[i+1].x)/2}));
    // Narration/description cells are often much wider than the caption itself. Use the next
    // reference boundary as the narration edge instead of the midpoint of the two caption starts.
    const descIndex=layout.findIndex(c=>c.kind==='description');
    if(descIndex>=0&&descIndex<layout.length-1){
      const next=layout[descIndex+1];
      if(next.kind==='reference')xBounds[descIndex].right=Math.max(xBounds[descIndex].right,next.x-3);
      else xBounds[descIndex].right=Math.max(xBounds[descIndex].right,next.x-18);
    }
    const refIndex=layout.findIndex(c=>c.kind==='reference');
    if(refIndex>=0&&refIndex<layout.length-1&&['debit','credit','amount','balance'].includes(layout[refIndex+1].kind)){
      xBounds[refIndex].right=Math.max(xBounds[refIndex].right,(layout[refIndex].x+layout[refIndex+1].x)/2+10);
    }
    const dateAnchors=[];
    const enrichedLines=(lines||[]).map(line=>({...line,_allLines:lines}));
    for(const line of enrichedLines){
      const anchor=dateFromColumnLine(line,xBounds[dateIndex],headerY,hasHeader);
      if(!anchor)continue;
      if(!dateAnchors.some(existing=>Math.abs(existing.y-anchor.y)<=3.5))dateAnchors.push(anchor);
    }
    dateAnchors.sort((a,b)=>b.y-a.y);
    if(!dateAnchors.length)return {rows:null,lines:(lines||[]).map(l=>l.text),issues:['The table headings were found, but no transaction dates were found in the date column.'],layout};
    const rows=[];
    for(let ri=0;ri<dateAnchors.length;ri++){
      const anchor=dateAnchors[ri],prev=dateAnchors[ri-1],next=dateAnchors[ri+1];
      const gapAbove=prev?Math.abs(prev.y-anchor.y):next?Math.abs(anchor.y-next.y):24;
      const gapBelow=next?Math.abs(anchor.y-next.y):prev?Math.abs(prev.y-anchor.y):24;
      const top=prev?(prev.y+anchor.y)/2:anchor.y+Math.max(10,gapAbove/2);
      const bottom=next?(anchor.y+next.y)/2:anchor.y-Math.max(10,gapBelow/2);
      const cells=layout.map(()=>[]);
      for(const item of allItems){
        if(item.y>top+0.1||item.y<bottom-0.1)continue;
        if(hasHeader&&headerY!==null&&item.y>=headerY-2)continue;
        let col=xBounds.findIndex(b=>item.x>=b.left&&item.x<b.right);if(col<0)continue;
        // Don't duplicate the anchor date if PDF text spans happen to overlap the column boundary.
        cells[col].push(item);
      }
      const row=layout.map((col,i)=>{
        const parts=cells[i].sort((a,b)=>b.y-a.y||a.x-b.x).map(item=>item.text).filter(Boolean);
        let value=joinCellFragments(cells[i],col.kind);
        if(col.kind==='date')value=anchor.date;
        return value;
      });
      rows.push(row);
    }
    const nameFor=col=>{if(col.kind==='ignored')return `Ignored: ${col.label||'Other column'}`;return ({date:'Date',description:'Description',reference:'Reference',debit:'Debit',credit:'Credit',amount:'Amount',balance:'Balance'}[col.kind]||col.label||'Other column');};
    const headers=layout.map(nameFor);
    // Avoid turning blank visual spacers into duplicate headers; labels above represent real columns.
    return {rows:[headers,...rows],lines:(lines||[]).map(l=>l.text),issues:[],layout:layout.map(c=>({...c})),headerDetected:hasHeader,rowCount:rows.length,bankProfile};
  }
  return {parseDate,parseMoney,parseCSV,headerType,mapHeaders,mappingUsable,findHeaderRow,validateMapping,parseMatrix,pdfItemsToLines,pdfPageToMatrix,fingerprintKey,makeFingerprint,norm,detectBankProfile,parseDirection,splitTrailingReference,MAX_ROWS};
});
