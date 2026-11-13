
(()=>{
 const el=id=>document.getElementById('costPeriods'+id),node=(tag,text,cls)=>{const row=document.createElement(tag);if(text!==undefined)row.textContent=text;if(cls)row.className=cls;return row;};
 const money=value=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(value/100),date=value=>value.split('-').reverse().join('/'),time=value=>value===null?'Sem coleta salva':new Date(value*1000).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'});
 let api=null,frame=null,promise=null,generation=0,stopped=true;
 function checked(value){
  const plain=row=>row!==null&&typeof row==='object'&&[Object.prototype,null].includes(Object.getPrototypeOf(row)),exact=(row,keys)=>plain(row)&&Reflect.ownKeys(row).length===keys.length&&keys.every(key=>Object.hasOwn(Object.getOwnPropertyDescriptor(row,key)||{},'value'));
  const int=row=>Number.isSafeInteger(row)&&!Object.is(row,-0)&&row>=0,nullable=row=>row===null||int(row),day=row=>typeof row==='string'&&/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$/.test(row)&&Number.isFinite(Date.parse(row+'T00:00:00Z'))&&new Date(row+'T00:00:00Z').toISOString().slice(0,10)===row;
  const array=(rows,max)=>Array.isArray(rows)&&Object.getPrototypeOf(rows)===Array.prototype&&rows.length<=max&&Reflect.ownKeys(rows).length===rows.length+1&&Array.from({length:rows.length},(_,i)=>Object.getOwnPropertyDescriptor(rows,String(i))).every(d=>d&&Object.hasOwn(d,'value'));
  const pending=['SOURCE_MISSING','SOURCE_UNAVAILABLE','SOURCE_STALE','PERIOD_INCOMPLETE','STATUS_REVIEW_REQUIRED','ORDER_LINES_MISSING','PRODUCTION_COST_INCOMPLETE','COSTS_UNAVAILABLE','ARITHMETIC_UNSAFE'];
  try{
   if(!exact(value,['schema','reference_month','checked_at','currency','basis','weekly','monthly'])||value.schema!=='production_cost_periods_v1'||typeof value.reference_month!=='string'||!/^\d{4}-(0[1-9]|1[0-2])$/.test(value.reference_month)||!int(value.checked_at)||value.checked_at>9999999999||value.currency!=='BRL'||value.basis!=='CURRENT_REGISTERED_COSTS_PAID_CREATE_DATE')return null;
   for(const [key,kind] of [['weekly','WEEK'],['monthly','MONTH']]){const p=value[key];
    if(!exact(p,['period','start_date','end_date','state','source_start_date','source_end_date','source_checked_at','calculated_at','production_cost_cents','known_production_cost_cents','coverage','versions','pending','sync_state','days'])||p.period!==kind||!day(p.start_date)||!day(p.end_date)||p.start_date>p.end_date||!['UNAVAILABLE','PARTIAL','COMPLETE'].includes(p.state)||!['IDLE','RUNNING'].includes(p.sync_state)||!int(p.calculated_at)||![p.source_checked_at,p.production_cost_cents,p.known_production_cost_cents].every(nullable)||![p.source_start_date,p.source_end_date].every(d=>d===null||day(d))||(p.source_start_date===null)!==(p.source_end_date===null)||p.source_start_date!==null&&p.source_start_date>p.source_end_date||!array(p.pending,9)||!p.pending.every(code=>pending.includes(code))||new Set(p.pending).size!==p.pending.length||!array(p.days,7))return null;
    const c=p.coverage;if(!exact(c,['orders','eligible_orders','excluded_cancelled','excluded_cancel_pending','excluded_unpaid','review_orders','total_units','known_units','pending_units','pending_variants'])||!['orders','eligible_orders','excluded_cancelled','excluded_cancel_pending','excluded_unpaid','review_orders','pending_units','pending_variants'].every(k=>int(c[k]))||!nullable(c.total_units)||!nullable(c.known_units)||c.known_units!==null&&c.total_units!==null&&c.known_units>c.total_units)return null;
    if(p.versions!==null&&(!exact(p.versions,['bindings','costs','cost_rules','classifications'])||!Object.values(p.versions).every(nullable)))return null;
    if(p.state==='COMPLETE'&&(p.production_cost_cents===null||p.pending.length||p.production_cost_cents!==p.known_production_cost_cents||p.source_checked_at===null||p.versions===null||c.total_units===null||c.known_units!==c.total_units||c.pending_units!==0||c.pending_variants!==0)||p.state!=='COMPLETE'&&p.production_cost_cents!==null)return null;
    const seen=new Set();for(const d of p.days){if(!exact(d,['date','eligible_orders','total_units','known_units','pending_units','known_production_cost_cents','production_cost_cents'])||!day(d.date)||d.date<p.start_date||d.date>p.end_date||seen.has(d.date)||!int(d.eligible_orders)||!int(d.pending_units)||!['total_units','known_units','known_production_cost_cents','production_cost_cents'].every(k=>nullable(d[k])))return null;seen.add(d.date);}
   }
   return JSON.parse(JSON.stringify(value));
  }catch{return null;}
 }
 function controls(busy){for(const key of ['Month','Refresh','Sync'])el(key).disabled=busy;}
 function panel(target,title,p){
  const out=[node('h3',title),node('p',date(p.start_date)+' a '+date(p.end_date),'field-help')];
  if(p.state==='COMPLETE')out.push(node('p',money(p.production_cost_cents),'cost-period-amount'),node('p','Referência de custo das vendas','field-help'));
  else if(p.known_production_cost_cents!==null)out.push(node('p',money(p.known_production_cost_cents),'cost-period-amount'),node('p','Identificado até agora · subtotal parcial','field-help'));
  else out.push(node('p','Aguardando dados','cost-period-amount'));
  const c=p.coverage;out.push(node('p',c.eligible_orders+' pedido(s) pago(s) · '+(c.known_units===null?'Cobertura de peças em conferência':c.known_units+' de '+(c.total_units===null?'—':c.total_units)+' unidade(s) com custo'),'field-help'));
  if(c.pending_units||c.pending_variants)out.push(node('p',c.pending_units+' unidade(s) sem custo · '+c.pending_variants+' variação(ões) para revisar.','field-help'));
  const exclusions=c.excluded_cancelled+c.excluded_cancel_pending+c.excluded_unpaid;if(exclusions)out.push(node('p',exclusions+' pedido(s) excluído(s): cancelados, em cancelamento ou não pagos.','field-help'));
  if(p.pending.includes('PERIOD_INCOMPLETE'))out.push(node('p','A coleta ainda não cobre todas as datas deste período.','field-help'));
  if(p.pending.includes('SOURCE_STALE'))out.push(node('p','A fonte precisa de uma nova atualização. Os custos usam os dados salvos abaixo.','field-help'));
  if(p.pending.includes('STATUS_REVIEW_REQUIRED'))out.push(node('p','Há pedidos em revisão ou devolução; o total permanece parcial.','field-help'));
  if(p.pending.some(code=>['COSTS_UNAVAILABLE','ARITHMETIC_UNSAFE','ORDER_LINES_MISSING'].includes(code)))out.push(node('p','Parte dos dados não pôde ser conferida. O total completo não está disponível.','field-help'));
  if(p.sync_state==='RUNNING')out.push(node('p','Atualização dos pedidos em andamento. Recalcule em instantes.','field-help'));
  out.push(node('p','Fonte: '+time(p.source_checked_at)+(p.source_start_date===null?'':' · '+date(p.source_start_date)+' a '+date(p.source_end_date)),'field-help'));
  if(p.versions)out.push(node('p','Custos v'+(p.versions.costs??'—')+' · regras v'+(p.versions.cost_rules??'—')+' · vínculos v'+(p.versions.bindings??'—'),'field-help'));
  target.replaceChildren(...out);
 }
 function render(){if(!frame)return;panel(el('Weekly'),'Esta semana',frame.weekly);panel(el('Monthly'),'Mês selecionado',frame.monthly);el('Days').hidden=!frame.weekly.days.length;el('DaysBody').replaceChildren(...frame.weekly.days.map(d=>{const row=node('div',undefined,'cost-period-day');row.append(node('span',date(d.date)+' · '+d.eligible_orders+' pedido(s)'),node('span',d.production_cost_cents!==null?money(d.production_cost_cents):d.known_production_cost_cents!==null?money(d.known_production_cost_cents)+' · parcial':'Pendente'));return row;}));}
 function refresh({sync=false}={}){
  if(stopped||!api)return Promise.resolve(false);if(promise)return promise;const month=el('Month').value;if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)){el('Message').textContent='Escolha um mês válido.';return Promise.resolve(false);}const seq=generation;controls(true);el('Message').textContent=sync?'Consultando os pedidos desta semana…':'Aplicando os custos atuais aos pedidos salvos…';
  const task=(async()=>{try{const raw=sync?await api('production-costs/periods',{operation:'sync',month}):await api('production-costs/periods?month='+encodeURIComponent(month));if(stopped||seq!==generation)return false;const next=checked(raw);if(!next||next.reference_month!==month)throw Error('INVALID');frame=next;render();globalThis.mlsAgentRegistry?.notify?.();el('Message').textContent=sync?'Consulta da semana concluída. Confira a cobertura e o horário da fonte.':'Custos recalculados nos dados salvos. A data da fonte foi preservada.';return true;}catch{if(!stopped&&seq===generation)el('Message').textContent='Não foi possível conferir os custos do período. Os últimos valores continuam visíveis; tente novamente.';return false;}finally{if(seq===generation){promise=null;controls(false);}}})();promise=task;return task;
 }
 function getSnapshot(){
  if(stopped||frame?.schema!=='production_cost_periods_v1')return null;
  const month=frame.monthly,coverage=month?.coverage;
  if(!month||!coverage)return null;
  const eligible=value=>Number.isSafeInteger(value)&&value>=0?value:null;
  return Object.freeze({schema:'mls_agent_production_period_v1',reference_month:frame.reference_month,
   checked_at:eligible(frame.checked_at),source_checked_at:eligible(month.source_checked_at),
   state:['COMPLETE','PARTIAL','UNAVAILABLE'].includes(month.state)?month.state:null,
   eligible_orders:eligible(coverage.eligible_orders),total_units:eligible(coverage.total_units),
   known_units:eligible(coverage.known_units),pending_units:eligible(coverage.pending_units),
   cost_cents:eligible(month.production_cost_cents),known_cost_cents:eligible(month.known_production_cost_cents),
   basis:'CURRENT_REGISTERED_COSTS_PAID_CREATE_DATE'});
 }
 globalThis.brazaProductionCostPeriods={start(options={}){if(!el('Month')||typeof options.api!=='function')return Promise.resolve(false);api=options.api;stopped=false;generation++;promise=null;frame=null;if(!el('Month').value)el('Month').value=new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit'}).format(new Date());el('Refresh').onclick=()=>refresh();el('Sync').onclick=()=>refresh({sync:true});el('Month').onchange=()=>refresh();return refresh();},refresh:()=>refresh(),getSnapshot,stop(){stopped=true;generation++;promise=null;}};
})();

(()=>{
 const projectProductionConfirmationProposal=function projectProductionConfirmationProposal(value){
 const plain=v=>v!==null&&typeof v==='object'&&[Object.prototype,null].includes(Object.getPrototypeOf(v));
 const exact=(v,keys)=>plain(v)&&Reflect.ownKeys(v).length===keys.length&&keys.every(key=>Object.hasOwn(Object.getOwnPropertyDescriptor(v,key)||{},'value'));
 const list=(v,max)=>Array.isArray(v)&&Object.getPrototypeOf(v)===Array.prototype&&v.length<=max&&Reflect.ownKeys(v).length===v.length+1&&Array.from({length:v.length},(_,i)=>Object.getOwnPropertyDescriptor(v,String(i))).every(row=>row&&Object.hasOwn(row,'value'));
 const int=(v,min=0,max=Number.MAX_SAFE_INTEGER)=>Number.isSafeInteger(v)&&!Object.is(v,-0)&&v>=min&&v<=max;
 const hash=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
 const id=(v,zero=false)=>typeof v==='string'&&(zero?/^(0|[1-9][0-9]{0,19})$/:/^[1-9][0-9]{0,19}$/).test(v);
 const text=(v,max)=>typeof v==='string'&&v.trim().length>0&&v.length<=max&&!/[\u0000-\u001f\u007f-\u009f]/.test(v);
 const nullable=(v,max)=>v===null||text(v,max),adult=['P','M','G','GG','G1','G2','G3'],child=['2','4','6','8','10','12','14','16'];
 try{
  if(!exact(value,['schema','checked_at','state','reason','source','catalog','composition','cost','versions','basis'])||value.schema!=='production_confirmation_proposal_v1'||!int(value.checked_at,1,9999999999)||!['AVAILABLE','UNAVAILABLE'].includes(value.state)||value.basis!=='SAVED_CONTEXT_NOT_MANUFACTURING_CONFIRMATION')return null;
  const s=value.source,c=value.catalog,p=value.composition,k=value.cost,v=value.versions;
  if(value.state==='UNAVAILABLE'?(value.reason!=='SAVED_SOURCE_UNAVAILABLE'||s!==null):(value.reason!==null||!exact(s,['key','hash','checked_at','order_hash','order_status','selling_quantity','item_id','model_id','sku','model_name','quantity_basis'])||!hash(s.key)||!hash(s.hash)||!hash(s.order_hash)||!int(s.checked_at,1,value.checked_at)||!text(s.order_status,40)||!/^[A-Z][A-Z0-9_]{0,39}$/.test(s.order_status)||!int(s.selling_quantity,1,10000)||!id(s.item_id)||!id(s.model_id,true)||!nullable(s.sku,128)||!nullable(s.model_name,160)||s.quantity_basis!=='SAVED_SELLING_UNITS_NOT_PRODUCED_PIECES'))return null;
  if(!exact(c,['state','product_name','model_name','attributes','catalog_fingerprint','checked_at','classification_status','reason'])||!['AVAILABLE','UNKNOWN','CHANGED'].includes(c.state)||!nullable(c.product_name,1024)||!nullable(c.model_name,512)||!list(c.attributes,2)||c.catalog_fingerprint!==null&&!hash(c.catalog_fingerprint)||c.checked_at!==null&&!int(c.checked_at,1,value.checked_at)||c.classification_status!==null&&!['QUEUED','RUNNING','MATCHED','PARTIAL','REVIEW','RETRY_WAIT'].includes(c.classification_status)||!nullable(c.reason,80))return null;
  const names=new Set();for(const a of c.attributes){if(!exact(a,['name','value'])||!text(a.name,64)||!text(a.value,64)||names.has(a.name))return null;names.add(a.name);}
  if(c.state==='AVAILABLE'?(s===null||c.product_name===null||c.model_name===null||c.catalog_fingerprint===null||c.checked_at===null||c.classification_status===null||c.reason!==null):(c.attributes.length>0||c.model_name!==null||c.reason===null))return null;
  if(!exact(p,['state','basis','components','reason'])||!['SUGGESTED','UNKNOWN','AMBIGUOUS'].includes(p.state)||!['MANUAL_BINDING','CATALOG_BINDING','EXPLICIT_RECIPE','EXPLICIT_CHILD_RULE','SIZE_AXIS','UNKNOWN'].includes(p.basis)||!list(p.components,4)||!nullable(p.reason,80))return null;
  if(p.state==='SUGGESTED'?(!p.components.length||p.basis==='UNKNOWN'||p.reason!==null):(p.components.length!==0||p.basis!=='UNKNOWN'||p.reason===null))return null;
  const keys=new Set();for(const row of p.components){
   if(!exact(row,['key','quantity_per_commercial_unit','identity'])||!/^component-[1-4]$/.test(row.key)||keys.has(row.key)||row.quantity_per_commercial_unit!==null&&!int(row.quantity_per_commercial_unit,1,20))return null;keys.add(row.key);
   const i=row.identity;if(!exact(i,['artwork','color','size','garment_type','fit','item_id','model_id','sku'])||i.artwork!==null||!nullable(i.color,80)||i.size!==null&&![...adult,...child].includes(i.size)||!['ADULT','CHILD','UNKNOWN'].includes(i.garment_type)||!['MALE','FEMALE','UNKNOWN'].includes(i.fit)||s===null||i.item_id!==s.item_id||i.model_id!==s.model_id||i.sku!==s.sku||i.garment_type==='ADULT'&&!adult.includes(i.size)||i.garment_type==='CHILD'&&!child.includes(i.size)||p.basis==='SIZE_AXIS'&&(i.garment_type!=='UNKNOWN'||i.fit!=='UNKNOWN'||row.quantity_per_commercial_unit!==null))return null;
  }
  if(!exact(k,['state','currency','scope','unit_cost_cents','basis','reason'])||!['AVAILABLE','UNKNOWN'].includes(k.state)||k.currency!=='BRL'||k.scope!=='COMMERCIAL_UNIT'||k.basis!=='CURRENT_REGISTERED_COST_NOT_HISTORICAL_MANUFACTURING'||!nullable(k.reason,80)||(k.state==='AVAILABLE'?s===null||!int(k.unit_cost_cents,0)||k.reason!==null:k.unit_cost_cents!==null||k.reason===null))return null;
  if(!exact(v,['bindings','costs','cost_rules','classifications','historical'])||Object.values(v).some(row=>row!==null&&!int(row,1,2147483647))||k.state==='AVAILABLE'&&Object.values(v).some(row=>row===null))return null;
  if(s===null&&(c.state!=='UNKNOWN'||p.state!=='UNKNOWN'||k.state!=='UNKNOWN'||Object.values(v).some(row=>row!==null)))return null;
  return {schema:value.schema,checked_at:value.checked_at,state:value.state,reason:value.reason,source:s?{...s}:null,catalog:{...c,attributes:c.attributes.map(row=>({...row}))},composition:{...p,components:p.components.map(row=>({...row,identity:{...row.identity}}))},cost:{...k},versions:{...v},basis:value.basis};
 }catch{return null;}
};
 const buildProductionConfirmationPatch=function buildProductionConfirmationPatch(value,key,current={}){
 const proposal=projectProductionConfirmationProposal(value),row=proposal?.composition.components.find(component=>component.key===key);
 if(!proposal||proposal.state!=='AVAILABLE'||proposal.catalog.state!=='AVAILABLE'||!row)return {state:'UNAVAILABLE',patch:{},conflicts:[]};
 const patch={},conflicts=[],labels={color:'cor',size:'tamanho',garment_type:'segmento',fit:'corte',item_id:'produto',model_id:'variação',sku:'SKU'};
 for(const name of Object.keys(labels)){
  const suggested=row.identity[name],existing=current?.[name],blank=value=>value===null||value===undefined||value===''||['garment_type','fit'].includes(name)&&value==='UNKNOWN';
  if(blank(suggested))continue;
  if(blank(existing)){patch[name]=suggested;continue;}
  const canonical=value=>typeof value==='string'?value.trim().normalize('NFC'):'',left=canonical(existing),right=canonical(suggested);
  if((['color','size','garment_type','fit'].includes(name)?left.toUpperCase()!==right.toUpperCase():left!==right))conflicts.push(labels[name]);
 }
 return conflicts.length?{state:'CONFLICT',patch:{},conflicts}:{state:'READY',patch,conflicts:[]};
};
 const node=(tag,text)=>{const item=document.createElement(tag);if(text!==undefined)item.textContent=text;return item;},hash=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
 const money=value=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(value/100);
 const names={ADULT:'Adulto',CHILD:'Infantil',MALE:'Masculino',FEMALE:'Feminino',UNISEX:'Unissex',UNKNOWN:'Ainda não identificado'},manual='O preenchimento manual continua disponível.',prompt='Selecione um contexto salvo para consultar a sugestão. O lote manual continua disponível.';
 let api=null,host=null,onApply=null,readIdentity=null,isLocked=null,started=false,sequence=0,source=null,view=null,component='',message='',error=false;
 const locked=()=>!started||!!isLocked?.();
 const fact=(list,label,text)=>list.append(node('dt',label),node('dd',text??'Ainda não identificado'));
 function render(){
  if(!host)return;host.className='production-confirmation-proposal';host.dataset.error=String(error);host.replaceChildren(node('h4','Preencher com o catálogo salvo'));
  if(message){const status=node('p',message);status.setAttribute('role','status');host.append(status);}
  if(!view||view.state!=='AVAILABLE')return;
  const saved=view.source,composition=view.composition;host.append(node('strong',view.catalog.product_name||'Produto #'+saved.item_id),node('p',view.catalog.model_name||saved.model_name||'Variação sem nome salvo'));
  const facts=node('dl');fact(facts,'Produto / variação',saved.item_id+' / '+saved.model_id);fact(facts,'SKU',saved.sku);for(const row of view.catalog.attributes)fact(facts,row.name,row.value);host.append(facts);
  host.append(node('p',saved.selling_quantity+' unidade(s) do anúncio na fonte salva. Essa quantidade não define peças fabricadas.'));
  if(composition.components.length){
   const label=node('label','Escolha a peça cuja identidade deseja conferir'),select=node('select');select.setAttribute('aria-label','Peça da sugestão salva');select.dataset.proposalComponent='true';
   const empty=node('option','Selecione a peça');empty.value='';select.append(empty);
   for(const row of composition.components){const identity=row.identity,option=node('option',[names[identity.garment_type],identity.size||'Tamanho não identificado',names[identity.fit],row.quantity_per_commercial_unit===null?'Quantidade física não determinada':row.quantity_per_commercial_unit+' por unidade do anúncio'].join(' · '));option.value=row.key;select.append(option);}
   select.value=component;select.disabled=locked();select.onchange=()=>{component=select.value;message='';error=false;render();host?.querySelector('[data-proposal-component]')?.focus?.();};label.append(select);host.append(label);
   const selected=composition.components.find(row=>row.key===component);if(selected){const identity=node('dl');for(const [label,name] of [['Cor','color'],['Tamanho','size'],['Segmento','garment_type'],['Corte','fit']])fact(identity,label,names[selected.identity[name]]||selected.identity[name]);host.append(identity);}
   const button=node('button','Usar dados salvos');button.type='button';button.dataset.proposalAction='apply';button.disabled=locked()||!selected||view.catalog.state!=='AVAILABLE';button.onclick=apply;host.append(button);
  }else host.append(node('p','A composição não foi identificada com segurança. Preencha a identidade manualmente.'));
  host.append(node('p',view.cost.state==='AVAILABLE'?'Referência atual por unidade do anúncio: '+money(view.cost.unit_cost_cents)+'. Esse valor não é o custo histórico de uma peça.':'Custo atual da unidade do anúncio ainda não identificado.'));
  host.append(node('p','A sugestão preenche somente campos de identidade vazios. Confira a estampa, a fabricação real e o custo histórico antes de registrar.'));
  const details=node('details'),summary=node('summary','Fonte e versões dos dados salvos');details.append(summary,node('small','Contexto: '+saved.hash),node('small','Catálogo: '+(view.catalog.catalog_fingerprint||'não identificado')),node('small','Revisões: '+Object.entries(view.versions).map(([key,value])=>key+' '+(value??'não identificada')).join(' · ')));host.append(details);
 }
 function apply(){
  if(locked()||!view||!source||view.source?.key!==source.key||view.source?.hash!==source.hash)return false;
  let result;try{result=buildProductionConfirmationPatch(view,component,readIdentity());}catch{result=null;}
  if(!result||result.state==='UNAVAILABLE'){message='A sugestão não está disponível. '+manual;error=true;render();return false;}
  if(result.state==='CONFLICT'){message='Nada foi preenchido. Confira os campos que já possuem outra identidade: '+result.conflicts.join(', ')+'.';error=true;render();return false;}
  if(!Object.keys(result.patch).length){message='Os campos disponíveis já estão preenchidos. Confira a identidade física antes de registrar.';error=false;render();return false;}
  try{if(onApply({...result.patch},{source_key:source.key,source_hash:source.hash,component_key:component})!==true)throw Error();}catch{message='Não foi possível aplicar a sugestão. Seu preenchimento foi preservado.';error=true;render();return false;}
  message='Dados salvos aplicados aos campos vazios. Confirme novamente a identidade física, a produção e o custo histórico.';error=false;render();return true;
 }
 async function setSource(value){
  const token=++sequence;view=null;component='';source=null;error=false;
  if(locked())return false;
  if(!value?.key&&!value?.hash){message=prompt;render();return false;}
  if(!hash(value?.key)||!hash(value?.hash)){message='Selecione novamente um contexto salvo válido.';error=true;render();return false;}
  source={key:value.key,hash:value.hash};const selected={...source};message='Lendo os dados já salvos deste produto…';render();
  try{
   const result=projectProductionConfirmationProposal(await api('production/proposal?source_key='+encodeURIComponent(selected.key)+'&source_hash='+encodeURIComponent(selected.hash)));
   if(!started||token!==sequence)return false;
   if(!result||result.state==='AVAILABLE'&&(result.source.key!==selected.key||result.source.hash!==selected.hash))throw Error();
   view=result;component=result.composition.components.length===1?result.composition.components[0].key:'';message=result.state==='AVAILABLE'?'Confira a sugestão antes de usar. Nenhuma produção foi registrada.':'O contexto não está disponível. '+manual;error=result.state!=='AVAILABLE';render();return result.state==='AVAILABLE';
  }catch(cause){if(!started||token!==sequence)return false;view=null;message=(cause?.status===409?'O contexto salvo mudou. Recarregue os registros e selecione novamente. ':'Não foi possível ler a sugestão salva. ')+manual;error=true;render();return false;}
 }
 function start(options={}){
  if(typeof options.api!=='function'||!options.host||typeof options.host.replaceChildren!=='function'||typeof options.onApply!=='function'||typeof options.readIdentity!=='function')return false;
  sequence++;api=options.api;host=options.host;onApply=options.onApply;readIdentity=options.readIdentity;isLocked=typeof options.isLocked==='function'?options.isLocked:null;started=true;source=null;view=null;component='';error=false;message=prompt;render();return true;
 }
 function stop(){sequence++;started=false;source=null;view=null;component='';api=null;onApply=null;readIdentity=null;isLocked=null;if(host)host.replaceChildren();host=null;}
 function bootstrapState(value){if(['UNAUTHORIZED','LOCKED','LOGGED_OUT'].includes(value?.phase))stop();}
 function refresh(){if(!host)return;for(const select of host.querySelectorAll('select'))select.disabled=locked();const button=host.querySelector('[data-proposal-action="apply"]');if(button)button.disabled=locked()||!view?.composition.components.some(row=>row.key===component)||view.catalog.state!=='AVAILABLE';}
 globalThis.brazaProductionConfirmationProposal=Object.freeze({start,setSource,sourceChanged:setSource,stop,bootstrapState,refresh,getSnapshot:()=>view?projectProductionConfirmationProposal(view):null});
})();


(()=>{
 const projectIncurredProduction=function projectIncurredProduction(value){
 const plain=v=>v!==null&&typeof v==='object'&&[Object.prototype,null].includes(Object.getPrototypeOf(v));
 const exact=(v,keys)=>plain(v)&&Reflect.ownKeys(v).length===keys.length&&keys.every(key=>Object.hasOwn(Object.getOwnPropertyDescriptor(v,key)||{},'value'));
 const array=(v,max)=>Array.isArray(v)&&Object.getPrototypeOf(v)===Array.prototype&&v.length<=max&&Reflect.ownKeys(v).length===v.length+1&&Array.from({length:v.length},(_,i)=>Object.getOwnPropertyDescriptor(v,String(i))).every(d=>d&&Object.hasOwn(d,'value'));
 const int=(v,min=0,max=Number.MAX_SAFE_INTEGER)=>Number.isSafeInteger(v)&&!Object.is(v,-0)&&v>=min&&v<=max;
 const hash=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v),uuid=v=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(v);
 const text=(v,max)=>typeof v==='string'&&v.length>0&&v.length<=max&&v.trim()===v&&v.normalize('NFC')===v&&!/[\u0000-\u001f\u007f-\u009f]/.test(v);
 const nullable=(v,max)=>v===null||text(v,max),id=(v,zero=false)=>v===null||typeof v==='string'&&(zero?/^(0|[1-9][0-9]{0,19})$/:/^[1-9][0-9]{0,19}$/).test(v);
 const date=v=>typeof v==='string'&&/^20\d{2}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(v)&&Number.isFinite(Date.parse(v+'T12:00:00Z'))&&new Date(v+'T12:00:00Z').toISOString().slice(0,10)===v;
 const dayFormatter=new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo'}),encoder=new TextEncoder(),day=stamp=>dayFormatter.format(new Date(stamp*1000));
 const normalized=v=>v.normalize('NFKC').toLowerCase().replace(/\s+/g,' ');
 const identity=v=>exact(v,['artwork','color','size','garment_type','fit','confirmed','item_id','model_id','sku'])&&nullable(v.artwork,120)&&nullable(v.color,80)&&nullable(v.size,16)&&['ADULT','CHILD','UNKNOWN'].includes(v.garment_type)&&['UNISEX','MALE','FEMALE','UNKNOWN'].includes(v.fit)&&typeof v.confirmed==='boolean'&&id(v.item_id)&&id(v.model_id,true)&&nullable(v.sku,128)&&(!v.confirmed||v.artwork!==null&&v.color!==null&&v.size!==null&&v.fit!=='UNKNOWN'&&(v.garment_type==='ADULT'?['P','M','G','GG','G1','G2','G3'].includes(v.size):v.garment_type==='CHILD'&&['2','4','6','8','10','12','14','16'].includes(v.size)));
 const reference=(v,who,amount)=>v===null||exact(v,['kind','revision','mode','unit_cost_cents'])&&['ADULT_REGULAR','ADULT_PLUS'].includes(v.kind)&&int(v.revision,1,2147483647)&&v.mode==='all_inclusive'&&int(v.unit_cost_cents,0,1000000)&&v.unit_cost_cents===amount&&who.garment_type==='ADULT'&&(v.kind==='ADULT_REGULAR'?['P','M','G','GG']:['G1','G2','G3']).includes(who.size);
 const source=(v,stamp)=>exact(v,['kind','key','hash','checked_at','order_hash','order_status','selling_quantity'])&&(v.kind==='MANUAL_LOT'?['key','hash','checked_at','order_hash','order_status','selling_quantity'].every(key=>v[key]===null):v.kind==='SAVED_DTF_ORDER_LINE'&&hash(v.key)&&hash(v.hash)&&int(v.checked_at,1,stamp)&&hash(v.order_hash)&&typeof v.order_status==='string'&&/^[A-Z][A-Z0-9_]{0,39}$/.test(v.order_status)&&int(v.selling_quantity,1,10000));
 const keys=['active_records','voided_records','produced_quantity','known_cost_quantity','unknown_cost_quantity','known_cost_cents','total_cost_cents','state'];
 try{
  if(!exact(value,['schema','checked_at','revision','records','summary','inventory_valuation','financial_integration_allowed','external_stock_write_allowed','basis'])||value.schema!=='incurred_production_v1'||!int(value.checked_at,1,9999999999)||!int(value.revision,0,2147483645)||!array(value.records,1000)||!exact(value.summary,keys)||!exact(value.inventory_valuation,['state','amount_cents'])||value.inventory_valuation.state!=='UNKNOWN'||value.inventory_valuation.amount_cents!==null||value.financial_integration_allowed!==false||value.external_stock_write_allowed!==false||value.basis!=='OPERATOR_CONFIRMED_INCURRED_PRODUCTION_NOT_PAID_CASH_OR_SALES_REFERENCE')return null;
  const rows=new Map(),activeRefs=new Set(),roots=new Set(),replaced=new Set();let active=0,voided=0,quantity=0n,knownQuantity=0n,unknownQuantity=0n,known=0n;
  for(const row of value.records){
   if(!exact(row,['record_id','production_ref','replaces_record_id','produced_date','quantity','identity','source','cost','evidence','status','recorded_at','updated_at','void_reason'])||!uuid(row.record_id)||rows.has(row.record_id)||!text(row.production_ref,120)||row.replaces_record_id!==null&&!uuid(row.replaces_record_id)||!date(row.produced_date)||!int(row.quantity,1,10000)||!identity(row.identity)||!text(row.evidence,240)||!['ACTIVE','VOID'].includes(row.status)||!int(row.recorded_at,1,value.checked_at)||!int(row.updated_at,row.recorded_at,value.checked_at)||row.produced_date>day(row.recorded_at)||!source(row.source,row.recorded_at)||!exact(row.cost,['state','currency','unit_cost_cents','reference','inventory_value_cents'])||row.cost.currency!=='BRL'||row.cost.inventory_value_cents!==null)return null;
   if(row.status==='ACTIVE'?row.void_reason!==null:!text(row.void_reason,240))return null;
   if(row.cost.state==='UNKNOWN'){if(row.cost.unit_cost_cents!==null||row.cost.reference!==null)return null;}
   else if(row.cost.state!=='DECLARED'||!int(row.cost.unit_cost_cents,0,1000000)||!reference(row.cost.reference,row.identity,row.cost.unit_cost_cents))return null;
   const ref=normalized(row.production_ref);
   if(row.replaces_record_id===null){if(roots.has(ref))return null;roots.add(ref);}
   else{if(replaced.has(row.replaces_record_id))return null;replaced.add(row.replaces_record_id);}
   rows.set(row.record_id,row);
   if(row.status==='VOID')voided++;
   else{
    if(activeRefs.has(ref))return null;activeRefs.add(ref);active++;quantity+=BigInt(row.quantity);
    if(row.cost.state==='UNKNOWN')unknownQuantity+=BigInt(row.quantity);
    else{knownQuantity+=BigInt(row.quantity);known+=BigInt(row.quantity)*BigInt(row.cost.unit_cost_cents);}
   }
   if(encoder.encode(JSON.stringify(row)).byteLength>8192)return null;
  }
  for(const row of rows.values())if(row.replaces_record_id!==null){
   const parent=rows.get(row.replaces_record_id);if(!parent||parent.status!=='VOID'||normalized(parent.production_ref)!==normalized(row.production_ref)||parent.updated_at>row.recorded_at)return null;
   const seen=new Set([row.record_id]);let link=row;
   while(link.replaces_record_id!==null){if(seen.has(link.replaces_record_id))return null;seen.add(link.replaces_record_id);link=rows.get(link.replaces_record_id);if(!link)return null;}
  }
  if(quantity>BigInt(Number.MAX_SAFE_INTEGER)||knownQuantity>BigInt(Number.MAX_SAFE_INTEGER)||unknownQuantity>BigInt(Number.MAX_SAFE_INTEGER)||known>BigInt(Number.MAX_SAFE_INTEGER)||value.revision<rows.size||value.revision===0&&rows.size!==0||value.revision>0&&rows.size===0)return null;
  const expected={active_records:active,voided_records:voided,produced_quantity:Number(quantity),known_cost_quantity:Number(knownQuantity),unknown_cost_quantity:Number(unknownQuantity),known_cost_cents:Number(known),total_cost_cents:active===0||unknownQuantity>0n?null:Number(known),state:active===0?'NO_RECORDS':unknownQuantity>0n?'PARTIAL_COSTS':'DECLARED_COSTS'};
  if(!keys.every(key=>value.summary[key]===expected[key])||encoder.encode(JSON.stringify(value)).byteLength>1048576)return null;
  return JSON.parse(JSON.stringify(value));
 }catch{return null;}
};
 const incurredProductionPeriods=function incurredProductionPeriods(ledger,selection){
 try{
  const frame=projectIncurredProduction(ledger),plain=v=>v!==null&&typeof v==='object'&&[Object.prototype,null].includes(Object.getPrototypeOf(v));
  const exact=(v,keys)=>plain(v)&&Reflect.ownKeys(v).length===keys.length&&keys.every(key=>Object.hasOwn(Object.getOwnPropertyDescriptor(v,key)||{},'value'));
  const date=v=>typeof v==='string'&&/^20\d{2}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(v)&&Number.isFinite(Date.parse(v+'T12:00:00Z'))&&new Date(v+'T12:00:00Z').toISOString().slice(0,10)===v;
  if(!frame||!exact(selection,['month','week_of']))return null;
  const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo'}).format(new Date(frame.checked_at*1000)),{month,week_of}=selection;
  if(typeof month!=='string'||!/^20\d{2}-(0[1-9]|1[0-2])$/.test(month)||month>today.slice(0,7)||!date(week_of)||week_of>today)return null;
  const at=new Date(week_of+'T12:00:00Z');at.setUTCDate(at.getUTCDate()-(at.getUTCDay()+6)%7);const weekStart=at.toISOString().slice(0,10);at.setUTCDate(at.getUTCDate()+6);const weekEnd=at.toISOString().slice(0,10),last=new Date(Date.UTC(Number(month.slice(0,4)),Number(month.slice(5,7)),0,12)).toISOString().slice(0,10);
  const period=(start_date,end_date)=>{
   let active=0,voided=0,quantity=0n,knownQuantity=0n,unknownQuantity=0n,known=0n;
   for(const row of frame.records){if(row.produced_date<start_date||row.produced_date>end_date)continue;if(row.status==='VOID'){voided++;continue;}active++;quantity+=BigInt(row.quantity);if(row.cost.state==='UNKNOWN')unknownQuantity+=BigInt(row.quantity);else{knownQuantity+=BigInt(row.quantity);known+=BigInt(row.quantity)*BigInt(row.cost.unit_cost_cents);}}
   if([quantity,knownQuantity,unknownQuantity,known].some(v=>v>BigInt(Number.MAX_SAFE_INTEGER)))return null;
   return {start_date,end_date,summary:{active_records:active,voided_records:voided,produced_quantity:Number(quantity),known_cost_quantity:Number(knownQuantity),unknown_cost_quantity:Number(unknownQuantity),known_cost_cents:Number(known),total_cost_cents:active===0||unknownQuantity>0n?null:Number(known),state:active===0?'NO_RECORDS':unknownQuantity>0n?'PARTIAL_COSTS':'DECLARED_COSTS'}};
  };
  const monthly=period(month+'-01',last<today?last:today),weekly=period(weekStart,weekEnd<today?weekEnd:today);if(!monthly||!weekly)return null;
  return {month,week_of,monthly,weekly};
 }catch{return null;}
};
 const incurredProductionRange=function incurredProductionRange(ledger,selection){
 try{
  const frame=projectIncurredProduction(ledger),plain=v=>v!==null&&typeof v==='object'&&[Object.prototype,null].includes(Object.getPrototypeOf(v));
  const exact=(v,keys)=>plain(v)&&Reflect.ownKeys(v).length===keys.length&&keys.every(key=>Object.hasOwn(Object.getOwnPropertyDescriptor(v,key)||{},'value'));
  const date=v=>typeof v==='string'&&/^20\d{2}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(v)&&Number.isFinite(Date.parse(v+'T12:00:00Z'))&&new Date(v+'T12:00:00Z').toISOString().slice(0,10)===v;
  if(!frame||!exact(selection,['start_date','end_date']))return null;
  const {start_date,end_date}=selection,today=new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo'}).format(new Date(frame.checked_at*1000));
  if(!date(start_date)||!date(end_date)||start_date>end_date||end_date>today)return null;
  const first=Date.parse(start_date+'T12:00:00Z'),last=Date.parse(end_date+'T12:00:00Z'),span=(last-first)/86400000+1;
  if(!Number.isInteger(span)||span<1||span>366)return null;
  const empty=()=>({active:0,voided:0,quantity:0n,knownQuantity:0n,unknownQuantity:0n,known:0n}),total=empty(),days=new Map();
  for(let at=first;at<=last;at+=86400000)days.set(new Date(at).toISOString().slice(0,10),empty());
  const add=(group,row)=>{if(row.status==='VOID'){group.voided++;return;}group.active++;group.quantity+=BigInt(row.quantity);if(row.cost.state==='UNKNOWN')group.unknownQuantity+=BigInt(row.quantity);else{group.knownQuantity+=BigInt(row.quantity);group.known+=BigInt(row.quantity)*BigInt(row.cost.unit_cost_cents);}};
  for(const row of frame.records){const group=days.get(row.produced_date);if(!group)continue;add(group,row);add(total,row);}
  const summary=group=>{
   if([group.quantity,group.knownQuantity,group.unknownQuantity,group.known].some(v=>v>BigInt(Number.MAX_SAFE_INTEGER)))return null;
   return {active_records:group.active,voided_records:group.voided,produced_quantity:Number(group.quantity),known_cost_quantity:Number(group.knownQuantity),unknown_cost_quantity:Number(group.unknownQuantity),known_cost_cents:Number(group.known),total_cost_cents:group.active===0||group.unknownQuantity>0n?null:Number(group.known),state:group.active===0?'NO_RECORDS':group.unknownQuantity>0n?'PARTIAL_COSTS':'DECLARED_COSTS'};
  };
  const totals=summary(total),daily=[...days].map(([date,group])=>({date,summary:summary(group)}));if(!totals||daily.some(row=>!row.summary))return null;
  return {schema:'incurred_production_range_v1',checked_at:frame.checked_at,revision:frame.revision,start_date,end_date,timezone:'America/Sao_Paulo',basis:'RECORDED_MANUFACTURE_DATE_NOT_SALES_OR_PAID_CASH',summary:totals,days:daily};
 }catch{return null;}
};
 const buildIncurredProductionAnalytics=function buildIncurredProductionAnalytics(ledger,selection){
 try{
  const plain=value=>value!==null&&typeof value==='object'&&[Object.prototype,null].includes(Object.getPrototypeOf(value));
  const exact=(value,keys)=>plain(value)&&Reflect.ownKeys(value).length===keys.length&&keys.every(key=>Object.hasOwn(Object.getOwnPropertyDescriptor(value,key)||{},'value'));
  const date=value=>typeof value==='string'&&/^20\d{2}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(value)&&Number.isFinite(Date.parse(value+'T12:00:00Z'))&&new Date(value+'T12:00:00Z').toISOString().slice(0,10)===value;
  if(!exact(selection,['month','selected_date']))return null;
  const {month,selected_date}=selection,frame=projectIncurredProduction(ledger);
  if(!frame||typeof month!=='string'||!/^20\d{2}-(0[1-9]|1[0-2])$/.test(month)||!date(selected_date)||selected_date.slice(0,7)!==month)return null;
  const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo'}).format(new Date(frame.checked_at*1000));
  if(month>today.slice(0,7)||selected_date>today)return null;
  const monthLast=new Date(Date.UTC(Number(month.slice(0,4)),Number(month.slice(5,7)),0,12)).toISOString().slice(0,10);
  const start_date=month+'-01',end_date=monthLast<today?monthLast:today;
  const range=incurredProductionRange(frame,{start_date,end_date});
  if(!range)return null;
  const selected=range.days.find(row=>row.date===selected_date);
  if(!selected)return null;
  const active=range.days.filter(row=>row.summary.active_records>0);
  const highest_cost={state:range.summary.state==='NO_RECORDS'?'NO_RECORDS':range.summary.unknown_cost_quantity>0?'UNKNOWN_COSTS':'AVAILABLE',amount_cents:null,dates:[]};
  // A partial day is a lower bound, not evidence of the month's largest cost.
  // An explicit zero-cost manufactured piece is different from an empty day.
  if(highest_cost.state==='AVAILABLE'){
   highest_cost.amount_cents=Math.max(...active.map(row=>row.summary.total_cost_cents));
   highest_cost.dates=active.filter(row=>row.summary.total_cost_cents===highest_cost.amount_cents).map(row=>row.date);
  }
  const highest_quantity={state:active.length?'AVAILABLE':'NO_RECORDS',produced_quantity:null,dates:[]};
  if(active.length){
   highest_quantity.produced_quantity=Math.max(...active.map(row=>row.summary.produced_quantity));
   highest_quantity.dates=active.filter(row=>row.summary.produced_quantity===highest_quantity.produced_quantity).map(row=>row.date);
  }
  return {schema:'incurred_production_analytics_v1',checked_at:frame.checked_at,revision:frame.revision,month,start_date,end_date,timezone:'America/Sao_Paulo',basis:'RECORDED_MANUFACTURE_DATE_HISTORICAL_COSTS_NOT_SALES_OR_CASH',summary:{...range.summary},days:range.days.map(row=>({date:row.date,summary:{...row.summary}})),selected_day:{date:selected_date,summary:{...selected.summary}},history_months:[...new Set(frame.records.map(row=>row.produced_date.slice(0,7)))].sort().reverse(),highest_cost,highest_quantity,financial_integration_allowed:false,actual_profit_cents:null};
 }catch{return null;}
};
 const projectIncurredProductionWorkspace=function projectIncurredProductionWorkspace(value){
 try{
  const plain=v=>v!==null&&typeof v==='object'&&[Object.prototype,null].includes(Object.getPrototypeOf(v));
  const exact=(v,keys)=>plain(v)&&Reflect.ownKeys(v).length===keys.length&&keys.every(key=>Object.hasOwn(Object.getOwnPropertyDescriptor(v,key)||{},'value'));
  const integer=(v,min=0,max=Number.MAX_SAFE_INTEGER)=>Number.isSafeInteger(v)&&!Object.is(v,-0)&&v>=min&&v<=max;
  const stamp=v=>integer(v,1,9999999999),hash=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
  const text=(v,max)=>v===null||typeof v==='string'&&v.length>0&&v.length<=max&&v.trim()===v&&v.normalize('NFC')===v&&!/[\u0000-\u001f\u007f-\u009f]/.test(v);
  const id=(v,zero=false)=>v===null||typeof v==='string'&&(zero?/^(0|[1-9][0-9]{0,19})$/:/^[1-9][0-9]{0,19}$/).test(v);
  const array=(v,max)=>Array.isArray(v)&&Object.getPrototypeOf(v)===Array.prototype&&v.length<=max&&Reflect.ownKeys(v).length===v.length+1&&Array.from({length:v.length},(_,i)=>Object.hasOwn(Object.getOwnPropertyDescriptor(v,String(i))||{},'value')).every(Boolean);
  if(!exact(value,['schema','month','week_of','checked_at','ledger','periods','source','references'])||value.schema!=='incurred_production_workspace_v1'||!stamp(value.checked_at))return null;
  const ledger=projectIncurredProduction(value.ledger);if(!ledger||ledger.checked_at>value.checked_at)return null;
  const periods=incurredProductionPeriods(ledger,{month:value.month,week_of:value.week_of});
  const summaryKeys=['active_records','voided_records','produced_quantity','known_cost_quantity','unknown_cost_quantity','known_cost_cents','total_cost_cents','state'];
  if(!periods||!exact(value.periods,['month','week_of','monthly','weekly'])||value.periods.month!==periods.month||value.periods.week_of!==periods.week_of)return null;
  for(const kind of ['monthly','weekly']){const row=value.periods[kind],expected=periods[kind];if(!exact(row,['start_date','end_date','summary'])||row.start_date!==expected.start_date||row.end_date!==expected.end_date||!exact(row.summary,summaryKeys)||summaryKeys.some(key=>row.summary[key]!==expected.summary[key]))return null;}
  const source=value.source,refs=value.references;
  if(!exact(source,['status','checked_at','included','has_more','reason','candidates'])||!['AVAILABLE','PARTIAL','UNAVAILABLE'].includes(source.status)||source.checked_at!==null&&(!stamp(source.checked_at)||source.checked_at>value.checked_at)||!integer(source.included,0,50)||typeof source.has_more!=='boolean'||!array(source.candidates,50)||source.included!==source.candidates.length)return null;
  if(source.status==='AVAILABLE'&&(source.has_more||source.reason!==null)||source.status==='PARTIAL'&&(!source.has_more||source.reason!=='SAVED_DTF_INCOMPLETE')||source.status==='UNAVAILABLE'&&(source.checked_at!==null||source.included!==0||!source.has_more||source.reason!=='SAVED_DTF_UNAVAILABLE'))return null;
  const seen=new Set(),candidates=[];
  for(const row of source.candidates){if(!exact(row,['key','hash','checked_at','order_hash','order_status','selling_quantity','item_id','model_id','sku','model_name','quantity_basis'])||!hash(row.key)||!hash(row.hash)||!hash(row.order_hash)||seen.has(row.key)||!stamp(row.checked_at)||row.checked_at>value.checked_at||typeof row.order_status!=='string'||!/^[A-Z][A-Z0-9_]{0,39}$/.test(row.order_status)||!integer(row.selling_quantity,1,10000)||!id(row.item_id)||!id(row.model_id,true)||!text(row.sku,128)||!text(row.model_name,160)||row.quantity_basis!=='SAVED_SELLING_UNITS_NOT_PRODUCED_PIECES')return null;seen.add(row.key);candidates.push({...row});}
  if(!exact(refs,['status','revision','mode','adult_regular_cents','adult_plus_cents'])||!['AVAILABLE','UNAVAILABLE'].includes(refs.status)||refs.revision!==null&&!integer(refs.revision,1,2147483647)||![null,'all_inclusive','itemized'].includes(refs.mode)||![refs.adult_regular_cents,refs.adult_plus_cents].every(v=>v===null||integer(v,0,1000000)))return null;
  if(refs.status==='UNAVAILABLE'&&[refs.revision,refs.mode,refs.adult_regular_cents,refs.adult_plus_cents].some(v=>v!==null)||refs.status==='AVAILABLE'&&(refs.revision===null||refs.mode===null)||refs.mode==='itemized'&&(refs.adult_regular_cents!==null||refs.adult_plus_cents!==null))return null;
  return {schema:value.schema,month:value.month,week_of:value.week_of,checked_at:value.checked_at,ledger,periods,source:{...source,candidates},references:{...refs}};
 }catch{return null;}
};
 const el=name=>document.getElementById('incurredProduction'+name),node=(tag,text,cls)=>{const value=document.createElement(tag);if(text!==undefined)value.textContent=text;if(cls)value.className=cls;return value;};
 const proposalHost=el('Proposal'),proposal=()=>globalThis.brazaProductionConfirmationProposal;
 const today=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo'}).format(new Date());
 const date=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)?value.slice(8)+'/'+value.slice(5,7)+'/'+value.slice(0,4):'Ainda não informada';
 const time=value=>Number.isSafeInteger(value)&&value>0?new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Sao_Paulo',dateStyle:'short',timeStyle:'short'}).format(new Date(value*1000)):'Sem leitura confirmada';
 const count=value=>new Intl.NumberFormat('pt-BR').format(value);
 const money=value=>{if(!Number.isSafeInteger(value))return 'Ainda não apurado';const amount=BigInt(value),whole=amount/100n,fraction=String(amount%100n).padStart(2,'0');return new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).formatToParts(whole).map(part=>part.type==='fraction'?fraction:part.value).join('');};
 const inputMoney=value=>Number.isSafeInteger(value)?String(BigInt(value)/100n)+','+String(BigInt(value)%100n).padStart(2,'0'):'';
 const validDay=value=>typeof value==='string'&&/^20\d{2}-\d{2}-\d{2}$/.test(value)&&value<=today()&&Number.isFinite(Date.parse(value+'T00:00:00Z'))&&new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;
 const validMonth=value=>typeof value==='string'&&/^20\d{2}-(0[1-9]|1[0-2])$/.test(value)&&value<=today().slice(0,7);
 const failures={INCURRED_PRODUCTION_RETURN_LINK_ACTIVE:'Desfaça o vínculo em Devoluções → Vínculo com a produção antes de anular ou substituir esta fabricação.',INCURRED_PRODUCTION_REFERENCE_CONFLICT:'Essa referência de produção já está ativa. Confira o histórico antes de lançar outra vez.',INCURRED_PRODUCTION_REPLACEMENT_REQUIRED:'Essa referência já possui histórico anulado. Selecione explicitamente o registro que será substituído.',INCURRED_PRODUCTION_REPLACEMENT_INVALID:'O registro escolhido não pode ser substituído. Confira o histórico atualizado.',INCURRED_PRODUCTION_SOURCE_CHANGED:'O contexto DTF mudou ou não está mais disponível. Escolha novamente a fonte salva ou use lote manual.',INCURRED_PRODUCTION_REFERENCE_CHANGED:'A referência de custo mudou. Confira o valor histórico e selecione novamente a sugestão, ou informe custo manual.',INCURRED_PRODUCTION_RECORD_VOID:'Este lançamento já foi anulado. Seu histórico permanece preservado.',INCURRED_PRODUCTION_RECORD_NOT_FOUND:'O registro não foi localizado na leitura atual. Seus rascunhos foram preservados.',INCURRED_PRODUCTION_LIMIT:'O limite deste histórico foi atingido. Os registros existentes foram preservados.',INCURRED_PRODUCTION_REQUEST_INVALID:'Confira data, referência, quantidade, identidade e confirmação do custo antes de enviar.'};
 let api=null,started=false,prepared=false,month='',weekOf='',rangeStart='',rangeEnd='',rangeDraft=null,rangeView=null,rangeLedger=null,rangeScope='',historyMonth='',historyDay='',analyticsView=null,analyticsLedger=null,analyticsScope='',analyticsInitialized=false,view=null,session=0,sequence=0,loading=false,busy=false,readPromise=null,pendingAction=null,draft=null,mainFields=null,voidFields=null,selectedRecord='',page=0,message='Abra para consultar os registros salvos.',errorState=false;
 const voidDrafts=new Map();let draftEdited=false;
 function status(text,error=false){message=text;errorState=error;if(el('Status')){el('Status').textContent=text;el('Status').dataset.error=String(error);}}
 function selected(){return view?.ledger.records.find(row=>row.record_id===selectedRecord)??null;}
 function readFields(fields){return Object.fromEntries(Object.entries(fields||{}).map(([name,input])=>[name,input.type==='checkbox'?input.checked:input.value]));}
 function rememberMain(){if(mainFields)draft={...draft,...readFields(mainFields)};}
 function rememberVoid(){if(voidFields&&selectedRecord)voidDrafts.set(selectedRecord,readFields(voidFields).reason);}
 function controls(){
  const locked=!started||busy||pendingAction!==null;
  for(const name of ['Month','Week'])if(el(name)){el(name).disabled=locked;el(name).max=name==='Month'?today().slice(0,7):today();el(name).value=name==='Month'?month:weekOf;}
  for(const name of ['Start','End'])if(el(name)){el(name).disabled=locked;el(name).max=today();el(name).value=rangeDraft?.[name==='Start'?'start_date':'end_date']??(name==='Start'?rangeStart:rangeEnd);}
  for(const name of ['ApplyRange','ThisWeek','ThisMonth'])if(el(name))el(name).disabled=locked||!view;
  if(el('HistoryMonth')){el('HistoryMonth').disabled=locked||!view;el('HistoryMonth').max=view?new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo'}).format(new Date(view.ledger.checked_at*1000)).slice(0,7):today().slice(0,7);el('HistoryMonth').value=historyMonth;}
  if(el('Day')){el('Day').disabled=locked||!view;el('Day').max=view?new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo'}).format(new Date(view.ledger.checked_at*1000)):today();el('Day').value=historyDay;}
  for(const button of el('MonthDays')?.querySelectorAll?.('button')||[])button.disabled=locked;
  for(const button of el('HighestCost')?.querySelectorAll?.('button')||[])button.disabled=locked;
  for(const name of ['RegisterDay','ConfirmDay'])if(el(name))el(name).disabled=locked||loading||!view;
  for(const bar of el('CostChart')?.querySelectorAll?.('[data-production-cost-date]')||[]){bar.setAttribute('aria-disabled',String(locked));bar.setAttribute('tabindex',locked?'-1':'0');}
  if(el('Reload'))el('Reload').disabled=!started||busy||loading;if(el('Retry')){el('Retry').hidden=pendingAction===null;el('Retry').disabled=!started||busy;}
  if(el('Record'))el('Record').disabled=locked||!view?.ledger.records.length;
  for(const fields of [mainFields,voidFields])for(const input of Object.values(fields||{}))input.disabled=locked;
  if(mainFields){mainFields.unit_cost.disabled=locked||mainFields.cost_mode.value!=='DECLARED';mainFields.unit_cost.readOnly=!!mainFields.cost_reference.value;mainFields.reference_confirmed.disabled=locked||!mainFields.cost_reference.value;mainFields.production_ref.readOnly=!!mainFields.replaces_record_id.value;}
  for(const name of ['Form','VoidForm'])for(const button of el(name)?.querySelectorAll?.('button')||[])button.disabled=locked;
  proposal()?.refresh?.();
  const relevant=recordsInRange();el('Previous').disabled=!view||page===0;el('Next').disabled=!view||(page+1)*20>=relevant.length;
 }
 function option(select,value,label){const item=node('option',label);item.value=value;select.append(item);}
 function reference(kind){const refs=view?.references,value=kind==='ADULT_REGULAR'?refs?.adult_regular_cents:kind==='ADULT_PLUS'?refs?.adult_plus_cents:null;return refs?.status==='AVAILABLE'&&refs.mode==='all_inclusive'&&Number.isSafeInteger(value)?{kind,revision:refs.revision,mode:'all_inclusive',unit_cost_cents:value}:null;}
 function changed(name){
  rememberMain();draftEdited=true;if(name==='source_key'){draft.source_hash=view?.source.candidates.find(row=>row.key===mainFields.source_key.value)?.hash??null;mainFields.identity_confirmed.checked=false;mainFields.reference_confirmed.checked=false;proposal()?.setSource?.({key:draft.source_key,hash:draft.source_hash});}
  if(name==='cost_reference'){
   const ref=reference(mainFields.cost_reference.value);draft.reference_snapshot=ref;
   mainFields.reference_confirmed.checked=false;if(ref){mainFields.cost_mode.value='DECLARED';mainFields.unit_cost.value=inputMoney(ref.unit_cost_cents);}rememberMain();
  }
  if(name==='replaces_record_id'){const old=view?.ledger.records.find(row=>row.record_id===mainFields.replaces_record_id.value&&row.status==='VOID');if(old)mainFields.production_ref.value=old.production_ref;rememberMain();}
  if(name!=='confirmed')mainFields.confirmed.checked=false;rememberMain();controls();
 }
 function field(form,fields,name,label,{value='',type='text',maxLength=null,min=null,max=null,options=null,wide=false,target=null}={}){
  const group=node('label',undefined,wide?'incurred-production-wide':''),caption=node('span',label),input=node(options?'select':type==='textarea'?'textarea':'input');input.setAttribute('name',name);input.name=name;if(!options&&type!=='textarea')input.type=type;if(maxLength!==null)input.maxLength=maxLength;if(min!==null)input.min=String(min);if(max!==null)input.max=String(max);
  if(options)for(const [key,title] of options)option(input,key,title);
  if(type==='checkbox'){input.checked=value===true;group.className='incurred-production-check incurred-production-wide';group.append(input,caption);}else{input.value=String(value??'');group.append(caption,input);}
  if(form.dataset.incurredForm==='record'){input.oninput=()=>{if(name!=='source_key')changed(name);};input.onchange=()=>changed(name);}else{input.oninput=rememberVoid;input.onchange=rememberVoid;}
  fields[name]=input;(target||form.querySelector('.incurred-production-fields')).append(group);return input;
 }
 function renderForms(){
  const advancedOpen=el('OptionalFields')?.open===true,correctionOpen=el('Replacement')?.open===true;
  if(proposalHost)proposalHost.hidden=!view;const form=el('Form');form.replaceChildren();form.hidden=!view;el('VoidForm').replaceChildren();el('VoidForm').hidden=true;mainFields=null;voidFields=null;if(!view)return;
  draft??={produced_date:today(),quantity:'',production_ref:'',replaces_record_id:'',source_key:'',source_hash:null,cost_mode:'UNKNOWN',unit_cost:'',cost_reference:'',reference_snapshot:null,reference_confirmed:false,confirmed:false,identity_confirmed:false};
  mainFields={};form.dataset.incurredForm='record';form.append(node('div',undefined,'incurred-production-fields'));
  field(form,mainFields,'production_ref','Referência única da produção',{value:draft.production_ref,maxLength:120,wide:true});
  field(form,mainFields,'produced_date','Data em que as peças foram produzidas · Brasília',{type:'date',value:draft.produced_date,min:'2000-01-01',max:today()});field(form,mainFields,'quantity','Quantidade de peças físicas produzidas',{type:'number',value:draft.quantity,min:1,max:10000});
  field(form,mainFields,'cost_mode','Custo histórico por peça',{value:draft.cost_mode,options:[['UNKNOWN','Ainda desconhecido'],['DECLARED','Vou informar o custo total histórico']]});field(form,mainFields,'unit_cost','Valor total histórico de cada peça · R$',{value:draft.unit_cost,maxLength:16});mainFields.unit_cost.inputMode='decimal';
  field(form,mainFields,'evidence','Fonte ou motivo da confirmação da produção e do custo',{value:draft.evidence,maxLength:240,wide:true});field(form,mainFields,'confirmed','Confirmo a data e a quantidade realmente produzida, e o custo histórico informado ou ainda desconhecido.',{type:'checkbox',value:draft.confirmed});
  const advanced=node('details',undefined,'incurred-production-advanced'),extra=node('div',undefined,'incurred-production-fields');advanced.id='incurredProductionOptionalFields';advanced.open=advancedOpen;advanced.append(node('summary','Identidade, vínculo DTF e sugestão de custo'),node('p','Opcional para um lote manual. Identidade física e referências de custo exigem suas próprias conferências.'),extra);form.append(advanced);
  const optional=(name,label,options={})=>field(form,mainFields,name,label,{...options,target:extra});
  for(const [name,label,maxLength] of [['artwork','Estampa ou identificação da arte',120],['color','Cor',80],['size','Tamanho',16]])optional(name,label,{value:draft[name],maxLength});
  optional('garment_type','Segmento',{value:draft.garment_type||'UNKNOWN',options:[['UNKNOWN','Ainda não identificado'],['ADULT','Adulto'],['CHILD','Infantil']]});optional('fit','Corte da peça',{value:draft.fit||'UNKNOWN',options:[['UNKNOWN','Ainda não identificado'],['UNISEX','Unissex'],['MALE','Masculino'],['FEMALE','Feminino']]});
  optional('identity_confirmed','Conferi fisicamente estampa, cor, tamanho, segmento e corte.',{type:'checkbox',value:draft.identity_confirmed});
  const sourceOptions=[['','Lote manual, sem vínculo DTF'],...view.source.candidates.map(row=>[row.key,(row.model_name||row.sku||'Contexto '+row.key.slice(0,8))+' · '+row.order_status+' · '+row.selling_quantity+' unidade(s) do anúncio'])];if(draft.source_key&&!sourceOptions.some(([key])=>key===draft.source_key))sourceOptions.push([draft.source_key,'Contexto anterior indisponível · escolha novamente']);
  optional('source_key','Contexto operacional salvo · não comprova produção',{value:draft.source_key,options:sourceOptions,wide:true});if(proposalHost)extra.append(proposalHost);
  const refs=[['','Valor manual ou desconhecido'],...['ADULT_REGULAR','ADULT_PLUS'].flatMap(kind=>{const ref=reference(kind);return ref?[[kind,(kind==='ADULT_REGULAR'?'Referência adulta P–GG':'Referência adulta G1–G3')+' · '+money(ref.unit_cost_cents)]]:[];})];if(draft.cost_reference&&!refs.some(([key])=>key===draft.cost_reference))refs.push([draft.cost_reference,'Referência anterior indisponível · escolha novamente']);
  optional('cost_reference','Sugestão atual opcional · exige confirmação histórica',{value:draft.cost_reference,options:refs,wide:true});optional('reference_confirmed','Conferi que essa referência salva corresponde ao custo histórico deste lote.',{type:'checkbox',value:draft.reference_confirmed});
  const corrections=node('details',undefined,'incurred-production-advanced'),correctionFields=node('div',undefined,'incurred-production-fields');corrections.id='incurredProductionReplacement';corrections.open=correctionOpen||!!draft.replaces_record_id;corrections.append(node('summary','Substituir um lançamento anulado'),correctionFields);form.append(corrections);
  const replacementOptions=[['','Novo registro, sem substituição'],...view.ledger.records.filter(row=>row.status==='VOID'&&!view.ledger.records.some(other=>other.replaces_record_id===row.record_id)).map(row=>[row.record_id,row.production_ref+' · '+date(row.produced_date)])];
  field(form,mainFields,'replaces_record_id','Substituir explicitamente um lançamento anulado',{value:draft.replaces_record_id,options:replacementOptions,wide:true,target:correctionFields});
  const button=node('button','Registrar produção realizada');button.type='submit';button.dataset.incurredAction='record';form.append(button);form.onsubmit=event=>{event.preventDefault();return record();};
  const entry=selected();if(!entry||entry.status==='VOID')return;const voidForm=el('VoidForm');voidForm.hidden=false;voidForm.dataset.incurredForm='void';voidForm.append(node('h4','Anular um lançamento incorreto'),node('p','A anulação preserva o fato anterior na auditoria. Um pedido cancelado não é motivo automático para apagar produção realizada.'),node('div',undefined,'incurred-production-fields'));voidFields={};field(voidForm,voidFields,'reason','Motivo da anulação',{value:voidDrafts.get(entry.record_id)||'',maxLength:240,wide:true});const voidButton=node('button','Anular este lançamento');voidButton.type='submit';voidButton.dataset.incurredAction='void';voidForm.append(voidButton);voidForm.onsubmit=event=>{event.preventDefault();const reason=clean(voidFields.reason.value,240);if(!reason)return invalid('Informe o motivo da anulação, com até 240 caracteres.');return newAction('void',{record_id:entry.record_id,reason});};
 }
 function facts(target,rows){target.replaceChildren();for(const [label,value] of rows)target.append(node('dt',label),node('dd',value));}
 function renderPeriod(target,title,range){
  target.replaceChildren(node('h3',title),node('p',date(range.start_date)+' a '+date(range.end_date)));const summary=range.summary;
  if(summary.state==='NO_RECORDS')target.append(node('p','Sem registros ativos neste recorte','incurred-production-amount'));
  else if(summary.state==='DECLARED_COSTS')target.append(node('p',money(summary.total_cost_cents),'incurred-production-amount'),node('p','Custo histórico declarado das peças registradas.'));
  else if(summary.known_cost_quantity>0)target.append(node('p',money(summary.known_cost_cents),'incurred-production-amount'),node('p','Subtotal das peças com custo conhecido; total ainda não apurado.'));
  else target.append(node('p','Custos ainda desconhecidos','incurred-production-amount'));
  target.append(node('p',count(summary.produced_quantity)+' peça(s) física(s) em '+count(summary.active_records)+' registro(s) ativo(s). '+count(summary.unknown_cost_quantity)+' peça(s) sem custo histórico confirmado.'));
  if(summary.voided_records)target.append(node('p',count(summary.voided_records)+' lançamento(s) anulado(s) preservado(s) no histórico.'));
 }
 function rangeSnapshot(){if(!view)return null;const scope=rangeStart+'|'+rangeEnd;if(rangeLedger!==view.ledger||rangeScope!==scope){rangeView=incurredProductionRange(view.ledger,{start_date:rangeStart,end_date:rangeEnd});rangeLedger=view.ledger;rangeScope=scope;}return rangeView;}
 function recordsInRange(){if(!view||!rangeSnapshot())return [];return view.ledger.records.filter(row=>row.produced_date>=rangeStart&&row.produced_date<=rangeEnd).sort((a,b)=>b.produced_date.localeCompare(a.produced_date)||b.recorded_at-a.recorded_at||a.record_id.localeCompare(b.record_id));}
 function renderRange(){
  const range=rangeSnapshot();el('Range').replaceChildren();el('Daily').replaceChildren();
  if(!range){el('Range').append(node('h3','Fabricação no período'),node('p',view?'Escolha datas válidas até a data da leitura salva. Atualize os registros para conferir um novo dia.':'Abra o histórico para consultar o custo registrado.'));return;}
  renderPeriod(el('Range'),'Fabricação no período selecionado',range);
  el('Range').append(node('p','Datas de fabricação em Brasília · leitura dos registros em '+time(range.checked_at)+'.'));
  if(range.summary.state==='PARTIAL_COSTS')el('Range').append(node('p','Falta o custo de '+count(range.summary.unknown_cost_quantity)+' peça(s). O subtotal conhecido não é o gasto total.'));
  if(range.summary.state==='NO_RECORDS')el('Range').append(node('p','A ausência de lançamentos não confirma que não houve fabricação ou gasto.'));
  for(const day of range.days){const item=node('div',undefined,'incurred-production-day'),summary=day.summary;item.append(node('span',date(day.date)+' · '+count(summary.produced_quantity)+' peça(s) registrada(s)'),node('strong',summary.state==='NO_RECORDS'?'Sem registro ativo':summary.state==='DECLARED_COSTS'?money(summary.total_cost_cents):summary.known_cost_quantity>0?money(summary.known_cost_cents)+' · subtotal, custo pendente':'Custo pendente'));el('Daily').append(item);}
 }
 function ledgerDay(){return view?new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo'}).format(new Date(view.ledger.checked_at*1000)):null;}
 function monthEnd(selectedMonth){const parts=selectedMonth.split('-').map(Number);return new Date(Date.UTC(parts[0],parts[1],0,12)).toISOString().slice(0,10);}
 function analyticsSnapshot(){
  if(!view)return null;const asof=ledgerDay();
  if(!validMonth(historyMonth)||historyMonth>asof.slice(0,7)){const financialMonth=globalThis.brazaMonthDashboard?.getSnapshot?.().month;historyMonth=validMonth(financialMonth)&&financialMonth<=asof.slice(0,7)?financialMonth:month&&month<=asof.slice(0,7)?month:asof.slice(0,7);}
  const last=monthEnd(historyMonth)<asof?monthEnd(historyMonth):asof;
  if(!validDay(historyDay)||historyDay.slice(0,7)!==historyMonth||historyDay>last){let initialDay=null;if(!analyticsInitialized){analyticsInitialized=true;try{initialDay=globalThis.brazaDayDashboard?.getSelection?.();}catch{}}historyDay=validDay(initialDay)&&initialDay.slice(0,7)===historyMonth&&initialDay<=last?initialDay:last;}
  const scope=historyMonth+'|'+historyDay;
  if(analyticsLedger!==view.ledger||analyticsScope!==scope){analyticsView=buildIncurredProductionAnalytics(view.ledger,{month:historyMonth,selected_date:historyDay});analyticsLedger=view.ledger;analyticsScope=scope;}
  if(analyticsView)analyticsInitialized=true;return analyticsView;
 }
 function notifyAnalytics(type='mls-production-analytics-change'){const value=analyticsSnapshot();if(value&&typeof globalThis.CustomEvent==='function'&&typeof document.dispatchEvent==='function')document.dispatchEvent(new globalThis.CustomEvent(type,{detail:Object.freeze({month:value.month,selected_date:value.selected_day.date})}));}
 function selectedCost(target,title,summary){
  target.replaceChildren(node('h4',title));
  if(summary.state==='NO_RECORDS')target.append(node('p','Sem registro ativo','incurred-production-amount'),node('p','A ausência de um lançamento não confirma gasto zero.'));
  else if(summary.state==='DECLARED_COSTS')target.append(node('p',money(summary.total_cost_cents),'incurred-production-amount'),node('p','Custo histórico confirmado nos registros.'));
  else if(summary.known_cost_quantity>0)target.append(node('p',money(summary.known_cost_cents),'incurred-production-amount'),node('p','Subtotal conhecido · '+count(summary.unknown_cost_quantity)+' peça(s) com custo pendente.'));
  else target.append(node('p','Custo pendente','incurred-production-amount'),node('p',count(summary.unknown_cost_quantity)+' peça(s) sem custo histórico confirmado.'));
  target.dataset.costState=summary.state;target.append(node('p',count(summary.produced_quantity)+' peça(s) física(s) · '+count(summary.active_records)+' registro(s) ativo(s).'));
 }
 function svgNode(tag,attributes={},text){const item=typeof document.createElementNS==='function'?document.createElementNS('http://www.w3.org/2000/svg',tag):node(tag);for(const [key,value]of Object.entries(attributes))item.setAttribute(key,String(value));if(text!==undefined)item.textContent=text;return item;}
 function renderCostChart(value){
  const target=el('CostChart'),empty=el('ChartEmpty');target.replaceChildren();target.dataset.costState=value.summary.state;
  const rows=value.days,active=rows.filter(row=>row.summary.active_records>0);target.hidden=active.length===0;if(active.length)target.removeAttribute('hidden');else target.setAttribute('hidden','');empty.hidden=active.length>0;el('ChartLegend').hidden=active.length===0;
  if(!active.length){empty.textContent='Nenhum registro ativo de fabricação neste mês. O gráfico não presume custo zero.';return;}
  const width=Math.max(280,Math.min(1200,Number(target.getBoundingClientRect?.().width)||720)),height=220,left=69,right=12,top=15,bottom=height-35,plot=width-left-right,maximum=Math.max(0,...active.map(row=>row.summary.known_cost_cents)),ceiling=maximum||1;
  target.setAttribute('viewBox','0 0 '+width+' '+height);target.setAttribute('preserveAspectRatio','none');
  target.append(svgNode('title',{id:'incurredProductionCostChartTitle'},'Custos registrados por data de fabricação em '+value.month),svgNode('desc',{id:'incurredProductionCostChartDescription'},'Cada barra representa o custo histórico das peças registradas naquele dia. Barras parciais mostram apenas o subtotal conhecido; dias sem registro não representam gasto zero. A tabela abaixo contém os valores e permite escolher um dia.'));
  for(let tick=0;tick<=4;tick++){const amount=Number(BigInt(maximum)*BigInt(tick)/4n),y=bottom-(bottom-top)*tick/4;target.append(svgNode('line',{x1:left,x2:width-right,y1:y,y2:y,class:'manufacture-chart-grid'}),svgNode('text',{x:left-8,y:y+4,'text-anchor':'end'},'R$ '+new Intl.NumberFormat('pt-BR',{notation:'compact',maximumFractionDigits:1}).format(amount/100)));}
  const step=plot/rows.length,barWidth=Math.max(2,Math.min(26,step*.72));
  rows.forEach((row,index)=>{
   const summary=row.summary,x=left+index*step+step/2;
   if(summary.active_records>0){const amount=summary.known_cost_cents,barHeight=Math.max(3,amount/ceiling*(bottom-top)),partial=summary.state==='PARTIAL_COSTS',bar=svgNode('rect',{x:x-barWidth/2,y:bottom-barHeight,width:barWidth,height:barHeight,rx:Math.min(4,barWidth/3),class:'manufacture-chart-bar'+(partial?' manufacture-chart-partial':'')+(row.date===historyDay?' manufacture-chart-selected':''),'data-production-cost-date':row.date,'data-cost-state':summary.state});bar.append(svgNode('title',{},date(row.date)+' · '+count(summary.produced_quantity)+' peça(s) · '+(partial?'Subtotal conhecido: '+money(amount)+'; custo de '+count(summary.unknown_cost_quantity)+' peça(s) pendente.':money(summary.total_cost_cents))));const choose=()=>{const ok=selectAnalyticsDate(row.date);if(ok)el('CostChart')?.querySelector('[data-production-cost-date="'+row.date+'"]')?.focus?.();return ok;};bar.setAttribute('role','button');bar.setAttribute('tabindex','0');bar.setAttribute('aria-label',date(row.date)+' · '+(partial?'Subtotal conhecido: '+money(amount)+', custo pendente':money(summary.total_cost_cents))+'. Selecionar este dia.');bar.setAttribute('aria-pressed',String(row.date===historyDay));bar.onclick=choose;bar.onkeydown=event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault?.();return choose();}return false;};target.append(bar);}
   if(index===0||index===rows.length-1||index%7===0)target.append(svgNode('text',{x,y:height-12,'text-anchor':'middle'},row.date.slice(8)));
  });
 }
 function renderAnalytics(){
  if(!el('HistoryMonth'))return;const value=analyticsSnapshot();
  el('MonthDays').replaceChildren();el('SavedMonths').replaceChildren();
  if(!value){for(const name of ['SelectedDay','MonthTotal','HighestCost'])el(name).replaceChildren(node('p','Carregue os registros salvos para consultar este valor.'));el('CostChart').replaceChildren();el('CostChart').hidden=true;el('CostChart').setAttribute('hidden','');el('ChartLegend').hidden=true;el('ChartEmpty').hidden=false;el('ChartEmpty').textContent='Abra o histórico para consultar os custos registrados por dia.';el('ChartSource').textContent='';return;}
  selectedCost(el('SelectedDay'),'Dia selecionado · '+date(value.selected_day.date),value.selected_day.summary);selectedCost(el('MonthTotal'),'Mês de fabricação · '+value.month.slice(5)+'/'+value.month.slice(0,4),value.summary);
  const peak=el('HighestCost');peak.replaceChildren(node('h4','Maior custo registrado no mês'));
  if(value.highest_cost.state==='AVAILABLE'){
   peak.append(node('p',money(value.highest_cost.amount_cents),'incurred-production-amount'),node('p',value.highest_cost.dates.length>1?'Empate entre '+count(value.highest_cost.dates.length)+' dias registrados.':'Data de fabricação com o maior custo confirmado no histórico deste mês.'));
   const dates=node('div',undefined,'incurred-production-peak-days');for(const selectedDate of value.highest_cost.dates){const button=node('button',date(selectedDate));button.type='button';button.dataset.incurredPeakDay=selectedDate;button.onclick=()=>selectAnalyticsDate(selectedDate);dates.append(button);}peak.append(dates);
  }else if(value.highest_cost.state==='UNKNOWN_COSTS')peak.append(node('p','Ainda não apurado','incurred-production-amount'),node('p','Há custos pendentes neste mês. O maior subtotal conhecido não identifica o dia de maior gasto.'));
  else peak.append(node('p','Sem registros ativos','incurred-production-amount'),node('p','Registre as peças fabricadas para comparar os dias.'));
  if(value.highest_quantity.state==='AVAILABLE')peak.append(node('p','Maior produção registrada: '+count(value.highest_quantity.produced_quantity)+' peça(s) · '+value.highest_quantity.dates.map(date).join(', ')+'.'));
  for(const savedMonth of value.history_months)option(el('SavedMonths'),savedMonth,savedMonth.slice(5)+'/'+savedMonth.slice(0,4));
  el('ChartSource').textContent='Fabricação de '+date(value.start_date)+' a '+date(value.end_date)+' · leitura '+time(value.checked_at);
  renderCostChart(value);
  for(const day of value.days){const summary=day.summary,row=node('tr'),cell=node('td'),button=node('button',date(day.date));button.type='button';button.dataset.incurredProductionDay=day.date;button.setAttribute('aria-pressed',String(day.date===historyDay));button.onclick=()=>selectAnalyticsDate(day.date);cell.append(button);row.dataset.costState=summary.state;row.append(cell,node('td',summary.state==='NO_RECORDS'?'Sem registro ativo':count(summary.produced_quantity)+' peça(s)'),node('td',summary.state==='DECLARED_COSTS'?money(summary.total_cost_cents):summary.state==='NO_RECORDS'?'Sem valor confirmado':summary.known_cost_quantity>0?money(summary.known_cost_cents)+' · subtotal; '+count(summary.unknown_cost_quantity)+' peça(s) pendente(s)':'Custo pendente'));el('MonthDays').append(row);}
 }
 function render(){
  if(!el(''))return;status(message,errorState);el('Records').replaceChildren();el('Record').replaceChildren();el('RecordFacts').replaceChildren();
  renderRange();renderAnalytics();
  if(!view){for(const name of ['Monthly','Weekly'])el(name).replaceChildren();el('SourceStatus').textContent='O vínculo DTF é opcional. A leitura nunca preenche quantidade produzida ou comprova fabricação.';el('ReferencesStatus').textContent='Custos históricos precisam ser declarados; referências atuais não são aplicadas automaticamente.';el('Page').textContent='';renderForms();controls();return;}
  renderPeriod(el('Monthly'),'Mês selecionado',view.periods.monthly);renderPeriod(el('Weekly'),'Semana selecionada',view.periods.weekly);
  el('SourceStatus').textContent=view.source.status==='UNAVAILABLE'?'Contextos DTF salvos indisponíveis. O registro manual e o histórico continuam disponíveis.':count(view.source.included)+' contexto(s) DTF salvo(s) incluído(s). '+(view.source.has_more?'Leitura parcial; outros contextos não estão incluídos. ':'')+'Esta lista não é o histórico completo da loja. Quantidade vendida e situação do pedido não comprovam fabricação.';
  el('ReferencesStatus').textContent=view.references.status==='UNAVAILABLE'?'Referências atuais indisponíveis. Informe o custo histórico manualmente ou mantenha desconhecido.':view.references.mode==='itemized'?'O modo de custos por componentes não oferece sugestão automática por peça nesta etapa.':'As referências adultas atuais são sugestões opcionais. Confirme o valor histórico; não divida custos de kits nem presuma o valor recuperável da peça.';
  if(!view.ledger.records.some(row=>row.record_id===selectedRecord))selectedRecord=view.ledger.records.at(-1)?.record_id||'';
  for(const row of view.ledger.records)option(el('Record'),row.record_id,row.production_ref+' · '+date(row.produced_date)+' · '+(row.status==='VOID'?'Anulado':'Ativo'));el('Record').value=selectedRecord;
  const entry=selected();if(entry)facts(el('RecordFacts'),[['Referência',entry.production_ref],['Situação do lançamento',entry.status==='VOID'?'Anulado com histórico preservado':'Ativo'],['Data da produção',date(entry.produced_date)],['Peças físicas declaradas',count(entry.quantity)],['Identidade declarada',[entry.identity.artwork,entry.identity.color,entry.identity.size,entry.identity.garment_type,entry.identity.fit].filter(Boolean).join(' · ')],['Custo histórico por peça',entry.cost.state==='DECLARED'?money(entry.cost.unit_cost_cents):'Desconhecido'],['Fonte da declaração',entry.evidence],['Contexto congelado',entry.source.kind==='MANUAL_LOT'?'Lote manual':entry.source.order_status+' · '+entry.source.selling_quantity+' unidade(s) vendida(s), sem verificar peças produzidas'],['Registrado em',time(entry.recorded_at)],['Correção',entry.void_reason||'Sem anulação'],['Avaliação de estoque e lucro','Ainda não integrados']]);
  const rows=recordsInRange();page=Math.max(0,Math.min(page,Math.max(0,Math.ceil(rows.length/20)-1)));
  for(const row of rows.slice(page*20,page*20+20)){const item=node('article',undefined,'incurred-production-record');item.append(node('strong',row.production_ref),node('p',date(row.produced_date)+' · '+count(row.quantity)+' peça(s) · '+(row.status==='VOID'?'Anulado':'Ativo')),node('p',row.cost.state==='DECLARED'?'Custo histórico unitário: '+money(row.cost.unit_cost_cents):'Custo histórico desconhecido'));el('Records').append(item);}
  if(!rows.length)el('Records').append(node('p','Nenhum lançamento registrado nas datas selecionadas. Isso não comprova ausência de produção real.'));
  el('Page').textContent=rows.length?'Página '+(page+1)+' de '+Math.ceil(rows.length/20)+' · '+rows.length+' lançamento(s) nas datas selecionadas':'Nenhum lançamento neste recorte';renderForms();controls();
 }
 function proposalIdentity(){
  const values=readFields(mainFields),source=view?.source.candidates.find(row=>row.key===values.source_key);return {...values,item_id:source?.item_id??null,model_id:source?.model_id??null,sku:source?.sku??null};
 }
 function applyProposal(patch,context){
  if(!started||busy||loading||pendingAction||!view||!mainFields)return false;rememberMain();
  const candidate=view.source.candidates.find(row=>row.key===draft.source_key);if(!candidate||context?.source_key!==candidate.key||context.source_hash!==candidate.hash||draft.source_hash!==candidate.hash)return false;
  const current=proposalIdentity(),limits={color:80,size:16,garment_type:16,fit:16,item_id:32,model_id:32,sku:120};
  for(const [name,value] of Object.entries(patch||{})){if(!Object.hasOwn(limits,name)||typeof value!=='string'||!value||value.length>limits[name])return false;const old=current[name];if(old&&old!=='UNKNOWN'&&old.trim().normalize('NFC').toUpperCase()!==value.trim().normalize('NFC').toUpperCase())return false;if(name==='garment_type'&&!['ADULT','CHILD'].includes(value)||name==='fit'&&!['UNISEX','MALE','FEMALE'].includes(value))return false;}
  for(const [name,value] of Object.entries(patch||{}))if(mainFields[name]&&(!mainFields[name].value||mainFields[name].value==='UNKNOWN'))mainFields[name].value=value;
  for(const name of ['identity_confirmed','confirmed','reference_confirmed'])mainFields[name].checked=false;rememberMain();controls();return true;
 }
 function startProposal(){return proposal()?.start?.({api,host:proposalHost,readIdentity:proposalIdentity,onApply:applyProposal,isLocked:()=>!started||busy||loading||pendingAction!==null||!view});}
 function invalid(text){status(text,true);return false;}
 function clean(value,max){const text=typeof value==='string'?value.trim().normalize('NFC'):'';return text&&text.length<=max&&!/[\u0000-\u001f\u007f-\u009f]/.test(text)?text:null;}
 function unitCost(value){const raw=typeof value==='string'?value.trim().replace(',','.'):'';if(!/^(0|[1-9]\d{0,5})(?:\.\d{1,2})?$/.test(raw))return null;const [whole,fraction='']=raw.split('.'),amount=BigInt(whole)*100n+BigInt(fraction.padEnd(2,'0'));return amount<=1000000n?Number(amount):null;}
 function uuid(){if(typeof globalThis.crypto?.randomUUID!=='function')throw Error();return globalThis.crypto.randomUUID();}
 function record(){
  if(!started||busy||pendingAction||!view)return false;rememberMain();const data=draft,ref=clean(data.production_ref,120),evidence=clean(data.evidence,240),quantity=typeof data.quantity==='string'&&/^[1-9]\d{0,4}$/.test(data.quantity)?Number(data.quantity):0;
  if(!ref)return invalid('Informe uma referência única para a produção, com até 120 caracteres.');if(!validDay(data.produced_date))return invalid('Informe a data real da produção, até hoje em Brasília.');if(quantity<1||quantity>10000)return invalid('Informe de 1 a 10.000 peças físicas produzidas. A quantidade do kit ou anúncio não é preenchida automaticamente.');if(!evidence)return invalid('Informe a fonte ou o motivo da confirmação, com até 240 caracteres.');if(!data.confirmed)return invalid('Confirme explicitamente a produção, a data, a quantidade e o custo histórico informado ou desconhecido.');
  const identity={artwork:clean(data.artwork,120),color:clean(data.color,80),size:clean(data.size,16)?.toUpperCase()??null,garment_type:['ADULT','CHILD'].includes(data.garment_type)?data.garment_type:'UNKNOWN',fit:['UNISEX','MALE','FEMALE'].includes(data.fit)?data.fit:'UNKNOWN',confirmed:data.identity_confirmed===true,item_id:null,model_id:null,sku:null};
  if(identity.confirmed&&(!identity.artwork||!identity.color||!identity.size||identity.fit==='UNKNOWN'||!(identity.garment_type==='ADULT'?['P','M','G','GG','G1','G2','G3']:identity.garment_type==='CHILD'?['2','4','6','8','10','12','14','16']:[]).includes(identity.size)))return invalid('Confira estampa, cor, tamanho, segmento e corte antes de confirmar a identidade física.');
  let source={kind:'MANUAL_LOT',key:null,hash:null};if(data.source_key){const candidate=view.source.candidates.find(row=>row.key===data.source_key);if(!candidate||candidate.hash!==data.source_hash)return invalid('O contexto DTF mudou ou ficou indisponível. Selecione novamente a fonte salva ou lote manual.');source={kind:'SAVED_DTF_ORDER_LINE',key:candidate.key,hash:candidate.hash};identity.item_id=candidate.item_id;identity.model_id=candidate.model_id;identity.sku=candidate.sku;}
  const amount=data.cost_mode==='DECLARED'?unitCost(data.unit_cost):null;if(data.cost_mode==='DECLARED'&&amount===null)return invalid('Informe explicitamente o custo histórico por peça, entre R$ 0,00 e R$ 10.000,00. Campo vazio não significa zero.');
  let costReference=null;if(data.cost_reference){const current=reference(data.cost_reference),chosen=data.reference_snapshot;if(!current||!chosen||current.revision!==chosen.revision||current.unit_cost_cents!==chosen.unit_cost_cents||current.kind!==chosen.kind)return invalid('A referência atual mudou. Escolha novamente a sugestão e confira o custo histórico, ou informe um valor manual.');if(data.cost_mode!=='DECLARED'||!data.reference_confirmed||amount!==chosen.unit_cost_cents)return invalid('Confirme explicitamente que a sugestão corresponde ao custo histórico deste lote.');const sizes=chosen.kind==='ADULT_REGULAR'?['P','M','G','GG']:['G1','G2','G3'];if(identity.garment_type!=='ADULT'||!sizes.includes(identity.size))return invalid('A referência adulta escolhida não corresponde ao segmento e tamanho declarados. Não use essa sugestão para infantil ou para dividir kits.');costReference={...chosen};}
  const replaces=data.replaces_record_id||null;if(replaces){const old=view.ledger.records.find(row=>row.record_id===replaces&&row.status==='VOID');if(!old)return invalid('Confira o lançamento anulado escolhido para substituição.');}
  let recordId;try{recordId=uuid();}catch{return invalid('O navegador não conseguiu preparar o registro. Atualize a página antes de tentar.');}
  return newAction('record',{record_id:recordId,production_ref:ref,replaces_record_id:replaces,produced_date:data.produced_date,quantity,identity,source,cost:{unit_cost_cents:amount,reference:costReference},evidence,confirmed:true});
 }
 function newAction(kind,payload){
  if(!started||busy||pendingAction||!view)return false;let body;try{body={revision:view.ledger.revision,request_id:uuid(),action:kind,...payload};for(const key of ['identity','source'])if(body[key])Object.freeze(body[key]);if(body.cost){if(body.cost.reference)Object.freeze(body.cost.reference);Object.freeze(body.cost);}Object.freeze(body);}catch{return invalid('O navegador não conseguiu preparar o envio. Atualize a página antes de tentar novamente.');}
  pendingAction={kind,body,month,week_of:weekOf,session};return sendPending();
 }
 function path(selectedMonth=month,selectedWeek=weekOf){return 'production/incurred?month='+encodeURIComponent(selectedMonth)+'&week_of='+encodeURIComponent(selectedWeek);}
 async function sendPending(){
  const action=pendingAction;if(!started||busy||!action||action.session!==session)return false;busy=true;status('Salvando o registro histórico…');controls();let refresh=false;
  try{const raw=await api(path(action.month,action.week_of),action.body),checked=projectIncurredProductionWorkspace(raw);if(!started||session!==action.session||pendingAction!==action)return false;if(!checked||checked.month!==action.month||checked.week_of!==action.week_of)throw Error();sequence++;readPromise=null;loading=false;view=checked;pendingAction=null;page=0;selectedRecord=action.body.record_id;if(action.kind==='record'){draft=null;draftEdited=false;proposal()?.stop?.();startProposal();}else voidDrafts.delete(action.body.record_id);status(action.kind==='record'?'Produção registrada com os fatos e o custo histórico declarados. O lucro e o estoque não foram alterados.':'Lançamento anulado com histórico preservado. Para corrigir, registre uma substituição explícita.');render();notifyAnalytics('mls-production-analytics-ready');return true;
  }catch(error){if(!started||session!==action.session||pendingAction!==action)return false;const read=key=>{const d=Object.getOwnPropertyDescriptor(error||{},key);return d&&Object.hasOwn(d,'value')?d.value:undefined;},http=read('status'),code=read('apiCode')||read('code')||read('message');if([400,404,409].includes(http)){pendingAction=null;refresh=true;status(failures[code]||(http===409?'O histórico mudou em outra sessão. Seu rascunho foi preservado; confira a leitura atual antes de enviar novamente.':'Não foi possível aceitar o registro. Confira os campos; seu rascunho foi preservado.'),true);}else status(http===401?'Sua sessão precisa ser confirmada. Entre novamente antes de continuar.':'O envio ainda não foi confirmado. Retome a mesma tentativa para evitar produção registrada duas vezes.',true);render();return false;
  }finally{if(started&&session===action.session){busy=false;controls();if(refresh&&el('Details').open)await load({preserveMessage:true});}}
 }
 async function load({preserveMessage=false}={}){
  if(!started||!el('Details').open||busy||!validMonth(month)||!validDay(weekOf))return false;if(readPromise)return readPromise;const token=++sequence,epoch=session,selectedMonth=month,selectedWeek=weekOf;proposal()?.stop?.();startProposal();loading=true;if(!preserveMessage)status('Conferindo somente os registros já salvos…');controls();
  const task=(async()=>{try{const raw=await api(path(selectedMonth,selectedWeek)),checked=projectIncurredProductionWorkspace(raw);if(!started||epoch!==session||token!==sequence||selectedMonth!==month||selectedWeek!==weekOf)return false;if(!checked||checked.month!==selectedMonth||checked.week_of!==selectedWeek)throw Error();view=checked;if(!preserveMessage)status(pendingAction?'Há um envio aguardando confirmação. Retome a mesma tentativa antes de criar outro registro.':'Histórico salvo carregado. Custos desconhecidos permanecem sem valor até uma declaração explícita.');render();notifyAnalytics('mls-production-analytics-ready');return true;}catch{if(started&&epoch===session&&token===sequence){status('Não foi possível conferir o histórico agora. A última leitura e seus rascunhos foram preservados.',true);render();}return false;}finally{if(epoch===session&&token===sequence){readPromise=null;loading=false;controls();if(view&&draft?.source_key)proposal()?.setSource?.({key:draft.source_key,hash:draft.source_hash});}}})();readPromise=task;return task;
 }
 function selectPeriod(){
  if(!started||busy||pendingAction){controls();return false;}const selectedMonth=el('Month').value,selectedWeek=el('Week').value;if(!validMonth(selectedMonth)||!validDay(selectedWeek)){controls();return invalid('Escolha mês e data de referência válidos, até hoje em Brasília.');}rememberMain();rememberVoid();month=selectedMonth;weekOf=selectedWeek;sequence++;readPromise=null;loading=false;view=null;page=0;render();return load();
 }
 function selectRange(start=el('Start').value,end=el('End').value){
  if(!started||busy||pendingAction){controls();return false;}
  if(!view||!incurredProductionRange(view.ledger,{start_date:start,end_date:end})){rangeDraft=null;controls();return invalid('Escolha a data inicial e final da fabricação, em ordem e até a data da leitura salva, com no máximo 366 dias.');}
  rememberMain();rememberVoid();rangeStart=start;rangeEnd=end;rangeDraft=null;page=0;status('Período aplicado aos registros já carregados, sem consultar pedidos ou alterar os lançamentos.');render();return true;
 }
 function selectAnalyticsDate(selectedDate=el('Day').value){
  if(!started||busy||pendingAction||!view){controls();return false;}
  const asof=ledgerDay();if(!validDay(selectedDate)||selectedDate>asof){controls();return invalid('Escolha uma data de fabricação válida, até a data da leitura salva.');}
  rememberMain();rememberVoid();historyMonth=selectedDate.slice(0,7);historyDay=selectedDate;status('Dia aplicado ao histórico salvo, com custo da data de fabricação.');render();notifyAnalytics();return true;
 }
 function registerForSelectedDate(){
  if(!started||busy||loading||pendingAction||!view||!mainFields||!validDay(historyDay))return false;
  rememberMain();const filled=Object.entries(draft).some(([name,value])=>value&&value!=='UNKNOWN'&&!(name==='produced_date'&&value===today()));
  if(draftEdited||filled)return invalid('Seu registro em andamento foi preservado. Confira a data no formulário antes de continuar; Registrar neste dia não substitui um rascunho.');
  mainFields.produced_date.value=historyDay;for(const name of ['confirmed','identity_confirmed','reference_confirmed'])mainFields[name].checked=false;rememberMain();draftEdited=true;status('Data '+date(historyDay)+' preparada. Informe as peças, o custo e a fonte; nenhum registro foi criado.');
  if(typeof globalThis.CustomEvent==='function'&&typeof document.dispatchEvent==='function')document.dispatchEvent(new globalThis.CustomEvent('mls-production-register-day',{detail:Object.freeze({date:historyDay})}));mainFields.production_ref.focus?.();return true;
 }
 function selectHistoryMonth(){
  if(!started||busy||pendingAction||!view){controls();return false;}
  const selectedMonth=el('HistoryMonth').value,asof=ledgerDay();if(!validMonth(selectedMonth)||selectedMonth>asof.slice(0,7)){controls();return invalid('Escolha um mês de fabricação válido, até a leitura salva.');}
  rememberMain();rememberVoid();historyMonth=selectedMonth;historyDay='';status('Mês aplicado aos registros já carregados. O custo histórico de cada lote foi preservado.');render();notifyAnalytics();return true;
 }
 function shortcut(kind){
  if(!view)return false;const end=new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo'}).format(new Date(view.ledger.checked_at*1000));let start=end.slice(0,7)+'-01';
  if(kind==='WEEK'){const at=new Date(end+'T12:00:00Z');at.setUTCDate(at.getUTCDate()-(at.getUTCDay()+6)%7);start=at.toISOString().slice(0,10);}
  return selectRange(start,end);
 }
 function prepare(){
  if(prepared||!el(''))return !!el('');prepared=true;el('Details').ontoggle=()=>{if(el('Details').open)load();};el('Reload').onclick=()=>{rememberMain();rememberVoid();return load();};el('Month').onchange=selectPeriod;el('Week').onchange=selectPeriod;el('HistoryMonth').onchange=selectHistoryMonth;el('Day').onchange=()=>selectAnalyticsDate();el('RegisterDay').onclick=registerForSelectedDate;el('ApplyRange').onclick=()=>selectRange();el('ThisWeek').onclick=()=>shortcut('WEEK');el('ThisMonth').onclick=()=>shortcut('MONTH');for(const name of ['Start','End'])el(name).oninput=()=>{rangeDraft={start_date:el('Start').value,end_date:el('End').value};};el('Retry').onclick=sendPending;el('Record').onchange=()=>{rememberMain();rememberVoid();selectedRecord=el('Record').value;render();};el('Previous').onclick=()=>{if(page>0){rememberMain();rememberVoid();page--;render();}};el('Next').onclick=()=>{if((page+1)*20<recordsInRange().length){rememberMain();rememberVoid();page++;render();}};globalThis.addEventListener?.('resize',()=>{if(started&&view&&el('Details').open){renderAnalytics();controls();}});return true;
 }
 function bootstrapState(options={}){if(!prepare()||!['LOADING','RETRYING','FAILED','READY'].includes(options.phase))return false;if(!started){status(options.phase==='FAILED'?'Entre na sessão administradora para consultar o histórico de produção.':options.phase==='READY'?'Abra para consultar os registros salvos.':'Aguardando a sessão administradora.');controls();}return true;}
 function start(options={}){if(typeof options.api!=='function'||!prepare())return false;if(started&&api===options.api)return true;session++;started=true;api=options.api;startProposal();if(!validMonth(month))month=today().slice(0,7);if(!validDay(weekOf))weekOf=today();if(!validDay(rangeStart)||!validDay(rangeEnd)){rangeStart=today().slice(0,7)+'-01';rangeEnd=today();rangeDraft=null;}status('Abra para consultar os registros salvos.');controls();if(el('Details').open)load();return true;}
 function open(){if(!prepare())return false;el('Details').open=true;load();return true;}
 function stop(){proposal()?.stop?.();session++;sequence++;started=false;api=null;view=null;draft=null;draftEdited=false;rangeDraft=null;rangeView=null;rangeLedger=null;rangeScope='';historyMonth='';historyDay='';analyticsView=null;analyticsLedger=null;analyticsScope='';analyticsInitialized=false;voidDrafts.clear();mainFields=null;voidFields=null;pendingAction=null;busy=false;loading=false;readPromise=null;selectedRecord='';status('Sessão encerrada. Entre novamente para consultar o histórico de produção.');render();}
 globalThis.brazaIncurredProduction=Object.freeze({start,bootstrapState,open,stop,selectAnalyticsDate,registerForSelectedDate,getSnapshot:()=>view?projectIncurredProductionWorkspace(view):null,getRangeSnapshot:()=>{const value=rangeSnapshot();return value?JSON.parse(JSON.stringify(value)):null;},getAnalyticsSnapshot:()=>{const value=analyticsSnapshot();return value?JSON.parse(JSON.stringify(value)):null;}});prepare();if(el(''))controls();
})();


(()=>{
 const el=name=>document.getElementById('productionDailyFinance'+name),node=(tag,text,cls)=>{const value=document.createElement(tag);if(text!==undefined)value.textContent=text;if(cls)value.className=cls;return value;};
 const money=value=>{if(!Number.isSafeInteger(value))return 'Pendente';const absolute=BigInt(value)<0n?-BigInt(value):BigInt(value),fraction=String(absolute%100n).padStart(2,'0');return (value<0?'-':'')+new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).formatToParts(absolute/100n).map(part=>part.type==='fraction'?fraction:part.value).join('');};
 const date=value=>value.slice(8)+'/'+value.slice(5,7),validDate=value=>typeof value==='string'&&/^20\d{2}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(value)&&Number.isFinite(Date.parse(value+'T12:00:00Z'))&&new Date(value+'T12:00:00Z').toISOString().slice(0,10)===value;
 let stopped=false,current=null,syncing=null;
 function empty(message,scope=null){current=null;for(const name of ['Selected','Best','Graph','Table'])el(name)?.replaceChildren();for(const name of ['Selected','Best'])if(el(name)){el(name).dataset.negative='false';el(name).dataset.positive='false';}if(el('Selected'))el('Selected').append(node('small','Data escolhida'),node('strong','Pendente'));if(el('Best'))el('Best').append(node('small','Melhor resultado estimado do mês'),node('strong','Em conferência'));if(el('Status'))el('Status').textContent=message;if(el('Open'))el('Open').href=scope?'/admin?tab=agent-finance&month='+scope.month+'&date='+scope.selected_day.date+'#businessDay':'/admin?tab=agent-finance#businessDay';}
 function ledger(){try{const value=globalThis.brazaIncurredProduction?.getAnalyticsSnapshot?.(),read=(row,key)=>row&&typeof row==='object'?Object.getOwnPropertyDescriptor(row,key)?.value:undefined,selected=read(value,'selected_day'),selectedDate=read(selected,'date'),month=read(value,'month');return read(value,'schema')==='incurred_production_analytics_v1'&&validDate(selectedDate)&&month===selectedDate.slice(0,7)?{month,selected_day:{date:selectedDate}}:null;}catch{return null;}}
 function checked(value){
  const plain=row=>row!==null&&typeof row==='object'&&[Object.prototype,null].includes(Object.getPrototypeOf(row)),exact=(row,keys)=>plain(row)&&Reflect.ownKeys(row).length===keys.length&&keys.every(key=>Object.hasOwn(Object.getOwnPropertyDescriptor(row,key)||{},'value'));
  const int=(row,min=0,max=Number.MAX_SAFE_INTEGER)=>Number.isSafeInteger(row)&&!Object.is(row,-0)&&row>=min&&row<=max,amount=(row,signed=false)=>row===null||int(row,signed?Number.MIN_SAFE_INTEGER:0);
  const array=(rows,max)=>Array.isArray(rows)&&Object.getPrototypeOf(rows)===Array.prototype&&rows.length<=max&&Reflect.ownKeys(rows).length===rows.length+1&&Array.from({length:rows.length},(_,i)=>Object.hasOwn(Object.getOwnPropertyDescriptor(rows,String(i))||{},'value')).every(Boolean);
  try{
   if(!exact(value,['schema','month','selected_date','start_date','end_date','timezone','currency','basis','publication_revision','costs_revision','source_checked_at','coverage','days','selected_day','best_day','actual_profit_cents','manufacturing_cost_subtracted'])||value.schema!=='production_daily_finance_v1'||!validDate(value.selected_date)||value.month!==value.selected_date.slice(0,7)||value.start_date!==value.month+'-01'||!validDate(value.end_date)||value.end_date.slice(0,7)!==value.month||value.timezone!=='America/Sao_Paulo'||value.currency!=='BRL'||value.basis!=='PAID_CREATE_DAY_CALENDAR_ADS_ALLOCATED_MONTHLY_ESTIMATE'||!int(value.publication_revision,1,2147483647)||!int(value.costs_revision,1,2147483647)||value.actual_profit_cents!==null||value.manufacturing_cost_subtracted!==false||!array(value.days,31)||value.days.length!==Number(value.end_date.slice(8)))return null;
   if(!exact(value.source_checked_at,['finance_oldest_at','finance_latest_at','ads_at'])||!Object.values(value.source_checked_at).every(row=>row===null||int(row,1,9999999999)))return null;
   let known=0,comparable=0;const eligible=[];
   for(let i=0;i<value.days.length;i++){
    const row=value.days[i];if(!exact(row,['date','estimate_cents','reference_production_cost_cents','known_reference_production_cost_cents','state','day_partial','pending'])||row.date!==value.month+'-'+String(i+1).padStart(2,'0')||!validDate(row.date)||!amount(row.estimate_cents,true)||!amount(row.reference_production_cost_cents)||!amount(row.known_reference_production_cost_cents)||!['COMPARABLE','PARTIAL','UNAVAILABLE'].includes(row.state)||typeof row.day_partial!=='boolean'||!array(row.pending,17)||row.pending.some(code=>typeof code!=='string'||!/^[A-Z_]{3,45}$/.test(code)))return null;
    if(row.reference_production_cost_cents!==null&&row.reference_production_cost_cents!==row.known_reference_production_cost_cents||row.state==='UNAVAILABLE'&&row.estimate_cents!==null||row.state!=='UNAVAILABLE'&&row.estimate_cents===null||row.state==='COMPARABLE'&&(row.day_partial||row.pending.length||row.reference_production_cost_cents===null)||row.state==='PARTIAL'&&!row.day_partial&&!row.pending.length)return null;
    if(row.estimate_cents!==null)known++;if(row.state==='COMPARABLE'){comparable++;eligible.push(row);}
   }
   if(!exact(value.coverage,['total_days','known_estimate_days','comparable_days','pending_days'])||value.coverage.total_days!==value.days.length||value.coverage.known_estimate_days!==known||value.coverage.comparable_days!==comparable||value.coverage.pending_days!==value.days.length-comparable)return null;
   const selected=value.days.find(row=>row.date===value.selected_date)??null,dayKeys=['date','estimate_cents','reference_production_cost_cents','known_reference_production_cost_cents','state','day_partial','pending'];
   if(selected===null?value.selected_day!==null:!exact(value.selected_day,dayKeys)||dayKeys.filter(key=>key!=='pending').some(key=>selected[key]!==value.selected_day[key])||!array(value.selected_day.pending,17)||selected.pending.length!==value.selected_day.pending.length||selected.pending.some((code,index)=>code!==value.selected_day.pending[index]))return null;
   if(!exact(value.best_day,['state','amount_cents','dates'])||!array(value.best_day.dates,31))return null;
   const peak=eligible.length?Math.max(...eligible.map(row=>row.estimate_cents)):null,dates=eligible.filter(row=>row.estimate_cents===peak).map(row=>row.date);if(value.best_day.state!==(eligible.length?'AVAILABLE':'NO_COMPARABLE_DAYS')||value.best_day.amount_cents!==peak||JSON.stringify(value.best_day.dates)!==JSON.stringify(dates))return null;
   return JSON.parse(JSON.stringify(value));
  }catch{return null;}
 }
 function selectDate(value){if(stopped||!validDate(value))return false;try{return globalThis.brazaIncurredProduction?.selectAnalyticsDate?.(value)===true;}catch{return false;}}
 function dateButton(value){const button=node('button',date(value));button.type='button';button.dataset.productionFinanceDate=value;button.onclick=()=>selectDate(value);return button;}
 function reference(row){return row.reference_production_cost_cents!==null?money(row.reference_production_cost_cents):row.known_reference_production_cost_cents!==null?money(row.known_reference_production_cost_cents)+' · parcial':'Pendente';}
 function refresh(){
  if(stopped||!el(''))return false;const manufacture=ledger();let raw=null;try{raw=globalThis.brazaDayDashboard?.getMonthAnalytics?.()??null;}catch{}const value=checked(raw);
  if(!manufacture){empty('Abra a fabricação e escolha o mês e a data para consultar os valores salvos.');return false;}
  if(!value||value.month!==manufacture.month||value.selected_date!==manufacture.selected_day.date){empty('O financeiro aguarda o mesmo mês e a mesma data da fabricação. A fonte pode estar incompleta ou uma edição pode estar impedindo a troca do período.',manufacture);return false;}
  current=value;const selected=value.selected_day,selectedBox=el('Selected'),bestBox=el('Best');selectedBox.replaceChildren(node('small','Resultado estimado · '+date(value.selected_date)),node('strong',selected?money(selected.estimate_cents):'Pendente'));
  selectedBox.dataset.negative=String(selected?.estimate_cents!==null&&selected?.estimate_cents<0);selectedBox.dataset.positive=String(selected?.estimate_cents>0);
  selectedBox.append(node('p',selected?'Referência de custo das vendas: '+reference(selected)+'. '+(selected.state==='COMPARABLE'?'Dia completo e sem pendências.':selected.day_partial?'Dia ainda parcial.':selected.estimate_cents!==null?'Estimativa com pendências; não participa da comparação.':'Resultado ainda em conferência.'):'A coleta salva vai até '+date(value.end_date)+'. A data escolhida ainda não tem leitura financeira.'));
  const best=value.best_day;bestBox.replaceChildren(node('small','Melhor resultado estimado · dias completos'),node('strong',best.state==='AVAILABLE'?money(best.amount_cents):'Em conferência'));bestBox.dataset.negative=String(best.amount_cents!==null&&best.amount_cents<0);bestBox.dataset.positive=String(best.amount_cents>0);bestBox.append(node('p',best.dates.length?best.dates.map(date).join(' · ')+(best.amount_cents<0?' · melhor resultado entre perdas estimadas.':''):'Dias parciais, custos incompletos e outras pendências ficam fora desta comparação.'));
  const maximum=Math.max(0,...value.days.flatMap(row=>[row.estimate_cents===null?0:Math.abs(row.estimate_cents),row.reference_production_cost_cents??row.known_reference_production_cost_cents??0])),chart=node('div',undefined,'production-finance-chart');chart.style.gridTemplateColumns='repeat('+value.days.length+',minmax(44px,1fr))';chart.style.minWidth=String(value.days.length*46)+'px';
  const table=[];
  for(const row of value.days){const button=dateButton(row.date);button.className='production-finance-point';button.setAttribute('aria-pressed',String(row.date===value.selected_date));button.dataset.partial=String(row.state!=='COMPARABLE');button.setAttribute('aria-label',date(row.date)+': resultado estimado '+money(row.estimate_cents)+'; referência de custo '+reference(row)+(row.state==='COMPARABLE'?'':'; parcial ou pendente'));const plot=node('span',undefined,'production-finance-plot');
   const bar=(amount,kind)=>{if(amount===null)return;const item=node('span',undefined,'production-finance-bar');item.dataset.kind=kind;item.dataset.negative=String(amount<0);item.style.height=(maximum?Math.max(1,Math.abs(amount)/maximum*48):1)+'%';plot.append(item);};bar(row.estimate_cents,'estimate');bar(row.reference_production_cost_cents??row.known_reference_production_cost_cents,'reference');if(row.estimate_cents===null)plot.append(node('span','—','production-finance-gap'));button.replaceChildren(plot,node('small',date(row.date)));chart.append(button);
   const tr=node('tr'),dateCell=node('td');dateCell.append(dateButton(row.date));tr.append(dateCell,node('td',money(row.estimate_cents)),node('td',reference(row)),node('td',row.state==='COMPARABLE'?'Completa':row.day_partial?'Dia parcial':row.pending.length?row.pending.length+' pendência(s)':'Sem resultado'));table.push(tr);
  }
  el('Graph').replaceChildren(chart);el('Table').replaceChildren(...table);el('Status').textContent='Fonte de '+date(value.start_date)+' a '+date(value.end_date)+' · '+value.coverage.known_estimate_days+' de '+value.coverage.total_days+' dias com estimativa · '+value.coverage.comparable_days+' dias completos e sem pendências. A fabricação não é somada nem descontada nesta conta.';
  el('Open').href='/admin?tab=agent-finance&month='+value.month+'&date='+value.selected_date+'#businessDay';return true;
 }
 async function change(event){const value=event?.detail,manufacture=ledger();if(!manufacture||!value||!validDate(value.selected_date)||value.month!==manufacture.month||value.selected_date!==manufacture.selected_day.date||value.month!==value.selected_date.slice(0,7)){refresh();return;}
  let financeDate=null;try{financeDate=globalThis.brazaDayDashboard?.getSelection?.();}catch{}
  if(financeDate===value.selected_date||syncing===value.selected_date){refresh();return;}
  syncing=value.selected_date;try{await globalThis.brazaDayDashboard?.selectDate?.(value.selected_date);}catch{}finally{if(syncing===value.selected_date)syncing=null;refresh();}
 }
 document.addEventListener('mls-production-analytics-ready',refresh);document.addEventListener('mls-production-analytics-change',change);
 globalThis.brazaProductionDailyFinance=Object.freeze({refresh,getSnapshot:()=>current?JSON.parse(JSON.stringify(current)):null,stop(){stopped=true;empty('Sessão encerrada.');}});
})();


(()=>{
 const projectProductionWeeklyClosingWorkspace=function projectProductionWeeklyClosingWorkspace(value){
 const plain=v=>v!==null&&typeof v==='object'&&[Object.prototype,null].includes(Object.getPrototypeOf(v));
 const exact=(v,keys)=>plain(v)&&Reflect.ownKeys(v).length===keys.length&&keys.every(key=>Object.hasOwn(Object.getOwnPropertyDescriptor(v,key)||{},'value'));
 const list=(v,max)=>Array.isArray(v)&&Object.getPrototypeOf(v)===Array.prototype&&v.length<=max&&Reflect.ownKeys(v).length===v.length+1&&Array.from({length:v.length},(_,i)=>Object.hasOwn(Object.getOwnPropertyDescriptor(v,String(i))||{},'value')).every(Boolean);
 const int=(v,min=0,max=Number.MAX_SAFE_INTEGER)=>Number.isSafeInteger(v)&&!Object.is(v,-0)&&v>=min&&v<=max,stamp=v=>int(v,1,9999999999),revision=v=>int(v,0,2147483645),hash=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
 const text=(v,max)=>typeof v==='string'&&v.length>0&&v.length<=max&&v.trim()===v&&v.normalize('NFC')===v&&!/[\u0000-\u001f\u007f-\u009f]/.test(v);
 const date=v=>typeof v==='string'&&/^20\d{2}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(v)&&Number.isFinite(Date.parse(v+'T12:00:00Z'))&&new Date(v+'T12:00:00Z').toISOString().slice(0,10)===v;
 const friday=v=>date(v)&&new Date(v+'T12:00:00Z').getUTCDay()===5,day=v=>new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo'}).format(new Date(v*1000));
 const at13=v=>new Intl.DateTimeFormat('en-GB',{timeZone:'America/Sao_Paulo',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).format(new Date(v*1000))==='13:00:00';
 const keys=['schema','week_end_date','period_start_at','period_end_at','captured_at','source_revision','timing_revision','capture_kind','report_version','content_hash','status','active_records','produced_quantity','known_cost_quantity','unknown_cost_quantity','boundary_pending_records','boundary_pending_quantity','known_cost_cents','total_cost_cents','pending','basis'];
 const pendingCodes=['PERIOD_OPEN','NO_PRODUCTION_RECORDS','UNKNOWN_UNIT_COST','BOUNDARY_TIME_REQUIRED'];
 try{
  if(!exact(value,['schema','checked_at','month','timezone','revision','source','policy','weeks','boundary_records','basis','financial_integration_allowed'])||value.schema!=='production_weekly_closing_workspace_v1'||!stamp(value.checked_at)||typeof value.month!=='string'||!/^20\d{2}-(0[1-9]|1[0-2])$/.test(value.month)||value.month>day(value.checked_at).slice(0,7)||value.timezone!=='America/Sao_Paulo'||!revision(value.revision)||!exact(value.source,['ledger_revision','checked_at'])||!revision(value.source.ledger_revision)||!stamp(value.source.checked_at)||value.source.checked_at>value.checked_at||!exact(value.policy,['enabled','weekday','hour','minute','next_close_at'])||value.policy.enabled!==true||value.policy.weekday!==5||value.policy.hour!==13||value.policy.minute!==0||!stamp(value.policy.next_close_at)||value.policy.next_close_at<=value.checked_at||!friday(day(value.policy.next_close_at))||!at13(value.policy.next_close_at)||!list(value.weeks,6)||!list(value.boundary_records,1000)||value.basis!=='OPERATOR_CONFIRMED_MANUFACTURE_WEEK_NOT_SALES_OR_PAID_CASH'||value.financial_integration_allowed!==false)return null;
  const report=(r,end,preview)=>{
   if(!exact(r,keys)||r.schema!=='production_weekly_report_v1'||r.week_end_date!==end||!friday(end)||!stamp(r.period_start_at)||!stamp(r.period_end_at)||r.period_start_at>=r.period_end_at||day(r.period_end_at)!==end||!at13(r.period_start_at)||!at13(r.period_end_at)||!stamp(r.captured_at)||r.captured_at>value.checked_at||!revision(r.source_revision)||r.source_revision>value.source.ledger_revision||!revision(r.timing_revision)||r.timing_revision>value.revision||!['LIVE_PREVIEW','RETROSPECTIVE','SCHEDULED','RESTATEMENT'].includes(r.capture_kind)||!int(r.report_version,0,10000)||!hash(r.content_hash)||!['OPEN','NO_RECORDS','PENDING','RECORDED_COSTS'].includes(r.status)||!list(r.pending,4)||new Set(r.pending).size!==r.pending.length||r.pending.some(code=>!pendingCodes.includes(code))||r.basis!=='CONFIRMED_MANUFACTURE_RECORDS_NOT_ALL_STORE_OR_CASH')return false;
   const start=new Date(end+'T12:00:00Z');start.setUTCDate(start.getUTCDate()-7);if(day(r.period_start_at)!==start.toISOString().slice(0,10))return false;
   for(const k of ['active_records','produced_quantity','known_cost_quantity','unknown_cost_quantity','boundary_pending_records','boundary_pending_quantity','known_cost_cents'])if(!int(r[k]))return false;
   if(BigInt(r.produced_quantity)!==BigInt(r.known_cost_quantity)+BigInt(r.unknown_cost_quantity)||r.known_cost_quantity===0&&r.known_cost_cents!==0||(r.boundary_pending_records===0)!==(r.boundary_pending_quantity===0)||r.active_records>r.produced_quantity||r.boundary_pending_records>r.boundary_pending_quantity)return false;
   const open=r.captured_at<r.period_end_at,empty=r.active_records===0&&r.boundary_pending_records===0,unknown=r.unknown_cost_quantity>0,boundary=r.boundary_pending_records>0;
   const expected=open?'OPEN':empty?'NO_RECORDS':unknown||boundary?'PENDING':'RECORDED_COSTS';
   if(r.status!==expected||(r.pending.includes('PERIOD_OPEN')!==open)||(r.pending.includes('UNKNOWN_UNIT_COST')!==unknown)||(r.pending.includes('BOUNDARY_TIME_REQUIRED')!==boundary)||(r.pending.includes('NO_PRODUCTION_RECORDS')!==empty))return false;
   if(r.status==='RECORDED_COSTS'?r.total_cost_cents!==r.known_cost_cents:r.total_cost_cents!==null)return false;
   if(preview){if(r.report_version!==0||r.captured_at!==value.checked_at||r.source_revision!==value.source.ledger_revision||r.timing_revision!==value.revision||r.capture_kind!==(open?'LIVE_PREVIEW':'RETROSPECTIVE'))return false;}
   else if(r.report_version<1||r.capture_kind==='LIVE_PREVIEW'||open)return false;
   return true;
  };
  let previous=null;const ends=new Set();
  for(const w of value.weeks){
   if(!exact(w,['end_date','current','original','latest','versions_count','delta_cents','needs_restatement'])||!friday(w.end_date)||ends.has(w.end_date)||previous!==null&&w.end_date>=previous||!int(w.versions_count,0,10000)||typeof w.needs_restatement!=='boolean'||!report(w.current,w.end_date,true))return null;
   if(w.end_date.slice(0,7)!==value.month&&!(value.month===day(value.checked_at).slice(0,7)&&w.current.period_end_at===value.policy.next_close_at))return null;
   if(w.versions_count===0){if(w.original!==null||w.latest!==null||w.delta_cents!==null||w.needs_restatement)return null;}
   else{
    if(!report(w.original,w.end_date,false)||!report(w.latest,w.end_date,false)||w.original.report_version!==1||w.latest.report_version!==w.versions_count||w.original.captured_at>w.latest.captured_at||w.original.period_start_at!==w.current.period_start_at||w.latest.period_start_at!==w.current.period_start_at||w.original.period_end_at!==w.current.period_end_at||w.latest.period_end_at!==w.current.period_end_at||w.needs_restatement!==(w.current.content_hash!==w.latest.content_hash))return null;
    const known=w.original.total_cost_cents!==null&&w.latest.total_cost_cents!==null;
    if(known?!int(w.delta_cents,Number.MIN_SAFE_INTEGER)||BigInt(w.delta_cents)!==BigInt(w.latest.total_cost_cents)-BigInt(w.original.total_cost_cents):w.delta_cents!==null)return null;
   }
   previous=w.end_date;ends.add(w.end_date);
  }
  const seen=new Set();
  for(const r of value.boundary_records){
   if(!exact(r,['record_id','record_hash','production_ref','produced_date','quantity','unit_cost_cents','before13_quantity','at_or_after13_quantity','assignment_status','affected_end_dates'])||typeof r.record_id!=='string'||!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(r.record_id)||seen.has(r.record_id)||!hash(r.record_hash)||!text(r.production_ref,120)||!friday(r.produced_date)||r.produced_date>day(value.checked_at)||!int(r.quantity,1,10000)||r.unit_cost_cents!==null&&!int(r.unit_cost_cents,0,1000000)||!['PENDING','STALE','CONFIRMED'].includes(r.assignment_status)||!list(r.affected_end_dates,2)||r.affected_end_dates.length!==2||r.affected_end_dates[0]!==r.produced_date||!r.affected_end_dates.some(v=>ends.has(v)))return null;
   const next=new Date(r.produced_date+'T12:00:00Z');next.setUTCDate(next.getUTCDate()+7);if(r.affected_end_dates[1]!==next.toISOString().slice(0,10))return null;
   if(r.assignment_status==='CONFIRMED'?!int(r.before13_quantity,0,r.quantity)||!int(r.at_or_after13_quantity,0,r.quantity)||r.before13_quantity+r.at_or_after13_quantity!==r.quantity:r.before13_quantity!==null||r.at_or_after13_quantity!==null)return null;
   seen.add(r.record_id);
  }
  return JSON.parse(JSON.stringify(value));
 }catch{return null;}
};
 const el=name=>document.getElementById('productionWeeklyClosing'+name),node=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
 const today=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo'}).format(new Date()),validMonth=v=>typeof v==='string'&&/^20\d{2}-(0[1-9]|1[0-2])$/.test(v)&&v<=today().slice(0,7);
 const date=v=>v.slice(8)+'/'+v.slice(5,7)+'/'+v.slice(0,4),time=v=>new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Sao_Paulo',dateStyle:'short',timeStyle:'short'}).format(new Date(v*1000)),count=v=>new Intl.NumberFormat('pt-BR').format(v);
 const money=v=>{if(!Number.isSafeInteger(v))return 'Ainda não apurado';const amount=BigInt(v),abs=amount<0n?-amount:amount,whole=abs/100n,fraction=String(abs%100n).padStart(2,'0');return (amount<0n?'− ':'')+new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).formatToParts(whole).map(p=>p.type==='fraction'?fraction:p.value).join('');};
 const labels={OPEN:'Em andamento',NO_RECORDS:'Sem registros',PENDING:'Em conferência',RECORDED_COSTS:'Custo registrado'},kinds={LIVE_PREVIEW:'Prévia da semana',RETROSPECTIVE:'Histórico reconstituído',SCHEDULED:'Fechamento automático',RESTATEMENT:'Revisão do fechamento'};
 let api=null,started=false,opened=false,prepared=false,dirty=true,month='',selected='',view=null,session=0,sequence=0,loading=false,busy=false,readPromise=null,pendingAction=null,refreshTimer=null,lastAutomaticRead=0,message='Abra Produção para consultar os fechamentos salvos.',errorState=false;
 const drafts=new Map();let requestedContext=null;
 const validContext=value=>value!==null&&typeof value==='object'&&Object.keys(value).length===2&&validMonth(value.month)&&typeof value.week_end==='string'&&/^20[0-9]{2}-[0-9]{2}-[0-9]{2}$/.test(value.week_end)&&value.week_end.slice(0,7)===value.month&&Number.isFinite(Date.parse(value.week_end+'T12:00:00Z'))&&new Date(value.week_end+'T12:00:00Z').toISOString().slice(0,10)===value.week_end&&new Date(value.week_end+'T12:00:00Z').getUTCDay()===5;
 function visible(){const active=document.documentElement?.dataset?.activePanel;return opened&&(!active||active==='agent-production')&&document.getElementById('missionProductionFabricationPane')?.hidden!==true&&document.getElementById('missionProductionWeeklyPane')?.hidden!==true;}
 const clock=()=>Math.floor(Date.now()/1000),stale=()=>!view||clock()-view.checked_at>=600||clock()>=view.policy.next_close_at;
 function clearRefresh(){if(refreshTimer!==null)clearTimeout(refreshTimer);refreshTimer=null;}
 function armRefresh(){
  clearRefresh();if(!started||!view||!visible()||document.hidden||loading||busy||pendingAction)return;
  const now=clock(),closed=view.weeks.find(w=>w.current.period_end_at<=now);let at=view.policy.next_close_at+65;
  if(at<=now||closed&&now-closed.current.period_end_at<86400&&(!closed.latest||closed.needs_restatement))at=Math.min(at>now?at:Infinity,Math.floor(now/600)*600+665);
  const epoch=session;refreshTimer=setTimeout(()=>{refreshTimer=null;if(epoch===session)return revalidate(true);},Math.max(1000,(at-now)*1000));
 }
 function revalidate(force=false){if(!started||!visible()||document.hidden||loading||busy||pendingAction){clearRefresh();return false;}if(!force&&!stale()||clock()-lastAutomaticRead<60){armRefresh();return false;}lastAutomaticRead=clock();return refresh();}
 function status(text,error=false){message=text;errorState=error;if(el('Status')){el('Status').textContent=text;el('Status').dataset.error=String(error);}}
 function controls(){if(!el(''))return;const locked=!started||loading||busy||pendingAction!==null;el('Month').disabled=locked;el('Month').value=month;el('Month').max=today().slice(0,7);el('Week').disabled=locked||!view;el('Week').value=selected;el('Refresh').disabled=locked;el('Retry').hidden=pendingAction===null;el('Retry').disabled=!started||busy;for(const input of el('Records').querySelectorAll('input'))input.disabled=locked;for(const host of ['Records','Graph'])for(const button of el(host).querySelectorAll('button'))button.disabled=locked;}
 function summary(target,title,r){target.replaceChildren(node('h4',title));if(!r){target.append(node('strong','Sem leitura para esta semana','production-weekly-amount'));return;}target.append(node('span',kinds[r.capture_kind]+(r.report_version?' · v'+r.report_version:''),'production-weekly-badge'),node('p',time(r.period_start_at)+' → '+time(r.period_end_at)+' · Brasília'),node('strong',r.total_cost_cents===null?labels[r.status]:money(r.total_cost_cents),'production-weekly-amount'));if(r.total_cost_cents===null&&r.known_cost_quantity>0)target.append(node('p','Subtotal conhecido: '+money(r.known_cost_cents)+'. O gasto total permanece em apuração.'));target.append(node('p',count(r.produced_quantity)+' peça(s) atribuída(s) · '+count(r.unknown_cost_quantity)+' sem custo histórico · '+count(r.boundary_pending_quantity)+' com corte de sexta pendente.'),node('p','Captura dos registros: '+time(r.captured_at)+'.'));}
 function selectedWeek(){return view?.weeks.find(w=>w.end_date===selected)??null;}
 function renderChart(){
  const host=el('Graph');host.replaceChildren();if(!view)return;
  const rows=[...view.weeks].reverse().map(w=>({w,r:w.latest??w.current})),amount=r=>r.total_cost_cents??(r.known_cost_quantity>0?r.known_cost_cents:null),max=Math.max(1,...rows.map(({r})=>amount(r)??0));
  for(const {w,r}of rows){const value=amount(r),label=value===null?labels[r.status]:money(value)+(r.total_cost_cents===null?' · subtotal':''),button=node('button',undefined,'production-weekly-point'),plot=node('span',undefined,'production-weekly-plot');button.type='button';button.dataset.weeklyChartEnd=w.end_date;button.dataset.partial=String(r.total_cost_cents===null);button.setAttribute('aria-pressed',String(w.end_date===selected));button.setAttribute('aria-label','Corte '+date(w.end_date)+' às 13h: '+label+' · '+(w.latest?'relatório salvo':'prévia dos registros'));button.title=button.getAttribute('aria-label');if(value!==null){const bar=node('span',undefined,'production-weekly-bar');bar.style.height=Math.max(3,value/max*100)+'%';plot.append(bar);}else plot.append(node('small','—'));button.append(node('small',date(w.end_date)),plot,node('small',label));button.onclick=()=>{el('Week').value=w.end_date;return el('Week').onchange();};host.append(button);}
 }
 function renderReports(){
  el('Week').replaceChildren();el('Table').replaceChildren();el('Empty').hidden=!view||view.weeks.some(w=>w.current.active_records>0||w.current.boundary_pending_records>0);if(!view){for(const [name,title]of [['Current','Próximo fechamento'],['Last','Semana anterior'],['Selected','Semana selecionada']])summary(el(name),title,null);return;}
  if(!view.weeks.some(w=>w.end_date===selected))selected=view.weeks.find(w=>w.current.period_end_at<=view.checked_at)?.end_date??view.weeks.find(w=>w.current.status==='OPEN')?.end_date??view.weeks[0]?.end_date??'';
  for(const w of view.weeks){const option=node('option','Corte '+date(w.end_date)+' às 13h · '+labels[(w.latest??w.current).status]);option.value=w.end_date;el('Week').append(option);}el('Week').value=selected;
  const current=view.weeks.find(w=>w.current.period_end_at===view.policy.next_close_at),past=view.weeks.find(w=>w.current.period_end_at<=view.checked_at),chosen=selectedWeek();
  summary(el('Current'),'Semana em andamento',current?.current??null);el('Current').append(node('p','Próximo fechamento: '+time(view.policy.next_close_at)+' · Brasília.'));
  summary(el('Last'),'Último corte do mês consultado',past?(past.latest??past.current):null);
  summary(el('Selected'),'Semana selecionada',chosen?(chosen.latest??chosen.current):null);
  if(chosen){if(!chosen.latest)el('Selected').append(node('p','Ainda não há fechamento salvo para este corte. A referência exibida é a leitura atual dos registros.'));else{el('Selected').append(node('p','Original v'+chosen.original.report_version+': '+(chosen.original.total_cost_cents===null?labels[chosen.original.status]:money(chosen.original.total_cost_cents))+'. Última versão v'+chosen.latest.report_version+': '+(chosen.latest.total_cost_cents===null?labels[chosen.latest.status]:money(chosen.latest.total_cost_cents))+'.'),node('p',chosen.delta_cents===null?'Variação entre versões: ainda não apurada.':'Variação da última versão em relação à original: '+(chosen.delta_cents>0?'+ ':'')+money(chosen.delta_cents)+'.'));if(chosen.needs_restatement){el('Selected').append(node('p','Há registros novos ou correções posteriores. O fechamento salvo foi preservado; a próxima conferência automática pode gerar uma revisão.'));if(chosen.current.total_cost_cents!==null)el('Selected').append(node('p','Referência atual dos registros: '+money(chosen.current.total_cost_cents)+' · ainda não salva como fechamento.'));else if(chosen.current.known_cost_quantity>0)el('Selected').append(node('p','Subtotal atual dos registros: '+money(chosen.current.known_cost_cents)+' · pendências impedem o gasto total.'));}}}
  const table=node('table'),head=node('thead'),tr=node('tr');for(const title of ['Corte às 13h','Situação','Custo da última leitura','Versões'])tr.append(node('th',title));head.append(tr);table.append(head);const body=node('tbody');for(const w of view.weeks){const r=w.latest??w.current,row=node('tr');row.append(node('td',date(w.end_date)),node('td',labels[r.status]+(w.latest?' · salvo':' · prévia')),node('td',r.total_cost_cents===null?r.known_cost_quantity>0?money(r.known_cost_cents)+' · subtotal':labels[r.status]:money(r.total_cost_cents)),node('td',String(w.versions_count)+(w.needs_restatement?' · atualização pendente':'')));body.append(row);}table.append(body);el('Table').append(table);
 }
 function field(form,label,name,type,value,wide=false){const wrap=node('label',undefined,wide?'production-weekly-wide':undefined),span=node('span',label),input=node('input');input.setAttribute('name',name);input.name=name;input.type=type;if(type==='checkbox'){wrap.className='production-weekly-confirm production-weekly-wide';input.checked=value;wrap.append(input,span);}else{input.value=value;wrap.append(span,input);}if(type==='number'){input.min='0';input.step='1';input.inputMode='numeric';}if(name==='reason')input.maxLength=240;form.append(wrap);return input;}
 function renderRecords(){
  const host=el('Records');host.replaceChildren();if(!view){el('PendingTitle').textContent='Conferir produção das sextas-feiras';return;}
  const pending=view.boundary_records.filter(r=>r.assignment_status!=='CONFIRMED').length;el('PendingTitle').textContent='Cortes das sextas · '+pending+' pendente(s)';
  if(!view.boundary_records.length){host.append(node('p','Nenhum lote de sexta-feira neste recorte requer divisão de horário.'));return;}
  for(const r of view.boundary_records){let d=drafts.get(r.record_id);if(!d||d.hash!==r.record_hash){d={hash:r.record_hash,before:r.before13_quantity===null?'':String(r.before13_quantity),after:r.at_or_after13_quantity===null?'':String(r.at_or_after13_quantity),reason:'',confirmed:false};drafts.set(r.record_id,d);}const box=node(r.assignment_status==='CONFIRMED'?'details':'section',undefined,'production-weekly-record');if(r.assignment_status==='CONFIRMED')box.append(node('summary',r.production_ref+' · '+date(r.produced_date)+' · corte conferido'));else box.append(node('h4',r.production_ref+' · '+date(r.produced_date)));box.append(node('p',count(r.quantity)+' peça(s) física(s). Antes de 13h: fechamento de '+date(r.affected_end_dates[0])+'. Às 13h ou depois: fechamento de '+date(r.affected_end_dates[1])+'.'));const form=node('form');form.dataset.weeklyRecord=r.record_id;const fields=node('div',undefined,'production-weekly-fields');const before=field(fields,'Peças fabricadas antes de 13h','before13_quantity','number',d.before),after=field(fields,'Peças fabricadas às 13h ou depois','at_or_after13_quantity','number',d.after),reason=field(fields,'Como você conferiu esse corte?','reason','text',d.reason,true),confirmed=field(fields,'Confirmo a divisão das peças realmente fabricadas; a soma deve ser '+count(r.quantity)+'.','confirmed','checkbox',d.confirmed,true);before.max=after.max=String(r.quantity);before.oninput=()=>{d.before=before.value;};after.oninput=()=>{d.after=after.value;};reason.oninput=()=>{d.reason=reason.value;};confirmed.onchange=()=>{d.confirmed=confirmed.checked;};form.append(fields);const button=node('button',r.assignment_status==='CONFIRMED'?'Salvar correção do corte':'Confirmar corte da sexta');button.type='submit';form.append(button);form.onsubmit=e=>{e.preventDefault();return assign(r.record_id);};box.append(form);host.append(box);}
 }
 function render(){if(!el(''))return;renderReports();renderChart();renderRecords();status(message,errorState);controls();}
 function invalid(text){status(text,true);controls();return false;}
 function path(m=month){return 'production/weekly-closing?month='+encodeURIComponent(m);}
 async function load({preserveMessage=false}={}){
  if(!started||!visible()||busy||pendingAction||!validMonth(month))return false;if(readPromise)return readPromise;const epoch=session,token=++sequence,selectedMonth=month;loading=true;if(!preserveMessage)status('Conferindo fechamentos e registros salvos…');controls();
  const task=(async()=>{try{const checked=projectProductionWeeklyClosingWorkspace(await api(path(selectedMonth)));if(!started||epoch!==session||token!==sequence||month!==selectedMonth)return false;if(!checked||checked.month!==selectedMonth||requestedContext?.month===selectedMonth&&!checked.weeks.some(week=>week.end_date===requestedContext.week_end))throw Error();view=checked;if(requestedContext?.month===selectedMonth)selected=requestedContext.week_end;requestedContext=null;dirty=false;if(!preserveMessage)status('Leitura conferida em '+time(checked.checked_at)+' · Brasília. Prévia não é fechamento salvo; semanas com pendências continuam identificadas.');render();return true;}catch{if(started&&epoch===session&&token===sequence){status('Não foi possível conferir os fechamentos agora. A última leitura e os rascunhos foram preservados.',true);render();}return false;}finally{if(epoch===session&&token===sequence){readPromise=null;loading=false;controls();armRefresh();}}})();readPromise=task;return task;
 }
 function assign(recordId){
  if(!started||busy||loading||pendingAction||!view)return false;const r=view.boundary_records.find(row=>row.record_id===recordId),d=drafts.get(recordId);if(!r||!d||d.hash!==r.record_hash)return invalid('Confira a leitura atual antes de confirmar o corte.');const number=v=>typeof v==='string'&&/^(0|[1-9][0-9]{0,4})$/.test(v)?Number(v):null,before=number(d.before),after=number(d.after),reason=d.reason.trim().normalize('NFC');if(before===null||after===null||before+after!==r.quantity)return invalid('Informe quantidades inteiras antes e depois de 13h; a soma deve ser '+count(r.quantity)+' peças.');if(!d.confirmed)return invalid('Confirme explicitamente a divisão real da fabricação.');if(!reason||reason.length>240||/[\u0000-\u001f\u007f-\u009f]/.test(reason))return invalid('Informe como o corte foi conferido, com até 240 caracteres.');let body;try{body=Object.freeze({action:'assign_boundary',month,request_id:crypto.randomUUID(),revision:view.revision,ledger_revision:view.source.ledger_revision,record_id:r.record_id,record_hash:r.record_hash,before13_quantity:before,at_or_after13_quantity:after,confirmed:true,reason});}catch{return invalid('O navegador não conseguiu preparar a confirmação. Atualize a página e tente novamente.');}sequence++;readPromise=null;loading=false;pendingAction={body,session};return sendPending();
 }
 async function sendPending(){
  const action=pendingAction;if(!started||busy||!action||action.session!==session)return false;busy=true;status('Salvando a confirmação do corte da sexta-feira…');controls();let refresh=false;
  try{const checked=projectProductionWeeklyClosingWorkspace(await api('production/weekly-closing',action.body));if(!started||session!==action.session||pendingAction!==action)return false;const row=checked?.boundary_records.find(r=>r.record_id===action.body.record_id);if(!checked||checked.month!==action.body.month||checked.revision<action.body.revision+1||row&&(row.assignment_status!=='CONFIRMED'||row.record_hash!==action.body.record_hash||row.before13_quantity!==action.body.before13_quantity||row.at_or_after13_quantity!==action.body.at_or_after13_quantity))throw Error();sequence++;view=checked;dirty=false;pendingAction=null;drafts.delete(action.body.record_id);status('Corte confirmado. Os registros de fabricação foram preservados; fechamentos anteriores mantêm suas versões.');render();if(typeof globalThis.CustomEvent==='function'&&typeof document.dispatchEvent==='function')document.dispatchEvent(new globalThis.CustomEvent('mls-production-timing-ready'));return true;}
  catch(error){if(!started||session!==action.session||pendingAction!==action)return false;const own=k=>Object.getOwnPropertyDescriptor(error||{},k)?.value,http=own('status'),code=own('apiCode')||own('code');if([400,404,409].includes(http)){pendingAction=null;refresh=true;status(http===409||code==='PRODUCTION_WEEKLY_SOURCE_CHANGED'||code==='PRODUCTION_WEEKLY_CONFLICT'?'Os registros mudaram em outra sessão. Confira a leitura atual; seu rascunho foi preservado.':'A confirmação não foi aceita. Confira os campos; seu rascunho foi preservado.',true);}else status(http===401?'Entre novamente na sessão administradora para confirmar o envio.':'O envio ainda não foi confirmado. Retome a mesma tentativa para evitar uma confirmação duplicada.',true);render();return false;}
  finally{if(started&&session===action.session){busy=false;controls();if(refresh)await load({preserveMessage:true});else armRefresh();}}
 }
 function prepare(){if(prepared||!el(''))return !!el('');prepared=true;el('Month').onchange=()=>{if(!started||loading||busy||pendingAction){controls();return false;}const next=el('Month').value;if(!validMonth(next)){controls();return invalid('Escolha um mês válido até o mês atual em Brasília.');}month=next;selected='';dirty=true;return load();};el('Week').onchange=()=>{if(!started||loading||busy||pendingAction||!view){controls();return false;}const next=el('Week').value;if(!view.weeks.some(w=>w.end_date===next))return invalid('Escolha uma semana do histórico carregado.');selected=next;render();return true;};el('Refresh').onclick=()=>refresh();el('Retry').onclick=sendPending;document.addEventListener('mls-production-analytics-ready',()=>refresh());document.addEventListener('visibilitychange',()=>revalidate());globalThis.addEventListener?.('focus',()=>revalidate());return true;}
 function bootstrapState(options={}){if(!prepare())return false;if(!started)status(options.phase==='FAILED'?'Entre na sessão administradora para consultar os fechamentos.':'Aguardando a sessão administradora.');controls();return true;}
 function start(options={}){if(typeof options.api!=='function'||!prepare())return false;if(started&&api===options.api)return true;session++;started=true;api=options.api;if(!validMonth(month))month=today().slice(0,7);status('Abra Produção para consultar os fechamentos salvos.');controls();if(requestedContext){const desired=requestedContext;openContext(desired);}else if(visible())load();return true;}
 function open(){if(!prepare())return false;opened=true;if(!started||!visible())return false;if(dirty||!view)return load();if(stale())return revalidate();render();armRefresh();return true;}
 function openContext(value){if(!prepare()||!validContext(value))return invalid('O acesso precisa informar um mês válido e uma sexta-feira desse mês.');if(busy||pendingAction)return invalid('Confira primeiro a tentativa de corte pendente. O período e o rascunho foram preservados.');requestedContext=Object.freeze({month:value.month,week_end:value.week_end});opened=true;if(!started)return true;if(month===value.month&&view?.month===value.month&&view.weeks.some(week=>week.end_date===value.week_end)){selected=value.week_end;requestedContext=null;render();armRefresh();return true;}clearRefresh();sequence++;readPromise=null;loading=false;month=value.month;selected=value.week_end;dirty=true;return load();}
 function refresh(){dirty=true;return load();}
 function stop(){clearRefresh();session++;sequence++;api=null;started=false;opened=false;view=null;month='';selected='';dirty=true;loading=false;busy=false;readPromise=null;pendingAction=null;lastAutomaticRead=0;requestedContext=null;drafts.clear();status('Sessão encerrada. Entre novamente para consultar os fechamentos.');render();}
 globalThis.brazaProductionWeeklyClosing=Object.freeze({start,bootstrapState,open,openContext,refresh,stop,getSelection:()=>Object.freeze({month,week_end:selected}),suspend:clearRefresh,getSnapshot:()=>view?projectProductionWeeklyClosingWorkspace(view):null});prepare();if(el(''))render();
})();

(()=>{
 const projectProductionCoverageWorkspace=function projectProductionCoverageWorkspace(value){
 try{
  const plain=v=>v!==null&&typeof v==='object'&&[Object.prototype,null].includes(Object.getPrototypeOf(v)),exact=(v,ks)=>plain(v)&&Reflect.ownKeys(v).length===ks.length&&ks.every(k=>Object.hasOwn(Object.getOwnPropertyDescriptor(v,k)||{},'value'));
  const int=(v,a=0,b=Number.MAX_SAFE_INTEGER)=>Number.isSafeInteger(v)&&!Object.is(v,-0)&&v>=a&&v<=b,hash=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v),date=v=>typeof v==='string'&&/^20\d{2}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(v)&&Number.isFinite(Date.parse(v+'T12:00:00Z'))&&new Date(v+'T12:00:00Z').toISOString().slice(0,10)===v;
  const text=v=>typeof v==='string'&&v.length>0&&v.length<=240&&v.trim()===v&&v.normalize('NFC')===v&&!/[\u0000-\u001f\u007f-\u009f]/.test(v),dense=(v,n)=>Array.isArray(v)&&v.length===n&&Reflect.ownKeys(v).length===n+1&&Array.from({length:n},(_,i)=>Object.hasOwn(Object.getOwnPropertyDescriptor(v,String(i))||{},'value')).every(Boolean);
  if(!exact(value,['schema','checked_at','week_end','revision','source','period','intervals','summary','basis'])||value.schema!=='production_coverage_workspace_v1'||value.basis!=='OWNER_CONFIRMED_MANUFACTURING_COMPLETENESS_NOT_CASH_OR_SALES'||!int(value.checked_at,1,9999999999)||!date(value.week_end)||new Date(value.week_end+'T12:00:00Z').getUTCDay()!==5||!int(value.revision,0,2147483645)||!exact(value.source,['ledger_revision','timing_revision'])||!int(value.source.ledger_revision,0,2147483645)||!int(value.source.timing_revision,0,2147483645)||!exact(value.period,['start_at','end_at','timezone'])||value.period.timezone!=='America/Sao_Paulo'||!dense(value.intervals,8))return null;
  const shift=(v,n)=>new Date(Date.parse(v+'T12:00:00Z')+n*86400000).toISOString().slice(0,10),civil=new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}),parts=new Intl.DateTimeFormat('en-GB',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
  const start=d=>{const mid=Date.parse(d+'T12:00:00Z')/1000;let lo=mid-129600,hi=mid+129600;while(lo<hi){const at=Math.floor((lo+hi)/2);if(civil.format(new Date(at*1000))<d)lo=at+1;else hi=at;}return civil.format(new Date(lo*1000))===d?lo:null;},close=d=>{const target=Date.parse(d+'T13:00:00Z');let at=target;for(let n=0;n<4;n++){const p=Object.fromEntries(parts.formatToParts(new Date(at)).filter(v=>v.type!=='literal').map(v=>[v.type,Number(v.value)])),diff=target-Date.UTC(p.year,p.month-1,p.day,p.hour,p.minute,p.second);if(!diff)return at/1000;at+=diff;}return null;};
  const first=shift(value.week_end,-7),today=civil.format(new Date(value.checked_at*1000));let next=shift(today,(5-new Date(today+'T12:00:00Z').getUTCDay()+7)%7);if(close(next)<=value.checked_at)next=shift(next,7);
  if(!date(first)||value.week_end>next||value.period.start_at!==close(first)||value.period.end_at!==close(value.week_end))return null;
  let quantity=0n,known=0n,unknown=0n,pending=0,confirmed=0,minimumRevision=0;
  for(let i=0;i<8;i++){
   const row=value.intervals[i],d=i===7?value.week_end:shift(first,i),part=i===0?'AT_OR_AFTER_13':i===7?'BEFORE_13':'DAY',a=i===0?value.period.start_at:start(d),b=i===7?value.period.end_at:start(shift(d,1));
   if(!exact(row,['key','date','part','start_at','end_at','source_hash','state','recorded','attestation','can_confirm','can_revoke'])||row.key!==d+':'+part||row.date!==d||row.part!==part||row.start_at!==a||row.end_at!==b||!int(a,1)||!int(b,a+1)||!hash(row.source_hash)||!exact(row.recorded,['records','quantity','known_quantity','unknown_quantity','known_cost_cents','boundary_pending_records']))return null;
   const m=row.recorded;for(const k of ['records','quantity','known_quantity','unknown_quantity','known_cost_cents','boundary_pending_records'])if(!int(m[k]))return null;
   if(m.records>m.quantity||m.known_quantity+m.unknown_quantity!==m.quantity||BigInt(m.known_cost_cents)>BigInt(m.known_quantity)*1000000n||part==='DAY'&&m.boundary_pending_records!==0)return null;
   const att=row.attestation;if(att!==null&&(!exact(att,['mode','source_hash','confirmed_at','revoked_at','reason'])||!['ALL_RECORDED','NO_MANUFACTURING'].includes(att.mode)||!hash(att.source_hash)||!int(att.confirmed_at,b,value.checked_at)||att.revoked_at!==null&&!int(att.revoked_at,att.confirmed_at,value.checked_at)||!text(att.reason)))return null;
   if(att!==null)minimumRevision+=att.revoked_at===null?1:2;
   const active=att!==null&&att.revoked_at===null,valid=active&&att.source_hash===row.source_hash;
   if(valid&&(m.boundary_pending_records>0||(att.mode==='NO_MANUFACTURING'?m.quantity!==0:m.quantity===0)))return null;
   const state=b>value.checked_at?'OPEN':m.boundary_pending_records>0?'BOUNDARY_REQUIRED':att?.revoked_at!==null&&att!==null?'REVOKED':active?valid?'CONFIRMED':'STALE':'UNCONFIRMED';
   if(row.state!==state||row.can_confirm!==(b<=value.checked_at&&m.boundary_pending_records===0)||row.can_revoke!==active)return null;
   quantity+=BigInt(m.quantity);known+=BigInt(m.known_cost_cents);unknown+=BigInt(m.unknown_quantity);pending+=m.boundary_pending_records;if(state==='CONFIRMED')confirmed++;
  }
  if(minimumRevision>value.revision||quantity>0n&&value.source.ledger_revision===0||[quantity,known,unknown].some(v=>v>BigInt(Number.MAX_SAFE_INTEGER))||!Number.isSafeInteger(pending)||!exact(value.summary,['state','confirmed_intervals','intervals_total','recorded_quantity','known_cost_cents','total_cost_cents','unknown_cost_quantity','boundary_pending_records']))return null;
  const state=value.period.end_at>value.checked_at?'OPEN':confirmed===8&&unknown===0n&&pending===0?'CONFIRMED':'PENDING',expected={state,confirmed_intervals:confirmed,intervals_total:8,recorded_quantity:Number(quantity),known_cost_cents:Number(known),total_cost_cents:state==='CONFIRMED'?Number(known):null,unknown_cost_quantity:Number(unknown),boundary_pending_records:pending};
  if(Object.keys(expected).some(k=>value.summary[k]!==expected[k]))return null;return JSON.parse(JSON.stringify(value));
 }catch{return null;}
};
 const el=name=>document.getElementById('productionCoverage'+name),node=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
 const zone='America/Sao_Paulo',today=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:zone}).format(new Date()),shift=(date,days)=>new Date(Date.parse(date+'T12:00:00Z')+days*86400000).toISOString().slice(0,10),weekday=date=>new Date(date+'T12:00:00Z').getUTCDay();
 const nextEnd=()=>{const day=today(),hour=Number(new Intl.DateTimeFormat('en-GB',{timeZone:zone,hour:'2-digit',hourCycle:'h23'}).format(new Date()));return shift(day,(5-weekday(day)+7)%7+(weekday(day)===5&&hour>=13?7:0));};
 const validDay=value=>typeof value==='string'&&/^20\d{2}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(value)&&Number.isFinite(Date.parse(value+'T12:00:00Z'))&&new Date(value+'T12:00:00Z').toISOString().slice(0,10)===value;
 const validWeek=value=>typeof value==='string'&&/^20\d{2}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(value)&&new Date(value+'T12:00:00Z').toISOString().slice(0,10)===value&&weekday(value)===5&&value>='2000-01-14'&&value<=nextEnd();
 const date=value=>value.slice(8)+'/'+value.slice(5,7)+'/'+value.slice(0,4),time=value=>new Intl.DateTimeFormat('pt-BR',{timeZone:zone,dateStyle:'short',timeStyle:'short'}).format(new Date(value*1000)),count=value=>new Intl.NumberFormat('pt-BR').format(value),money=value=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(value/100);
 const labels={OPEN:'Intervalo ainda em andamento',BOUNDARY_REQUIRED:'Corte da sexta pendente',UNCONFIRMED:'Ainda não conferido',CONFIRMED:'Conferência válida',STALE:'Registros alterados · confira novamente',REVOKED:'Conferência retirada'},parts={DAY:'Dia completo',BEFORE_13:'Antes de 13h',AT_OR_AFTER_13:'A partir de 13h'};
 let api=null,started=false,opened=false,prepared=false,dirty=true,week='',interval='',view=null,session=0,sequence=0,loading=false,busy=false,readPromise=null,pendingAction=null,dayContext=null;
 const drafts=new Map(),fields=new Map();
 const visible=()=>opened&&el('Details')?.open===true&&(!document.documentElement?.dataset?.activePanel||document.documentElement.dataset.activePanel==='agent-production')&&document.getElementById('missionProductionFabricationPane')?.hidden!==true&&document.getElementById('missionProductionWeeklyPane')?.hidden!==true;
 const locked=()=>!started||loading||busy||pendingAction!==null;
 function status(text,error=false){if(el('Status')){el('Status').textContent=text;el('Status').dataset.error=String(error);}}
 function remember(){for(const [key,input]of fields){const old=drafts.get(key);if(old)drafts.set(key,{...old,declaration:input.declaration.value,reason:input.reason.value,confirmed:input.confirmed.checked===true});}}
 function controls(){if(!el(''))return;const lock=locked(),choosing=dayContext?.part===null;el('Week').value=week;el('Week').max=nextEnd();el('Week').disabled=lock;el('Interval').disabled=lock||!view||view.week_end!==week||choosing;el('Refresh').disabled=lock||choosing;el('Retry').hidden=pendingAction===null;el('Retry').disabled=!started||busy;for(const [name,part]of [['Before','BEFORE_13'],['After','AT_OR_AFTER_13']]){el(name).hidden=!dayContext||weekday(dayContext.date)!==5;el(name).disabled=lock||!dayContext||!validWeek(part==='BEFORE_13'?dayContext.date:shift(dayContext.date,7));el(name).setAttribute('aria-pressed',String(dayContext?.part===part));}for(const input of fields.values()){for(const n of [input.declaration,input.reason,input.confirmed,input.button])n.disabled=lock||!input.available;}}
 function renderDay(){const target=el('Day');target.hidden=dayContext===null;if(!dayContext)return;el('DayTitle').textContent='Conferir fabricação de '+date(dayContext.date);el('DayMessage').textContent=weekday(dayContext.date)===5?'A sexta pertence a duas semanas. Confira antes e a partir de 13h separadamente; uma metade não confirma o dia inteiro.'+(!validWeek(shift(dayContext.date,7))?' A metade a partir de 13h estará disponível após esse corte.':''):'Dia completo, da meia-noite até a próxima meia-noite em Brasília. Declare somente depois de conferir todos os lotes.';}

 function render(){
  if(!el(''))return;remember();renderDay();fields.clear();el('Intervals').replaceChildren();el('Interval').replaceChildren();const summary=el('Summary');summary.replaceChildren(node('h4','Conferência da semana de fabricação'));
  if(dayContext?.part===null){summary.append(node('p','Escolha a metade da sexta que deseja conferir. A abertura não salva nenhuma declaração.'));controls();return;}
  if(!view||view.week_end!==week){summary.append(node('strong','Sem conferência carregada','production-weekly-amount'),node('p','A ausência de registros não significa gasto zero.'));controls();return;}
  const total=view.summary;summary.append(node('p',time(view.period.start_at)+' → '+time(view.period.end_at)+' · Brasília'),node('strong',total.state==='CONFIRMED'?money(total.total_cost_cents):total.state==='OPEN'?'Semana em andamento':total.confirmed_intervals===8?'Custos históricos pendentes':'Conferência pendente','production-weekly-amount'),node('p',count(total.confirmed_intervals)+' de 8 intervalos conferidos · '+count(total.recorded_quantity)+' peça(s) registrada(s).'));
  if(total.state==='CONFIRMED')summary.append(node('p','Custo dos lotes declarados, com todos os intervalos conferidos pelo proprietário.'));
  else if(total.known_cost_cents>0)summary.append(node('p','Subtotal dos lotes com custo conhecido: '+money(total.known_cost_cents)+'. O total da semana permanece pendente.'));
  if(total.unknown_cost_quantity>0)summary.append(node('p',count(total.unknown_cost_quantity)+' peça(s) com custo histórico desconhecido.'));
  if(total.boundary_pending_records>0)summary.append(node('p',count(total.boundary_pending_records)+' registro(s) com horário de sexta ainda não confirmado.'));
  if(!view.intervals.some(row=>row.key===interval))interval=(view.intervals.find(row=>row.can_confirm&&row.state!=='CONFIRMED')||view.intervals[0]).key;for(const row of view.intervals){const option=node('option',date(row.date)+' · '+parts[row.part]+' · '+labels[row.state]);option.value=row.key;el('Interval').append(option);}el('Interval').value=interval;
  for(const row of view.intervals.filter(row=>row.key===interval)){
   const form=node('form',undefined,'production-weekly-record');form.dataset.coverageInterval=row.key;form.append(node('h4',date(row.date)+' · '+parts[row.part]),node('p',labels[row.state]),node('p',count(row.recorded.quantity)+' peça(s) atribuída(s) · '+count(row.recorded.unknown_quantity)+' sem custo histórico.'));
   if(row.attestation)form.append(node('p',(row.attestation.mode==='NO_MANUFACTURING'?'Sem fabricação declarada':'Todos os lotes declarados como registrados')+' · '+time(row.attestation.confirmed_at)+'. '+row.attestation.reason));
   if(!row.can_confirm&&!row.can_revoke){form.append(node('p',row.state==='OPEN'?'A conferência fica disponível quando este intervalo terminar.':'Confirme primeiro a divisão das peças de sexta antes/a partir de 13h.'));el('Intervals').append(form);continue;}
   let d=drafts.get(row.key)||{source_hash:row.source_hash,declaration:'',reason:'',confirmed:false};if(d.source_hash!==row.source_hash)d={...d,source_hash:row.source_hash,confirmed:false};drafts.set(row.key,d);
   const grid=node('div',undefined,'production-weekly-fields'),select=node('select');select.name='declaration';select.setAttribute('name','declaration');
   const choices=[['','Escolha a declaração']];if(row.can_confirm)choices.push(row.recorded.quantity>0?['ALL_RECORDED','Todos os lotes fabricados foram registrados']:['NO_MANUFACTURING','Não houve fabricação neste intervalo']);if(row.can_revoke)choices.push(['REVOKE','Retirar a conferência anterior']);
   if(d.declaration&&!choices.some(([key])=>key===d.declaration))choices.push([d.declaration,'Declaração anterior incompatível · escolha novamente']);for(const [key,text]of choices){const option=node('option',text);option.value=key;select.append(option);}select.value=d.declaration;
   const reason=node('input');reason.name='reason';reason.setAttribute('name','reason');reason.maxLength=240;reason.value=d.reason;
   const label=(caption,input)=>{const n=node('label',caption);n.append(input);grid.append(n);};label('O que você conferiu?',select);label('Como conferiu ou por que está retirando a confirmação?',reason);
   const check=node('input');check.type='checkbox';check.name='confirmed';check.setAttribute('name','confirmed');check.checked=d.confirmed;const confirmation=node('label',undefined,'production-weekly-confirm production-weekly-wide');confirmation.append(check,node('span','Conferi os lotes e o intervalo real. Confirmo a declaração escolhida ou a retirada da conferência anterior.'));grid.append(confirmation);
   for(const input of [select,reason,check]){input.oninput=()=>{if(input!==check)check.checked=false;remember();};input.onchange=input.oninput;}
   const button=node('button',d.declaration==='REVOKE'?'Retirar conferência':'Salvar conferência');button.type='submit';button.dataset.coverageAction=d.declaration==='REVOKE'?'revoke':'confirm';select.onchange=()=>{check.checked=false;remember();button.textContent=select.value==='REVOKE'?'Retirar conferência':'Salvar conferência';button.dataset.coverageAction=select.value==='REVOKE'?'revoke':'confirm';};form.append(grid,button);fields.set(row.key,{declaration:select,reason,confirmed:check,button,available:true});form.onsubmit=event=>{event.preventDefault();return submit(row.key);};el('Intervals').append(form);
  }
  controls();
 }
 function invalid(text){status(text,true);controls();return false;}
 function submit(key){
  if(locked()||!view||view.week_end!==week||dayContext?.part===null)return false;remember();const row=view.intervals.find(r=>r.key===key),d=drafts.get(key);if(!row||!d||d.source_hash!==row.source_hash)return invalid('A origem mudou. Atualize a leitura e confira novamente.');
  const revoke=d.declaration==='REVOKE',mode=revoke?null:d.declaration;if(revoke?!row.can_revoke:!row.can_confirm||mode!==(row.recorded.quantity>0?'ALL_RECORDED':'NO_MANUFACTURING'))return invalid('Escolha uma declaração compatível com este intervalo.');
  const reason=d.reason.trim().normalize('NFC');if(!reason||reason.length>240||/[\u0000-\u001f\u007f-\u009f]/.test(reason))return invalid('Informe como conferiu o período, com até 240 caracteres.');if(!d.confirmed)return invalid('Confirme explicitamente a declaração do intervalo.');
  let body;try{body=Object.freeze({action:revoke?'revoke':'confirm',week_end:week,interval_key:key,source_hash:row.source_hash,revision:view.revision,ledger_revision:view.source.ledger_revision,timing_revision:view.source.timing_revision,request_id:crypto.randomUUID(),mode,reason,confirmed:true});}catch{return invalid('O navegador não conseguiu preparar a confirmação. Atualize a página.');}
  sequence++;readPromise=null;loading=false;pendingAction={body,session,previous:row.attestation?Object.freeze({...row.attestation}):null};return sendPending();
 }
 const path=()=> 'production/coverage?week_end='+encodeURIComponent(week);
 async function load({preserveMessage=false}={}){
  if(!started||!visible()||busy||pendingAction||dayContext?.part===null||!validWeek(week))return false;if(readPromise)return readPromise;remember();const epoch=session,token=++sequence,selected=week;loading=true;if(!preserveMessage)status('Conferindo somente fabricação e declarações já salvas…');controls();
  const task=(async()=>{try{const checked=projectProductionCoverageWorkspace(await api(path()));if(!started||epoch!==session||token!==sequence||selected!==week)return false;if(!checked||checked.week_end!==selected)throw Error();view=checked;dirty=false;if(!preserveMessage)status('Conferência carregada. Períodos sem declaração continuam desconhecidos.');render();return true;}catch{if(started&&epoch===session&&token===sequence){status('Não foi possível conferir agora. A última leitura e os rascunhos foram preservados.',true);render();}return false;}finally{if(epoch===session&&token===sequence){readPromise=null;loading=false;controls();}}})();readPromise=task;return task;
 }
 async function sendPending(){
  const action=pendingAction;if(!started||busy||!action||action.session!==session)return false;busy=true;status('Salvando sua declaração de fabricação…');controls();let refresh=false;
  try{const checked=projectProductionCoverageWorkspace(await api('production/coverage',action.body));if(!started||session!==action.session||pendingAction!==action)return false;const saved=checked?.intervals.find(row=>row.key===action.body.interval_key)?.attestation,prior=action.previous;if(!checked||checked.week_end!==action.body.week_end||checked.revision<action.body.revision+1||!saved||saved.reason!==action.body.reason||(action.body.action==='confirm'?saved.mode!==action.body.mode||saved.source_hash!==action.body.source_hash||saved.revoked_at!==null:!prior||saved.mode!==prior.mode||saved.source_hash!==prior.source_hash||saved.confirmed_at!==prior.confirmed_at||saved.revoked_at===null))throw Error();sequence++;readPromise=null;loading=false;view=checked;dirty=false;pendingAction=null;drafts.delete(action.body.interval_key);fields.delete(action.body.interval_key);status(action.body.action==='revoke'?'Conferência retirada com histórico preservado.':'Declaração salva. O custo total depende dos demais intervalos e custos históricos.');render();return true;}
  catch(error){if(!started||session!==action.session||pendingAction!==action)return false;const own=k=>Object.getOwnPropertyDescriptor(error||{},k)?.value,http=own('status');if([400,404,409].includes(http)){pendingAction=null;refresh=true;status(http===409?'Os registros ou declarações mudaram. Confira a leitura atual; seu rascunho foi preservado.':'A declaração não foi aceita. Confira os campos; seu rascunho foi preservado.',true);}else status(http===401?'Entre novamente para confirmar o envio.':'O envio ainda não foi confirmado. Retome a mesma tentativa para evitar duplicidade.',true);render();return false;}
  finally{if(started&&session===action.session){busy=false;controls();if(refresh)await load({preserveMessage:true});}}
 }
 function openForDate(value,options={}){
  if(!prepare()||!started||loading||busy||pendingAction)return false;
  const part=options?.part,friday=validDay(value)&&weekday(value)===5;
  if(!validDay(value)||value>today()||!friday&&part!==undefined&&part!=='DAY'||friday&&part!==undefined&&!['BEFORE_13','AT_OR_AFTER_13'].includes(part))return invalid('Escolha uma data válida até hoje e a metade correta da sexta-feira.');
  const chosen=friday?part??null:'DAY',target=friday?shift(value,chosen==='AT_OR_AFTER_13'?7:0):shift(value,(5-weekday(value)+7)%7);
  if(!validWeek(target))return invalid('Esse intervalo ainda não está disponível ou está fora do histórico permitido.');
  remember();dayContext={date:value,part:chosen};opened=true;el('Details').open=true;
  if(chosen===null){render();status('Escolha antes ou a partir de 13h; a sexta exige duas conferências distintas.');return true;}
  const changed=week!==target;week=target;interval=value+':'+chosen;if(changed)dirty=true;
  if(!visible()){render();return false;}if(dirty||!view||view.week_end!==week)return load();render();status('Intervalo selecionado. A declaração exige sua conferência e confirmação explícita.');return true;
 }
 function prepare(){if(prepared||!el(''))return !!el('');prepared=true;el('Before').onclick=()=>dayContext?openForDate(dayContext.date,{part:'BEFORE_13'}):false;el('After').onclick=()=>dayContext?openForDate(dayContext.date,{part:'AT_OR_AFTER_13'}):false;el('Details').ontoggle=()=>{if(el('Details').open){opened=true;load();}};el('Week').onchange=()=>{if(locked()){controls();return false;}const selected=el('Week').value;if(!validWeek(selected)){controls();return invalid('Escolha uma sexta-feira válida até o próximo corte.');}remember();dayContext=null;week=selected;interval='';dirty=true;render();return load();};el('Interval').onchange=()=>{if(locked()||!view){controls();return false;}const key=el('Interval').value;if(!view.intervals.some(row=>row.key===key))return invalid('Escolha um intervalo da semana carregada.');remember();dayContext=null;interval=key;render();return true;};el('Refresh').onclick=()=>refresh();el('Retry').onclick=sendPending;for(const event of ['mls-production-analytics-ready','mls-production-timing-ready'])document.addEventListener(event,()=>refresh());return true;}
 function start(options={}){if(typeof options.api!=='function'||!prepare())return false;if(started&&api===options.api)return true;session++;started=true;api=options.api;if(!validWeek(week))week=shift(nextEnd(),-7);status('Abra Produção para consultar a conferência salva.');controls();if(visible())load();return true;}
 function open(){if(!prepare())return false;opened=true;el('Details').open=true;if(!started||!visible())return false;if(dirty||!view)return load();render();return true;}
 function refresh(){dirty=true;return load();}
 function bootstrapState(options={}){if(!prepare())return false;if(!started)status(options.phase==='FAILED'?'Entre na sessão administradora para consultar a fabricação.':'Aguardando a sessão administradora.');controls();return true;}
 function stop(){session++;sequence++;started=false;opened=false;api=null;view=null;week='';interval='';dirty=true;loading=false;busy=false;readPromise=null;pendingAction=null;dayContext=null;drafts.clear();fields.clear();status('Sessão encerrada. Entre novamente para consultar a fabricação.');render();}
 globalThis.brazaProductionCoverage=Object.freeze({start,bootstrapState,open,openForDate,refresh,stop,getSnapshot:()=>view?projectProductionCoverageWorkspace(view):null});prepare();if(el(''))render();
})();

(()=>{
 const el=id=>document.getElementById(id);
 let selected='manufacturing',mode='daily';
 const reference=hash=>hash==='#costPeriods'||typeof hash==='string'&&hash.startsWith('#costPeriods');
 function activateFragment(fragment='',{deferWeekly=false}={}){
  if(!el('missionProductionFabricationPane')||!el('missionProductionReferencePane'))return false;
  selected=reference(fragment)?'sales-reference':'manufacturing';
  mode=/^#production(Weekly|Coverage)/.test(fragment)?'weekly':/^#incurredProduction(Form|Record|Void|Proposal)/.test(fragment)?'records':/^#incurredProduction(Range|Start|End|Apply|This|Compar|Month$|Week$|DailyDetails)/.test(fragment)?'range':'daily';
  el('missionProductionFabricationPane').hidden=selected!=='manufacturing';el('missionProductionReferencePane').hidden=selected!=='sales-reference';
  const heading=el('missionProductionOperationsTitle'),intro=heading?.closest?.('.mission-operation-heading')?.querySelector?.('p');
  if(heading)heading.textContent=selected==='manufacturing'?'Produção e custo por data de fabricação':'Referência de custo dos pedidos vendidos';
  if(intro)intro.textContent=selected==='manufacturing'?'Consulte os registros de fabricação por dia, mês ou intervalo. Os custos históricos pertencem às peças registradas.':'Custos atuais aplicados aos pedidos pagos, pela data de criação. A fabricação realizada tem seu próprio histórico.';
  const show=(id,visible)=>{const item=el(id);if(item)item.hidden=!visible;};
  show('missionProductionWeeklyPane',mode==='weekly');show('incurredProduction',mode!=='weekly');
  show('incurredProductionCalendar',mode==='daily');show('incurredProductionFinancePane',mode==='daily');show('incurredProductionRangePane',mode==='range');show('incurredProductionRecordsPane',mode==='records');
  const context=el('productionWorkspaceContext');if(context)context.textContent=mode==='weekly'?'Fechamento semanal · sexta 13h → sexta 13h, Brasília. Relatório capturado e total conferido têm estados próprios.':mode==='records'?'Registrar produção · informe somente peças realmente fabricadas. Datas e custos ficam no histórico.':mode==='range'?'Consultar intervalo · as duas datas entram no recorte dos lotes salvos.':'Diário e mês · custo das peças registradas na data de fabricação. Confira a completude do dia antes de considerar o total fechado.';
  if(selected==='manufacturing'){
   const details=el('incurredProductionDetails');
   if(details&&(!details.open||!globalThis.brazaIncurredProduction?.getSnapshot?.()))globalThis.brazaIncurredProduction?.open?.();
   if(mode!=='weekly')globalThis.brazaProductionWeeklyClosing?.suspend?.();
   if(mode==='weekly'){if(!deferWeekly)globalThis.brazaProductionWeeklyClosing?.open?.();if(fragment.startsWith('#productionCoverage'))globalThis.brazaProductionCoverage?.open?.();}
   if(mode==='daily')globalThis.brazaProductionDailyFinance?.refresh?.();
  }
  return true;
 }
 function navigate(fragment){const link=document.querySelector?.('#agent-production .mission-page-tabs a[href="'+fragment+'"]');if(link?.click){link.click();return true;}return activateFragment(fragment);}
 function confirmDay(){const date=globalThis.brazaIncurredProduction?.getAnalyticsSnapshot?.()?.selected_day?.date;if(!date)return false;navigate('#productionWeeklyClosing');const result=globalThis.brazaProductionCoverage?.openForDate?.(date)??false;const focus=ok=>{if(ok!==false&&selected==='manufacturing'&&mode==='weekly'){const target=el('productionCoverageDetails');target?.scrollIntoView?.({block:'start',behavior:'instant'});target?.querySelector?.('summary')?.focus?.();}return ok;};return result&&typeof result.then==='function'?result.then(focus):focus(result);}
 function openContext(context){if(!activateFragment('#productionWeeklyClosing',{deferWeekly:true}))return false;return globalThis.brazaProductionWeeklyClosing?.openContext?.(context)??false;}
 function open({fragment='',context=null}={}){if(context)return openContext(context);if(/^#productionWeekly/.test(fragment)&&typeof URLSearchParams==='function'){const params=new URLSearchParams(globalThis.location?.search||'');if(params.getAll('month').length===1&&params.getAll('week_end').length===1)return openContext({month:params.get('month'),week_end:params.get('week_end')});}return activateFragment(fragment);}
 const confirm=el('incurredProductionConfirmDay');if(confirm)confirm.onclick=confirmDay;
 document.addEventListener?.('mls-production-register-day',()=>navigate('#incurredProductionRecordsPane'));
 globalThis.brazaProductionWorkspace=Object.freeze({open,openContext,activateFragment,confirmDay,getSnapshot:()=>Object.freeze({active_pane:selected,active_view:mode})});
})();