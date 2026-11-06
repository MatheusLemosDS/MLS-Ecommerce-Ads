import {projectProductionConfirmationProposal} from './production-confirmation-proposal.mjs';

// Catalogue context is a draft suggestion, never a physical manufacturing fact.
export function buildProductionConfirmationPatch(value,key,current={}){
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
}

export const PRODUCTION_CONFIRMATION_PROPOSAL_CSS=String.raw`
.production-confirmation-proposal{grid-column:1/-1;min-width:0;padding:1rem;border:1px solid var(--line);border-radius:14px;background:var(--surface-raised)}.production-confirmation-proposal p{margin:.5rem 0;line-height:1.55}.production-confirmation-proposal h4{margin:0 0 .5rem}.production-confirmation-proposal dl{display:grid;grid-template-columns:minmax(100px,1fr) 2fr;gap:.4rem .8rem}.production-confirmation-proposal dd{margin:0;overflow-wrap:anywhere}.production-confirmation-proposal small{display:block;overflow-wrap:anywhere;line-height:1.55}.production-confirmation-proposal[data-error="true"]{border-color:#e8a25e}.production-confirmation-proposal button,.production-confirmation-proposal select{min-height:44px;max-width:100%}.production-confirmation-proposal label{display:grid;gap:.4rem;margin:.8rem 0}@media(max-width:480px){.production-confirmation-proposal dl{grid-template-columns:1fr}.production-confirmation-proposal dt{font-weight:700}.production-confirmation-proposal button{width:100%}}
`;

export const PRODUCTION_CONFIRMATION_PROPOSAL_CLIENT=String.raw`
(()=>{
 const projectProductionConfirmationProposal=${projectProductionConfirmationProposal.toString()};
 const buildProductionConfirmationPatch=${buildProductionConfirmationPatch.toString()};
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
`;
