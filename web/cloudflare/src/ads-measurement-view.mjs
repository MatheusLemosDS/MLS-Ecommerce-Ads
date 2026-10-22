import {projectAdsMeasurement} from './ads-measurement.mjs';

// The two ratios remain independent: a provider-reported ROAS is not replaced
// with a calculation, and a calculated ROAS is never an average of daily ratios.
const adsMeasurementViewPaths=new Set(['/dashboard','/advertising','/campaigns','/gmv-max','/opportunities','/performance','/optimization','/integrations']);
const adsMeasurementViewEscape=value=>String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const adsMeasurementViewDay=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value+'T00:00:00Z'))&&new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;
const adsMeasurementViewDate=value=>adsMeasurementViewDay(value)?value.split('-').reverse().join('/'):'—';
function adsMeasurementViewMoney(value){
 if(!Number.isSafeInteger(value)||value<0)return '—';
 const cents=BigInt(value),whole=(cents/100n).toLocaleString('pt-BR'),fraction=(cents%100n).toString().padStart(2,'0');
 return 'R$ '+whole+','+fraction;
}
function adsMeasurementViewRoas(value){
 if(typeof value==='number'&&Number.isFinite(value)&&value>=0)return String(value).replace('.',',')+'x';
 if(typeof value==='string'&&value.length<=96&&/^(0|[1-9][0-9]*)(?:\.[0-9]+)?$/.test(value))return value.replace(/(\.\d*?[1-9])0+$|\.0+$/, '$1').replace('.',',')+'x';
 return '—';
}
function adsMeasurementViewMetric(label,value,help){
 return '<div class="ads-measurement-metric"><span>'+adsMeasurementViewEscape(label)+'</span><strong>'+adsMeasurementViewEscape(value)+'</strong><small>'+adsMeasurementViewEscape(help)+'</small></div>';
}
const adsMeasurementViewCss=`
.ads-measurement-scope{min-width:0;margin:0 0 24px;padding:22px;border:1px solid var(--line,#344155);border-radius:18px;background:var(--surface,#172033);color:var(--text,#e5eaf2)}
.ads-measurement-scope h2{margin:0 0 8px;font-size:18px;line-height:1.3}.ads-measurement-scope p{margin:8px 0;color:var(--muted,#a9b6c9);font-size:13px;overflow-wrap:anywhere}
.ads-measurement-controls{display:flex;flex-wrap:wrap;align-items:end;gap:12px;margin:18px 0}.ads-measurement-controls label{display:grid;gap:6px;flex:1 1 170px;min-width:0;font-size:12px;font-weight:600}.ads-measurement-controls input{box-sizing:border-box;width:100%;min-width:0;min-height:44px;padding:10px 12px;border:1px solid var(--line,#344155);border-radius:10px;background:var(--surface-raised,#1d293f);color:var(--text,#e5eaf2);font:inherit;color-scheme:inherit}.ads-measurement-controls button{min-height:44px;padding:10px 16px;border:1px solid transparent;border-radius:10px;background:var(--accent,#a893ff);color:var(--on-accent,#101525);font:inherit;font-weight:700;cursor:pointer}.ads-measurement-controls input:focus-visible,.ads-measurement-controls button:focus-visible,.ads-measurement-scope summary:focus-visible{outline:3px solid var(--accent,#a893ff);outline-offset:3px}
.ads-measurement-metrics{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin:16px 0}.ads-measurement-metric{min-width:0;padding:16px;border:1px solid var(--line,#344155);border-radius:12px;background:var(--surface-raised,#1d293f)}.ads-measurement-metric span,.ads-measurement-metric small{display:block;color:var(--muted,#a9b6c9);font-size:12px;line-height:1.5}.ads-measurement-metric strong{display:block;margin:7px 0;color:var(--text,#e5eaf2);font-size:clamp(19px,2vw,25px);line-height:1.3;overflow-wrap:anywhere}
.ads-measurement-scope .ads-measurement-difference{padding:12px 14px;border:1px solid var(--line,#344155);border-left:3px solid var(--accent,#a893ff);border-radius:8px;color:var(--text,#e5eaf2)}.ads-measurement-scope details{margin-top:14px}.ads-measurement-scope summary{min-height:44px;display:list-item;padding:10px 0;cursor:pointer;font-weight:600}.ads-measurement-scope .ads-measurement-direct{grid-template-columns:repeat(3,minmax(0,1fr))}
.ads-measurement-table-wrap{width:100%;max-width:100%;min-width:0;overflow-x:auto;overscroll-behavior-x:contain}.ads-measurement-table{width:100%;border-collapse:collapse;font-size:13px}.ads-measurement-table th,.ads-measurement-table td{text-align:left;padding:13px 10px;border-bottom:1px solid var(--line,#344155);white-space:nowrap}.ads-measurement-table th{color:var(--muted,#a9b6c9);font-size:12px}.ads-measurement-table-note{margin:12px 0 0;color:var(--muted,#a9b6c9);font-size:12px}
@media(max-width:1000px){.ads-measurement-metrics{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media(max-width:550px){.ads-measurement-scope{padding:16px}.ads-measurement-metrics,.ads-measurement-scope .ads-measurement-direct{grid-template-columns:minmax(0,1fr)}.ads-measurement-controls{display:grid;grid-template-columns:minmax(0,1fr)}.ads-measurement-controls button{width:100%}}
`;

export function renderAdsMeasurementScope(ads,currentPath){
 const frame=projectAdsMeasurement(ads?.measurement),path=adsMeasurementViewPaths.has(currentPath)?currentPath:'/dashboard';
 const start=frame?.start_date??'',end=frame?.end_date??'';
 const form='<form class="ads-measurement-controls" method="get" action="'+path+'"><label>Data inicial<input type="date" name="start_date" value="'+adsMeasurementViewEscape(start)+'" required></label><label>Data final<input type="date" name="end_date" value="'+adsMeasurementViewEscape(end)+'" required></label><button type="submit">Consultar anúncios</button></form>';
 const detailNote=['/campaigns','/gmv-max','/opportunities','/optimization'].includes(path)?'<p>As consultas por campanha e produto abaixo têm período próprio, ainda sem conciliação com este filtro da conta. Não some esses valores ao investimento da conta.</p>':'';
 const heading='<style>'+adsMeasurementViewCss+'</style><section class="ads-measurement-scope" aria-label="Período e fonte dos anúncios"><h2>Confira o mesmo período na Shopee Ads</h2><p>Este filtro seleciona os indicadores da conta de anúncios, em períodos de até 15 dias.</p>'+detailNote+form;
 if(!frame)return heading+'<p>Os indicadores deste período estão indisponíveis. Escolha as datas e consulte novamente.</p></section>';
 const period=adsMeasurementViewDate(start)+(start===end?'':' a '+adsMeasurementViewDate(end));
 const fetched=frame.fetched_at?new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Sao_Paulo',dateStyle:'short',timeStyle:'medium'}).format(new Date(frame.fetched_at*1000)):'—';
 const metadata='<p><strong>'+adsMeasurementViewEscape(period)+'</strong> · '+frame.covered_days+' de '+frame.total_days+' dia(s) com gasto informado.</p><p>Consultado em '+adsMeasurementViewEscape(fetched)+' · Brasília. Este é o horário da consulta; o horário de corte e o fuso do relatório não são informados pela fonte.</p>';
 if(frame.status==='UNAVAILABLE')return heading+metadata+'<p>Não foi possível conferir os dados deste período. O gasto e o ROAS permanecem indisponíveis.</p></section>';
 const broad=frame.totals.broad,direct=frame.totals.direct;
 let content='<div class="ads-measurement-metrics">'+adsMeasurementViewMetric('Investimento no período',adsMeasurementViewMoney(frame.expense_cents),frame.status==='PARTIAL'?'Total pendente: há dias sem gasto informado.':'Soma dos gastos diários retornados pela Shopee.')+adsMeasurementViewMetric('Vendas atribuídas · amplas',adsMeasurementViewMoney(broad.gmv_cents),'Atribuição de anúncios; não representa as vendas totais da loja.')+adsMeasurementViewMetric('ROAS informado · amplo',adsMeasurementViewRoas(broad.reported_roas_raw),frame.total_days===1?'Valor retornado pela Shopee, preservado.':'O total de ROAS não foi informado; não usamos a média dos dias.')+adsMeasurementViewMetric('ROAS calculado · amplo',adsMeasurementViewRoas(broad.calculated_roas_raw),'Vendas atribuídas amplas ÷ investimento do mesmo período.')+'</div>';
 if(broad.reported_roas_raw!==null&&broad.calculated_roas_raw!==null&&Math.abs(Number(broad.reported_roas_raw)-Number(broad.calculated_roas_raw))>0.005000000001)content+='<p class="ads-measurement-difference">O ROAS informado pela Shopee difere da divisão dos valores retornados nesta consulta. Os dois valores estão preservados para conferência.</p>';
 if(frame.status==='PARTIAL')content+='<p>Gasto conhecido: '+adsMeasurementViewMoney(frame.known_expense_cents)+'. Dias sem gasto informado: '+frame.missing_dates.map(adsMeasurementViewDate).join(', ')+'. Esses dias não são tratados como gasto zero.</p>';
 if(frame.day_partial)content+='<p>O período inclui o dia em andamento. Os valores ainda podem ser atualizados pela Shopee.</p>';
 if(frame.balance_cents!==null)content+='<p>Crédito disponível para anúncios: '+adsMeasurementViewMoney(frame.balance_cents)+'. Esse saldo não é o gasto do período.</p>';
 content+='<details><summary>Ver atribuição direta separadamente</summary><div class="ads-measurement-metrics ads-measurement-direct">'+adsMeasurementViewMetric('Vendas atribuídas · diretas',adsMeasurementViewMoney(direct.gmv_cents),'Não somar às vendas de atribuição ampla.')+adsMeasurementViewMetric('ROAS informado · direto',adsMeasurementViewRoas(direct.reported_roas_raw),'Indicador retornado pela Shopee para a atribuição direta.')+adsMeasurementViewMetric('ROAS calculado · direto',adsMeasurementViewRoas(direct.calculated_roas_raw),'Vendas diretas ÷ investimento do mesmo período.')+'</div></details><p>Usamos atribuição ampla de forma consistente. Direta e ampla são recortes diferentes e não devem ser somadas. Os pedidos atribuídos aos anúncios também diferem dos pedidos totais da loja.</p>';
 return heading+metadata+content+'</section>';
}

export function renderAdsMeasurementDailyTable(rows){
 if(!Array.isArray(rows)||rows.length===0||rows.length>15)return '<p class="ads-measurement-table-note">Nenhum dado diário de anúncios disponível para este período.</p>';
 const seen=new Set();
 if(rows.some(row=>!row||!adsMeasurementViewDay(row.date)||seen.has(row.date)||!seen.add(row.date)||!row.broad))return '<p class="ads-measurement-table-note">Os dados diários de anúncios não puderam ser conferidos.</p>';
 const body=rows.map(row=>'<tr><td>'+adsMeasurementViewDate(row.date)+'</td><td>'+adsMeasurementViewMoney(row.expense_cents)+'</td><td>'+adsMeasurementViewMoney(row.broad.gmv_cents)+'</td><td>'+adsMeasurementViewRoas(row.broad.reported_roas_raw)+'</td><td>'+adsMeasurementViewRoas(row.broad.calculated_roas_raw)+'</td><td>'+(Number.isSafeInteger(row.broad.orders)&&row.broad.orders>=0?BigInt(row.broad.orders).toLocaleString('pt-BR'):'—')+'</td></tr>').join('');
 return '<div class="ads-measurement-table-wrap" role="region" tabindex="0" aria-label="Anúncios por dia, atribuição ampla"><table class="ads-measurement-table"><thead><tr><th scope="col">Data</th><th scope="col">Investimento</th><th scope="col">Vendas atribuídas · amplas</th><th scope="col">ROAS informado</th><th scope="col">ROAS calculado</th><th scope="col">Pedidos atribuídos</th></tr></thead><tbody>'+body+'</tbody></table></div><p class="ads-measurement-table-note">ROAS calculado = vendas atribuídas amplas ÷ investimento. Um campo ausente permanece indisponível (—); não é substituído por zero nem pela atribuição direta.</p>';
}
