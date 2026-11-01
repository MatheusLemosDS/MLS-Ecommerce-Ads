import {projectPhysicalReturns} from './physical-returns.mjs';

// The ledger and saved-source list have separate meanings. Keep this wrapper
// self-contained because the owner page embeds both projectors as frozen code.
export function projectPhysicalReturnsWorkspace(value){
 try{
  const plain=item=>item!==null&&typeof item==='object'&&[Object.prototype,null].includes(Object.getPrototypeOf(item));
  const exact=(item,keys)=>plain(item)&&Reflect.ownKeys(item).length===keys.length&&keys.every(key=>Object.hasOwn(Object.getOwnPropertyDescriptor(item,key)||{},'value'));
  const integer=(item,min=0,max=Number.MAX_SAFE_INTEGER)=>Number.isSafeInteger(item)&&!Object.is(item,-0)&&item>=min&&item<=max;
  const stamp=item=>integer(item,1,9999999999),hash=item=>typeof item==='string'&&/^[a-f0-9]{64}$/.test(item);
  const array=(item,max)=>Array.isArray(item)&&Object.getPrototypeOf(item)===Array.prototype&&item.length<=max&&Reflect.ownKeys(item).length===item.length+1&&Array.from({length:item.length},(_,index)=>Object.hasOwn(Object.getOwnPropertyDescriptor(item,String(index))||{},'value')).every(Boolean);
  if(!exact(value,['schema','month','checked_at','source','physical'])||value.schema!=='physical_returns_workspace_v1'||typeof value.month!=='string'||!/^\d{4}-(0[1-9]|1[0-2])$/.test(value.month)||value.month<'2000-01'||!stamp(value.checked_at))return null;
  const physical=projectPhysicalReturns(value.physical),source=value.source;
  if(!physical||physical.checked_at>value.checked_at||!exact(source,['status','checked_at','cases_total','cases_included','truncated','reason','cases'])||!['AVAILABLE','PARTIAL','UNAVAILABLE'].includes(source.status)||source.checked_at!==null&&(!stamp(source.checked_at)||source.checked_at>value.checked_at)||source.cases_total!==null&&!integer(source.cases_total)||!integer(source.cases_included,0,120)||typeof source.truncated!=='boolean'||!array(source.cases,120)||source.cases.length!==source.cases_included||source.cases_total!==null&&source.cases_total<source.cases_included||![null,'SAVED_RETURNS_UNAVAILABLE','SAVED_RETURNS_INCOMPLETE','SAVED_RETURNS_CONFLICT'].includes(source.reason))return null;
  if(source.status==='AVAILABLE'&&(source.reason!==null||source.truncated||source.cases_total!==source.cases_included)||source.status==='UNAVAILABLE'&&(source.reason===null||source.cases.length!==0)||source.status==='PARTIAL'&&source.reason===null)return null;
  const seen=new Set(),cases=[];
  for(const row of source.cases){
   if(!exact(row,['case_hash','order_hash','status','checked_at','publication_revision'])||!hash(row.case_hash)||!hash(row.order_hash)||seen.has(row.case_hash)||!['PENDING','UNKNOWN','REQUESTED','ACCEPTED','CANCELLED','JUDGING','REFUND_PAID','CLOSED','PROCESSING'].includes(row.status)||row.checked_at!==null&&(!stamp(row.checked_at)||row.checked_at>value.checked_at)||!integer(row.publication_revision,1,2147483647))return null;
   seen.add(row.case_hash);cases.push({...row});
  }
  return {schema:value.schema,month:value.month,checked_at:value.checked_at,source:{...source,cases},physical};
 }catch{return null;}
}

export const PHYSICAL_RETURNS_CSS=String.raw`
.physical-returns{margin-top:20px;min-width:0;border:1px solid var(--line);border-radius:14px;background:var(--surface)}.physical-returns>details>summary{cursor:pointer;min-height:64px;padding:16px;list-style:none;display:flex;align-items:center;justify-content:space-between;gap:14px}.physical-returns>details>summary::-webkit-details-marker{display:none}.physical-returns>details>summary:after{content:'+';font-size:22px;color:var(--muted)}.physical-returns>details[open]>summary:after{content:'−'}.physical-returns-heading{min-width:0}.physical-returns-heading strong{display:block;font-size:15px}.physical-returns-heading small{display:block;margin-top:5px;font-size:11px;color:var(--muted);line-height:1.6}.physical-returns-body{padding:0 16px 16px}.physical-returns p,.physical-returns li{font-size:11px;line-height:1.75;color:var(--muted);overflow-wrap:anywhere}.physical-returns-notice{padding:12px;border:1px solid var(--line);border-radius:10px;background:var(--surface-raised)}.physical-returns-toolbar{display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;margin:12px 0}.physical-returns-toolbar span{font-size:11px;line-height:1.6;color:var(--muted)}.physical-returns h4{font-size:13px;margin:0 0 10px}.physical-returns h5{font-size:12px;margin:0 0 10px}.physical-returns-summary{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:9px;margin:12px 0}.physical-returns-summary>div{padding:12px;border:1px solid var(--line);border-radius:9px;min-width:0}.physical-returns-summary dt{font-size:10px;color:var(--muted);line-height:1.6}.physical-returns-summary dd{margin:7px 0 0;font-size:20px;font-weight:700;font-variant-numeric:tabular-nums;overflow-wrap:anywhere}.physical-returns-columns{display:grid;grid-template-columns:minmax(0,.8fr) minmax(0,1.2fr);gap:14px}.physical-returns-panel{min-width:0;border:1px solid var(--line);border-radius:10px;padding:14px;margin-top:14px}.physical-returns label{display:block;min-width:0;font-size:11px;line-height:1.6;color:var(--muted)}.physical-returns input,.physical-returns select,.physical-returns textarea{display:block;box-sizing:border-box;width:100%;min-width:0;min-height:44px;margin-top:5px;font:inherit;color:var(--text);background:var(--surface-raised);border:1px solid var(--line);border-radius:8px;padding:10px}.physical-returns select{max-width:100%}.physical-returns textarea{resize:vertical;min-height:76px}.physical-returns button{min-height:44px;font-size:11px;line-height:1.6;max-width:100%;white-space:normal;overflow-wrap:anywhere}.physical-returns button:disabled{opacity:.55;cursor:not-allowed}.physical-returns-fields{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.physical-returns-fields>.physical-returns-wide{grid-column:1/-1}.physical-returns-check{display:flex!important;min-height:44px;align-items:flex-start;gap:9px;margin:10px 0}.physical-returns-check input{width:19px;min-height:19px;flex:0 0 19px;margin:2px 0 0}.physical-returns-check span{min-width:0}.physical-returns-form{margin-top:14px;padding-top:14px;border-top:1px solid var(--line)}.physical-returns-form button{margin-top:12px}.physical-returns-facts{display:grid;grid-template-columns:minmax(95px,.55fr) minmax(0,1fr);gap:6px 10px;margin:12px 0;font-size:11px;line-height:1.7}.physical-returns-facts dt{color:var(--muted)}.physical-returns-facts dd{margin:0;overflow-wrap:anywhere}.physical-returns-message{margin:12px 0!important;padding:10px 12px;border-radius:9px;background:var(--surface-raised)}.physical-returns-message[data-error=true]{border:1px solid var(--negative,#e77f99)}.physical-returns-history{margin-top:14px;padding-top:12px;border-top:1px solid var(--line)}.physical-returns [hidden]{display:none!important}.physical-returns :focus-visible{outline:3px solid var(--accent);outline-offset:3px}@media(max-width:760px){.physical-returns-columns{grid-template-columns:minmax(0,1fr)}.physical-returns-summary{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:390px){.physical-returns-body{padding:0 12px 12px}.physical-returns-panel{padding:12px}.physical-returns-fields,.physical-returns-facts{grid-template-columns:minmax(0,1fr)}.physical-returns-fields>.physical-returns-wide{grid-column:auto}.physical-returns-facts dt{margin-top:5px}.physical-returns-toolbar{align-items:stretch}.physical-returns-toolbar button{width:100%}}
`;

export function physicalReturnsBody(){return `<section id="physicalReturns" class="physical-returns" aria-labelledby="physicalReturnsTitle"><details id="physicalReturnsDetails"><summary><span class="physical-returns-heading"><strong id="physicalReturnsTitle">Recebimento e inspeção das devoluções</strong><small>Controle físico separado da situação financeira da solicitação.</small></span></summary><div class="physical-returns-body"><p class="physical-returns-notice">Custo e impacto no resultado ainda não apurados. Este controle registra as peças informadas por você; não altera o resultado financeiro, não publica estoque e não confirma uma nova venda.</p><div class="physical-returns-toolbar"><label for="physicalReturnsMonthSelect">Mês das solicitações<input id="physicalReturnsMonthSelect" type="month" min="2000-01" disabled></label><button id="physicalReturnsReload" type="button" class="button-link" disabled>Atualizar registros salvos</button></div><p id="physicalReturnsMonth">Preparando a referência salva.</p><p id="physicalReturnsStatus" class="physical-returns-message" role="status" aria-live="polite">Abra para consultar os registros salvos.</p><button id="physicalReturnsRetry" type="button" class="button-link" data-physical-action="retry" hidden>Tentar o mesmo envio novamente</button><dl id="physicalReturnsSummary" class="physical-returns-summary"></dl><div class="physical-returns-columns"><section class="physical-returns-panel"><h4>Solicitações salvas da Shopee</h4><p id="physicalReturnsSourceStatus">A situação da solicitação não comprova a chegada das peças.</p><label for="physicalReturnsSourceCase">Solicitação desta referência</label><select id="physicalReturnsSourceCase" disabled></select><dl id="physicalReturnsSourceFacts" class="physical-returns-facts"></dl><button id="physicalReturnsRegister" type="button" data-physical-action="register" disabled>Registrar aguardando recebimento</button></section><section class="physical-returns-panel"><h4>Controle físico registrado</h4><p>Os registros físicos permanecem disponíveis ao mudar de mês. As quantidades são declaradas no recebimento; o total esperado da solicitação ainda não foi confirmado.</p><label for="physicalReturnsCase">Registro físico</label><select id="physicalReturnsCase" disabled></select><dl id="physicalReturnsCaseFacts" class="physical-returns-facts"></dl><form id="physicalReturnsReceiveForm" class="physical-returns-form" hidden></form><div id="physicalReturnsLines" class="physical-returns-history" hidden><h5>Recebimentos e correções</h5><label for="physicalReturnsLine">Item registrado no recebimento</label><select id="physicalReturnsLine" disabled></select><dl id="physicalReturnsLineFacts" class="physical-returns-facts"></dl><form id="physicalReturnsInspectForm" class="physical-returns-form" hidden></form><form id="physicalReturnsVoidForm" class="physical-returns-form" hidden></form></div></section></div></div></details></section>`;}

export const PHYSICAL_RETURNS_CLIENT=String.raw`
(()=>{
 const projectPhysicalReturns=${projectPhysicalReturns.toString()};
 const projectPhysicalReturnsWorkspace=${projectPhysicalReturnsWorkspace.toString()};
 const el=name=>document.getElementById('physicalReturns'+name);
 const node=(tag,text,cls)=>{const item=document.createElement(tag);if(text!==undefined)item.textContent=text;if(cls)item.className=cls;return item;};
 const statuses={PENDING:'Detalhes pendentes',UNKNOWN:'Situação não reconhecida',REQUESTED:'Solicitação aberta',ACCEPTED:'Solicitação aceita',CANCELLED:'Solicitação cancelada',JUDGING:'Em análise',REFUND_PAID:'Reembolso informado',CLOSED:'Solicitação encerrada',PROCESSING:'Em processamento'};
 const lineStatuses={QUARANTINE:'Em quarentena, aguardando inspeção',INSPECTED:'Inspeção registrada',VOID:'Lançamento anulado'};
 const categoryLabels={resellable:'Reaproveitáveis após inspeção',repair:'Precisam de reparo',damaged:'Avariadas',mismatch:'Divergentes do esperado',quarantine:'Em quarentena'};
 const failureMessages={PHYSICAL_RETURNS_RECEIPT_REFERENCE_CONFLICT:'Essa identificação de recebimento já está ativa neste registro. Confira os itens recebidos antes de lançar novamente.',PHYSICAL_RETURNS_IDENTITY_CONFLICT:'A identificação informada não corresponde ao registro atual. Confira a peça e os campos antes de salvar.',PHYSICAL_RETURNS_QUANTITY_MISMATCH:'As quantidades da inspeção precisam somar exatamente as peças deste recebimento.',PHYSICAL_RETURNS_LINE_VOID:'Este lançamento já foi anulado. O histórico foi preservado.',PHYSICAL_RETURNS_SOURCE_REQUIRED:'A solicitação salva precisa ser conferida antes de abrir este controle físico.',PHYSICAL_RETURNS_LIMIT:'O limite de registros deste controle foi atingido. Os registros existentes foram preservados.',PHYSICAL_RETURNS_REQUEST_INVALID:'Confira os campos do registro antes de enviar.'};
 const count=value=>Number.isSafeInteger(value)?new Intl.NumberFormat('pt-BR').format(value):'Ainda não confirmado';
 const time=value=>Number.isSafeInteger(value)&&value>0?new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Sao_Paulo',dateStyle:'short',timeStyle:'short'}).format(new Date(value*1000)):'Sem leitura confirmada';
 const todayMonth=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit'}).format(new Date()).slice(0,7);
 const validMonth=value=>typeof value==='string'&&/^\d{4}-(0[1-9]|1[0-2])$/.test(value)&&value>='2000-01'&&value<=todayMonth();
 const ref=value=>'Solicitação '+value.slice(0,10)+'…';
 let api=null,started=false,prepared=false,phase='LOADING',month='',monthPinned=false,view=null,loading=false,busy=false,session=0,readSequence=0,readPromise=null,pendingAction=null,selectedSource='',selectedCase='',selectedLine='',message='Abra para consultar os registros salvos.',errorState=false;
 const drafts=new Map(),fields={receive:null,inspect:null,void:null};
 function status(text,error=false){message=text;errorState=error;if(el('Status')){el('Status').textContent=text;el('Status').dataset.error=String(error);}}
 function currentCase(){return view?.physical.cases.find(row=>row.case_hash===selectedCase)??null;}
 function currentLine(){return currentCase()?.lines.find(row=>row.line_id===selectedLine)??null;}
 function draftKey(kind){return kind+':'+selectedCase+(kind==='receive'?'':':'+selectedLine);}
 function readFields(kind){const result={};for(const [name,input] of Object.entries(fields[kind]||{}))result[name]=input.type==='checkbox'?input.checked:input.value;return result;}
 function remember(kind){if(fields[kind])drafts.set(draftKey(kind),readFields(kind));}
 function controls(){
  const locked=!started||busy||pendingAction!==null;
  if(el('Reload'))el('Reload').disabled=!started||busy||loading;if(el('MonthSelect')){el('MonthSelect').disabled=locked;el('MonthSelect').max=todayMonth();el('MonthSelect').value=month;}
  if(el('Retry')){el('Retry').hidden=pendingAction===null;el('Retry').disabled=!started||busy;}
  for(const name of ['SourceCase','Case','Line'])if(el(name))el(name).disabled=locked||!view||name==='SourceCase'&&!view.source.cases.length||name==='Case'&&!view.physical.cases.length||name==='Line'&&!currentCase()?.lines.length;
  const candidate=view?.source.cases.find(row=>row.case_hash===selectedSource),registered=!!view?.physical.cases.some(row=>row.case_hash===selectedSource);
  if(el('Register')){el('Register').disabled=!started||busy||!candidate||pendingAction!==null&&!registered;el('Register').textContent=registered?'Ver controle físico':'Registrar aguardando recebimento';}
  for(const kind of ['receive','inspect','void'])for(const input of Object.values(fields[kind]||{}))input.disabled=locked;
  for(const kind of ['receive','inspect','void']){const form=el(kind==='receive'?'ReceiveForm':kind==='inspect'?'InspectForm':'VoidForm');for(const button of form?.querySelectorAll?.('button')||[])button.disabled=locked;}
 }
 function facts(target,pairs){target.replaceChildren();for(const [label,value] of pairs)target.append(node('dt',label),node('dd',value));}
 function option(select,value,label){const item=node('option',label);item.value=value;select.append(item);}
 function field(form,map,name,label,{type='text',value='',maxLength=null,options=null,min=null,max=null,wide=false}={}){
  const group=node('label',undefined,wide?'physical-returns-wide':''),caption=node('span',label),input=node(options?'select':type==='textarea'?'textarea':'input');input.setAttribute('name',name);input.name=name;
  if(!options&&type!=='textarea')input.type=type;if(maxLength!==null)input.maxLength=maxLength;if(min!==null)input.min=String(min);if(max!==null)input.max=String(max);
  if(options)for(const [key,title] of options)option(input,key,title);
  if(type==='checkbox'){group.className='physical-returns-check physical-returns-wide';input.checked=value===true;group.append(input,caption);}else{input.value=String(value??'');group.append(caption,input);}
  input.oninput=()=>remember(form.dataset.physicalForm);input.onchange=()=>remember(form.dataset.physicalForm);map[name]=input;form.querySelector('.physical-returns-fields').append(group);return input;
 }
 function identityFields(form,map,data){
  field(form,map,'artwork','Estampa ou identificação da arte',{value:data.artwork,maxLength:120});field(form,map,'color','Cor',{value:data.color,maxLength:80});field(form,map,'size','Tamanho',{value:data.size,maxLength:16});
  field(form,map,'garment_type','Segmento',{value:data.garment_type||'UNKNOWN',options:[['UNKNOWN','Ainda não identificado'],['ADULT','Adulto'],['CHILD','Infantil']]});
  field(form,map,'fit','Corte da peça',{value:data.fit||'UNKNOWN',options:[['UNKNOWN','Ainda não identificado'],['UNISEX','Unissex'],['MALE','Masculino'],['FEMALE','Feminino']]});
  field(form,map,'confirmed','Conferi fisicamente estampa, cor, tamanho, segmento e corte desta peça.',{type:'checkbox',value:data.confirmed===true});
 }
 function beginForm(kind,title){const form=el(kind==='receive'?'ReceiveForm':kind==='inspect'?'InspectForm':'VoidForm');form.replaceChildren();form.dataset.physicalForm=kind;form.hidden=false;form.append(node('h5',title),node('div',undefined,'physical-returns-fields'));fields[kind]={};return form;}
 function formButton(form,kind,label){const button=node('button',label);button.type='submit';button.dataset.physicalAction=kind;form.append(button);form.onsubmit=event=>{event.preventDefault();return submitForm(kind);};}
 function renderForms(){
  for(const kind of ['receive','inspect','void'])fields[kind]=null;
  for(const name of ['ReceiveForm','InspectForm','VoidForm']){el(name).replaceChildren();el(name).hidden=true;}
  const record=currentCase(),line=currentLine();if(!record)return;
  let form=beginForm('receive','Registrar mais peças recebidas'),data=drafts.get(draftKey('receive'))||{};
  field(form,fields.receive,'receipt_ref','Identificação deste item no recebimento',{value:data.receipt_ref,maxLength:120,wide:true});
  field(form,fields.receive,'quantity','Quantidade realmente recebida',{type:'number',value:data.quantity,min:1,max:10000});identityFields(form,fields.receive,data);
  form.append(node('p','Use uma referência estável, por exemplo “Pacote 1 · masculina M”. Registre cada combinação de estampa, cor, tamanho, segmento e corte separadamente. Toda peça entra em quarentena até a inspeção.'));formButton(form,'receive','Registrar recebimento');
  if(!line||line.status==='VOID')return;
  form=beginForm('inspect','Inspecionar ou corrigir a classificação');data=drafts.get(draftKey('inspect'))||{...line.identity,...line.partition,reason:''};
  for(const [name,label] of Object.entries(categoryLabels))field(form,fields.inspect,name,label,{type:'number',value:data[name],min:0,max:line.quantity});
  identityFields(form,fields.inspect,data);field(form,fields.inspect,'reason','Motivo da inspeção ou da correção',{type:'textarea',value:data.reason,maxLength:240,wide:true});
  form.append(node('p','As cinco categorias devem somar exatamente '+count(line.quantity)+' peça(s). Só classifique como reaproveitável após conferir a identificação completa. Itens divergentes e em quarentena continuam separados.'));formButton(form,'inspect','Salvar inspeção');
  form=beginForm('void','Corrigir um recebimento lançado por engano');data=drafts.get(draftKey('void'))||{};field(form,fields.void,'reason','Motivo da anulação',{type:'textarea',value:data.reason,maxLength:240,wide:true});
  form.append(node('p','A anulação preserva o histórico e retira este lançamento das quantidades ativas. Depois registre o recebimento correto, se necessário.'));formButton(form,'void','Anular este lançamento');
 }
 function render(){
  if(!el(''))return;
  el('Month').textContent=validMonth(month)?'Solicitações da referência '+month.slice(5)+'/'+month.slice(0,4)+' · peças físicas de todos os meses':'Preparando a referência salva.';
  status(message,errorState);el('Summary').replaceChildren();el('SourceFacts').replaceChildren();el('CaseFacts').replaceChildren();el('LineFacts').replaceChildren();el('SourceCase').replaceChildren();el('Case').replaceChildren();el('Line').replaceChildren();
  if(!view){el('SourceStatus').textContent='A lista usa somente solicitações já salvas. A situação da solicitação não comprova a chegada de peças.';el('Lines').hidden=true;for(const name of ['ReceiveForm','InspectForm','VoidForm']){el(name).replaceChildren();el(name).hidden=true;}for(const kind of ['receive','inspect','void'])fields[kind]=null;controls();return;}
  const summary=view.physical.summary;
  for(const [label,value] of [['Peças registradas · inclui anuladas',summary.received_quantity],['Peças ativas',summary.active_quantity],['Em quarentena',summary.quarantine_quantity],['Classificadas como reaproveitáveis',summary.resellable_quantity],['Precisam de reparo',summary.repair_quantity],['Avariadas ou divergentes',summary.damaged_quantity+summary.mismatch_quantity]]){const group=node('div');group.append(node('dt',label),node('dd',count(value)));el('Summary').append(group);}
  el('SourceStatus').textContent=view.source.status==='UNAVAILABLE'?'As solicitações salvas ainda não estão disponíveis. Os controles físicos existentes continuam independentes desta lista.':view.source.status==='PARTIAL'?'Lista parcial de solicitações salvas; parte da conferência ainda está pendente. Situação financeira não comprova chegada de peças.':count(view.source.cases_included)+' solicitação(ões) salva(s). A situação financeira não comprova chegada de peças.';
  if(!view.source.cases.some(row=>row.case_hash===selectedSource))selectedSource=view.source.cases[0]?.case_hash||'';
  if(!view.physical.cases.some(row=>row.case_hash===selectedCase))selectedCase=view.physical.cases[0]?.case_hash||'';
  for(const row of view.source.cases)option(el('SourceCase'),row.case_hash,ref(row.case_hash)+' · '+statuses[row.status]);el('SourceCase').value=selectedSource;
  const source=view.source.cases.find(row=>row.case_hash===selectedSource);if(source)facts(el('SourceFacts'),[['Situação financeira salva',statuses[source.status]],['Leitura salva',time(source.checked_at)],['Quantidade esperada de peças','Ainda não confirmada']]);
  for(const record of view.physical.cases)option(el('Case'),record.case_hash,ref(record.case_hash)+' · '+(record.lines.length?count(record.lines.length)+' lançamento(s)':'Aguardando recebimento'));el('Case').value=selectedCase;
  const record=currentCase();if(record){const active=record.lines.filter(line=>line.status!=='VOID').reduce((sum,line)=>sum+line.quantity,0);facts(el('CaseFacts'),[['Controle físico',active?count(active)+' peça(s) ativa(s) declarada(s)':'Aguardando recebimento'],['Solicitação na abertura',statuses[record.source.status]],['Registrado em',time(record.registered_at)],['Custo e impacto no resultado','Ainda não apurados']]);}
  el('Lines').hidden=!record?.lines.length;
  if(!record?.lines.some(line=>line.line_id===selectedLine))selectedLine=record?.lines.at(-1)?.line_id||'';
  for(const line of record?.lines||[])option(el('Line'),line.line_id,line.receipt_ref+' · '+count(line.quantity)+' peça(s) · '+lineStatuses[line.status]);el('Line').value=selectedLine;
  const line=currentLine();if(line){facts(el('LineFacts'),[['Referência do recebimento',line.receipt_ref],['Situação física',lineStatuses[line.status]],['Quantidade recebida declarada',count(line.quantity)],['Recebido em',time(line.received_at)],...Object.entries(categoryLabels).map(([key,label])=>[label,count(line.partition[key])]),['Último motivo registrado',line.reason||'Ainda sem inspeção'],['Custo e impacto no resultado','Ainda não apurados']]);}
  renderForms();controls();
 }
 function inputError(text){status(text,true);return false;}
 function quantity(value,{zero=false,max=10000}={}){if(typeof value!=='string'||!/^\d{1,8}$/.test(value.trim()))return null;const result=Number(value.trim());return Number.isSafeInteger(result)&&result>=(zero?0:1)&&result<=max?result:null;}
 function text(value,max){const result=typeof value==='string'?value.trim().normalize('NFC'):'';return result&&result.length<=max?result:null;}
 function identity(data,previous=null){
  const result={artwork:text(data.artwork,120),color:text(data.color,80),size:text(data.size,16)?.toUpperCase()??null,garment_type:['ADULT','CHILD'].includes(data.garment_type)?data.garment_type:'UNKNOWN',fit:['UNISEX','MALE','FEMALE'].includes(data.fit)?data.fit:'UNKNOWN',confirmed:data.confirmed===true,item_id:previous?.item_id??null,model_id:previous?.model_id??null,sku:previous?.sku??null};
  if(result.confirmed&&(!result.artwork||!result.color||!result.size||result.garment_type==='UNKNOWN'||result.fit==='UNKNOWN'))return null;
  if(result.confirmed&&!(result.garment_type==='ADULT'?['P','M','G','GG','G1','G2','G3']:['2','4','6','8','10','12','14','16']).includes(result.size))return null;
  return result;
 }
 function uuid(){if(typeof globalThis.crypto?.randomUUID!=='function')throw Error();return globalThis.crypto.randomUUID();}
 function newAction(kind,payload){
  if(!started||busy||pendingAction||!view)return false;
  let body;try{body={revision:view.physical.revision,request_id:uuid(),action:kind,...payload};if(body.identity)Object.freeze(body.identity);if(body.partition)Object.freeze(body.partition);Object.freeze(body);}catch{return inputError('O navegador não conseguiu preparar o envio. Atualize a página antes de tentar novamente.');}
  pendingAction={kind,body,month,session,draftKey:kind==='register'?null:draftKey(kind)};return sendPending();
 }
 function submitForm(kind){
  if(!started||busy||pendingAction||!view)return false;remember(kind);const data=readFields(kind),record=currentCase(),line=currentLine();if(!record)return false;
  if(kind==='receive'){const amount=quantity(data.quantity),receiptRef=text(data.receipt_ref,120),identified=identity(data);if(amount===null)return inputError('Informe uma quantidade realmente recebida entre 1 e 10.000 peças.');if(!receiptRef)return inputError('Informe uma identificação estável para este item do recebimento.');if(!identified)return inputError('Confira estampa, cor, tamanho, segmento e corte antes de confirmar a identificação.');let lineId;try{lineId=uuid();}catch{return inputError('O navegador não conseguiu preparar o recebimento.');}return newAction(kind,{case_hash:record.case_hash,line_id:lineId,receipt_ref:receiptRef,quantity:amount,identity:identified});}
  if(!line||line.status==='VOID')return false;
  const reason=text(data.reason,240);if(!reason)return inputError('Informe o motivo deste registro, com até 240 caracteres.');
  if(kind==='void')return newAction(kind,{case_hash:record.case_hash,line_id:line.line_id,reason});
  const partition={};for(const key of Object.keys(categoryLabels)){const amount=quantity(data[key],{zero:true,max:line.quantity});if(amount===null)return inputError('Confira as quantidades da inspeção.');partition[key]=amount;}
  if(Object.values(partition).reduce((sum,value)=>sum+value,0)!==line.quantity)return inputError('As categorias da inspeção precisam somar exatamente '+count(line.quantity)+' peça(s).');
  const identified=identity(data,line.identity);if(!identified||partition.resellable>0&&!identified.confirmed)return inputError('Para registrar peças reaproveitáveis, confira e confirme a identificação completa.');
  return newAction(kind,{case_hash:record.case_hash,line_id:line.line_id,partition,identity:identified,reason});
 }
 async function sendPending(){
  const action=pendingAction;if(!started||busy||!action||action.session!==session)return false;busy=true;status('Salvando o registro físico…');controls();let refresh=false;
  try{
   const raw=await api('returns/physical?month='+encodeURIComponent(action.month),action.body),checked=projectPhysicalReturnsWorkspace(raw);
   if(!started||session!==action.session||pendingAction!==action)return false;if(!checked||checked.month!==action.month)throw Error();
   readSequence++;readPromise=null;loading=false;pendingAction=null;if(action.draftKey)drafts.delete(action.draftKey);selectedCase=action.body.case_hash;if(action.kind==='receive')selectedLine=action.body.line_id;
   if(month===action.month)view=checked;else refresh=true;
   status(action.kind==='register'?'Controle aberto. Aguardando o recebimento físico das peças.':action.kind==='receive'?'Recebimento registrado em quarentena. Confira as peças e registre a inspeção.':action.kind==='inspect'?'Inspeção salva. O resultado financeiro e os anúncios permanecem separados deste controle.':'Lançamento anulado com histórico preservado. Confira o recebimento correto antes de registrar novamente.');render();return true;
  }catch(error){
   if(!started||session!==action.session||pendingAction!==action)return false;
   const read=key=>{const field=Object.getOwnPropertyDescriptor(error||{},key);return field&&Object.hasOwn(field,'value')?field.value:undefined;},code=read('apiCode')||read('code')||read('message'),http=read('status');
   if(http===409||http===400||http===404){pendingAction=null;refresh=true;status(failureMessages[code]||(http===409?'Os registros mudaram em outra sessão. Seus rascunhos foram preservados; confira a leitura atual e envie novamente.':'Não foi possível aceitar este registro. Os rascunhos foram preservados para conferência.'),true);}
   else if(http===401){status('Sua sessão precisa ser confirmada. Entre novamente antes de continuar; nenhum novo envio foi iniciado.',true);}
   else status('O envio ainda não foi confirmado. Use “Tentar o mesmo envio novamente” para retomar esta tentativa sem duplicar o recebimento.',true);
   render();return false;
  }finally{if(started&&session===action.session){busy=false;controls();if(refresh&&el('Details').open)await load({preserveMessage:true});}}
 }
 async function load({preserveMessage=false}={}){
  if(!started||!validMonth(month)||!el('Details').open||busy)return false;if(readPromise)return readPromise;
  const token=++readSequence,epoch=session,selected=month;loading=true;if(!preserveMessage)status('Conferindo solicitações e controles físicos já salvos…');controls();
  const task=(async()=>{try{const raw=await api('returns/physical?month='+encodeURIComponent(selected)),checked=projectPhysicalReturnsWorkspace(raw);if(!started||epoch!==session||token!==readSequence||selected!==month)return false;if(!checked||checked.month!==selected)throw Error();view=checked;if(!preserveMessage)status(pendingAction?'Há um envio aguardando confirmação. Retome a mesma tentativa antes de criar outro registro.':'Registros salvos carregados. As quantidades físicas são declaradas por você.');render();return true;}catch{if(started&&epoch===session&&token===readSequence){status('Não foi possível conferir os registros agora. Os rascunhos e a última leitura válida foram preservados.',true);render();}return false;}finally{if(epoch===session&&token===readSequence){loading=false;readPromise=null;controls();}}})();readPromise=task;return task;
 }
 function observe(selected,{explicit=false}={}){
  if(!validMonth(selected)||monthPinned&&!explicit&&selected!==month)return Promise.resolve(false);const changed=selected!==month;
  if(changed&&(busy||pendingAction)){controls();status('Conclua o envio pendente antes de mudar o mês das solicitações.',true);return Promise.resolve(false);}
  if(explicit)monthPinned=true;if(changed){for(const kind of ['receive','inspect','void'])remember(kind);month=selected;readSequence++;readPromise=null;loading=false;view=null;render();}
  return started&&el('Details')?.open&&(changed||!view)?load():Promise.resolve(!!view);
 }
 function prepare(){
  if(prepared||!el(''))return !!el('');prepared=true;
  el('Details').ontoggle=()=>{if(!el('Details').open)return;let selected;try{selected=globalThis.brazaMonthDashboard?.getSnapshot?.()?.month;}catch{}if(!monthPinned&&validMonth(selected)&&selected!==month)return observe(selected);return load();};
  el('MonthSelect').onchange=()=>{const selected=el('MonthSelect').value;if(!validMonth(selected)){controls();status('Escolha um mês válido, até o mês atual em Brasília.',true);return false;}return observe(selected,{explicit:true});};
  el('Reload').onclick=()=>load();el('Retry').onclick=()=>sendPending();
  el('SourceCase').onchange=()=>{selectedSource=el('SourceCase').value;render();};
  el('Case').onchange=()=>{for(const kind of ['receive','inspect','void'])remember(kind);selectedCase=el('Case').value;selectedLine='';render();};
  el('Line').onchange=()=>{remember('inspect');remember('void');selectedLine=el('Line').value;render();};
  el('Register').onclick=()=>{const row=view?.source.cases.find(item=>item.case_hash===selectedSource);if(!row)return false;if(view.physical.cases.some(item=>item.case_hash===row.case_hash)){for(const kind of ['receive','inspect','void'])remember(kind);selectedCase=row.case_hash;selectedLine='';render();return true;}return newAction('register',{case_hash:row.case_hash,order_hash:row.order_hash});};return true;
 }
 function bootstrapState(options={}){if(!prepare()||!['LOADING','RETRYING','FAILED','READY'].includes(options.phase))return false;phase=options.phase;if(!started){status(phase==='FAILED'?'Entre na sessão administradora para consultar os controles físicos.':phase==='READY'?'Abra para consultar os registros salvos.':'Aguardando a sessão administradora.');controls();}return true;}
 function start(options={}){if(typeof options.api!=='function'||!prepare())return false;if(started&&api===options.api)return true;session++;started=true;api=options.api;phase='READY';let selected;try{selected=globalThis.brazaMonthDashboard?.getSnapshot?.()?.month;}catch{}if(!validMonth(selected))selected=todayMonth();status('Abra para consultar os registros salvos.');observe(selected);controls();return true;}
 function open(){if(!prepare())return false;el('Details').open=true;let selected;try{selected=globalThis.brazaMonthDashboard?.getSnapshot?.()?.month;}catch{}if(!monthPinned&&validMonth(selected)&&selected!==month)observe(selected);else load();return true;}
 function stop(){session++;readSequence++;started=false;api=null;view=null;monthPinned=false;readPromise=null;pendingAction=null;busy=false;loading=false;selectedSource='';selectedCase='';selectedLine='';drafts.clear();for(const kind of ['receive','inspect','void'])fields[kind]=null;status('Sessão encerrada. Entre novamente para consultar os controles físicos.');render();}
 globalThis.brazaPhysicalReturns=Object.freeze({start,bootstrapState,observe,open,stop,getSnapshot:()=>view?projectPhysicalReturnsWorkspace(view):null});prepare();controls();
})();
`;
