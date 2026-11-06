/*
 * Aruvi receipt OCR post-processor v1.1.
 * PaddleOCR provides local text + polygons. This module performs conservative,
 * India-aware field extraction and emits confidence/review metadata. It never
 * uploads images, invents missing digits, or changes transaction storage.
 */
(function (root) {
  'use strict';

  var HANDLE_PROVIDERS = Object.assign(Object.create(null), {
    oksbi: 'Bank-linked UPI handle (bank not confirmed)',
    okaxis: 'Bank-linked UPI handle (bank not confirmed)',
    okicici: 'Bank-linked UPI handle (bank not confirmed)',
    okhdfcbank: 'Bank-linked UPI handle (bank not confirmed)',
    ybl: 'PhonePe UPI route', ibl: 'PhonePe UPI route', axl: 'PhonePe UPI route',
    paytm: 'Paytm UPI route', ptyes: 'Paytm UPI route', ptaxis: 'Paytm UPI route',
    pthdfc: 'Paytm UPI route', ptsbi: 'Paytm UPI route', pticici: 'Paytm UPI route',
    apl: 'Amazon Pay UPI route', yapl: 'Amazon Pay UPI route',
    upi: 'UPI handle (provider not confirmed)'
  });

  var SOURCE_APPS = [
    { name: 'Google Pay', re: /\b(?:google\s*pay|g\s*pay|gpay|tez)\b/i, weight: 1 },
    { name: 'PhonePe', re: /\bphone\s*pe\b|\bphonepe\b/i, weight: 1 },
    { name: 'Paytm', re: /\bpaytm\b|\bone97\b/i, weight: 1 },
    { name: 'BHIM', re: /\bbhim\b|bharat\s+interface\s+for\s+money/i, weight: 1 },
    { name: 'Amazon Pay', re: /\bamazon\s*pay\b|\bamazonpay\b/i, weight: 1 },
    { name: 'CRED', re: /\bcred(?:\s*pay)?\b/i, weight: 1 },
    { name: 'WhatsApp Pay', re: /\bwhatsapp\s*pay\b/i, weight: 1 },
    { name: 'MobiKwik', re: /\bmobikwik\b/i, weight: 1 },
    { name: 'Freecharge', re: /\bfreecharge\b/i, weight: 1 },
    { name: 'Airtel Thanks', re: /\bairtel\s*(?:thanks|payments?)\b/i, weight: 1 },
    { name: 'Jupiter', re: /\bjupiter\b/i, weight: 1 },
    { name: 'super.money', re: /\bsuper\s*\.\s*money\b|\bsupermoney\b/i, weight: 1 },
    { name: 'Slice', re: /\bslice\b/i, weight: .9 },
    { name: 'Navi', re: /\bnavi\b/i, weight: .9 }
  ];

  var VPA_RE = /\b[a-z0-9][a-z0-9._-]{0,120}@[a-z0-9][a-z0-9.-]{0,80}\b/ig;
  var AMOUNT_RE = /(?:₹|\bINR\b|\bRs\.?\s*)\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)/ig;
  var BARE_NUMBER_RE = /(?<![A-Za-z0-9])(?:[0-9]{1,3}(?:,[0-9]{2,3})+|[0-9]+)(?:\.[0-9]{1,2})?(?![A-Za-z0-9])/g;
  var AMOUNT_LABEL_RE = /\b(?:amount|total|grand\s*total|paid|you\s*paid|transaction\s*amount|debited|credited|sent|received|payment\s*(?:of|amount)?|charged|purchase\s*amount|transferred)\b/i;
  var NEGATIVE_AMOUNT_RE = /\b(?:balance|available|cashback|cash\s*back|reward|discount|offer|saving|savings|limit|before|after|minimum\s*due|points|coupon|voucher|bill\s*date|account\s*(?:no|number))\b/ig;
  var REFERENCE_CONTEXT_RE = /\b(?:utr|rrn|reference|ref\s*(?:no|number)?|transaction\s*id|txn\s*id|account\s*(?:no|number)|ifsc|mobile|phone|otp)\b/i;

  function configureHandleMapping(mapping) {
    if (!mapping || typeof mapping !== 'object') return false;
    Object.keys(mapping).forEach(function (key) {
      var handle = String(key || '').trim().replace(/^@/, '').toLowerCase();
      var provider = String(mapping[key] || '').trim().slice(0, 80);
      if (/^[a-z0-9][a-z0-9.-]{0,80}$/.test(handle) && provider) HANDLE_PROVIDERS[handle] = provider;
    });
    return true;
  }

  function textOf(item) { return String(item && item.text || '').replace(/\s+/g, ' ').trim(); }
  function getBox(item) {
    var p = item && (item.poly || item.polygon || item.box), xs = [], ys = [];
    if (Array.isArray(p) && p.length) {
      if (Array.isArray(p[0])) p.forEach(function (pt) {
        if (pt && Number.isFinite(+pt[0]) && Number.isFinite(+pt[1])) { xs.push(+pt[0]); ys.push(+pt[1]); }
      });
      else if (p.length >= 4) return { x0:+p[0], y0:+p[1], x1:+p[2], y1:+p[3] };
    } else if (p && typeof p === 'object') {
      if (Array.isArray(p.points)) return getBox({ poly:p.points });
      if ([p.x0,p.y0,p.x1,p.y1].every(function (v) { return Number.isFinite(+v); })) return { x0:+p.x0, y0:+p.y0, x1:+p.x1, y1:+p.y1 };
    }
    if (!xs.length) return null;
    return { x0:Math.min.apply(null,xs), y0:Math.min.apply(null,ys), x1:Math.max.apply(null,xs), y1:Math.max.apply(null,ys) };
  }
  function median(values) {
    var a = values.filter(function (v) { return Number.isFinite(v) && v > 0; }).sort(function (x,y) { return x-y; });
    if (!a.length) return 1;
    var m = Math.floor(a.length / 2);
    return a.length % 2 ? a[m] : (a[m-1] + a[m]) / 2;
  }
  function normaliseItems(items) {
    var valid = (Array.isArray(items) ? items : []).map(function (item, index) {
      var box = getBox(item);
      return { text:textOf(item), score:Math.max(0, Math.min(1, Number(item && item.score) || 0)), box:box, sourceIndex:index };
    }).filter(function (item) {
      return item.text && item.box && Number.isFinite(item.box.x0) && Number.isFinite(item.box.y0) &&
        Number.isFinite(item.box.x1) && Number.isFinite(item.box.y1) && item.box.x1 >= item.box.x0 && item.box.y1 >= item.box.y0;
    });
    // Cluster boxes into visual rows first, then sort each row left-to-right. This avoids
    // a non-transitive pairwise comparator scrambling OCR items on narrow phone receipts.
    valid.sort(function (a,b) { return (a.box.y0+a.box.y1) - (b.box.y0+b.box.y1) || a.box.x0-b.box.x0; });
    var rowHeight = median(valid.map(function (v) { return v.box.y1-v.box.y0; })), rows = [];
    valid.forEach(function (item) {
      var cy = (item.box.y0 + item.box.y1) / 2, h = Math.max(1, item.box.y1-item.box.y0), best = null, bestDistance = Infinity;
      rows.forEach(function (row) {
        var overlap = Math.max(0, Math.min(row.y1,item.box.y1)-Math.max(row.y0,item.box.y0));
        var minHeight = Math.max(1, Math.min(row.height,h));
        var distance = Math.abs(cy-row.center);
        if (overlap/minHeight >= .35 || distance <= Math.max(5, Math.min(rowHeight,minHeight)*.38)) {
          if (distance < bestDistance) { best = row; bestDistance = distance; }
        }
      });
      if (!best) rows.push({items:[item],y0:item.box.y0,y1:item.box.y1,center:cy,height:h});
      else {
        best.items.push(item); best.y0=Math.min(best.y0,item.box.y0); best.y1=Math.max(best.y1,item.box.y1);
        best.center=best.items.reduce(function(sum,v){return sum+(v.box.y0+v.box.y1)/2;},0)/best.items.length;
        best.height=median(best.items.map(function(v){return v.box.y1-v.box.y0;}));
      }
    });
    rows.sort(function(a,b){return a.center-b.center;});
    var output=[];
    rows.forEach(function(row){row.items.sort(function(a,b){return a.box.x0-b.box.x0;});row.items.forEach(function(item){output.push(item);});});
    return output;
  }
  function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi,n)); }
  function editDistance(a,b) {
    var prev = new Array(b.length+1), cur = new Array(b.length+1);
    for (var j=0;j<=b.length;j++) prev[j]=j;
    for (var i=1;i<=a.length;i++) {
      cur[0]=i;
      for (var k=1;k<=b.length;k++) cur[k]=Math.min(cur[k-1]+1,prev[k]+1,prev[k-1]+(a[i-1]===b[k-1]?0:1));
      var t=prev;prev=cur;cur=t;
    }
    return prev[b.length];
  }
  function fuzzyLabel(text, labels, maxRatio) {
    var clean=String(text||'').toLowerCase().replace(/[^a-z0-9 ]/g,' ').replace(/\s+/g,' ').trim();
    if(!clean)return null;
    for(var i=0;i<labels.length;i++){
      var label=labels[i],normal=label.toLowerCase();
      if(clean===normal||clean.indexOf(normal+' ')===0||clean.indexOf(normal+':')===0)return{label:label,ratio:0};
    }
    var best=null,flat=clean.replace(/ /g,'');
    labels.forEach(function(label){
      var normal=label.toLowerCase().replace(/ /g,'');
      if(normal.length<=3)return;
      var ratio=editDistance(flat.slice(0,normal.length),normal)/Math.max(normal.length,1);
      if(!best||ratio<best.ratio)best={label:label,ratio:ratio};
    });
    return best&&best.ratio<=(maxRatio||.22)?best:null;
  }
  function parseAmount(value) {
    var s=String(value||'').replace(/(?:₹|\bINR\b|\bRs\.?)/ig,'').replace(/\s/g,'').replace(/[^0-9,.]/g,'');
    if(!s||!/\d/.test(s))return null;
    var parts=s.split('.');
    if(parts.length>2||(parts[1]&&!/^\d{1,2}$/.test(parts[1])))return null;
    var integer=parts[0];
    if(!integer||!/^\d[\d,]*$/.test(integer))return null;
    if(integer.indexOf(',')>=0){
      var indian=/^\d{1,2}(?:,\d{2})*,\d{3}$/.test(integer);
      var western=/^\d{1,3}(?:,\d{3})+$/.test(integer);
      if(!indian&&!western)return null;
    }
    var canonical=integer.replace(/,/g,'')+(parts.length===2?'.'+parts[1]:''), amount=Number(canonical), major=Number(integer.replace(/,/g,''));
    if(!Number.isFinite(amount)||amount<=0||!Number.isSafeInteger(major))return null;
    return{value:amount,canonical:canonical,formatted:integer+(parts.length===2?'.'+parts[1]:''),digits:integer.replace(/\D/g,'').length};
  }
  function extractVpa(lines) {
    var candidates=[];
    lines.forEach(function(line){
      var re=new RegExp(VPA_RE.source,'ig'),m;
      while((m=re.exec(line.text))){
        var id=m[0].replace(/[.,;:]+$/,''), handle=id.slice(id.lastIndexOf('@')+1).toLowerCase();
        candidates.push({id:id,handle:'@'+handle,provider:HANDLE_PROVIDERS[handle]||'Other UPI handle',lineIndex:line.index,confidence:line.score});
      }
    });
    candidates.sort(function(a,b){return b.confidence-a.confidence;});
    return candidates[0]||{id:'',handle:'',provider:'',lineIndex:-1,confidence:0};
  }
  function detectSourceApp(lines) {
    var candidates=[];
    SOURCE_APPS.forEach(function(app){
      lines.forEach(function(line,index){
        if(app.re.test(line.text)) candidates.push({name:app.name,confidence:clamp(.55+line.score*.38*app.weight,0,.96),lineIndex:index,source:'visible-app-label'});
        app.re.lastIndex=0;
      });
    });
    candidates.sort(function(a,b){return b.confidence-a.confidence;});
    return candidates[0]||{name:'',confidence:0,lineIndex:-1,source:''};
  }
  function isNumericLike(text) { return /^[\s₹₹Rs.INR0-9,.'-]+$/i.test(String(text||''))&&/\d/.test(text); }
  function cleanName(value, vpa) {
    var s=String(value||'');
    if(vpa)s=s.replace(new RegExp(vpa.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'ig'),' ');
    s=s.replace(VPA_RE,' ').replace(/\b(?:upi\s*id|vpa|upi|utr|rrn|transaction\s*id|txn\s*id|reference|amount|total|date|time|status|paid|sent|received|from|to|paid\s*by|paid\s*to)\b.*$/i,' ')
      .replace(/(?:₹|\bINR\b|\bRs\.?\s*)\s*[\d,.]+.*$/i,' ').replace(/[|•·:：]+/g,' ').replace(/\s+/g,' ')
      .replace(/^[\s,.;#-]+|[\s,.;#-]+$/g,'').trim();
    if(!s||s.length>90||isNumericLike(s)||/^(?:paid to|sent to|received from|from|to|paid by|merchant|beneficiary)$/i.test(s)||!/[a-z]/i.test(s))return'';
    if(/\b(?:successful|success|completed|pending|failed|declined|transaction|payment|upi)\b/i.test(s)&&s.split(/\s+/).length<=2)return'';
    return s;
  }
  function detectParty(lines, upi) {
    var outgoingLabels=['paid to','sent to','payment to','transferred to','debited to','beneficiary','merchant','to'];
    var incomingLabels=['received from','credited from','paid by','from'];
    var incoming=[],outgoing=[],merchant=[];
    lines.forEach(function(line,index){
      var lo=line.text.toLowerCase(),inc=fuzzyLabel(lo,incomingLabels,.20),out=fuzzyLabel(lo,outgoingLabels,.18);
      if(inc)incoming.push({line:line,index:index,label:inc.label,ratio:inc.ratio});
      if(out)outgoing.push({line:line,index:index,label:out.label,ratio:out.ratio});
      if(/\bmerchant\b/i.test(lo))merchant.push({line:line,index:index,label:'merchant',ratio:0});
    });
    var direction=incoming.length&&!outgoing.length?'incoming':outgoing.length&&!incoming.length?'outgoing':'unknown';
    var anchors=direction==='incoming'?incoming:direction==='outgoing'?outgoing:merchant,best=null;
    anchors.forEach(function(anchor){
      var labelPattern=anchor.label.replace(/[.*+?^${}()|[\]\\]/g,'\\$&').replace(/\s+/g,'\\s+');
      var after=anchor.line.text.replace(new RegExp('^.*?\\b'+labelPattern+'\\b\\s*[:：-]?\\s*','i'),'');
      var candidates=[];
      if(after&&after!==anchor.line.text)candidates.push({text:after,index:anchor.index,inline:true});
      [anchor.index+1,anchor.index+2,anchor.index-1].forEach(function(idx){if(idx>=0&&idx<lines.length)candidates.push({text:lines[idx].text,index:idx,inline:false});});
      candidates.forEach(function(c){
        var name=cleanName(c.text,upi.id);if(!name)return;
        var target=lines[c.index],a=anchor.line.box,b=target.box,dy=Math.abs((b.y0+b.y1-a.y0-a.y1)/2),h=Math.max(1,a.y1-a.y0,b.y1-b.y0);
        var score=clamp(.58+target.score*.20+(c.inline?.10:0)-Math.min(.20,dy/(h*4)*.20)-anchor.ratio*.10,0,.96);
        if(c.index<anchor.index)score-=.04;
        var item={name:name,confidence:clamp(score,0,.96),direction:direction,lineIndex:c.index,label:anchor.label,kind:anchor.label==='merchant'?'merchant':'person'};
        if(!best||item.confidence>best.confidence)best=item;
      });
    });
    return{name:best?best.name:'',confidence:best?best.confidence:0,direction:direction,source:best?best.label:'',kind:best?best.kind:''};
  }
  function extractRefs(lines) {
    var utrLabels=['utr','rrn','upi ref','upi reference','bank reference','reference no','ref no'];
    var txnLabels=['transaction id','txn id','upi transaction id','transaction reference'];
    var result={utr:'',transactionId:'',confidence:0,utrConfidence:0,transactionIdConfidence:0};
    function valueAfter(line,index) {
      var same=line.text.match(/(?:[:#-]\s*|\s{1,})([A-Z0-9][A-Z0-9/-]{5,39})\s*$/i);
      if(same)return{value:same[1],lineIndex:index,inline:true};
      var next=lines[index+1];
      if(next&&/^[A-Z0-9][A-Z0-9/-]{5,39}$/i.test(next.text.trim()))return{value:next.text.trim(),lineIndex:index+1,inline:false};
      return null;
    }
    lines.forEach(function(line,index){
      var utr=fuzzyLabel(line.text,utrLabels,.22),txn=fuzzyLabel(line.text,txnLabels,.18);
      if(utr&&!result.utr){var a=valueAfter(line,index);if(a){result.utr=a.value;result.utrConfidence=clamp(.62+line.score*.32,0,.95);}}
      if(txn&&!result.transactionId){var b=valueAfter(line,index);if(b){result.transactionId=b.value;result.transactionIdConfidence=clamp(.60+line.score*.32,0,.95);}}
    });
    var joined=lines.map(function(l){return l.text;}).join('\n');
    if(!result.utr){var m=joined.match(/\b(?:UTR|UTR1|RRN|UPI\s*Ref(?:erence)?(?:\s*No)?|Bank\s*Reference)\b\s*[:#-]?\s*([A-Z0-9/-]{6,40})/i);if(m)result.utr=m[1];}
    if(!result.transactionId){var t=joined.match(/\b(?:UPI\s*)?(?:Transaction\s*ID|Txn\s*ID|Transaction\s*Reference)\b\s*[:#-]?\s*([A-Z0-9/-]{6,40})/i);if(t)result.transactionId=t[1];}
    if(result.utr&&!result.utrConfidence)result.utrConfidence=.70;
    if(result.transactionId&&!result.transactionIdConfidence)result.transactionIdConfidence=.70;
    if(result.utr&&result.utr===result.transactionId)result.transactionId='';
    result.confidence=Math.max(result.utrConfidence,result.transactionIdConfidence);
    return result;
  }
  function amountCandidates(lines) {
    var heights=lines.map(function(l){return l.box.y1-l.box.y0;}),localMedian=median(heights),candidates=[];
    function contextFor(text,start,end) {
      var before=text.slice(Math.max(0,start-48),start),after=text.slice(end,Math.min(text.length,end+26));
      var positives=Array.from(before.matchAll(/\b(?:amount|total|grand\s*total|paid|you\s*paid|transaction\s*amount|debited|credited|sent|received|payment|charged|purchase|transferred)\b/ig));
      var negatives=Array.from(before.matchAll(NEGATIVE_AMOUNT_RE));
      var lastPositive=positives.length?positives[positives.length-1].index:-1,lastNegative=negatives.length?negatives[negatives.length-1].index:-1;
      var positive=lastPositive>lastNegative;
      var negative=lastNegative>lastPositive||/^\s*(?:balance|cashback|cash\s*back|reward|discount|offer|saving|limit|minimum\s*due)\b/i.test(after);
      var ref=REFERENCE_CONTEXT_RE.test(before.slice(-32));
      return{positive:positive,negative:negative,reference:ref,context:before.slice(-42)};
    }
    function add(raw,line,index,start,end,merged) {
      var parsed=parseAmount(raw);if(!parsed)return;
      var ctx=contextFor(line.text,start,end),hasCurrency=/(?:₹|\bINR\b|\bRs\.?)/i.test(raw)||(merged&&merged.currencyOnly),
        hasLabel=ctx.positive||(merged&&merged.label),h=Math.max(1,line.box.y1-line.box.y0),sizeFactor=clamp(h/localMedian,.55,2.5);
      if(ctx.negative||ctx.reference)return;
      if(!hasCurrency&&!hasLabel)return;
      var score=.24+(hasCurrency?.27:0)+(hasLabel?.22:0)+Math.min(.14,line.score*.14)+Math.min(.05,Math.max(0,sizeFactor-1)*.04);
      if(parsed.digits>=4)score+=.015;
      if(hasLabel&&!hasCurrency)score+=.045;
      if(merged)score-=.025;
      candidates.push({value:parsed.value,formatted:parsed.formatted,canonical:parsed.canonical,confidence:clamp(score,0,.96),raw:raw,lineIndex:index,box:line.box,source:merged?'spatial-join':'paddle-line',hasCurrency:!!hasCurrency,hasLabel:!!hasLabel,heightRatio:sizeFactor,context:ctx.context});
    }
    lines.forEach(function(line,index){
      var re=new RegExp(AMOUNT_RE.source,'ig'),m;
      while((m=re.exec(line.text)))add(m[0],line,index,m.index,m.index+m[0].length,null);
      // Accept bare numbers only when an amount/payment label immediately precedes them.
      // This deliberately avoids converting a random date, phone number, UTR or 2,499 into INR.
      if(!(new RegExp(AMOUNT_RE.source,'i')).test(line.text)&&AMOUNT_LABEL_RE.test(line.text)&&!REFERENCE_CONTEXT_RE.test(line.text)){
        var bare=new RegExp(BARE_NUMBER_RE.source,'g'),n;
        while((n=bare.exec(line.text)))add(n[0],line,index,n.index,n.index+n[0].length,{label:true});
      }
      if(AMOUNT_LABEL_RE.test(line.text)&&index+1<lines.length){
        var next=lines[index+1],number=next.text.match(/^\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)\s*$/),gap=next.box.y0-line.box.y1,h=Math.max(1,line.box.y1-line.box.y0,next.box.y1-next.box.y0);
        if(number&&gap>=-h*.3&&gap<=h*2.2){
          var combined={text:line.text+' '+next.text,score:Math.min(line.score,next.score),box:{x0:Math.min(line.box.x0,next.box.x0),y0:Math.min(line.box.y0,next.box.y0),x1:Math.max(line.box.x1,next.box.x1),y1:Math.max(line.box.y1,next.box.y1)}};
          add(number[1],combined,index,combined.text.indexOf(number[1]),combined.text.length,{label:true});
        }
      }
      if(/^\s*(?:₹|Rs\.?|INR)\s*$/i.test(line.text)&&index+1<lines.length){
        var below=lines[index+1],amountOnly=below.text.match(/^\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)\s*$/),verticalGap=below.box.y0-line.box.y1,lineH=Math.max(1,line.box.y1-line.box.y0,below.box.y1-below.box.y0),horizontalGap=Math.max(0,Math.max(line.box.x0,below.box.x0)-Math.min(line.box.x1,below.box.x1));
        if(amountOnly&&verticalGap>=-lineH*.35&&verticalGap<=lineH*1.65&&horizontalGap<lineH*2.4){
          var merged={text:'₹ '+below.text,score:Math.min(line.score,below.score),box:{x0:Math.min(line.box.x0,below.box.x0),y0:line.box.y0,x1:Math.max(line.box.x1,below.box.x1),y1:below.box.y1}};
          add('₹ '+amountOnly[1],merged,index,0,merged.text.length,{currencyOnly:true});
        }
      }
    });
    candidates.sort(function(a,b){return b.confidence-a.confidence||Number(b.hasLabel)-Number(a.hasLabel)||Number(b.hasCurrency)-Number(a.hasCurrency)||b.heightRatio-a.heightRatio||a.lineIndex-b.lineIndex;});
    // Keep duplicate readings for traceability but use only one candidate per normalized value.
    var seen=Object.create(null),unique=[];
    candidates.forEach(function(c){if(!seen[c.canonical]){seen[c.canonical]=true;unique.push(c);}});
    return unique;
  }
  function extract(options) {
    options=options||{};
    var lines=normaliseItems(options.items||[]);
    if(!lines.length&&options.text){
      lines=String(options.text).split(/\r?\n/).filter(Boolean).map(function(text,index){return{text:text,score:.5,box:{x0:0,y0:index*20,x1:100,y1:index*20+16}};});
    }
    lines=lines.map(function(l,index){l.index=index;return l;});
    var upi=extractVpa(lines),references=extractRefs(lines),sourceApp=detectSourceApp(lines),amounts=amountCandidates(lines);
    var mergedOCRText=lines.map(function(line){return line.text;}).join('\n');
    var cppParty=root.PocketWiseWasm&&typeof root.PocketWiseWasm.extractMerchant==='function'
      ?root.PocketWiseWasm.extractMerchant(mergedOCRText):null;
    /* The browser build has the required Wasm engine before OCR is enabled.
       The JS detector remains only for standalone parser tests and older fixtures. */
    var party=cppParty?{name:cppParty.name,confidence:cppParty.confidence,direction:cppParty.direction}:detectParty(lines,upi);
    var amount=amounts.length&&amounts[0].confidence>=.60?amounts[0]:null;
    var ambiguousAmount=!!(amount&&amounts.length>1&&amounts[1].value!==amount.value&&Math.abs(amount.confidence-amounts[1].confidence)<.055);
    var warnings=[];
    if(!amount)warnings.push('INR amount not identified with sufficient evidence');
    if(ambiguousAmount)warnings.push('More than one amount has similar OCR evidence');
    if(!party.name)warnings.push('Recipient or merchant name needs manual confirmation');
    if(party.direction==='unknown')warnings.push('Payment direction was not clear from the receipt');
    if(!upi.id)warnings.push('UPI ID was not found');
    if(!references.utr&&!references.transactionId)warnings.push('Bank reference or transaction ID was not found');
    var fieldConfidence={
      amount:amount?amount.confidence:0,
      party:party.confidence,
      upi:upi.confidence,
      utr:references.utrConfidence,
      transactionId:references.transactionIdConfidence,
      sourceApp:sourceApp.confidence
    };
    return{
      amount:amount,party:party,upi:upi,references:references,direction:party.direction,sourceApp:sourceApp,
      fieldConfidence:fieldConfidence,needsReview:!amount||ambiguousAmount||!party.name||party.confidence<.78||party.direction==='unknown',
      warnings:warnings,lines:lines.map(function(l){return{text:l.text,score:l.score,box:l.box};}),candidates:amounts.slice(0,8)
    };
  }

  root.PocketWiseReceiptParser=Object.freeze({version:'1.1.0',extract:extract,parseAmount:parseAmount,configureHandleMapping:configureHandleMapping});
}(typeof window!=='undefined'?window:this));
