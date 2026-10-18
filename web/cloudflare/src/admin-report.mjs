// Conservative display extraction only. The original report remains authoritative.
export function parseReport(text){
 const clean=String(text||'').replace(/\r/g,'');
 const scalar=pattern=>{const matches=[...clean.matchAll(pattern)];return matches.length===1?matches[0][1]:null;};
 const investment=scalar(/^\s*(?:Investimento(?:\s+(?:raw|informado))?|Gasto(?:\s+(?:raw|informado))?)\s*:\s*["']?([0-9]+(?:[.,][0-9]+)?)\s*["']?\s*$/gim);
 const clicks=scalar(/^\s*Cliques\s*:\s*([0-9]+)\s*$/gim);
 const impressions=scalar(/^\s*Impressões\s*:\s*([0-9]+)\s*$/gim);
 const paired=pattern=>{const matches=[...clean.matchAll(pattern)];return matches.length===1?[matches[0][1],matches[0][2]]:null;};
 const roas=paired(/^\s*ROAS(?:\s+(?:raw|bruto|informado))?\s+([0-9]+(?:[.,][0-9]+)?)\s+([0-9]+(?:[.,][0-9]+)?)\s*$/gim);
 const orders=paired(/^\s*(?:Pedidos(?:\/conversões)?(?:\s+(?:reportados|informados))?)\s+([0-9]+)\s+([0-9]+)\s*$/gim);
 const economic=scalar(/^\s*(?:Status econômico|Resultado:\s*situação econômica)\s*:?\s*(UNKNOWN|UNVERIFIED|PROFITABLE|UNPROFITABLE)\s*[.;]?\s*$/gim);
 const recommendation=scalar(/^\s*Recomendação(?:\s+retornada)?\s*:\s*([A-Z_]+)\s*\.?\s*$/gim);
 const headings=/^(Métricas recebidas|Métricas do dia|Qualidade e limitações|Diagnóstico e recomendação|Referências de kits(?: para esta análise)?|Referências consultadas|Política H2 preservada|Política da API preservada|Qualidade dos dados)$/i;
 const sections=[];let current=null;
 for(const line of clean.split('\n')){const title=line.trim().replace(/^#{1,6}\s*/, '');if(headings.test(title)){current={title,body:[]};sections.push(current);}else if(current)current.body.push(line);}
 const date=scalar(/^Análise de (\d{4}-\d{2}-\d{2})[^\n]*$/gim);
 return {date,investment,clicks,impressions,roas,orders,economic,recommendation,sections:sections.map(s=>({...s,body:s.body.join('\n').trim()})).filter(s=>s.body),original:clean};
}
