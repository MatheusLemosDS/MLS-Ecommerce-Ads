// File evidence has its own contract. It never projects a legacy payment DTO.
export const EXTERNAL_CASH_PATH = '/internal/finance/external-cash-v1';
export const EXTERNAL_CASH_REQUEST_MAXIMUM = 524288;
export const EXTERNAL_CASH_RESPONSE_MAXIMUM = 131072;

const externalCashErrors=Object.freeze({REQUEST_INVALID:400,CONFIGURATION:503,CLOCK_INVALID:503,STORAGE_INVALID:503,STORAGE_UNAVAILABLE:503,REVISION_CONFLICT:409,CURSOR_STALE:409,IMPORT_CONFLICT:409,PREVIEW_MISMATCH:409,REQUEST_ID_REUSED:409,MATCH_CONFLICT:409,MATCH_NOT_FOUND:404,RETRY_REQUIRED:503,STATUS_NOT_COMPLETED:400,UNAUTHORIZED:401,FORBIDDEN:403,NOT_FOUND:404,METHOD_NOT_ALLOWED:405,BODY_TOO_LARGE:413,UNAVAILABLE:502,TIMEOUT:504});
export function externalCashErrorStatus(code){return typeof code==='string'&&code.startsWith('FINANCE_EXTERNAL_CASH_')&&Object.hasOwn(externalCashErrors,code.slice(22))?externalCashErrors[code.slice(22)]:null;}
export function projectExternalCashError(value){
 try{
  if(!value||![Object.prototype,null].includes(Object.getPrototypeOf(value))||Reflect.ownKeys(value).length!==2||!['schema','error'].every(key=>Object.hasOwn(Object.getOwnPropertyDescriptor(value,key)||{},'value'))||value.schema!=='external_cash_error_v1'||externalCashErrorStatus(value.error)===null)return null;
  return {schema:'external_cash_error_v1',error:value.error};
 }catch{return null;}
}

// Kept self-contained so the browser and each private boundary use one projector.
export function createExternalCashProtocol(){
 const plain=value=>value!==null&&typeof value==='object'&&[Object.prototype,null].includes(Object.getPrototypeOf(value));
 const exact=(value,required,optional=[])=>plain(value)&&Reflect.ownKeys(value).length>=required.length&&Reflect.ownKeys(value).length<=required.length+optional.length&&Reflect.ownKeys(value).every(key=>typeof key==='string'&&[...required,...optional].includes(key)&&Object.hasOwn(Object.getOwnPropertyDescriptor(value,key)||{},'value'))&&required.every(key=>Object.hasOwn(value,key));
 const array=(value,maximum)=>Array.isArray(value)&&Object.getPrototypeOf(value)===Array.prototype&&value.length<=maximum&&Reflect.ownKeys(value).length===value.length+1&&Array.from({length:value.length},(_,index)=>Object.hasOwn(Object.getOwnPropertyDescriptor(value,String(index))||{},'value')).every(Boolean);
 const int=(value,min=0,max=Number.MAX_SAFE_INTEGER)=>Number.isSafeInteger(value)&&!Object.is(value,-0)&&value>=min&&value<=max;
 const text=(value,max,nullable=false)=>nullable&&value===null||typeof value==='string'&&value.length>0&&value.length<=max&&value.normalize('NFC')===value&&!/[\u0000-\u001f\u007f]/.test(value);
 const hash=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
 const uuid=value=>typeof value==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(value);
 const id=value=>hash(value)||uuid(value);
 const date=value=>typeof value==='string'&&/^20\d{2}-(0[1-9]|1[0-2])-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value+'T00:00:00Z'))&&new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;
 const month=value=>typeof value==='string'&&/^20\d{2}-(0[1-9]|1[0-2])$/.test(value);
 const source=value=>['NUBANK','SHOPEE'].includes(value);
 const completedStatus=value=>value===null||typeof value==='string'&&['COMPLETED','COMPLETE','CONCLUIDO','CONCLUIDA','TRANSFERENCIA CONCLUIDA','TRANSFERIDO','TRANSFERIDA','SUCCESS','SUCCESSFUL'].includes(value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toUpperCase());
 const cursor=value=>value===null||text(value,160);
 const rowKeys=['line','date','amount_cents','external_id','reference','description','reported_status'];
 function projectRow(value){
  if(!exact(value,rowKeys)||!int(value.line,1,100000)||!date(value.date)||!int(value.amount_cents,Number.MIN_SAFE_INTEGER)||!text(value.external_id,128,true)||!text(value.reference,160,true)||!text(value.description,240,true)||!text(value.reported_status,80,true))return null;
  return Object.fromEntries(rowKeys.map(key=>[key,value[key]]));
 }
 function selection(value,kind){
  if(!exact(value,['format','date_format','amount_format'])||!(kind==='NUBANK'?['nubank_csv','nubank_ofx']:['shopee_csv']).includes(value.format)||!['DMY','YMD'].includes(value.date_format)||!['BRL','DECIMAL'].includes(value.amount_format))return null;
  return {format:value.format,date_format:value.date_format,amount_format:value.amount_format};
 }
 function projectRequest(value){
  try{
   if(!plain(value)||!Reflect.ownKeys(value).every(key=>Object.hasOwn(Object.getOwnPropertyDescriptor(value,key)||{},'value'))||value.schema!=='external_cash_request_v1')return null;
   if(value.operation==='read'){
    if(!exact(value,['schema','operation','month'],['source','cursor','limit'])||!month(value.month))return null;
    const kind=Object.hasOwn(value,'source')?value.source:null,page=Object.hasOwn(value,'cursor')?value.cursor:null,limit=Object.hasOwn(value,'limit')?value.limit:50;
    if(kind!==null&&!source(kind)||!cursor(page)||!int(limit,1,100))return null;
    return {schema:value.schema,operation:'read',month:value.month,source:kind,cursor:page,limit};
   }
   if(['preview','import'].includes(value.operation)){
    const fields=['schema','operation','source','bank_account_declared','completed_transfers_declared','document_hash','selection','rows'];
    if(value.operation==='import')fields.push('request_id','expected_revision','preview_hash','confirmed');
    if(!exact(value,fields,value.operation==='preview'?['cursor','limit']:[])||!source(value.source)||value.bank_account_declared!==true||value.completed_transfers_declared!==(value.source==='SHOPEE')||!hash(value.document_hash)||!array(value.rows,1000)||value.rows.length<1)return null;
    const selected=selection(value.selection,value.source),rows=value.rows.map(projectRow);
    if(!selected||rows.some(row=>row===null)||new Set(rows.map(row=>row.line)).size!==rows.length)return null;
    const result={schema:value.schema,operation:value.operation,source:value.source,bank_account_declared:true,completed_transfers_declared:value.completed_transfers_declared,document_hash:value.document_hash,selection:selected,rows};
    if(value.operation==='preview'){
     const page=Object.hasOwn(value,'cursor')?value.cursor:null,limit=Object.hasOwn(value,'limit')?value.limit:50;if(!cursor(page)||!int(limit,1,100))return null;
     return {...result,cursor:page,limit};
    }
    if(!uuid(value.request_id)||!int(value.expected_revision,0,Number.MAX_SAFE_INTEGER-1)||!hash(value.preview_hash)||value.confirmed!==true)return null;
    return {...result,request_id:value.request_id,expected_revision:value.expected_revision,preview_hash:value.preview_hash,confirmed:true};
   }
   if(['match','unlink'].includes(value.operation)){
    if(!exact(value,['schema','operation','request_id','expected_revision','confirmed','reason',value.operation==='match'?'pairs':'match_id'])||!uuid(value.request_id)||!int(value.expected_revision,0,Number.MAX_SAFE_INTEGER-1)||value.confirmed!==true||!text(value.reason,240)||value.reason.trim()!==value.reason)return null;
    const result={schema:value.schema,operation:value.operation,request_id:value.request_id,expected_revision:value.expected_revision,confirmed:true,reason:value.reason};
    if(value.operation==='unlink')return id(value.match_id)?{...result,match_id:value.match_id}:null;
    if(!array(value.pairs,50)||value.pairs.length<1)return null;
    const banks=new Set(),transfers=new Set(),pairs=[];
    for(const pair of value.pairs){
     if(!exact(pair,['bank_record_id','transfer_record_id'])||!id(pair.bank_record_id)||!id(pair.transfer_record_id)||pair.bank_record_id===pair.transfer_record_id||banks.has(pair.bank_record_id)||transfers.has(pair.transfer_record_id))return null;
     banks.add(pair.bank_record_id);transfers.add(pair.transfer_record_id);pairs.push({bank_record_id:pair.bank_record_id,transfer_record_id:pair.transfer_record_id});
    }
    return {...result,pairs};
   }
   return null;
  }catch{return null;}
 }
 function projectResponse(value){
  try{
   if(!plain(value)||!Reflect.ownKeys(value).every(key=>Object.hasOwn(Object.getOwnPropertyDescriptor(value,key)||{},'value'))||!int(value.revision))return null;
   if(value.schema==='external_cash_workspace_v1'){
    if(!exact(value,['schema','revision','records','matches','suggestions','next_cursor','summary'])||!array(value.records,100)||!array(value.matches,100)||!array(value.suggestions,100)||!cursor(value.next_cursor))return null;
    const recordKeys=['record_id','source','date','amount_cents','currency','external_id','reference','description','import_id','review'];
    const recordIds=new Set(),records=[];
    for(const record of value.records){
     if(!exact(record,recordKeys)||!id(record.record_id)||recordIds.has(record.record_id)||!source(record.source)||!date(record.date)||!int(record.amount_cents,Number.MIN_SAFE_INTEGER)||record.currency!=='BRL'||!text(record.external_id,128,true)||!text(record.reference,160,true)||!text(record.description,240,true)||!id(record.import_id)||typeof record.review!=='boolean')return null;
     recordIds.add(record.record_id);records.push(Object.fromEntries(recordKeys.map(key=>[key,record[key]])));
    }
    const matches=[],matchIds=new Set(),banks=new Set(),transfers=new Set();
    for(const item of value.matches){
     if(!exact(item,['match_id','bank_record_id','transfer_record_id','confirmed_at','reason'])||!id(item.match_id)||matchIds.has(item.match_id)||!id(item.bank_record_id)||!id(item.transfer_record_id)||item.bank_record_id===item.transfer_record_id||banks.has(item.bank_record_id)||transfers.has(item.transfer_record_id)||!int(item.confirmed_at,1,9999999999)||!text(item.reason,240))return null;
     matchIds.add(item.match_id);banks.add(item.bank_record_id);transfers.add(item.transfer_record_id);matches.push({...item});
    }
    const suggestions=[],seen=new Set();
    for(const item of value.suggestions){
     if(!exact(item,['bank_record_id','transfer_record_id','confidence'])||!id(item.bank_record_id)||!id(item.transfer_record_id)||item.bank_record_id===item.transfer_record_id||!['AMOUNT_DATE','SHARED_REFERENCE'].includes(item.confidence)||seen.has(item.bank_record_id+':'+item.transfer_record_id))return null;
     seen.add(item.bank_record_id+':'+item.transfer_record_id);suggestions.push({...item});
    }
    const summaryKeys=['record_count','match_count','unmatched_bank_count','unmatched_transfer_count','review_count'];
    if(!exact(value.summary,summaryKeys)||!summaryKeys.every(key=>int(value.summary[key]))||value.summary.record_count<records.length||value.summary.review_count>value.summary.record_count)return null;
    return {schema:value.schema,revision:value.revision,records,matches,suggestions,next_cursor:value.next_cursor,summary:{...value.summary}};
   }
   if(value.schema==='external_cash_preview_v1'){
    if(!exact(value,['schema','revision','preview_hash','can_import','counts','rows','next_cursor'])||!hash(value.preview_hash)||typeof value.can_import!=='boolean'||!exact(value.counts,['total','new','duplicates','review'])||!Object.values(value.counts).every(count=>int(count,0,1000))||value.counts.total<1||value.counts.new+value.counts.duplicates!==value.counts.total||value.counts.review>value.counts.new||!array(value.rows,100)||value.rows.length>value.counts.total||!cursor(value.next_cursor))return null;
    const rows=[],seen=new Set();for(const row of value.rows){if(!exact(row,['line','state'])||!int(row.line,1,100000)||!['NEW','DUPLICATE','REVIEW'].includes(row.state)||seen.has(row.line))return null;seen.add(row.line);rows.push({...row});}
    return {schema:value.schema,revision:value.revision,preview_hash:value.preview_hash,can_import:value.can_import,counts:{...value.counts},rows,next_cursor:value.next_cursor};
   }
   if(value.schema==='external_cash_mutation_v1'){
    if(!exact(value,['schema','operation','request_id','revision','replayed','result'])||!['import','match','unlink'].includes(value.operation)||!uuid(value.request_id)||value.revision<1||typeof value.replayed!=='boolean'||!exact(value.result,['import_id','inserted_count','duplicate_count','review_count','match_ids','unlinked_match_id']))return null;
    const result=value.result;if(!['inserted_count','duplicate_count','review_count'].every(key=>int(result[key],0,1000))||result.review_count>result.inserted_count||!array(result.match_ids,50)||!result.match_ids.every(id)||new Set(result.match_ids).size!==result.match_ids.length)return null;
    if(value.operation==='import'&&(!id(result.import_id)||result.inserted_count+result.duplicate_count>1000||result.match_ids.length||result.unlinked_match_id!==null))return null;
    if(value.operation!=='import'&&(result.import_id!==null||result.inserted_count!==0||result.duplicate_count!==0||result.review_count!==0))return null;
    if(value.operation==='match'&&(result.match_ids.length<1||result.unlinked_match_id!==null))return null;
    if(value.operation==='unlink'&&(result.match_ids.length||!id(result.unlinked_match_id)))return null;
    return {schema:value.schema,operation:value.operation,request_id:value.request_id,revision:value.revision,replayed:value.replayed,result:{...result,match_ids:[...result.match_ids]}};
   }
   return null;
  }catch{return null;}
 }
 function responseMatches(request,response){
  const input=projectRequest(request),frame=projectResponse(response);if(!input||!frame)return false;
  if(input.operation==='read'){
   const ids=new Set(frame.records?.map(row=>row.record_id)??[]);
   return frame.schema==='external_cash_workspace_v1'&&frame.records.every(row=>row.date.startsWith(input.month+'-')&&(input.source===null||row.source===input.source))&&[...frame.matches,...frame.suggestions].every(pair=>ids.has(pair.bank_record_id)||ids.has(pair.transfer_record_id));
  }
  if(input.operation==='preview')return frame.schema==='external_cash_preview_v1'&&frame.counts.total===input.rows.length&&frame.rows.every(row=>input.rows.some(item=>item.line===row.line));
  return frame.schema==='external_cash_mutation_v1'&&frame.operation===input.operation&&frame.request_id===input.request_id&&(frame.replayed||frame.revision===input.expected_revision+1);
 }
 return {projectExternalCashRequest:projectRequest,projectExternalCashResponse:projectResponse,externalCashResponseMatches:responseMatches,isExternalCashCompletedStatus:completedStatus};
}

const externalCashProtocol=createExternalCashProtocol();
export function projectExternalCashRequest(value){return externalCashProtocol.projectExternalCashRequest(value);}
export function projectExternalCashResponse(value){return externalCashProtocol.projectExternalCashResponse(value);}
export function externalCashResponseMatches(request,response){return externalCashProtocol.externalCashResponseMatches(request,response);}
export function isExternalCashCompletedStatus(value){return externalCashProtocol.isExternalCashCompletedStatus(value);}
