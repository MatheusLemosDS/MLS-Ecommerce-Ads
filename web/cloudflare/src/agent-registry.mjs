export function buildMlsAgentRegistry({day=null,month=null,now=null}={}){
 const safe=value=>Number.isSafeInteger(value)&&!Object.is(value,-0);
 const money=value=>safe(value)?value:null;
 const list=value=>Array.isArray(value)?value.filter(item=>typeof item==='string'&&item.length<=80):[];
 const pending=[...new Set([...list(month?.pending),...list(day?.pending)])];
 const priorities=[];
 const priorityMap={
  ARITHMETIC_UNSAFE:['BLOCKED','Auditoria bloqueada','Um valor não pôde ser calculado com segurança.','#businessMonthCalculationDetails','auditor'],
  SOURCE_UNAVAILABLE:['BLOCKED','Fonte financeira indisponível','Parte da base financeira ainda não está disponível.','#businessMonth','auditor'],
  FINANCIAL_SOURCE_STALE:['ATTENTION','Atualizar dados financeiros','A leitura financeira ultrapassou a janela de frescor.','#businessMonth','auditor'],
  PAYMENT_INCOMPLETE:['ATTENTION','Conferir repasses dos pedidos','Há pedidos pagos sem todos os valores financeiros.','#businessReconciliation','finance'],
  TAX_POLICY_REQUIRED:['ATTENTION','Confirmar regra fiscal','A regra mensal do DAS ainda precisa ser confirmada.','#businessMonthCalculationDetails','finance'],
  INVOICE_TAX_UNAVAILABLE:['ATTENTION','Conferir imposto','O imposto do período ainda não pôde ser calculado.','#businessMonthCalculationDetails','finance'],
  EXTERNAL_EXPENSES_REQUIRED:['ATTENTION','Conferir despesas do mês','Aluguel, funcionários, boletos ou outras despesas ainda precisam de confirmação.','#businessMonthExpensesDetails','finance'],
  RECHARGE_TREATMENT_REQUIRED:['ATTENTION','Classificar ajuste de anúncios','O ajuste precisa ser identificado como recarga ou taxa antes do fechamento.','#businessMonthExpensesDetails','ads'],
  ADJUSTMENT_UNAVAILABLE:['ATTENTION','Conferir ajuste do repasse','Falta evidência para um ajuste financeiro do período.','#businessReconciliation','finance'],
  ADJUSTMENTS_PENDING:['ATTENTION','Conferir ajustes do repasse','Os ajustes do período ainda estão em conferência.','#businessReconciliation','finance'],
  ADJUSTMENT_CONFLICT:['ATTENTION','Resolver divergência de ajuste','Os valores de ajuste não são compatíveis entre as evidências.','#businessReconciliation','auditor'],
  STATUS_REVIEW_REQUIRED:['ATTENTION','Revisar pedidos fora da base paga','Existem pedidos com situação que exige conferência.','#businessReconciliation','returns'],
  RETURNS_NOT_RECONCILED:['ATTENTION','Conciliar devoluções e reembolsos','Devoluções identificadas ainda podem alterar o resultado.','#businessReconciliation','returns'],
  PRODUCTION_COST_INCOMPLETE:['ATTENTION','Completar custos dos produtos','Há unidades vendidas sem custo de produção confirmado.','/admin?tab=products','products'],
  ADS_UNAVAILABLE:['ATTENTION','Atualizar anúncios','O gasto de anúncios do período ainda não está disponível.','/dashboard','ads'],
  ADS_SOURCE_STALE:['ATTENTION','Atualizar anúncios','A leitura de anúncios precisa ser atualizada.','/dashboard','ads'],
  COLLECTING:['WORKING','Coleta financeira em andamento','O servidor ainda está atualizando o período.','#businessMonth','auditor'],
  PERIOD_LIMIT_REACHED:['ATTENTION','Período financeiro parcial','A coleta encontrou o limite configurado antes de concluir o período.','#businessMonth','auditor']
 };
 for(const code of pending){
  const row=priorityMap[code];
  if(!row)continue;
  if(priorities.some(item=>item.code===code))continue;
  priorities.push(Object.freeze({code,severity:row[0],title:row[1],detail:row[2],href:row[3],agent_id:row[4]}));
 }
 if(month?.status==='RUNNING'&&!priorities.some(item=>item.code==='COLLECTING'))priorities.push(Object.freeze({code:'COLLECTING',severity:'WORKING',title:'Coleta financeira em andamento',detail:'O servidor está atualizando o mês sem depender desta aba.',href:'#businessMonth',agent_id:'auditor'}));
 const dailyNet=money(day?.net_cents),dailySales=money(day?.sales_cents),dailyAds=money(day?.ads_spend_cents),dailyPaid=safe(day?.paid_orders)&&day.paid_orders>=0?day.paid_orders:null;
 let margin=null;
 if(dailyNet!==null&&dailySales!==null&&dailySales>0){
  const value=BigInt(dailyNet)*10000n/BigInt(dailySales);
  if(value>=BigInt(Number.MIN_SAFE_INTEGER)&&value<=BigInt(Number.MAX_SAFE_INTEGER))margin=Number(value);
 }
 const monthBalance=money(month?.balance_cents);
 const coverage=month?.production_coverage&&typeof month.production_coverage==='object'?month.production_coverage:null;
 const knownUnits=safe(coverage?.known_units)&&coverage.known_units>=0?coverage.known_units:null,totalUnits=safe(coverage?.total_units)&&coverage.total_units>=0?coverage.total_units:null;
 const returns=safe(month?.coverage?.returns)&&month.coverage.returns>=0?month.coverage.returns:0;
 const returnsUnknown=safe(month?.coverage?.returns_unknown)&&month.coverage.returns_unknown>=0?month.coverage.returns_unknown:0;
 const reviews=['cancel_pending','other','unknown'].reduce((total,key)=>total+(safe(month?.coverage?.[key])&&month.coverage[key]>=0?month.coverage[key]:0),0);
 const has=code=>pending.includes(code);
 const collectionWorking=month?.status==='RUNNING'||has('COLLECTING');
 const blocked=priorities.some(item=>item.severity==='BLOCKED');
 const attention=priorities.some(item=>item.severity==='ATTENTION');
 const overall=blocked?'BLOCKED':attention?'ATTENTION':collectionWorking?'WORKING':month?'HEALTHY':'WORKING';
 const agent=(id,name,area,status,message,href,metric=null,metric_kind=null)=>Object.freeze({id,name,area,mode:'OBSERVER',status,message,href,metric,metric_kind,last_checked_at:safe(month?.checked_at)?month.checked_at:null});
 const financeAttention=['PAYMENT_INCOMPLETE','TAX_POLICY_REQUIRED','INVOICE_TAX_UNAVAILABLE','EXTERNAL_EXPENSES_REQUIRED','ADJUSTMENT_UNAVAILABLE','ADJUSTMENTS_PENDING','ADJUSTMENT_CONFLICT','FINANCIAL_SOURCE_STALE','SOURCE_UNAVAILABLE'].some(has);
 const adsAttention=['ADS_UNAVAILABLE','ADS_SOURCE_STALE','RECHARGE_TREATMENT_REQUIRED','ADJUSTMENT_UNAVAILABLE','ADJUSTMENT_CONFLICT'].some(has);
 const productAttention=has('PRODUCTION_COST_INCOMPLETE');
 const returnAttention=has('RETURNS_NOT_RECONCILED')||has('STATUS_REVIEW_REQUIRED')||returns+returnsUnknown+reviews>0;
 const auditBlocked=has('ARITHMETIC_UNSAFE')||has('SOURCE_UNAVAILABLE')||has('ADJUSTMENT_CONFLICT');
 const auditAttention=auditBlocked||has('FINANCIAL_SOURCE_STALE')||has('PERIOD_LIMIT_REACHED');
 const financeStatus=month?financeAttention?'ATTENTION':collectionWorking?'WORKING':'HEALTHY':'WORKING';
 const adsStatus=month?adsAttention?'ATTENTION':collectionWorking?'WORKING':'HEALTHY':'WORKING';
 const productStatus=month?productAttention?'ATTENTION':collectionWorking?'WORKING':'HEALTHY':'WORKING';
 const productionStatus=month?productAttention?'ATTENTION':collectionWorking?'WORKING':'HEALTHY':'WORKING';
 const returnsStatus=month?returnAttention?'ATTENTION':collectionWorking?'WORKING':'HEALTHY':'WORKING';
 const auditorStatus=auditBlocked?'BLOCKED':auditAttention?'ATTENTION':collectionWorking?'WORKING':month?'HEALTHY':'WORKING';
 const agents=[
  agent('finance','MLS Finance','Financeiro',financeStatus,monthBalance!==null?'Resultado mensal estimado disponível para acompanhamento.':financeAttention?'O fechamento financeiro ainda depende de conferências.':'Aguardando o resumo financeiro validado.','#businessMonth',monthBalance,'money'),
  agent('ads','MLS Ads','Anúncios',adsStatus,dailyAds!==null?'Investimento do dia acompanha a mesma leitura usada no resultado.':adsAttention?'A leitura de anúncios requer atenção.':'Aguardando o gasto diário validado.','/dashboard',dailyAds,'money'),
  agent('products','MLS Products','Produtos',productStatus,productAttention?'Existem unidades vendidas sem custo confirmado.':month?'Custos dos itens vendidos não apresentam bloqueio de cobertura.':'Aguardando o catálogo financeiro do mês.','/admin?tab=products',totalUnits,'units'),
  agent('production','MLS Production','Produção',productionStatus,knownUnits!==null&&totalUnits!==null?knownUnits+' de '+totalUnits+' unidade(s) com custo conhecido.':'Aguardando a cobertura de custos da produção.','/admin?tab=production',knownUnits,'units'),
  agent('returns','MLS Returns','Devoluções',returnsStatus,returnAttention?(returns+returnsUnknown)+' pedido(s) pagos com devolução e '+reviews+' em revisão exigem acompanhamento.':'Nenhuma pendência de devolução foi sinalizada no mês.','#businessReconciliation',returns+returnsUnknown+reviews,'count'),
  agent('auditor','MLS Auditor','Auditoria',auditorStatus,auditBlocked?'Uma inconsistência impede tratar os dados como confiáveis.':auditAttention?'A qualidade ou o frescor dos dados precisa de atenção.':collectionWorking?'Aguardando a conclusão da coleta do servidor.':'As validações do resumo não indicam bloqueios.','#businessMonth',priorities.length,'count')
 ];
 const hermesStatus=overall==='BLOCKED'?'BLOCKED':overall==='ATTENTION'?'ATTENTION':overall==='WORKING'?'WORKING':'HEALTHY';
 const hermes=agent('hermes','MLS Hermes','Supervisor',hermesStatus,blocked?'Há um bloqueio que deve ser resolvido antes de qualquer automação.':attention?priorities.filter(item=>item.severity==='ATTENTION').length+' prioridade(s) precisam de atenção.':collectionWorking?'Os agentes estão aguardando a atualização do período.':'Monitoramento estável. Nenhuma ação comercial é executada automaticamente.','/admin?tab=hermes',priorities.length,'count');
 return Object.freeze({
  schema:'mls_agent_registry_v1',
  generated_at:safe(now)&&now>0?now:Math.floor(Date.now()/1000),
  mode:'OBSERVER',
  health:overall,
  day:Object.freeze({
   date:typeof day?.date==='string'?day.date:null,
   net_cents:dailyNet,
   net_basis:day?.net_basis==='KNOWN_COSTS'?'KNOWN_COSTS':day?.net_basis==='ESTIMATE'?'ESTIMATE':null,
   sales_cents:dailySales,
   ads_spend_cents:dailyAds,
   paid_orders:dailyPaid,
   margin_bps:margin
  }),
  month:Object.freeze({
   month:typeof month?.month==='string'?month.month:null,
   balance_cents:monthBalance,
   status:typeof month?.status==='string'?month.status:null
  }),
  priorities:Object.freeze(priorities.slice(0,8)),
  hermes,
  agents:Object.freeze(agents)
 });
}
