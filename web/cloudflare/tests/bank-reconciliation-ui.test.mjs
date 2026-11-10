import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {BANK_RECONCILIATION_CLIENT,BANK_RECONCILIATION_CSS,bankReconciliationBody,createBankReconciliationController} from '../src/bank-reconciliation-view.mjs';
import {createCashStatementImportParser} from '../../finance/src/cash-statement-import.mjs';
import {createExternalCashProtocol} from '../../finance/src/external-cash-frame.mjs';

const hash='a'.repeat(64),recordId='b'.repeat(64),transferId='c'.repeat(64),matchId='d'.repeat(64);
const workspace=()=>({schema:'external_cash_workspace_v1',revision:0,records:[],matches:[],suggestions:[],next_cursor:null,summary:{record_count:0,match_count:0,unmatched_bank_count:0,unmatched_transfer_count:0,review_count:0}});
function browser(){
 const controls=new Map();
 function node(tag='div'){
  let id='';const value={tag,textContent:'',value:'',checked:false,hidden:false,disabled:false,children:[],files:[],dataset:{},append(...children){this.children.push(...children);},replaceChildren(...children){this.children=[...children];this.textContent='';},querySelectorAll(type){return this.children.flatMap(child=>[...(child.tag===type?[child]:[]),...(child.querySelectorAll?.(type)??[])]);},setAttribute(){},focus(){},scrollIntoView(){}};
  Object.defineProperty(value,'id',{get:()=>id,set:v=>{id=v;controls.set(v,value);}});return value;
 }
 for(const [,id] of bankReconciliationBody().matchAll(/\bid="([^"]+)"/g)){const value=node();value.id=id;}
 const el=name=>controls.get('bankReconciliation'+name),document={hidden:false,documentElement:{dataset:{activePanel:'overview'}},getElementById:id=>controls.get(id),createElement:node};
 for(const [id,value] of Object.entries({Format:'nubank_csv',Separator:',',DateFormat:'DMY',AmountFormat:'BRL',Currency:'BRL',Month:'2026-11'}))el(id).value=value;
 const calls=[];let handler=async(path,request)=>request?.operation==='preview'?{schema:'external_cash_preview_v1',revision:0,preview_hash:hash,can_import:true,counts:{total:request.rows.length,new:request.rows.length,duplicates:0,review:0},rows:request.rows.slice(0,100).map(row=>({line:row.line,state:'NEW'})),next_cursor:null}:workspace();
 const api=async(path,request)=>{calls.push({path,request:request&&structuredClone(request)});return handler(path,request);};
 const controller=createBankReconciliationController(createCashStatementImportParser(),createExternalCashProtocol(),{document,crypto:webcrypto});controller.prepare();
 const text=value=>value.textContent+' '+value.children.map(text).join(' ');
 function file(source,content,name=source+'.csv'){const bytes=new TextEncoder().encode(content);el('File'+source).files=[{name,size:bytes.length,arrayBuffer:async()=>bytes.buffer}];el('File'+source).onchange();}
 return {controller,el,document,calls,api,file,text:name=>text(el(name)),handler:value=>handler=value,node};
}
async function ready(){const b=browser();await b.controller.start({api:b.api});return b;}
async function selected(){const b=await ready();b.file('NUBANK','Data,Valor,Identificador,Descrição\n10/11/2026,15.50,fixture-1,Transferência sintética');await b.el('ChooseNUBANK').onclick();b.el('AmountFormat').value='DECIMAL';b.el('Account').checked=true;return b;}
function mutation(request){return {schema:'external_cash_mutation_v1',operation:request.operation,request_id:request.request_id,revision:request.expected_revision+1,replayed:false,result:{import_id:request.operation==='import'?hash:null,inserted_count:request.operation==='import'?request.rows.length:0,duplicate_count:0,review_count:0,match_ids:request.operation==='match'?[matchId]:[],unlinked_match_id:request.operation==='unlink'?request.match_id:null}};}

test('start remains local on overview; Finance opens one lazy read and hidden month changes preserve drafts',async()=>{
 const b=await ready();assert.equal(b.calls.length,0);b.document.documentElement.dataset.activePanel='agent-finance';b.controller.open();b.controller.open();await new Promise(resolve=>setImmediate(resolve));assert.equal(b.calls.length,1);assert.equal(b.calls[0].path,'finance/external-cash?month=2026-11');
 b.document.documentElement.dataset.activePanel='overview';await b.controller.observe('2026-10');assert.equal(b.calls.length,1);
});

test('file selection and local inspection never save; explicit preview sends normalized rows without file bytes',async()=>{
 const b=await selected();assert.equal(b.calls.length,0);assert.match(b.text('LocalStatus'),/reconhecidos/);await b.el('Preview').onclick();assert.equal(b.calls.length,1);const request=b.calls[0].request;assert.equal(request.operation,'preview');assert.equal(request.rows[0].amount_cents,1550);assert.equal(request.rows[0].reported_status,null);assert.match(request.document_hash,/^[a-f0-9]{64}$/);assert.equal(request.bank_account_declared,true);assert.equal(request.completed_transfers_declared,false);assert.deepEqual(Object.keys(request.selection),['format','date_format','amount_format']);assert.equal(b.el('Import').disabled,true);
 b.el('ConfirmImport').checked=true;b.el('ConfirmImport').onchange();assert.equal(b.el('Import').disabled,false);
});

test('import retry retains its idempotency key after a lost response; later edits require a fresh preview',async()=>{
 const b=await selected();await b.el('Preview').onclick();b.el('ConfirmImport').checked=true;let attempts=0;b.handler(async(path,request)=>{if(request?.operation==='import'){if(++attempts===1)throw Error('lost');return mutation(request);}return workspace();});
 assert.equal(await b.el('Import').onclick(),false);assert.match(b.text('Status'),/mesma identificação/);assert.equal(await b.el('Import').onclick(),true);const writes=b.calls.filter(call=>call.request?.operation==='import');assert.equal(writes.length,2);assert.equal(writes[0].request.request_id,writes[1].request.request_id);assert.equal(b.el('Import').disabled,true);assert.equal(b.el('Draft').hidden,false);
});

test('a CAS conflict keeps the local file and blocks confirmation until a new preview',async()=>{
 const b=await selected();await b.el('Preview').onclick();b.el('ConfirmImport').checked=true;b.handler(async()=>{throw Object.assign(Error('conflict'),{status:409});});await b.el('Import').onclick();assert.match(b.text('Status'),/revisão mudou/);assert.equal(b.el('ConfirmImport').checked,false);assert.equal(b.el('Import').disabled,true);assert.equal(b.el('Draft').hidden,false);assert.equal(b.el('Preview').disabled,false);
});

test('unknown Nubank headers require explicit mapping; pending Shopee rows cannot become completed through a checkbox',async()=>{
 const b=await ready();b.file('NUBANK','Dia;Total;Ref\n10/11/2026;15,50;n-1');await b.el('ChooseNUBANK').onclick();b.el('Separator').value=';';b.el('Separator').onchange();b.el('Columndate').value='Dia';b.el('Columnamount').value='Total';b.el('Columnexternal_id').value='Ref';b.el('Account').checked=true;await b.el('Preview').onclick();assert.equal(b.calls.at(-1).request.rows[0].amount_cents,1550);
 b.file('SHOPEE','Dia;Total;Situação\n10/11/2026;15,50;Pending');await b.el('ChooseSHOPEE').onclick();b.el('Columndate').value='Dia';b.el('Columnamount').value='Total';b.el('Columnstatus').value='Situação';b.el('CompletedStatus').value='Pending';b.el('Account').checked=true;b.el('Completed').checked=true;const count=b.calls.length;await b.el('Preview').onclick();assert.equal(b.calls.length,count);assert.match(b.text('LocalStatus'),/Linha 2: STATUS_NOT_COMPLETED/);
});

test('recognized Shopee status cannot be omitted or replaced by a different completed-looking column',async()=>{
 const b=await ready();b.file('SHOPEE','Dia;Total;Status da Transferência;Outro campo\n10/11/2026;15,50;PENDING;COMPLETED');await b.el('ChooseSHOPEE').onclick();b.el('Separator').value=';';b.el('Separator').onchange();b.el('Columndate').value='Dia';b.el('Columnamount').value='Total';b.el('Account').checked=true;b.el('Completed').checked=true;b.el('CompletedStatus').value='COMPLETED';assert.equal(b.el('Columnstatus').value,'Status da Transferência');assert.equal(b.el('Columnstatus').required,true);
 for(const mapped of ['', 'Outro campo']){b.el('Columnstatus').value=mapped;b.el('Columnstatus').onchange();await b.el('Preview').onclick();assert.equal(b.calls.length,0);assert.match(b.text('LocalStatus'),/Linha 1: MAPPING_STATUS_REQUIRED/);assert.equal(b.el('Import').disabled,true);}
 b.el('Columnstatus').value='Status da Transferência';b.el('CompletedStatus').value='';await b.el('Preview').onclick();assert.equal(b.calls.length,0);assert.match(b.text('LocalStatus'),/situação concluída exata/);b.el('CompletedStatus').value='PENDING';await b.el('Preview').onclick();assert.equal(b.calls.length,0);assert.match(b.text('LocalStatus'),/Linha 2: STATUS_NOT_COMPLETED/);
});

test('ambiguous Shopee status headers block preview with an explanation',async()=>{
 const b=await ready();b.file('SHOPEE','Dia;Total;Status;Situação\n10/11/2026;15,50;PENDING;COMPLETED');await b.el('ChooseSHOPEE').onclick();b.el('Separator').value=';';b.el('Separator').onchange();assert.equal(b.el('Preview').disabled,true);assert.match(b.text('LocalStatus'),/MAPPING_STATUS_AMBIGUOUS.*mais de uma coluna/);b.el('Account').checked=true;b.el('Completed').checked=true;b.el('Columndate').value='Dia';b.el('Columnamount').value='Total';b.el('Columnstatus').value='Situação';b.el('CompletedStatus').value='COMPLETED';await b.el('Preview').onclick();assert.equal(b.calls.length,0);
});

test('more than 1000 rows requires an explicit selection and never silently truncates',async()=>{
 const b=await ready();const content='Data,Valor,Identificador,Descrição\n'+Array.from({length:1001},(_,i)=>'10/11/2026,1.00,fixture-'+i+',Sintético').join('\n');b.file('NUBANK',content);await b.el('ChooseNUBANK').onclick();b.el('AmountFormat').value='DECIMAL';b.el('Account').checked=true;await b.el('Preview').onclick();assert.equal(b.calls.length,0);assert.match(b.text('LocalStatus'),/1001 linha.*entre 1 e 1000/);
});

test('suggestions require a checkbox and reason; unlink also requires explicit review',async()=>{
 const b=await ready(),value=workspace();value.records=[['NUBANK',recordId],['SHOPEE',transferId]].map(([source,record_id])=>({record_id,source,date:'2026-11-10',amount_cents:1550,currency:'BRL',external_id:null,reference:'<script>fixture</script>',description:null,import_id:hash,review:false}));value.summary={record_count:2,match_count:0,unmatched_bank_count:1,unmatched_transfer_count:1,review_count:0};value.suggestions=[{bank_record_id:recordId,transfer_record_id:transferId,confidence:'SHARED_REFERENCE'}];b.handler(async(path,request)=>request?mutation(request):value);b.document.documentElement.dataset.activePanel='agent-finance';b.controller.open();await new Promise(resolve=>setImmediate(resolve));const article=b.el('Suggestions').children[0],button=article.children.at(-1),checkbox=article.children.at(-2).children[0];await button.onclick();assert.equal(b.calls.length,1);checkbox.checked=true;await button.onclick();assert.equal(b.calls.length,1);b.el('Reason').value='Conferência sintética';await button.onclick();assert.equal(b.calls[1].request.operation,'match');assert.equal(b.calls[1].request.confirmed,true);assert.match(b.text('Suggestions'),/<script>fixture<\/script>/);
 value.suggestions=[];value.matches=[{match_id:matchId,bank_record_id:recordId,transfer_record_id:transferId,confirmed_at:1794300000,reason:'Conferência sintética'}];value.summary.match_count=1;value.summary.unmatched_bank_count=0;value.summary.unmatched_transfer_count=0;await b.el('Refresh').onclick();const confirmed=b.el('Matches').children[0];await confirmed.children.at(-1).onclick();assert.equal(b.calls.filter(call=>call.request?.operation==='unlink').length,0);confirmed.children.at(-2).children[0].checked=true;await confirmed.children.at(-1).onclick();assert.equal(b.calls.filter(call=>call.request?.operation==='unlink').length,1);
});

test('stop clears private file handles and saved values; the client is self contained and uses responsive tokens',async()=>{
 const b=await selected();await b.el('Preview').onclick();b.controller.stop();assert.equal(b.el('Draft').hidden,true);assert.equal(b.el('Preview').disabled,true);assert.equal(b.el('Import').disabled,true);assert.equal(b.el('FileNUBANK').value,'');assert.match(BANK_RECONCILIATION_CSS,/min-height:44px/);assert.match(BANK_RECONCILIATION_CSS,/var\(--surface\)/);assert.doesNotMatch(BANK_RECONCILIATION_CLIENT,/localStorage|sessionStorage|console\.|innerHTML|fetch\(/);assert.doesNotThrow(()=>new Function(BANK_RECONCILIATION_CLIENT));
});

test('all preview pages must be inspected and a later edit invalidates an in-flight preview',async()=>{
 const b=await selected();let finish;b.handler(async(path,request)=>request.cursor?{schema:'external_cash_preview_v1',revision:0,preview_hash:hash,can_import:true,counts:{total:1,new:1,duplicates:0,review:0},rows:[{line:2,state:'NEW'}],next_cursor:null}:{schema:'external_cash_preview_v1',revision:0,preview_hash:hash,can_import:true,counts:{total:1,new:1,duplicates:0,review:0},rows:[],next_cursor:'second'});
 await b.el('Preview').onclick();assert.equal(b.el('ConfirmImport').disabled,true);assert.equal(b.el('PreviewMore').hidden,false);await b.el('PreviewMore').onclick();assert.equal(b.el('ConfirmImport').disabled,false);
 b.handler(()=>new Promise(resolve=>finish=resolve));const pending=b.el('Preview').onclick();b.el('From').value='2026-11-11';b.el('From').onchange();finish({schema:'external_cash_preview_v1',revision:0,preview_hash:hash,can_import:true,counts:{total:1,new:1,duplicates:0,review:0},rows:[{line:2,state:'NEW'}],next_cursor:null});await pending;assert.equal(b.el('ConfirmImport').disabled,true);assert.equal(b.el('PreviewRows').children.length,0);
});

test('manual comparison retains an October transfer while choosing the November bank credit',async()=>{
 const b=await ready();const row=(source,record_id,date)=>({record_id,source,date,amount_cents:1550,currency:'BRL',external_id:null,reference:'fixture-crossmonth',description:null,import_id:hash,review:false});
 b.handler(async(path,request)=>{if(request)return mutation(request);const value=workspace(),october=path.includes('2026-10');value.revision=october?3:4;value.records=[row(october?'SHOPEE':'NUBANK',october?transferId:recordId,october?'2026-10-31':'2026-11-01')];value.summary.record_count=1;value.summary[october?'unmatched_transfer_count':'unmatched_bank_count']=1;return value;});
 b.el('Month').value='2026-10';b.document.documentElement.dataset.activePanel='agent-finance';b.controller.open();await new Promise(resolve=>setImmediate(resolve));const selectRecord=()=>b.el('Records').children[0].children[1].children[0].children[4].children[0].onclick();selectRecord();b.el('Month').value='2026-11';b.el('Month').onchange();await new Promise(resolve=>setImmediate(resolve));selectRecord();assert.match(b.text('ManualPair'),/2026-10-31/);assert.match(b.text('ManualPair'),/2026-11-01/);b.el('ManualConfirm').checked=true;b.el('ManualConfirm').onchange();b.el('Reason').value='Transferência sintética entre meses';await b.el('ManualMatch').onclick();const write=b.calls.find(call=>call.request?.operation==='match').request;assert.equal(write.expected_revision,4);assert.deepEqual(write.pairs,[{bank_record_id:recordId,transfer_record_id:transferId}]);
});

test('a forged response from another month cannot replace the visible cash records',async()=>{
 const b=await ready(),value=workspace();value.records=[{record_id:recordId,source:'NUBANK',date:'2026-10-01',amount_cents:100,currency:'BRL',external_id:null,reference:null,description:null,import_id:hash,review:false}];value.summary.record_count=1;value.summary.unmatched_bank_count=1;b.handler(async()=>value);b.document.documentElement.dataset.activePanel='agent-finance';b.controller.open();await new Promise(resolve=>setImmediate(resolve));assert.equal(b.el('Records').children.length,0);assert.match(b.text('Status'),/Não foi possível consultar/);
});
