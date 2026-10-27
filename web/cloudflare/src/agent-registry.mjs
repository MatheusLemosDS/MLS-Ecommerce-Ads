export function buildMlsAgentRegistry({day=null,month=null,reconciliation=null,releases=null,incomeOverview=null,now=null}={}){
 const safe=value=>Number.isSafeInteger(value)&&!Object.is(value,-0);
 const money=value=>safe(value)?value:null;
 const list=value=>Array.isArray(value)?value.filter(item=>typeof item==='string'&&item.length<=80):[];
 const releasePending=releases?.month===month?.month?list(releases?.report?.report?.pending):[];
 const pending=[...new Set([...list(month?.pending),...list(day?.pending),...releasePending])];
 const priorities=[];
 const releaseOrders=releases?.month===month?.month&&releases?.orders&&typeof releases.orders==='object'?releases.orders:null,releaseSummary=releaseOrders?.summary&&typeof releaseOrders.summary==='object'?releaseOrders.summary:null,releaseRows=Array.isArray(releaseOrders?.rows)?releaseOrders.rows:[];
 const expenseSchedule=month?.expense_schedule?.month===month?.month&&month.expense_schedule?.status==='AVAILABLE'?month.expense_schedule:null;
 const reconciliationMoney=reconciliation?.month===month?.month&&Array.isArray(reconciliation?.money)?reconciliation.money:[],reconciliationPayouts=new Map();
 for(const group of reconciliationMoney)for(const payout of Array.isArray(group?.money?.payouts)?group.money.payouts:[])if(typeof payout?.order_hash==='string')reconciliationPayouts.set(payout.order_hash,payout);
 let settlementConflicts=0;
 for(const row of releaseRows){const payout=reconciliationPayouts.get(row?.order_hash),left=row?.after_adjustment_repass_cents,right=payout?.after_adjustment_repass_cents;if(safe(left)&&safe(right)&&left!==right)settlementConflicts++;}
 if(settlementConflicts)priorities.push(Object.freeze({code:'SETTLEMENT_EVIDENCE_CONFLICT',severity:'BLOCKED',title:'Divergência no repasse após ajustes',detail:settlementConflicts+' pedido(s) têm valores incompatíveis entre a conferência de devoluções e a de liberações.',href:'#businessEscrowReleases',agent_id:'auditor'}));
 if(safe(expenseSchedule?.overdue_count)&&expenseSchedule.overdue_count>0)priorities.push(Object.freeze({code:'EXPENSES_OVERDUE',severity:'ATTENTION',title:'Contas vencidas precisam de conferência',detail:expenseSchedule.overdue_count+' lançamento(s) em aberto passaram do vencimento informado.',href:'#businessMonthExpensesDetails',agent_id:'finance'}));
 if(safe(expenseSchedule?.due_today_count)&&expenseSchedule.due_today_count>0)priorities.push(Object.freeze({code:'EXPENSES_DUE_TODAY',severity:'ATTENTION',title:'Contas vencem hoje',detail:expenseSchedule.due_today_count+' lançamento(s) em aberto vencem hoje.',href:'#businessMonthExpensesDetails',agent_id:'finance'}));
 if((expenseSchedule?.overdue_count??0)===0&&(expenseSchedule?.due_today_count??0)===0&&safe(expenseSchedule?.due_next_7_days_count)&&expenseSchedule.due_next_7_days_count>0)priorities.push(Object.freeze({code:'EXPENSES_DUE_SOON',severity:'WORKING',title:'Próximos pagamentos',detail:expenseSchedule.due_next_7_days_count+' lançamento(s) vencem nos próximos 7 dias.',href:'#businessMonthExpensesDetails',agent_id:'finance'}));
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
  PERIOD_LIMIT_REACHED:['ATTENTION','Período financeiro parcial','A coleta encontrou o limite configurado antes de concluir o período.','#businessMonth','auditor'],
  RELEASE_IDENTITY_AMBIGUOUS:['ATTENTION','Conferir liberações repetidas','Há pedido(s) com mais de uma ocorrência no calendário de liberações.','#businessEscrowReleases','finance'],
  RELEASE_AMOUNT_UNVERIFIED:['ATTENTION','Conferir valores liberados','Há liberações localizadas cujo valor ainda não pôde ser compatibilizado com o repasse.','#businessEscrowReleases','finance'],
  RELEASE_SOURCE_UNAVAILABLE:['ATTENTION','Fonte de liberações indisponível','A última consulta de liberações encontrou uma falha e preservou as evidências anteriores.','#businessEscrowReleases','auditor'],
  FINANCIAL_EVIDENCE_MISSING:['ATTENTION','Completar evidência financeira das liberações','Há pedidos localizados sem base financeira suficiente para validar o valor liberado.','#businessEscrowReleases','finance'],
  SOURCE_MISSING:['ATTENTION','Coorte financeira incompleta nas liberações','Parte dos pedidos do resumo ainda não está disponível para o cruzamento de liberações.','#businessEscrowReleases','auditor'],
  MATCHING_INCOMPLETE:['WORKING','Conciliação de liberações em andamento','Ainda existem pedidos pagos sem correspondência completa no calendário consultado.','#businessEscrowReleases','finance'],
  RELEASES_COLLECTING:['WORKING','Calendário de liberações em atualização','O servidor ainda está conferindo as liberações do mês.','#businessEscrowReleases','finance']
 };
 for(const code of pending){
  const row=priorityMap[code];
  if(!row)continue;
  if(priorities.some(item=>item.code===code))continue;
  priorities.push(Object.freeze({code,severity:row[0],title:row[1],detail:row[2],href:row[3],agent_id:row[4]}));
 }
 if(month?.status==='RUNNING'&&!priorities.some(item=>item.code==='COLLECTING'))priorities.push(Object.freeze({code:'COLLECTING',severity:'WORKING',title:'Coleta financeira em andamento',detail:'O servidor está atualizando o mês sem depender desta aba.',href:'#businessMonth',agent_id:'auditor'}));
 if(safe(releaseSummary?.not_located_orders)&&releaseSummary.not_located_orders>0&&!priorities.some(item=>item.code==='MATCHING_INCOMPLETE'))priorities.push(Object.freeze({code:'RELEASES_NOT_LOCATED',severity:'WORKING',title:'Pedidos sem liberação localizada neste calendário',detail:releaseSummary.not_located_orders+' pedido(s) pagos ainda não aparecem no calendário de liberações consultado. Isso não comprova falta de recebimento.',href:'#businessEscrowReleases',agent_id:'finance'}));
 const dailyNet=money(day?.net_cents),dailySales=money(day?.sales_cents),dailyAds=money(day?.ads_spend_cents),dailyPaid=safe(day?.paid_orders)&&day.paid_orders>=0?day.paid_orders:null;
 let margin=null;
 if(dailyNet!==null&&dailySales!==null&&dailySales>0){
  const value=BigInt(dailyNet)*10000n/BigInt(dailySales);
  if(value>=BigInt(Number.MIN_SAFE_INTEGER)&&value<=BigInt(Number.MAX_SAFE_INTEGER))margin=Number(value);
 }
 const monthBalance=money(month?.balance_cents);
 const currentPending=incomeOverview?.status&&money(incomeOverview?.pending_cents),incomeCheckedAt=safe(incomeOverview?.checked_at)?incomeOverview.checked_at:null;
 const coverage=month?.production_coverage&&typeof month.production_coverage==='object'?month.production_coverage:null;
 const knownUnits=safe(coverage?.known_units)&&coverage.known_units>=0?coverage.known_units:null,totalUnits=safe(coverage?.total_units)&&coverage.total_units>=0?coverage.total_units:null;
 const returns=safe(month?.coverage?.returns)&&month.coverage.returns>=0?month.coverage.returns:0;
 const returnsUnknown=safe(month?.coverage?.returns_unknown)&&month.coverage.returns_unknown>=0?month.coverage.returns_unknown:0;
 const reviews=['cancel_pending','other','unknown'].reduce((total,key)=>total+(safe(month?.coverage?.[key])&&month.coverage[key]>=0?month.coverage[key]:0),0);
 const has=code=>pending.includes(code);
 const collectionWorking=month?.status==='RUNNING'||has('COLLECTING'),working=collectionWorking||priorities.some(item=>item.severity==='WORKING');
 const blocked=priorities.some(item=>item.severity==='BLOCKED');
 const attention=priorities.some(item=>item.severity==='ATTENTION');
 const overall=blocked?'BLOCKED':attention?'ATTENTION':working?'WORKING':month?'HEALTHY':'WORKING';
 const agent=(id,name,area,status,message,href,metric=null,metric_kind=null,secondary_metric=null,secondary_metric_kind=null,secondary_metric_label=null)=>Object.freeze({id,name,area,mode:'OBSERVER',status,message,href,metric,metric_kind,secondary_metric,secondary_metric_kind,secondary_metric_label,last_checked_at:safe(month?.checked_at)?month.checked_at:null});
 const expenseUrgent=(safe(expenseSchedule?.overdue_count)&&expenseSchedule.overdue_count>0)||(safe(expenseSchedule?.due_today_count)&&expenseSchedule.due_today_count>0);
 const expenseUpcoming=safe(expenseSchedule?.due_next_7_days_count)&&expenseSchedule.due_next_7_days_count>0;
 const financeAttention=expenseUrgent||['PAYMENT_INCOMPLETE','TAX_POLICY_REQUIRED','INVOICE_TAX_UNAVAILABLE','EXTERNAL_EXPENSES_REQUIRED','ADJUSTMENT_UNAVAILABLE','ADJUSTMENTS_PENDING','ADJUSTMENT_CONFLICT','FINANCIAL_SOURCE_STALE','SOURCE_UNAVAILABLE','RELEASE_IDENTITY_AMBIGUOUS','RELEASE_AMOUNT_UNVERIFIED','FINANCIAL_EVIDENCE_MISSING'].some(has);
 const adsAttention=['ADS_UNAVAILABLE','ADS_SOURCE_STALE','RECHARGE_TREATMENT_REQUIRED','ADJUSTMENT_UNAVAILABLE','ADJUSTMENT_CONFLICT'].some(has);
 const productAttention=has('PRODUCTION_COST_INCOMPLETE');
 const returnAttention=has('RETURNS_NOT_RECONCILED')||has('STATUS_REVIEW_REQUIRED')||returns+returnsUnknown+reviews>0;
 const auditBlocked=has('ARITHMETIC_UNSAFE')||has('SOURCE_UNAVAILABLE')||has('ADJUSTMENT_CONFLICT')||settlementConflicts>0;
 const auditAttention=auditBlocked||has('FINANCIAL_SOURCE_STALE')||has('PERIOD_LIMIT_REACHED')||has('RELEASE_SOURCE_UNAVAILABLE')||has('SOURCE_MISSING');
 const financeWorking=expenseUpcoming||collectionWorking||has('MATCHING_INCOMPLETE')||has('RELEASES_COLLECTING')||(safe(releaseSummary?.not_located_orders)&&releaseSummary.not_located_orders>0);
 const financeStatus=month?financeAttention?'ATTENTION':financeWorking?'WORKING':'HEALTHY':'WORKING';
 const adsStatus=month?adsAttention?'ATTENTION':collectionWorking?'WORKING':'HEALTHY':'WORKING';
 const productStatus=month?productAttention?'ATTENTION':collectionWorking?'WORKING':'HEALTHY':'WORKING';
 const productionStatus=month?productAttention?'ATTENTION':collectionWorking?'WORKING':'HEALTHY':'WORKING';
 const returnsStatus=month?returnAttention?'ATTENTION':collectionWorking?'WORKING':'HEALTHY':'WORKING';
 const auditorStatus=auditBlocked?'BLOCKED':auditAttention?'ATTENTION':collectionWorking?'WORKING':month?'HEALTHY':'WORKING';
 const agents=[
  agent('finance','MLS Finance','Financeiro',financeStatus,expenseUrgent?(expenseSchedule.overdue_count+' conta(s) atrasada(s) e '+expenseSchedule.due_today_count+' vencendo hoje precisam de conferência.'):(expenseUpcoming?expenseSchedule.due_next_7_days_count+' pagamento(s) vencem nos próximos 7 dias.':releaseSummary?(releaseSummary.verified_orders+' liberação(ões) conferida(s); '+releaseSummary.not_located_orders+' pedido(s) sem liberação localizada neste calendário.'):(monthBalance!==null?'Resultado mensal estimado disponível para acompanhamento.':financeAttention?'O fechamento financeiro ainda depende de conferências.':'Aguardando o resumo financeiro validado.')),'#businessMonthExpensesDetails',monthBalance,'money',currentPending,'money',currentPending!==null?'Pendente atual na Shopee':null),
  agent('ads','MLS Ads','Anúncios',adsStatus,dailyAds!==null?'Investimento do dia acompanha a mesma leitura usada no resultado.':adsAttention?'A leitura de anúncios requer atenção.':'Aguardando o gasto diário validado.','/dashboard',dailyAds,'money'),
  agent('products','MLS Products','Produtos',productStatus,productAttention?'Existem unidades vendidas sem custo confirmado.':month?'Custos dos itens vendidos não apresentam bloqueio de cobertura.':'Aguardando o catálogo financeiro do mês.','/admin?tab=products',totalUnits,'units'),
  agent('production','MLS Production','Produção',productionStatus,knownUnits!==null&&totalUnits!==null?knownUnits+' de '+totalUnits+' unidade(s) com custo conhecido.':'Aguardando a cobertura de custos da produção.','/admin?tab=production',knownUnits,'units'),
  agent('returns','MLS Returns','Devoluções',returnsStatus,returnAttention?(returns+returnsUnknown)+' pedido(s) pagos com devolução e '+reviews+' em revisão exigem acompanhamento.':'Nenhuma pendência de devolução foi sinalizada no mês.','#businessReconciliation',returns+returnsUnknown+reviews,'count'),
  agent('auditor','MLS Auditor','Auditoria',auditorStatus,settlementConflicts?settlementConflicts+' divergência(s) entre evidências de repasse após ajustes precisam ser resolvidas.':auditBlocked?'Uma inconsistência impede tratar os dados como confiáveis.':auditAttention?'A qualidade ou o frescor dos dados precisa de atenção.':collectionWorking?'Aguardando a conclusão da coleta do servidor.':'As validações do resumo não indicam bloqueios.','#businessEscrowReleases',priorities.length,'count')
 ];
 const hermesStatus=overall==='BLOCKED'?'BLOCKED':overall==='ATTENTION'?'ATTENTION':overall==='WORKING'?'WORKING':'HEALTHY';
 const hermes=agent('hermes','MLS Hermes','Supervisor',hermesStatus,blocked?'Há um bloqueio que deve ser resolvido antes de qualquer automação.':attention?priorities.filter(item=>item.severity==='ATTENTION').length+' prioridade(s) precisam de atenção.':working?'Há conferências em andamento; nenhuma ausência de liberação é tratada como falta de recebimento.':'Monitoramento estável. Nenhuma ação comercial é executada automaticamente.','/admin?tab=hermes',priorities.length,'count');
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
  settlement:Object.freeze({
   release_orders_known:safe(releaseSummary?.known_paid_orders)?releaseSummary.known_paid_orders:null,
   releases_verified:safe(releaseSummary?.verified_orders)?releaseSummary.verified_orders:null,
   releases_not_located:safe(releaseSummary?.not_located_orders)?releaseSummary.not_located_orders:null,
   release_value_unverified:safe(releaseSummary?.unverified_orders)?releaseSummary.unverified_orders:null,
   release_ambiguous:safe(releaseSummary?.ambiguous_orders)?releaseSummary.ambiguous_orders:null,
   evidence_conflicts:settlementConflicts
  }),
  income:Object.freeze({current_pending_cents:currentPending,checked_at:incomeCheckedAt,status:typeof incomeOverview?.status==='string'?incomeOverview.status:null,basis:incomeOverview?.basis==='CURRENT_PROVIDER_INCOME_STATUS_NOT_BANK_RECEIPT_OR_HISTORICAL_MONTH'?incomeOverview.basis:null}),
  expenses:Object.freeze({status:expenseSchedule?.status??null,open_count:safe(expenseSchedule?.open_count)?expenseSchedule.open_count:null,open_cents:money(expenseSchedule?.open_cents),overdue_count:safe(expenseSchedule?.overdue_count)?expenseSchedule.overdue_count:null,overdue_cents:money(expenseSchedule?.overdue_cents),due_today_count:safe(expenseSchedule?.due_today_count)?expenseSchedule.due_today_count:null,due_today_cents:money(expenseSchedule?.due_today_cents),due_next_7_days_count:safe(expenseSchedule?.due_next_7_days_count)?expenseSchedule.due_next_7_days_count:null,due_next_7_days_cents:money(expenseSchedule?.due_next_7_days_cents),next_due_date:typeof expenseSchedule?.next_due_date==='string'?expenseSchedule.next_due_date:null,next_due_count:safe(expenseSchedule?.next_due_count)?expenseSchedule.next_due_count:null,next_due_cents:money(expenseSchedule?.next_due_cents),basis:expenseSchedule?.basis==='OWNER_DECLARED_DUE_DATES_NOT_BANK_SETTLEMENT'?expenseSchedule.basis:null}),
  priorities:Object.freeze(priorities.slice(0,8)),
  hermes,
  agents:Object.freeze(agents)
 });
}
