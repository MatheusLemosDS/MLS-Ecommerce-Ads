// Browser-local parsing only. Neither raw files nor account details belong in the import DTO.
// Keep this factory self-contained: the App build freezes it into the browser bundle.
export function createCashStatementImportParser(){
 const CASH_STATEMENT_IMPORT_LIMITS=Object.freeze({bytes:5*1024*1024,rows:10000,columns:32,cell_bytes:4096,errors:100});
 const encoder=new TextEncoder(),formats=['nubank_csv','nubank_ofx','shopee_csv'];
 const plain=value=>value!==null&&typeof value==='object'&&[Object.prototype,null].includes(Object.getPrototypeOf(value));
 const bad=(code,line=1)=>{throw {cash_parse:true,code,line};};
 const diagnostic=error=>({line:Number.isSafeInteger(error?.line)&&error.line>0?error.line:1,code:error?.cash_parse===true?error.code:'INPUT_INVALID'});
 const canonicalHeader=value=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
 const nubankHeaders=['data','valor','identificador','descricao'];
 const statusHeaders=headers=>headers.filter(header=>{
  const normalized=canonicalHeader(header).replace(/[^a-z0-9]+/g,' ').trim(),compact=normalized.replace(/ /g,'');
  return /(?:^| )(?:status|situacao|estado)(?: |$)/.test(normalized)||/^(?:(?:status|situacao|estado)(?:da|do|de)?(?:transferencia|transferencias|transfer|pagamento|pagamentos|repasse|repasses)|(?:transfer|transferencia|payment|payout)status)$/.test(compact);
 });
 const cardHeader=headers=>headers.some(header=>/(?:^|[ _-])(cartao|fatura|parcela|estabelecimento|title)(?:$|[ _-])/.test(canonicalHeader(header)));
 const isNubank=headers=>!cardHeader(headers)&&nubankHeaders.every(name=>headers.some(header=>canonicalHeader(header)===name));
 function inputText(input){
  let text;
  if(typeof input==='string'){
   if(input.length>CASH_STATEMENT_IMPORT_LIMITS.bytes)bad('FILE_TOO_LARGE');
   if(!input.isWellFormed())bad('UTF8_INVALID');
   if(encoder.encode(input).length>CASH_STATEMENT_IMPORT_LIMITS.bytes)bad('FILE_TOO_LARGE');
   text=input;
  }else if(input instanceof Uint8Array){
   if(input.byteLength>CASH_STATEMENT_IMPORT_LIMITS.bytes)bad('FILE_TOO_LARGE');
   try{text=new TextDecoder('utf-8',{fatal:true}).decode(input);}catch{bad('UTF8_INVALID');}
  }else bad('INPUT_INVALID');
  text=text.replace(/^\ufeff/,'');
  if(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\ufeff]/.test(text))bad('CHARACTER_INVALID');
  return text.replace(/\r\n?/g,'\n');
 }
 function csvRecords(text,separator){
  if(![',',';','\t'].includes(separator))bad('SEPARATOR_REQUIRED');
  const records=[];let fields=[],field='',state='start',line=1,start=1;
  const fieldEnd=()=>{
   if(encoder.encode(field).length>CASH_STATEMENT_IMPORT_LIMITS.cell_bytes)bad('CELL_TOO_LARGE',start);
   fields.push(field);field='';state='start';
   if(fields.length>CASH_STATEMENT_IMPORT_LIMITS.columns)bad('COLUMN_LIMIT',start);
  };
  const rowEnd=()=>{
   fieldEnd();if(fields.some(value=>value.trim()!==''))records.push({line:start,values:fields});fields=[];
   if(records.length>CASH_STATEMENT_IMPORT_LIMITS.rows+1)bad('ROW_LIMIT',start);
  };
  for(let index=0;index<text.length;index++){
   const char=text[index];
   if(state==='quoted'){
    if(char==='"'){if(text[index+1]==='"'){field+='"';index++;}else state='closed';}
    else{field+=char;if(char==='\n')line++;}
   }else if(char===separator)fieldEnd();
   else if(char==='\n'){rowEnd();line++;start=line;}
   else if(char==='"'){if(state!=='start')bad('CSV_QUOTE_INVALID',line);state='quoted';}
   else{if(state==='closed')bad('CSV_QUOTE_INVALID',line);field+=char;state='plain';}
   if(field.length>CASH_STATEMENT_IMPORT_LIMITS.cell_bytes)bad('CELL_TOO_LARGE',start);
  }
  if(state==='quoted')bad('CSV_QUOTE_UNCLOSED',start);
  if(field!==''||fields.length||state!=='start')rowEnd();
  if(!records.length)bad('HEADER_REQUIRED');
  const header=records[0],headers=header.values.map(value=>value.trim().normalize('NFC'));
  if(headers.some(value=>value==='')||new Set(headers.map(canonicalHeader)).size!==headers.length)bad('HEADER_INVALID',header.line);
  for(const record of records.slice(1))if(record.values.length!==headers.length)bad('COLUMN_COUNT',record.line);
  return {headers,records:records.slice(1),header_line:header.line};
 }
 function calendar(value,format,line){
  const match=(format==='DMY'?/^(\d{2})\/(\d{2})\/(\d{4})$/:/^(\d{4})-(\d{2})-(\d{2})$/).exec(value.trim());
  if(!match)bad('DATE_INVALID',line);
  const year=Number(match[format==='DMY'?3:1]),month=Number(match[2]),day=Number(match[format==='DMY'?1:3]);
  const leap=year%4===0&&(year%100!==0||year%400===0),days=[31,leap?29:28,31,30,31,30,31,31,30,31,30,31];
  if(year<1900||year>9999||month<1||month>12||day<1||day>days[month-1])bad('DATE_INVALID',line);
  return String(year).padStart(4,'0')+'-'+String(month).padStart(2,'0')+'-'+String(day).padStart(2,'0');
 }
 function money(value,format,line){
  let text=value.trim();
  if(format==='BRL'){
   text=text.replace(/^R\$\s*/,'');
   if(!/^[+-]?(?:\d+|\d{1,3}(?:\.\d{3})+)(?:,\d{1,2})?$/.test(text))bad('AMOUNT_INVALID',line);
   text=text.replace(/\./g,'').replace(',','.');
  }else if(!/^[+-]?\d+(?:\.\d{1,2})?$/.test(text))bad('AMOUNT_INVALID',line);
  const match=/^([+-]?)(\d+)(?:\.(\d{1,2}))?$/.exec(text);
  const cents=(BigInt(match[2])*100n+BigInt((match[3]??'').padEnd(2,'0')))*(match[1]==='-'?-1n:1n);
  if(cents<BigInt(Number.MIN_SAFE_INTEGER)||cents>BigInt(Number.MAX_SAFE_INTEGER))bad('AMOUNT_RANGE',line);
  return Number(cents);
 }
 function optional(value,line,limit=128){
  if(value===undefined||value.trim()==='')return null;
  const text=value.trim().normalize('NFC');
  if(text.length>limit||/[\n\t]/.test(text))bad('FIELD_INVALID',line);
  return text;
 }
 function description(value,line){
  if(value===undefined||value.trim()==='')return null;
  const text=value.trim().normalize('NFC').replace(/\s+/g,' ');
  if(text.length>240)bad('FIELD_INVALID',line);
  return text;
 }
 function rowValue(values,line,format,options){
  return {line,date:calendar(values.date,options.date_format,line),amount_cents:money(values.amount,options.amount_format,line),
   external_id:optional(values.external_id,line),reference:optional(values.reference,line,160),description:description(values.description,line),
   reported_status:optional(values.status,line,80),source:format==='shopee_csv'?'SHOPEE':'NUBANK',source_format:format};
 }
 function appendError(errors,error){if(errors.length<CASH_STATEMENT_IMPORT_LIMITS.errors)errors.push(diagnostic(error));}
 function parseCsv(text,options){
  if(options.currency!=='BRL')bad('CURRENCY_REQUIRED');
  if(!['DMY','YMD'].includes(options.date_format))bad('DATE_FORMAT_REQUIRED');
  if(!['BRL','DECIMAL'].includes(options.amount_format))bad('AMOUNT_FORMAT_REQUIRED');
  const {headers,records,header_line}=csvRecords(text,options.separator),columns={};
  if(cardHeader(headers))bad('CARD_CSV_UNSUPPORTED',header_line);
  if(options.format==='nubank_csv'&&options.columns===undefined){
   if(!isNubank(headers))bad('NUBANK_HEADER_REQUIRED',header_line);
   for(const [name,header] of Object.entries({date:'data',amount:'valor',external_id:'identificador',description:'descricao'}))columns[name]=headers.findIndex(value=>canonicalHeader(value)===header);
  }else{
   if(!plain(options.columns)||Object.keys(options.columns).some(name=>!['date','amount','external_id','reference','description','status'].includes(name)))bad('MAPPING_REQUIRED',header_line);
   if(options.format==='shopee_csv'){
    const statuses=statusHeaders(headers);
    if(statuses.length>1)bad('MAPPING_STATUS_AMBIGUOUS',header_line);
    if(statuses.length===1&&(typeof options.columns.status!=='string'||options.columns.status.trim().normalize('NFC')!==statuses[0]))bad('MAPPING_STATUS_REQUIRED',header_line);
   }
   for(const [name,header] of Object.entries(options.columns)){
    if(typeof header!=='string'||!headers.includes(header.trim().normalize('NFC')))bad('MAPPING_INVALID',header_line);
    columns[name]=headers.indexOf(header.trim().normalize('NFC'));
   }
   if(columns.date===undefined||columns.amount===undefined||new Set(Object.values(columns)).size!==Object.keys(columns).length)bad('MAPPING_INVALID',header_line);
  }
  const rows=[],errors=[];
  for(const record of records){
   const values={};for(const [name,index] of Object.entries(columns))values[name]=record.values[index];
   try{rows.push(rowValue(values,record.line,options.format,options));}catch(error){appendError(errors,error);}
  }
  return {rows,errors};
 }
 function entities(text,line){
  return text.replace(/&([^;]*);|&/g,(full,name)=>{
   const predefined={amp:'&',lt:'<',gt:'>',quot:'"',apos:"'"};if(Object.hasOwn(predefined,name))return predefined[name];
   const numeric=/^#(?:x([0-9a-fA-F]+)|(\d+))$/.exec(name??'');
   if(!numeric)bad('ENTITY_UNSUPPORTED',line);
   const point=Number.parseInt(numeric[1]??numeric[2],numeric[1]?16:10);
   if(!Number.isSafeInteger(point)||point>0x10ffff||point>=0xd800&&point<=0xdfff||point<32&&![9,10,13].includes(point)||point===127||point===0xfeff||point===0xfffe||point===0xffff)bad('CHARACTER_INVALID',line);
   return String.fromCodePoint(point);
  });
 }
 function ofxTree(text){
  if(/<!/.test(text))bad('DTD_UNSUPPORTED');
  const rootStart=text.indexOf('<OFX>');if(rootStart<0)bad('OFX_UNSUPPORTED');
  const prefix=text.slice(0,rootStart).trim();let sgml=false;
  if(/^OFXHEADER:/.test(prefix)){
   sgml=true;const headers={};
   for(const entry of prefix.split('\n')){
    const match=/^([A-Z]+):([^<>]*)$/.exec(entry.trim());if(!match||Object.hasOwn(headers,match[1]))bad('OFX_HEADER_INVALID');headers[match[1]]=match[2];
   }
   if(headers.OFXHEADER!=='100'||headers.DATA!=='OFXSGML'||!/^1\d\d$/.test(headers.VERSION??'')||!['UTF-8','UTF8','USASCII'].includes(headers.ENCODING??'')||headers.CHARSET!==undefined&&!['NONE','UTF-8','UTF8','65001'].includes(headers.CHARSET)||headers.COMPRESSION!==undefined&&headers.COMPRESSION!=='NONE'||headers.SECURITY!==undefined&&headers.SECURITY!=='NONE')bad('OFX_HEADER_INVALID');
  }else if(prefix!==''){
   const instructions=prefix.match(/<\?(?:xml|OFX)\s+[^<>]*\?>/g);
   if(!instructions||instructions.length>2||prefix.replace(/<\?(?:xml|OFX)\s+[^<>]*\?>/g,'').trim()!=='')bad('OFX_HEADER_INVALID');
   for(const instruction of instructions){
    const encoding=/\bencoding\s*=\s*["']([^"']+)["']/i.exec(instruction);
    if(encoding&&!/^UTF-?8$/i.test(encoding[1]))bad('UTF8_INVALID');
    if(instruction.startsWith('<?OFX')&&!/\bOFXHEADER\s*=\s*"200"/.test(instruction))bad('OFX_HEADER_INVALID');
   }
  }
  const aggregate=new Set(['OFX','SIGNONMSGSRSV1','SONRS','STATUS','FI','BANKMSGSRSV1','STMTTRNRS','STMTRS','BANKACCTFROM','BANKTRANLIST','STMTTRN','LEDGERBAL','AVAILBAL','CURRENCY','ORIGCURRENCY']);
  let index=rootStart,line=1+text.slice(0,rootStart).split('\n').length-1,count=0,root=null;const stack=[];
  const advance=part=>{line+=part.split('\n').length-1;index+=part.length;};
  while(index<text.length){
   if(text[index]!=='<'){
    const next=text.indexOf('<',index),part=text.slice(index,next<0?text.length:next),node=stack.at(-1);
    if(part.trim()!==''){
     if(!node||aggregate.has(node.name))bad('OFX_STRUCTURE_INVALID',line);
     node.text+=part;if(encoder.encode(node.text).length>CASH_STATEMENT_IMPORT_LIMITS.cell_bytes)bad('CELL_TOO_LARGE',node.line);
    }
    advance(part);continue;
   }
   const end=text.indexOf('>',index);if(end<0||end-index>128)bad('OFX_STRUCTURE_INVALID',line);
   const token=text.slice(index,end+1),match=/^<(\/?)([A-Z][A-Z0-9_.]*)\s*>$/.exec(token);
   if(!match)bad('OFX_STRUCTURE_INVALID',line);
   const closing=match[1]==='/',name=match[2];
   if(sgml&&stack.length&&!aggregate.has(stack.at(-1).name)&&(!closing||stack.at(-1).name!==name))stack.pop();
   if(closing){if(!stack.length||stack.at(-1).name!==name)bad('OFX_STRUCTURE_INVALID',line);stack.pop();}
   else{
    if(++count>160000||stack.length>=20)bad('OFX_STRUCTURE_LIMIT',line);
    if(stack.length&&!aggregate.has(stack.at(-1).name))bad('OFX_STRUCTURE_INVALID',line);
    const node={name,line,children:[],text:''};
    if(stack.length)stack.at(-1).children.push(node);else if(root!==null||name!=='OFX')bad('OFX_STRUCTURE_INVALID',line);else root=node;
    stack.push(node);
   }
   advance(token);
  }
  if(stack.length||root===null)bad('OFX_STRUCTURE_INVALID',line);
  return root;
 }
 function parseOfx(text){
  if(/<(?:CCSTMTRS|CREDITCARDMSGSRSV1|INVSTMTRS|INVSTMTMSGSRSV1)[\s>]/.test(text))bad('OFX_ACCOUNT_UNSUPPORTED');
  const root=ofxTree(text),all=[];const walk=node=>{all.push(node);for(const child of node.children)walk(child);};walk(root);
  if(all.some(node=>/^(?:CCSTMTRS|CREDITCARDMSGSRSV1|INVSTMTRS|INVSTMTMSGSRSV1)$/.test(node.name)))bad('OFX_ACCOUNT_UNSUPPORTED');
  const statements=all.filter(node=>node.name==='STMTRS');
  if(statements.length!==1)bad('OFX_STATEMENT_REQUIRED');
  const statement=statements[0];
  const child=(node,name,required=true)=>{
   const matches=node.children.filter(entry=>entry.name===name);if(matches.length>1||required&&matches.length!==1)bad('OFX_FIELD_INVALID',node.line);return matches[0]??null;
  };
  const leaf=(node,name,required=true)=>{
   const found=child(node,name,required);if(!found)return undefined;
   if(found.children.length)bad('OFX_FIELD_INVALID',found.line);return entities(found.text.trim(),found.line);
  };
  const banks=child(root,'BANKMSGSRSV1'),response=child(banks,'STMTTRNRS');
  if(child(response,'STMTRS')!==statement||all.filter(node=>node.name==='CURDEF').length!==1||leaf(statement,'CURDEF')!=='BRL')bad('CURRENCY_REQUIRED',statement.line);
  child(statement,'BANKACCTFROM');const transactions=child(statement,'BANKTRANLIST'),entries=transactions.children.filter(node=>node.name==='STMTTRN');
  if(all.filter(node=>node.name==='STMTTRN').length!==entries.length)bad('OFX_STRUCTURE_INVALID',statement.line);
  if(all.some(node=>node.name==='CURSYM'&&entities(node.text.trim(),node.line)!=='BRL'))bad('CURRENCY_REQUIRED',statement.line);
  if(entries.length>CASH_STATEMENT_IMPORT_LIMITS.rows)bad('ROW_LIMIT',transactions.line);
  const rows=[],errors=[];
  for(const entry of entries){
   try{
    const posted=leaf(entry,'DTPOSTED'),match=/^(\d{4})(\d{2})(\d{2})(?:(\d{2})(\d{2})(\d{2})(?:\.\d{1,6})?)?(?:\[([+-]?\d{1,2}(?:\.\d{1,2})?)(?::[A-Za-z]{1,8})?\])?$/.exec(posted);
    if(!match||match[4]!==undefined&&(Number(match[4])>23||Number(match[5])>59||Number(match[6])>59)||match[7]!==undefined&&(Number(match[7])< -12||Number(match[7])>14))bad('DATE_INVALID',entry.line);
    const memo=leaf(entry,'MEMO',false),name=leaf(entry,'NAME',false);leaf(entry,'TRNTYPE',false);
    const values={date:match[1]+'-'+match[2]+'-'+match[3],amount:leaf(entry,'TRNAMT'),external_id:leaf(entry,'FITID',false),reference:leaf(entry,'REFNUM',false),description:memo??name};
    rows.push(rowValue(values,entry.line,'nubank_ofx',{date_format:'YMD',amount_format:'DECIMAL'}));
   }catch(error){appendError(errors,error);}
  }
  // Decode every scalar once, including ignored metadata; unsupported entities never slip through.
  for(const node of all)if(!node.children.length)entities(node.text,node.line);
  return {rows,errors};
 }
 function inspectCashStatement(input,options={}){
  try{
   if(!plain(options)||Object.keys(options).some(key=>key!=='separator'))bad('OPTIONS_INVALID');
   const parsed=csvRecords(inputText(input),options.separator);
   return {ok:true,headers:parsed.headers,status_headers:statusHeaders(parsed.headers),rows_count:parsed.records.length,detected_format:isNubank(parsed.headers)?'nubank_csv':null,card_csv:cardHeader(parsed.headers),errors:[]};
  }catch(error){return {ok:false,headers:[],status_headers:[],rows_count:0,detected_format:null,card_csv:false,errors:[diagnostic(error)]};}
 }
 function parseCashStatement(input,options={}){
  const format=plain(options)&&formats.includes(options.format)?options.format:null,source=format===null?null:format==='shopee_csv'?'SHOPEE':'NUBANK';
  const result={ok:false,source,format,currency:'BRL',rows:[],errors:[]};
  try{
   if(!plain(options)||Object.keys(options).some(key=>!['format','separator','currency','date_format','amount_format','columns'].includes(key)))bad('OPTIONS_INVALID');
   if(format===null)bad('FORMAT_REQUIRED');
   const text=inputText(input),parsed=format==='nubank_ofx'?parseOfx(text):parseCsv(text,options);
   return {...result,ok:parsed.errors.length===0,...parsed};
  }catch(error){return {...result,errors:[diagnostic(error)]};}
 }
 return Object.freeze({parseCashStatement,inspectCashStatement,CASH_STATEMENT_IMPORT_LIMITS});
}
const cashStatementImportParser=createCashStatementImportParser();
export const {parseCashStatement,inspectCashStatement,CASH_STATEMENT_IMPORT_LIMITS}=cashStatementImportParser;
