export const PRODUCTION_WORKSPACE_CSS=String.raw`
.production-workspace-pane[hidden]{display:none!important}.production-workspace-pane{min-width:0}.production-workspace-pane>section{min-width:0}
.production-workspace-pane .incurred-production-controls>a{display:inline-flex;align-items:center;justify-content:center;min-height:44px;padding:0 12px}.production-workspace-pane [hidden]{display:none!important}.production-workspace-context{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin:0 0 16px;padding:14px 16px;border:1px solid var(--line);border-radius:12px;background:linear-gradient(120deg,var(--surface-raised),var(--surface))}.production-workspace-context p{margin:0;font-size:12px;line-height:1.7;color:var(--muted)}.production-workspace-context strong{color:var(--text)}.production-workspace-context a{color:var(--accent);font-size:12px;min-height:44px;display:inline-flex;align-items:center}.production-workspace-pane .incurred-production{border-top:2px solid var(--accent)}.production-workspace-pane .incurred-production-calendar{margin-top:12px;border:0;padding:0;background:transparent}.production-workspace-pane .incurred-production-daily-cards .incurred-production-panel{background:linear-gradient(145deg,var(--surface-raised),var(--surface));border-top:2px solid var(--accent);box-shadow:0 6px 22px #0000000c}.production-workspace-pane .incurred-production-cost-chart{height:280px}.production-workspace-pane .incurred-production-chart-wrap{padding:14px;border:1px solid var(--line);border-radius:12px;background:var(--surface-raised)}.production-workspace-pane .production-weekly{border-top:2px solid var(--accent)}.production-workspace-pane .production-weekly-grid{gap:14px}.production-workspace-pane .production-weekly-card{background:linear-gradient(145deg,var(--surface-raised),var(--surface))}@media(max-width:600px){.production-workspace-context{padding:12px}.production-workspace-pane .incurred-production-cost-chart{height:230px}.production-workspace-pane .incurred-production-chart-wrap{padding:10px}}
`;

export function productionWorkspaceBody({daily,weekly,coverage,reference}){
 return '<div id="missionProductionFabricationPane" class="production-workspace-pane"><div class="production-workspace-context"><p id="productionWorkspaceContext"><strong>Diário e mês</strong> · Custo das peças registradas na data de fabricação.</p><a href="/admin?tab=agent-production#incurredProductionRecordsPane">Registrar produção →</a></div>'+daily+'<div id="missionProductionWeeklyPane" hidden>'+weekly+coverage+'</div></div><div id="missionProductionReferencePane" class="production-workspace-pane" hidden>'+reference+'</div>';
}

// These panes change the visible source, never the source facts. Opening the
// manufacturing pane uses the existing authenticated, lazy ledger controller.
export const PRODUCTION_WORKSPACE_CLIENT=String.raw`
(()=>{
 const el=id=>document.getElementById(id);
 let selected='manufacturing',mode='daily';
 const reference=hash=>hash==='#costPeriods'||typeof hash==='string'&&hash.startsWith('#costPeriods');
 function activateFragment(fragment=''){
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
   if(mode==='weekly'){globalThis.brazaProductionWeeklyClosing?.open?.();if(fragment.startsWith('#productionCoverage'))globalThis.brazaProductionCoverage?.open?.();}
   if(mode==='daily')globalThis.brazaProductionDailyFinance?.refresh?.();
  }
  return true;
 }
 function navigate(fragment){const link=document.querySelector?.('#agent-production .mission-page-tabs a[href="'+fragment+'"]');if(link?.click){link.click();return true;}return activateFragment(fragment);}
 function confirmDay(){const date=globalThis.brazaIncurredProduction?.getAnalyticsSnapshot?.()?.selected_day?.date;if(!date)return false;navigate('#productionWeeklyClosing');const result=globalThis.brazaProductionCoverage?.openForDate?.(date)??false;const focus=ok=>{if(ok!==false&&selected==='manufacturing'&&mode==='weekly'){const target=el('productionCoverageDetails');target?.scrollIntoView?.({block:'start',behavior:'instant'});target?.querySelector?.('summary')?.focus?.();}return ok;};return result&&typeof result.then==='function'?result.then(focus):focus(result);}
 const confirm=el('incurredProductionConfirmDay');if(confirm)confirm.onclick=confirmDay;
 document.addEventListener?.('mls-production-register-day',()=>navigate('#incurredProductionRecordsPane'));
 globalThis.brazaProductionWorkspace=Object.freeze({open:({fragment=''}={})=>activateFragment(fragment),activateFragment,confirmDay,getSnapshot:()=>Object.freeze({active_pane:selected,active_view:mode})});
})();`;
