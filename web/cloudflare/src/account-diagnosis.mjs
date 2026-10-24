import {projectBusinessMonth} from './business-month.mjs';

// Keep every helper local so the browser can embed this function after the
// monthly projector. The diagnosis accepts only its validated, detached frame.
export function buildAccountDiagnosis(frame){
 const safe=value=>value>=BigInt(Number.MIN_SAFE_INTEGER)&&value<=BigInt(Number.MAX_SAFE_INTEGER)?Number(value):null;
 try{
  const month=projectBusinessMonth(frame);
  if(!month)return null;
  const conditions=[...month.result.pending];
  const block=code=>{if(!conditions.includes(code))conditions.push(code);};
  const hasMonthlyDas=month.tax?.regime==='MEI'&&month.tax.status==='DECLARED';
  if(!hasMonthlyDas)block('TAX_POLICY_REQUIRED');
  if(!month.source_checked_at)block('FINANCIAL_SOURCE_TIMESTAMPS_REQUIRED');
  const ratio=(numerator,denominator)=>{
   if(numerator===null||denominator===null||denominator===0)return null;
   const value=safe(BigInt(numerator)*10000n/BigInt(denominator));
   if(value===null)block('ARITHMETIC_UNSAFE');
   return value;
  };
  const adsSpend=month.ads?.status==='AVAILABLE'?month.ads.expense_cents:null;
  // TACOS compares actual calendar spend with all paid store sales for exactly
  // the same selection; neither attributed Ads GMV nor average ROAS is used.
  const tacos=ratio(adsSpend,month.sales_cents);
  let totalQuantity=null,costedQuantity=null,costCoverage=null;
  if(month.product_summary){
   let total=0n,costed=0n;
   for(const row of month.product_summary.products)for(const variant of row.variants){
    total+=BigInt(variant.quantity);
    if(variant.unit_cost_cents!==null)costed+=BigInt(variant.quantity);
   }
   totalQuantity=safe(total);costedQuantity=safe(costed);
   if(totalQuantity===null||costedQuantity===null)block('ARITHMETIC_UNSAFE');
   else costCoverage=ratio(costedQuantity,totalQuantity);
  }
  const adjustment=month.ads_adjustment_cents;
  const rechargeAddback=adjustment===null||adjustment<0||adjustment>0&&month.expenses.recharge_treatment==='UNCONFIRMED'?null:month.expenses.recharge_treatment==='ADS_RECHARGE'?adjustment:0;
  let beforeAds=null;
  if(conditions.every(code=>code==='ADS_UNAVAILABLE')&&hasMonthlyDas&&month.expected_repass_cents!==null&&month.production_cost_cents!==null&&month.invoice_tax_cents!==null&&month.expenses.external_expenses_cents!==null&&rechargeAddback!==null){
   // Recharge is already deducted from the expected payout. Add back only its
   // confirmed Ads classification, then deduct actual Ads spend once below.
   beforeAds=safe(BigInt(month.expected_repass_cents)+BigInt(rechargeAddback)-BigInt(month.production_cost_cents)-BigInt(month.tax.tax_cents)-BigInt(month.expenses.external_expenses_cents));
   if(beforeAds===null)block('ARITHMETIC_UNSAFE');
  }
  const net=conditions.length===0&&beforeAds!==null?month.result.net_estimate_cents:null;
  const tasks=[];
  const addTask=(code,priority,label,detail)=>{if(!tasks.some(task=>task.code===code))tasks.push({code,priority,label,detail});};
  const pendingTasks=[
   ['PRODUCTION_COST_INCOMPLETE','COMPLETE_PRODUCTION_COSTS','Cadastrar custos das unidades vendidas','Confirme o vínculo de cada variação e o custo de produção; quantidade sem custo não equivale a custo zero.'],
   ['RETURNS_NOT_RECONCILED','RECONCILE_RETURNS','Conciliar devoluções e reembolsos','Confirme os valores efetivos de devolução e reembolso antes de liberar a estimativa mensal.'],
   ['PAYMENT_INCOMPLETE','COMPLETE_PAYMENT_COVERAGE','Completar os dados de pagamento','Releia os pagamentos dos pedidos pagos sem cobertura; subtotal conhecido não representa o total do mês.'],
   ['FINANCIAL_SOURCE_STALE','REFRESH_FINANCIAL_SOURCE','Atualizar a leitura financeira','Atualize os dados financeiros do mês e confirme os horários das fontes.'],
   ['FINANCIAL_SOURCE_TIMESTAMPS_REQUIRED','REFRESH_FINANCIAL_SOURCE','Atualizar a leitura financeira','Atualize os dados financeiros do mês e confirme os horários das fontes.'],
   ['SOURCE_UNAVAILABLE','RESTORE_FINANCIAL_SOURCE','Restabelecer a fonte financeira','Conclua uma leitura válida da fonte financeira antes de revisar o resultado do mês.'],
   ['TAX_POLICY_REQUIRED','DECLARE_MONTHLY_DAS','Confirmar o DAS mensal do MEI','Declare o DAS da competência; o imposto mensal não deve ser substituído por uma porcentagem das vendas.'],
   ['INVOICE_TAX_UNAVAILABLE','DECLARE_MONTHLY_DAS','Confirmar o DAS mensal do MEI','Declare o DAS da competência; o imposto mensal não deve ser substituído por uma porcentagem das vendas.'],
   ['EXTERNAL_EXPENSES_REQUIRED','DECLARE_EXTERNAL_EXPENSES','Declarar despesas externas','Confirme o total de despesas externas, inclusive quando o valor for explicitamente zero.'],
   ['RECHARGE_TREATMENT_REQUIRED','CONFIRM_RECHARGE_TREATMENT','Classificar os ajustes de recarga','Confirme se o desconto no repasse foi recarga de Ads ou suporte técnico para evitar dupla contabilização.'],
   ['ADJUSTMENT_UNAVAILABLE','RECONCILE_PAYMENT_ADJUSTMENTS','Conciliar os ajustes do repasse','Obtenha os ajustes completos dos pagamentos e revise eventuais valores negativos antes de calcular o saldo.'],
   ['STATUS_REVIEW_REQUIRED','RECONCILE_ORDER_STATUS','Revisar situações dos pedidos','Concilie cancelamentos pendentes e situações desconhecidas antes de liberar a estimativa.'],
   ['COLLECTING','COMPLETE_MONTH_COLLECTION','Concluir a coleta do mês','Conclua todas as janelas do período; valores parciais não representam o mês completo.'],
   ['PERIOD_LIMIT_REACHED','REVIEW_PERIOD_COVERAGE','Revisar a cobertura do período','Resolva o limite de coleta antes de usar os subtotais como resultado mensal.'],
   ['ADS_UNAVAILABLE','REFRESH_CALENDAR_ADS','Completar o gasto real de Ads','Leia todos os dias do mesmo período financeiro; dias ausentes não equivalem a gasto zero.'],
   ['ARITHMETIC_UNSAFE','REVIEW_ARITHMETIC','Revisar os limites dos valores','O cálculo excedeu a representação monetária segura; revise a origem dos valores.'],
  ];
  for(const [pending,code,label,detail] of pendingTasks)if(conditions.includes(pending))addTask(code,'HIGH',label,detail);
  if(net!==null&&net<0)addTask('REVIEW_MONTHLY_LOSS','HIGH','Revisar a perda mensal estimada','Revise custos, repasses, despesas e gasto de Ads antes de propor qualquer aumento de investimento.');
  if(net===0)addTask('REVIEW_BREAK_EVEN','MEDIUM','Revisar o ponto de equilíbrio','A estimativa está no ponto de equilíbrio; confirme os dados e a margem antes de propor investimento adicional.');
  addTask('CHECK_STOCK_AND_CAMPAIGN',net>0?'MEDIUM':'LOW','Conferir estoque e campanhas antes de decidir','Valide estoque disponível, atribuição por produto e campanha e limites próprios de Ads. Este diagnóstico não autoriza execução nem aumento de orçamento.');
  const gaps=[
   'O repasse é esperado; recebimentos liquidados e reembolsos efetivos ainda precisam de conciliação.',
   'O gasto de Ads é do calendário; não há atribuição validada por SKU e campanha neste diagnóstico.',
   'Estoque disponível e limites de investimento em Ads ainda precisam de validação.',
  ];
  if(!month.product_summary)gaps.push('A cobertura de custos por quantidade vendida depende do resumo validado de produtos.');
  else if(month.product_summary.mixed_orders>0)gaps.push('Pedidos com vários produtos não permitem atribuir repasse ou margem individual sem conciliação.');
  return {
   schema:'account_diagnosis_v1',month:month.month,start_date:month.start_date,end_date:month.end_date,checked_at:month.checked_at,
   status:conditions.length===0&&net!==null?'READY_FOR_REVIEW':'BLOCKED',actual_profit_cents:null,execution:'READ_ONLY',basis:month.result.basis,
   metrics:{paid_store_sales_cents:month.sales_cents,ads_spend_cents:adsSpend,tacos_bps:tacos,available_before_ads_cents:beforeAds,net_estimate_cents:net,net_margin_bps:net!==null?month.result.net_margin_bps:null,recharge_addback_cents:rechargeAddback,paid_orders:month.coverage.paid,payment_covered_orders:month.coverage.payment_covered,payment_missing_orders:month.coverage.payment_missing,returns_pending_orders:month.coverage.returns+month.coverage.returns_unknown,costed_quantity:costedQuantity,total_quantity:totalQuantity,cost_coverage_bps:costCoverage},
   conditions,tasks:tasks.slice(0,15),
   limits:[
    'Somente leitura: nenhuma alteração em orçamento, ROAS alvo, campanha ou anúncio.',
    'Os limites de análises do assistente não são limites de investimento em Ads.',
    'A estimativa combina pedidos pagos do mês de criação e Ads do calendário; não representa lucro realizado.',
   ],gaps,
  };
 }catch{return null;}
}
