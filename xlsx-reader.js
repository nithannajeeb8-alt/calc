/* Offline OOXML XLSX reader for Aruvi bank-statement imports.
   Supports standard .xlsx workbooks (stored/deflate ZIP entries, shared/inline strings,
   cached formula values, numeric cells and Excel date-formatted cells). No network calls. */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.PWXLSXReader=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const MAX_ENTRIES=5000,MAX_ENTRY_BYTES=80*1024*1024,MAX_TOTAL_UNCOMPRESSED=140*1024*1024,MAX_ROWS=20010,MAX_COLUMNS=256;
  const utf8=new TextDecoder('utf-8');
  const text=value=>String(value??'');
  const escapeRE=value=>String(value).replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  function xmlDecode(value){return text(value).replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos);/gi,(all,entity)=>{
    const key=entity.toLowerCase();if(key==='amp')return '&';if(key==='lt')return '<';if(key==='gt')return '>';if(key==='quot')return '"';if(key==='apos')return "'";
    try{return String.fromCodePoint(key.startsWith('#x')?parseInt(key.slice(2),16):parseInt(key.slice(1),10));}catch(_){return all;}
  });}
  function tagEntries(xml,localName){
    const re=new RegExp(`<((?:[\\w.-]+:)?${escapeRE(localName)})\\b([^>]*)>`, 'gi'),out=[];let match;
    while((match=re.exec(xml))){const fullName=match[1],attrs=match[2]||'',selfClosing=/\/\s*$/.test(attrs);let body='';
      if(!selfClosing){const close=new RegExp(`<\\/${escapeRE(fullName)}\\s*>`,'gi');close.lastIndex=re.lastIndex;const end=close.exec(xml);if(!end)throw new Error(`The Excel workbook contains an incomplete ${localName} XML element.`);body=xml.slice(re.lastIndex,end.index);re.lastIndex=close.lastIndex;}
      out.push({attrs,body});
    }
    return out;
  }
  function attr(attrs,name){const re=new RegExp(`(?:^|\\s)${escapeRE(name)}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`,'i'),m=attrs.match(re);return m?xmlDecode(m[1]??m[2]??''):'';}
  function innerText(xml){return text(xml).replace(/<[^>]*>/g,'').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,'$1').replace(/\s+/g,' ').trim();}
  function textRuns(xml){return tagEntries(xml,'t').map(x=>xmlDecode(innerText(x.body))).join('');}
  function normalisePath(path){
    const parts=[];for(const part of text(path).replace(/\\/g,'/').split('/')){if(!part||part==='.')continue;if(part==='..')parts.pop();else parts.push(part);}return parts.join('/');
  }
  function resolveWorkbookTarget(target){
    const raw=text(target).replace(/\\/g,'/');return raw.startsWith('/')?normalisePath(raw):normalisePath(`xl/${raw}`);
  }
  function readU16(view,offset){if(offset<0||offset+2>view.byteLength)throw new Error('The Excel workbook ZIP directory is incomplete.');return view.getUint16(offset,true);}
  function readU32(view,offset){if(offset<0||offset+4>view.byteLength)throw new Error('The Excel workbook ZIP directory is incomplete.');return view.getUint32(offset,true);}
  const crcTable=(()=>{const table=new Uint32Array(256);for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=(c&1)?(0xedb88320^(c>>>1)):(c>>>1);table[n]=c>>>0;}return table;})();
  function crc32(bytes){let c=0xffffffff;for(let i=0;i<bytes.length;i++)c=crcTable[(c^bytes[i])&0xff]^(c>>>8);return (c^0xffffffff)>>>0;}
  function readZipDirectory(bytes){
    if(!(bytes instanceof Uint8Array))bytes=new Uint8Array(bytes);
    const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);let eocd=-1;
    for(let i=Math.max(0,bytes.length-22-65535);i<=bytes.length-22;i++){if(readU32(view,i)===0x06054b50)eocd=i;}
    if(eocd<0)throw new Error('This is not a valid .xlsx workbook. The Excel ZIP directory was not found.');
    const disk=readU16(view,eocd+4),directoryDisk=readU16(view,eocd+6),diskEntries=readU16(view,eocd+8),totalEntries=readU16(view,eocd+10),directorySize=readU32(view,eocd+12),directoryOffset=readU32(view,eocd+16);
    if(disk||directoryDisk||diskEntries!==totalEntries)throw new Error('This Excel workbook uses a multi-disk ZIP layout that Aruvi cannot read.');
    if(totalEntries===0xffff||directoryOffset===0xffffffff||directorySize===0xffffffff)throw new Error('This Excel workbook uses ZIP64 extensions. Export it as a standard .xlsx workbook and try again.');
    if(totalEntries>MAX_ENTRIES||directoryOffset+directorySize>bytes.length)throw new Error('The Excel workbook directory is too large or incomplete.');
    const entries=new Map();let offset=directoryOffset,totalBytes=0;
    for(let i=0;i<totalEntries;i++){
      if(readU32(view,offset)!==0x02014b50)throw new Error('The Excel workbook ZIP directory is damaged.');
      const flags=readU16(view,offset+8),method=readU16(view,offset+10),crc=readU32(view,offset+16),compressedSize=readU32(view,offset+20),uncompressedSize=readU32(view,offset+24),nameLength=readU16(view,offset+28),extraLength=readU16(view,offset+30),commentLength=readU16(view,offset+32),localOffset=readU32(view,offset+42);
      if(compressedSize===0xffffffff||uncompressedSize===0xffffffff||localOffset===0xffffffff)throw new Error('This Excel workbook uses ZIP64 entries. Export it as a standard .xlsx workbook and try again.');
      if(offset+46+nameLength+extraLength+commentLength>bytes.length)throw new Error('The Excel workbook ZIP directory contains an invalid filename length.');
      const name=utf8.decode(bytes.subarray(offset+46,offset+46+nameLength)).replace(/\\/g,'/');
      if(flags&1)throw new Error('Password-protected Excel workbooks are not supported. Remove the workbook password in Excel, then import it again.');
      if(compressedSize>MAX_ENTRY_BYTES||uncompressedSize>MAX_ENTRY_BYTES)throw new Error('An Excel workbook section is too large to safely process on this device. Export a smaller statement.');
      totalBytes+=uncompressedSize;if(totalBytes>MAX_TOTAL_UNCOMPRESSED)throw new Error('The expanded Excel workbook is too large to safely process on this device. Export a smaller statement.');
      if(name&&!name.endsWith('/'))entries.set(name,{name,flags,method,crc,compressedSize,uncompressedSize,localOffset});
      offset+=46+nameLength+extraLength+commentLength;
    }
    return {bytes,view,entries};
  }
  async function unzipEntry(zip,name){
    const entry=zip.entries.get(name);if(!entry)return null;
    const {bytes,view}=zip,offset=entry.localOffset;
    if(readU32(view,offset)!==0x04034b50)throw new Error(`The Excel workbook section ${name} has an invalid ZIP header.`);
    const localNameLength=readU16(view,offset+26),localExtraLength=readU16(view,offset+28),dataStart=offset+30+localNameLength+localExtraLength,dataEnd=dataStart+entry.compressedSize;
    if(dataEnd>bytes.length)throw new Error(`The Excel workbook section ${name} is truncated.`);
    const compressed=bytes.subarray(dataStart,dataEnd);let output;
    if(entry.method===0)output=compressed.slice();
    else if(entry.method===8){
      if(typeof DecompressionStream!=='function'||typeof Blob!=='function')throw new Error('This browser cannot decompress Excel workbooks offline. Update Safari/Chrome or export the bank statement as CSV.');
      try{
        const stream=new Blob([compressed]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
        const reader=stream.getReader(),chunks=[];let total=0;
        while(true){const part=await reader.read();if(part.done)break;total+=part.value.length;if(total>entry.uncompressedSize||total>MAX_ENTRY_BYTES){await reader.cancel();throw new Error(`The Excel workbook section ${name} expands beyond its declared safe size.`);}chunks.push(part.value);}
        output=new Uint8Array(total);let position=0;for(const chunk of chunks){output.set(chunk,position);position+=chunk.length;}
      }catch(error){if(/declared safe size/.test(String(error?.message||'')))throw error;throw new Error(`Aruvi could not decompress ${name}. The Excel workbook may be damaged or use an unsupported compression option.`);}
    }else throw new Error(`The Excel workbook uses an unsupported ZIP compression method (${entry.method}). Save it again as a standard .xlsx file.`);
    if(output.length!==entry.uncompressedSize)throw new Error(`The Excel workbook section ${name} failed its size check.`);
    if(crc32(output)!==entry.crc)throw new Error(`The Excel workbook section ${name} failed its integrity check. The file may be corrupted.`);
    return utf8.decode(output);
  }
  function columnIndex(reference){const letters=text(reference).match(/^[A-Z]+/i)?.[0];if(!letters)return -1;let n=0;for(const ch of letters.toUpperCase())n=n*26+ch.charCodeAt(0)-64;return n-1;}
  function dateSerialToISO(value,date1904){const serial=Number(value);if(!Number.isFinite(serial)||serial<0||serial>200000)return text(value);const days=Math.floor(serial),epoch=date1904?Date.UTC(1904,0,1):Date.UTC(1899,11,31),excelLeapBugAdjustment=!date1904&&days>=60?1:0;const date=new Date(epoch+(days-excelLeapBugAdjustment)*86400000);return `${date.getUTCFullYear()}-${String(date.getUTCMonth()+1).padStart(2,'0')}-${String(date.getUTCDate()).padStart(2,'0')}`;}
  function isDateFormat(format){
    const cleaned=text(format).replace(/"[^"]*"/g,'').replace(/\\./g,'').replace(/\[[^\]]*\]/g,'').replace(/_.|\*./g,'');
    return /(?:y{1,4}|d{1,4})/i.test(cleaned)||/(?:^|[^a-z])m{1,4}(?:[^a-z]|$)/i.test(cleaned);
  }
  function buildStyleMap(stylesXml){
    if(!stylesXml)return [];
    const custom=new Map();for(const entry of tagEntries(stylesXml,'numFmt'))custom.set(Number(attr(entry.attrs,'numFmtId')),attr(entry.attrs,'formatCode'));
    const xfs=tagEntries(stylesXml,'cellXfs')[0]?.body||'';
    return tagEntries(xfs,'xf').map(entry=>{const id=Number(attr(entry.attrs,'numFmtId'))||0;const builtin=(id>=14&&id<=22)||(id>=27&&id<=36)||(id>=45&&id<=47)||(id>=50&&id<=58);return builtin||isDateFormat(custom.get(id));});
  }
  function cellValue(cell,sharedStrings,styleDates,date1904){
    const type=attr(cell.attrs,'t'),style=Number(attr(cell.attrs,'s'))||0;
    if(type==='inlineStr')return textRuns(tagEntries(cell.body,'is')[0]?.body||'');
    const raw=innerText(tagEntries(cell.body,'v')[0]?.body||'');if(raw==='')return '';
    if(type==='s'){const index=Number(raw);return Number.isInteger(index)&&index>=0?sharedStrings[index]??'':'';}
    if(type==='b')return raw==='1'?'TRUE':'FALSE';
    if(type==='e')return '';
    if(type==='d')return raw.slice(0,10);
    if(styleDates[style])return dateSerialToISO(raw,date1904);
    return raw;
  }
  function parseSheetRows(xml,sharedStrings,styleDates,date1904){
    const rowEntries=tagEntries(xml,'row').slice(0,MAX_ROWS);const rows=[];
    for(let r=0;r<rowEntries.length;r++){
      const cells=tagEntries(rowEntries[r].body,'c');let fallbackColumn=0,maxColumn=-1;const parsed=[];
      for(const cell of cells){let index=columnIndex(attr(cell.attrs,'r'));if(index<0)index=fallbackColumn;fallbackColumn=index+1;if(index<0||index>=MAX_COLUMNS)continue;parsed.push([index,cellValue(cell,sharedStrings,styleDates,date1904)]);maxColumn=Math.max(maxColumn,index);}
      if(maxColumn<0){rows.push([]);continue;}
      const row=Array(maxColumn+1).fill('');for(const [index,value] of parsed)row[index]=value;rows.push(row);
    }
    return rows;
  }
  async function read(arrayBuffer){
    const bytes=arrayBuffer instanceof Uint8Array?arrayBuffer:new Uint8Array(arrayBuffer);
    if(bytes.length<22)throw new Error('This file is not a valid .xlsx workbook or is too small to be an Excel workbook.');
    const zip=readZipDirectory(bytes);
    const workbookXml=await unzipEntry(zip,'xl/workbook.xml');if(!workbookXml)throw new Error('This file is not a supported Excel .xlsx workbook. The workbook.xml section is missing.');
    const relsXml=await unzipEntry(zip,'xl/_rels/workbook.xml.rels')||'';
    const relationships=new Map(tagEntries(relsXml,'Relationship').map(item=>[attr(item.attrs,'Id'),{target:attr(item.attrs,'Target'),type:attr(item.attrs,'Type')} ]));
    const sharedPath=[...relationships.values()].find(item=>/\/sharedStrings$/.test(item.type))?.target||'sharedStrings.xml';
    const stylesPath=[...relationships.values()].find(item=>/\/styles$/.test(item.type))?.target||'styles.xml';
    const sharedXml=await unzipEntry(zip,resolveWorkbookTarget(sharedPath));
    const stylesXml=await unzipEntry(zip,resolveWorkbookTarget(stylesPath));
    const sharedStrings=sharedXml?tagEntries(sharedXml,'si').map(item=>textRuns(item.body)):[];
    const styleDates=buildStyleMap(stylesXml);
    const workbookPr=tagEntries(workbookXml,'workbookPr')[0];const date1904=['1','true'].includes(attr(workbookPr?.attrs||'','date1904').toLowerCase());
    const sheets=tagEntries(workbookXml,'sheet');if(!sheets.length)throw new Error('No worksheets were found in this Excel workbook.');
    const result=[];
    for(const sheet of sheets){
      if(attr(sheet.attrs,'state')==='hidden'||attr(sheet.attrs,'state')==='veryHidden')continue;
      const name=attr(sheet.attrs,'name')||`Sheet ${result.length+1}`;const relId=Object.entries(parseAttributes(sheet.attrs)).find(([key])=>key.endsWith(':id'))?.[1]||attr(sheet.attrs,'id');
      const rel=relationships.get(relId);if(!rel?.target||!(/\/worksheet$/.test(rel.type)||!rel.type))continue;
      const path=resolveWorkbookTarget(rel.target),sheetXml=await unzipEntry(zip,path);if(!sheetXml)continue;
      result.push({name,rows:parseSheetRows(sheetXml,sharedStrings,styleDates,date1904)});
    }
    if(!result.length)throw new Error('No readable worksheets were found in this Excel workbook.');
    return {sheets:result,date1904};
  }
  function parseAttributes(attrs){const out={};const re=/([:\w.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;let match;while((match=re.exec(text(attrs))))out[match[1]]=xmlDecode(match[2]??match[3]??'');return out;}
  function selectStatementSheet(workbook,statementParser){
    if(!workbook||!Array.isArray(workbook.sheets)||!statementParser)throw new Error('The Excel workbook could not be prepared for statement analysis.');
    const candidates=workbook.sheets.map((sheet,index)=>{
      const sourceRows=Array.isArray(sheet.rows)?sheet.rows:[],headerIndex=statementParser.findHeaderRow(sourceRows);
      const matrix=headerIndex>=0?sourceRows.slice(headerIndex):sourceRows;
      const mapping=statementParser.mapHeaders(matrix[0]||[]);
      const result=statementParser.parseMatrix(matrix,mapping);
      const nonEmptyRows=sourceRows.reduce((count,row)=>count+(Array.isArray(row)&&row.some(cell=>String(cell??'').trim())?1:0),0);
      return {sheetName:sheet.name||`Sheet ${index+1}`,sheetIndex:index,headerIndex,matrix,mapping,result,nonEmptyRows,transactionCount:result.transactions?.length||0};
    }).filter(candidate=>candidate.nonEmptyRows>0);
    if(!candidates.length)return null;
    const withHeader=candidates.filter(candidate=>candidate.headerIndex>=0);
    const pool=withHeader.length?withHeader:candidates;
    pool.sort((a,b)=>b.transactionCount-a.transactionCount||b.nonEmptyRows-a.nonEmptyRows||a.sheetIndex-b.sheetIndex);
    return pool[0];
  }
  return {read,readZipDirectory,crc32,parseSheetRows,dateSerialToISO,selectStatementSheet,MAX_ROWS};
});
