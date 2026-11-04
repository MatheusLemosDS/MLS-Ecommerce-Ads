export const PRODUCTION_WORKSPACE_CSS=String.raw`
.production-workspace-pane[hidden]{display:none!important}.production-workspace-pane{min-width:0}.production-workspace-pane>section{min-width:0}
`;

// These panes change the visible source, never the source facts. Opening the
// manufacturing pane uses the existing authenticated, lazy ledger controller.
export const PRODUCTION_WORKSPACE_CLIENT=String.raw`
(()=>{
 const el=id=>document.getElementById(id);
 let selected='manufacturing';
 const reference=hash=>hash==='#costPeriods'||typeof hash==='string'&&hash.startsWith('#costPeriods');
 function activateFragment(fragment=''){
  if(!el('missionProductionFabricationPane')||!el('missionProductionReferencePane'))return false;
  selected=reference(fragment)?'sales-reference':'manufacturing';
  el('missionProductionFabricationPane').hidden=selected!=='manufacturing';el('missionProductionReferencePane').hidden=selected!=='sales-reference';
  const heading=el('missionProductionOperationsTitle'),intro=heading?.closest?.('.mission-operation-heading')?.querySelector?.('p');
  if(heading)heading.textContent=selected==='manufacturing'?'Produção e custo por data de fabricação':'Referência de custo dos pedidos vendidos';
  if(intro)intro.textContent=selected==='manufacturing'?'Consulte os registros de fabricação por dia, mês ou intervalo. Os custos históricos pertencem às peças registradas.':'Custos atuais aplicados aos pedidos pagos, pela data de criação. A fabricação realizada tem seu próprio histórico.';
  if(selected==='manufacturing'){
   const details=el('incurredProductionDetails');
   if(details&&(!details.open||!globalThis.brazaIncurredProduction?.getSnapshot?.()))globalThis.brazaIncurredProduction?.open?.();
   globalThis.brazaProductionWeeklyClosing?.open?.();
   globalThis.brazaProductionDailyFinance?.refresh?.();
  }
  return true;
 }
 globalThis.brazaProductionWorkspace=Object.freeze({open:({fragment=''}={})=>activateFragment(fragment),activateFragment,getSnapshot:()=>Object.freeze({active_pane:selected})});
})();`;
