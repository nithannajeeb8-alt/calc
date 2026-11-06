/* Deterministic evidence checks for optional AI statement transcription. */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.PWStatementAIGuard=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const DATE_PATTERN=/(?:\b\d{4}[./-]\d{1,2}[./-]\d{1,2}\b|\b\d{1,2}[./-]\d{1,2}[./-]\d{2,4}\b|\b\d{1,2}[ -]+[A-Za-z]{3,9}[, ]+\d{2,4}\b|\b[A-Za-z]{3,9}[ -]+\d{1,2},?\s+\d{2,4}\b)/g;
  const MONEY_PATTERN=/(?:₹\s*|INR\s*|Rs\.?\s*)?[-(]?\s*(?:\d{1,3}(?:,\d{2,3})+|\d+)(?:\.\d{1,2})?\)?(?:\s*(?:DR|CR))?/gi;
  const STOP_WORDS=new Set(['the','and','for','from','to','via','by','upi','neft','imps','rtgs','pos','atm','transfer','payment','debit','credit','dr','cr','ref','no','txn','transaction','card','bank','pay','merchant','services','service','store','online','purchase']);
  function safeText(value,max=500){return String(value??'').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,' ').replace(/\s+/g,' ').trim().slice(0,max);}
  function dateOccurrences(line,parser){
    const found=[];const text=String(line||'');DATE_PATTERN.lastIndex=0;let match;
    while((match=DATE_PATTERN.exec(text))){const date=parser.parseDate(match[0]);if(date)found.push({date,raw:match[0],index:match.index});}
    return found;
  }
  function numericValues(text,parser){
    const source=String(text||'');const withoutDates=source.replace(DATE_PATTERN, ' ');const values=new Set();MONEY_PATTERN.lastIndex=0;let match;
    while((match=MONEY_PATTERN.exec(withoutDates))){
      const raw=match[0],digits=raw.replace(/\D/g,'');
      const hasCurrency=/(?:₹|\bINR\b|\bRs\.?)/i.test(raw);
      const hasDecimal=/\.\d{1,2}/.test(raw);
      const hasGrouping=/\d{1,3}(?:,\d{2,3})+/.test(raw);
      if(!hasCurrency&&!hasDecimal&&!hasGrouping&&digits.length>=10)continue;
      const parsed=parser.parseMoney(raw);
      if(parsed.value!==null&&parsed.value>0&&parsed.value<=100000000000)values.add(Math.round(parsed.value*100));
    }
    return values;
  }
  function tokens(value,parser){return parser.norm(value).split(' ').filter(token=>token.length>=2&&!STOP_WORDS.has(token)&&!/^\d+$/.test(token));}
  function descriptionSupported(description,context,parser){
    const normalized=parser.norm(description),source=parser.norm(context);
    if(!normalized||!source)return false;
    if(source.includes(normalized))return true;
    const wanted=tokens(description,parser),available=new Set(tokens(context,parser));
    if(!wanted.length)return false;
    const hits=wanted.filter(token=>available.has(token)).length;
    return hits>=Math.min(wanted.length,Math.max(1,Math.ceil(wanted.length*0.5)));
  }
  function normalizeDirection(value){
    const direction=String(value??'').trim().toLowerCase();
    if(/^(?:debit|dr|expense|withdrawal|outflow)$/.test(direction))return 'debit';
    if(/^(?:credit|cr|income|deposit|inflow)$/.test(direction))return 'credit';
    if(/^(?:refund|reversal)$/.test(direction))return 'refund';
    return 'unknown';
  }
  function sourceDirection(text){
    const debit=/\bDR\b|\bDEBIT\b/i.test(String(text||''));
    const credit=/\bCR\b|\bCREDIT\b/i.test(String(text||''));
    return debit===credit?null:debit?'debit':'credit';
  }
  function validate(payload,sourceText,parser,options={}){
    if(!parser||typeof parser.parseDate!=='function'||typeof parser.parseMoney!=='function'||typeof parser.norm!=='function')throw new Error('The deterministic statement validator is unavailable.');
    const rows=Array.isArray(payload)?payload:(Array.isArray(payload?.transactions)?payload.transactions:[]);
    const text=String(sourceText||'').slice(0,150000);
    const lines=text.split(/\r?\n/).map(line=>line.trim()).filter(Boolean);
    const maxRows=Math.max(1,Math.min(20000,Number(options.maxRows)||20000));
    const index=[];
    for(let i=0;i<lines.length;i++){if(/\b(?:statement date|date of statement|generated on|printed on|period from)\b/i.test(lines[i]))continue;for(const item of dateOccurrences(lines[i],parser))index.push({line:i,date:item.date});}
    const accepted=[],issues=[];const seen=new Set();
    for(let ri=0;ri<rows.length&&ri<maxRows;ri++){
      const row=rows[ri]||{};const date=parser.parseDate(row.date??row.transaction_date??row.value_date);
      const description=safeText(row.description??row.narration??row.particulars??row.details,500);
      const amountResult=parser.parseMoney(row.amount??row.amount_raw);
      const amount=amountResult.value;
      const direction=normalizeDirection(row.direction??row.type??row.dr_cr);
      if(!date){issues.push({row:ri+1,reason:'AI date is missing or invalid.'});continue;}
      if(!description){issues.push({row:ri+1,reason:'AI narration is empty.'});continue;}
      if(amount===null||amount<=0||amount>100000000000){issues.push({row:ri+1,reason:'AI amount is missing or invalid.'});continue;}
      const dateLines=index.filter(item=>item.date===date).map(item=>item.line);
      if(!dateLines.length){issues.push({row:ri+1,reason:'Date was not found in the original statement text.'});continue;}
      let bestContext='',matchedRowText='',amountFound=false,balanceFound=false,descriptionFound=false;
      const balanceValue=row.balance===null||row.balance===undefined||row.balance===''?null:parser.parseMoney(row.balance).value;
      for(const lineIndex of dateLines){
        const rowLines=[lines[lineIndex]];
        for(let next=lineIndex+1;next<Math.min(lines.length,lineIndex+3);next++){
          if(dateOccurrences(lines[next],parser).length||/^(?:page\s+\d+|generated on|statement date|closing balance|opening balance)\b/i.test(lines[next]))break;
          rowLines.push(lines[next]);
        }
        const context=rowLines.join(' ');
        const values=numericValues(context,parser);
        if(values.has(Math.round(amount*100))){
          const descOK=descriptionSupported(description,context,parser);
          const balanceOK=balanceValue===null||values.has(Math.round(balanceValue*100));
          if(!amountFound||descOK&&balanceOK){amountFound=true;bestContext=context;matchedRowText=context;descriptionFound=descOK;balanceFound=balanceValue!==null&&balanceOK;}
          if(descOK&&balanceOK)break;
        }
      }
      if(!amountFound){issues.push({row:ri+1,reason:'Amount was not found near its date in the source text.'});continue;}
      if(!descriptionFound){issues.push({row:ri+1,reason:'Narration could not be matched to nearby source text.'});continue;}
      const sourceDir=sourceDirection(matchedRowText);
      if(direction!=='unknown'&&sourceDir&&direction!==sourceDir){issues.push({row:ri+1,reason:'AI direction conflicts with the debit/credit marker in the source text.'});continue;}
      if(balanceValue!==null&&!balanceFound){issues.push({row:ri+1,reason:'Running balance was not found near the transaction in the source text.'});continue;}
      const reference=safeText(row.reference??row.ref??row.utr,100);
      if(reference&&!parser.norm(bestContext).includes(parser.norm(reference))){issues.push({row:ri+1,reason:'Reference was not found near the transaction in the source text.'});continue;}
      const key=[date,Math.round(amount*100),direction,parser.norm(description),reference.toLowerCase()].join('|');
      if(seen.has(key)){issues.push({row:ri+1,reason:'Repeated AI row was removed.'});continue;}
      seen.add(key);
      accepted.push({date,description,amount,direction,balance:balanceValue,reference});
    }
    if(rows.length>maxRows)issues.push({row:maxRows+1,reason:`Only the first ${maxRows.toLocaleString('en-IN')} AI rows were checked.`});
    return {transactions:accepted,issues,proposed:rows.length,verified:accepted.length};
  }
  return {validate,normalizeDirection,numericValues,dateOccurrences,sourceDirection};
});
