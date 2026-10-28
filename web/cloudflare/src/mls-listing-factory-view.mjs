// MLS Listing Factory, owner-only draft UI. No marketplace I/O.
export const MLS_LISTING_FACTORY_CSS=String.raw`
.mls-lf{margin:0 0 22px;padding:22px;border:1px solid var(--line,#dce2e9);border-radius:18px;min-width:0;background:var(--surface,#fff)}
.mls-lf *{box-sizing:border-box}.mls-lf-head{display:flex;justify-content:space-between;gap:16px;align-items:flex-start;flex-wrap:wrap}
.mls-lf h2{font-size:22px;margin:5px 0 6px}.mls-lf h3{font-size:16px;margin:0}.mls-lf p{margin:5px 0;line-height:1.45}
.mls-lf-kicker{font-size:11px;font-weight:750;letter-spacing:1px;color:var(--muted,#68778a)}
.mls-lf-pill{font-size:11px;font-weight:700;color:#157450;border:1px solid #82bba1;border-radius:30px;background:rgba(39,164,111,.08);padding:7px 10px}
.mls-lf-copy{max-width:750px;color:var(--muted,#68778a);font-size:13px}
.mls-lf-form{display:grid;gap:15px;margin:18px 0;border-top:1px solid var(--line,#dce2e9);padding-top:17px}
.mls-lf-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}
.mls-lf-field{display:grid;gap:5px;min-width:0}.mls-lf-field label{font-weight:650;font-size:12px}
.mls-lf-field input,.mls-lf-field textarea{width:100%;min-width:0;border:1px solid var(--line,#cfd8df);border-radius:10px;min-height:40px;padding:10px 12px;background:var(--surface-raised,var(--surface,#fff));color:var(--text,#222);font-size:13px}
.mls-lf-field textarea{min-height:95px;resize:vertical}
.mls-lf-help{color:var(--muted,#68778a);font-size:11px;overflow-wrap:anywhere}
.mls-lf-sizes{display:flex;gap:7px;flex-wrap:wrap}.mls-lf-size{display:inline-flex;align-items:center;gap:5px;padding:7px 9px;border:1px solid var(--line,#dce2e9);border-radius:8px;font-size:12px}
.mls-lf-field .mls-lf-size input{min-height:0;width:auto;padding:0;flex:none}.mls-lf-table-wrap{overflow:auto;border:1px solid var(--line,#dce2e9);border-radius:12px}
.mls-lf-table{border-collapse:collapse;width:100%;min-width:435px;font-size:12px}
.mls-lf-table th,.mls-lf-table td{text-align:left;padding:9px 11px;border-bottom:1px solid var(--line,#e4e8ec)}
.mls-lf-table tbody tr:last-child td{border-bottom:0}
.mls-lf-table td input{width:125px;max-width:100%;padding:8px;border:1px solid var(--line,#dce2e9);background:var(--surface,#fff);color:var(--text,#222);border-radius:8px}
.mls-lf-images{display:grid;grid-template-columns:repeat(auto-fill,minmax(115px,1fr));gap:9px}
.mls-lf-photo{margin:0;padding:7px;border:1px solid var(--line,#dce2e9);border-radius:10px;min-width:0}
.mls-lf-photo img{width:100%;aspect-ratio:1/1;object-fit:contain;background:#f2f3f5;border-radius:7px}
.mls-lf-photo figcaption{font-size:10px;margin-top:5px;overflow-wrap:anywhere}.mls-lf-photo[data-valid=false]{border-color:#c86952}
.mls-lf-actions{display:flex;gap:9px;flex-wrap:wrap}
.mls-lf .mls-lf-btn{border:1px solid var(--line,#dce2e9);background:var(--surface-raised,var(--surface,#fff));border-radius:10px;padding:10px 14px;color:var(--text,#222);font-size:12px;font-weight:700;cursor:pointer;min-height:42px}
.mls-lf .mls-lf-btn:focus-visible{outline:3px solid #56a1e9;outline-offset:2px}
.mls-lf .mls-lf-btn.primary{background:#2459a6;color:#fff;border-color:#2459a6}.mls-lf .mls-lf-btn:disabled{opacity:.45;cursor:not-allowed}
.mls-lf-message{font-size:12px;padding:10px 12px;border-radius:10px;background:var(--surface-raised,rgba(128,128,128,.07));min-height:36px}
.mls-lf-bulk{display:grid;gap:11px;margin:14px 0;padding:16px;border-radius:13px;border:1px solid var(--line,#dce2e9);background:var(--surface-raised,var(--surface,#fff))}
.mls-lf-bulk h4{margin:0;font-size:14px}.mls-lf-bulk-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.mls-lf-bulk [type=file]{max-width:100%;min-width:0;font-size:12px}.mls-lf-bulk [type=file]:disabled{opacity:.5}.mls-lf-bulk-status{font-size:12px;overflow-wrap:anywhere}
.mls-lf-queue{display:grid;gap:11px;margin:15px 0}.mls-lf-item{border:1px solid var(--line,#dce2e9);border-left:3px solid #c78037;padding:14px;border-radius:12px;display:grid;gap:9px;min-width:0}
.mls-lf-item[data-ready=true]{border-left-color:#218665}.mls-lf-item-head,.mls-lf-queue-head{display:flex;gap:12px;justify-content:space-between;align-items:flex-start;flex-wrap:wrap}
.mls-lf-item strong{overflow-wrap:anywhere}.mls-lf-thumbs{display:flex;gap:5px;overflow:auto}.mls-lf-thumbs img{width:54px;height:54px;border-radius:7px;object-fit:contain;background:#f0f0f0;flex:none}
@media(max-width:700px){.mls-lf{padding:15px}.mls-lf-grid,.mls-lf-bulk-grid{grid-template-columns:1fr}.mls-lf-actions>*{flex:1;min-width:125px}}
`;
export function mlsListingFactoryBody(){return String.raw`
<section id="mlsListingFactory" class="mls-lf" aria-labelledby="mlsLfHeading">
 <div class="mls-lf-head"><div><span class="mls-lf-kicker">MLS CREATIVE · LISTING FACTORY</span><h2 id="mlsLfHeading">Fábrica de anúncios</h2>
 <p class="mls-lf-copy">Crie rascunhos de anúncios de camisetas e estampas com mockups, tamanhos e preços individuais. Valide tudo localmente e exporte para revisão — sem enviar à Shopee.</p></div><span class="mls-lf-pill">RASCUNHO · SEM PUBLICAÇÃO</span></div>
 <form id="mlsLfForm" class="mls-lf-form" autocomplete="off">
  <div class="mls-lf-grid">
   <div class="mls-lf-field"><label for="mlsLfRef">Código interno da arte</label><input id="mlsLfRef" maxlength="64" placeholder="retro-2000-001" required><span class="mls-lf-help">Identificador único, sem espaços.</span></div>
   <div class="mls-lf-field"><label for="mlsLfSku">Prefixo SKU</label><input id="mlsLfSku" maxlength="60" placeholder="RETRO2000-001" required><span class="mls-lf-help">Combinado automaticamente com o tamanho.</span></div>
  </div>
  <div class="mls-lf-field"><label for="mlsLfTitle">Título do anúncio</label><input id="mlsLfTitle" maxlength="120" placeholder="Camiseta retrô anos 2000 unissex" required><span class="mls-lf-help">Título de autoria do operador; regras de categoria devem ser revistas no Seller Centre.</span></div>
  <div class="mls-lf-field"><label for="mlsLfDescription">Descrição</label><textarea id="mlsLfDescription" maxlength="5000" placeholder="Detalhes do tecido, medidas, cuidados com a estampa e prazo de produção..." required></textarea></div>
  <div class="mls-lf-grid">
   <div class="mls-lf-field"><label for="mlsLfPrice">Preço base (R$)</label><input id="mlsLfPrice" inputmode="decimal" placeholder="Informe o preço"><button type="button" id="mlsLfApplyPrice" class="mls-lf-btn">Aplicar a todos os tamanhos</button><span class="mls-lf-help">Alterações no preço base atualizam tamanhos ainda não editados. Você pode definir preços diferentes por variação. Informe seu preço; o sistema não utiliza tarifa ou margem presumida.</span></div>
   <div class="mls-lf-field"><label for="mlsLfExtraSizes">Outros tamanhos (separados por vírgula)</label><input id="mlsLfExtraSizes" maxlength="200" placeholder="2, 4, 6, 8 ou Único"><span class="mls-lf-help">Opcional; cada tamanho pode ter preço diferente.</span></div>
  </div>
  <div class="mls-lf-field"><label>Tamanhos padrão</label><div class="mls-lf-sizes" id="mlsLfSizeList">
   <label class="mls-lf-size"><input type="checkbox" data-lf-size="P" checked>P</label><label class="mls-lf-size"><input type="checkbox" data-lf-size="M" checked>M</label>
   <label class="mls-lf-size"><input type="checkbox" data-lf-size="G" checked>G</label><label class="mls-lf-size"><input type="checkbox" data-lf-size="GG" checked>GG</label>
   <label class="mls-lf-size"><input type="checkbox" data-lf-size="G1">G1</label><label class="mls-lf-size"><input type="checkbox" data-lf-size="G2">G2</label><label class="mls-lf-size"><input type="checkbox" data-lf-size="G3">G3</label>
  </div></div>
  <div><h3>Variações e preços</h3><p class="mls-lf-help">Quantidade em branco significa estoque desconhecido. Não copiamos quantidades de vendas anteriores.</p>
  <div class="mls-lf-table-wrap"><table class="mls-lf-table"><thead><tr><th>Tamanho e SKU</th><th>Preço R$</th><th>Quantidade opcional</th></tr></thead><tbody id="mlsLfVariants"></tbody></table></div></div>
  <div class="mls-lf-field"><label for="mlsLfFiles">Imagens do anúncio · 5 a 9 JPG ou PNG</label><input id="mlsLfFiles" type="file" accept=".jpg,.jpeg,.png,image/jpeg,image/png" multiple>
   <span class="mls-lf-help">Máximo 2 MB por imagem · formato quadrado · pelo menos 500×500 px. Verificação por decodificação real e hash SHA-256 neste navegador; nenhum upload.</span>
   <div id="mlsLfImagePreview" class="mls-lf-images" aria-live="polite"></div>
  </div>
  <div class="mls-lf-actions"><button class="mls-lf-btn primary" id="mlsLfSave" type="submit">Adicionar à fila de revisão</button>
   <button class="mls-lf-btn" id="mlsLfCancel" type="button" hidden>Cancelar edição</button>
   <button class="mls-lf-btn" id="mlsLfReset" type="button">Limpar formulário</button></div>
 </form>
 <p id="mlsLfMessage" class="mls-lf-message" role="status" aria-live="polite">Rascunhos mantidos apenas nesta aba. Exporte o JSON antes de sair.</p>
 <div class="mls-lf-queue-head"><h3>Fila de rascunhos</h3><span id="mlsLfStats" class="mls-lf-help">0 anúncios</span></div>
 <div class="mls-lf-bulk" id="mlsLfBulk" aria-labelledby="mlsLfBulkHeading">
  <h4 id="mlsLfBulkHeading">Reanexar mockups em lote</h4>
  <p class="mls-lf-help">Para anúncios importados por JSON, selecione seus JPG/PNG originais em uma única operação. O sistema associa o nome exato do arquivo aos rascunhos, inclusive repetidos em várias artes. Não usa diretórios nem envia arquivos à internet.</p>
  <div class="mls-lf-bulk-grid">
   <div class="mls-lf-field"><label for="mlsLfBatchFiles">Selecionar várias imagens</label><input id="mlsLfBatchFiles" type="file" accept=".jpg,.jpeg,.png,image/jpeg,image/png" multiple disabled></div>
   <div class="mls-lf-field"><label for="mlsLfBatchFolder">Ou escolher uma pasta de mockups (Chrome/Edge)</label><input id="mlsLfBatchFolder" type="file" accept=".jpg,.jpeg,.png,image/jpeg,image/png" multiple webkitdirectory directory disabled></div>
  </div>
  <p id="mlsLfBatchStatus" class="mls-lf-bulk-status mls-lf-help" role="status" aria-live="polite">Importe um lote JSON ou adicione anúncios para habilitar a associação. Máximo 200 arquivos/64 MB por seleção; nomes duplicados bloqueiam o lote.</p>
 </div>
 <div id="mlsLfDrafts" class="mls-lf-queue"></div>
 <div class="mls-lf-actions" aria-label="Navegação da fila">
  <button class="mls-lf-btn" id="mlsLfPrevious" type="button" disabled>Anterior</button>
  <span id="mlsLfPage" class="mls-lf-help" aria-live="polite">Página 0</span>
  <button class="mls-lf-btn" id="mlsLfNext" type="button" disabled>Próxima</button>
 </div>
 <div class="mls-lf-field" style="margin:10px 0 12px"><label for="mlsLfImport">Retomar anúncios de um arquivo JSON anterior</label><input id="mlsLfImport" type="file" accept=".json,application/json"><span class="mls-lf-help">Aceita apenas manifesto MLS (anúncios JSON); importar substitui esta fila após confirmação. Os mockups não estão no JSON: reanexe as imagens locais e confira os custos antes de revisar.</span></div>
 <div class="mls-lf-actions"><button class="mls-lf-btn primary" id="mlsLfExportManifest" type="button" disabled>Exportar anúncios JSON</button>
  <button class="mls-lf-btn" id="mlsLfExportReview" type="button" disabled>Exportar revisão JSON</button>
  <button class="mls-lf-btn" id="mlsLfClear" type="button" disabled>Limpar fila</button></div>
 <p class="mls-lf-help">O JSON não inclui arquivos binários. Guarde os mockups originais para o futuro processo autorizado. Estoque, preços, tarifas e permissão Shopee não foram comprovados.</p>
</section>`;}
export const MLS_LISTING_FACTORY_CLIENT=String.raw`
(() => {
 /*__MLS_LISTING_FACTORY_CORE__*/
 const root=document.getElementById('mlsListingFactory');
 if(!root)return;
 const by=id=>document.getElementById('mlsLf'+id);
 const form=by('Form'),notice=by('Message'),sizes=by('SizeList'),table=by('Variants'),
  chosen=by('ImagePreview'),queue=by('Drafts'),input=by('Files');
 const state={drafts:[],files:[],rows:new Map(),editing:null,busy:false,sequence:0,page:0};
 const pageSize=8;
 const button=(label,fn)=>{const e=document.createElement('button');e.type='button';e.className='mls-lf-btn';e.textContent=label;e.onclick=fn;return e;};
 const el=(tag,txt,cl)=>{const e=document.createElement(tag);if(txt!==undefined)e.textContent=String(txt);if(cl)e.className=cl;return e;};
 const tell=value=>notice.textContent=value;
 const fmt=new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'});
 const valuePrice=txt=>{
  const s=String(txt??'').trim();if(!/^\d{1,6}(?:[,.]\d{1,2})?$/.test(s))return null;
  const v=s.replace(',','.').split('.');const n=Number(v[0])*100+Number((v[1]||'').padEnd(2,'0'));
  return Number.isSafeInteger(n)&&n>0&&n<=100000000?n:null;
 };
 const shownPrice=v=>Number.isSafeInteger(v)?Math.floor(v/100)+','+String(v%100).padStart(2,'0'):'';
 function selectedSizes(){
  const v=[...sizes.querySelectorAll('[data-lf-size]')].filter(x=>x.checked).map(x=>x.dataset.lfSize)
   .concat(by('ExtraSizes').value.split(',').map(x=>x.trim()).filter(Boolean));
  const unique=v.map(x=>x.normalize('NFC').toUpperCase());
  return v.length>32||unique.length!==new Set(unique).size||
   !v.every(x=>x.length<=40&&/^[\p{L}\p{N} .\/_-]{1,40}$/u.test(x))?null:v;
 }
 function sku(size){
  const suffix=size.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/[^A-Z0-9_-]+/g,'-').replace(/^-+|-+$/g,'');
  return by('Sku').value.trim().toUpperCase()+'-'+suffix;
 }
 function remember(){
  for(const row of table.querySelectorAll('tr[data-size]'))
   state.rows.set(row.dataset.size,{...(state.rows.get(row.dataset.size)||{}),price:row.querySelector('[data-role=price]')?.value??'',
    quantity:row.querySelector('[data-role=quantity]')?.value??''});
 }
 function variantRows(skipRemember=false){
  if(skipRemember!==true)remember();table.replaceChildren();
  const available=selectedSizes();
  if(!available){table.append(el('tr','Tamanhos duplicados ou inválidos.'));return;}
  for(const size of available){
   const data=state.rows.get(size)||{price:by('Price').value.trim(),quantity:'',manualPrice:false};
   state.rows.set(size,data);
   const tr=el('tr');tr.dataset.size=size;
   const a=el('td'),b=el('td'),c=el('td');
   a.append(el('strong',size),el('div',sku(size),'mls-lf-help'));
   for(const [cell,key] of [[b,'price'],[c,'quantity']]){
    const i=el('input');i.type='text';i.inputMode=key==='price'?'decimal':'numeric';
    i.value=data[key];i.dataset.role=key;i.setAttribute('aria-label',(key==='price'?'Preço ':'Quantidade ')+size);
    i.oninput=()=>{data[key]=i.value;if(key==='price')data.manualPrice=true;};cell.append(i);
   }
   tr.append(a,b,c);table.append(tr);
  }
 }
 function headerType(bytes,name){
  const png=bytes.length>=33&&[137,80,78,71,13,10,26,10].every((x,i)=>bytes[i]===x)&&
   [73,72,68,82].every((x,i)=>bytes[i+12]===x);
  const jpg=bytes.length>4&&bytes[0]===255&&bytes[1]===216;
  return png&&name.toLowerCase().endsWith('.png')?'image/png':
   jpg&&/\.jpe?g$/i.test(name)?'image/jpeg':null;
 }
 function dimensionsFromHeader(bytes,mime){
  if(mime==='image/png'){
   if(bytes.length<24)return null;
   const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
   return {width:v.getUint32(16),height:v.getUint32(20)};
  }
  let offset=2;
  while(offset+4<bytes.length){
   if(bytes[offset]!==255)return null;
   while(bytes[offset]===255)offset++;
   const marker=bytes[offset++];
   if(marker===217||marker===218)break;
   if(marker===1||marker>=208&&marker<=215)continue;
   if(offset+2>bytes.length)break;
   const length=bytes[offset]*256+bytes[offset+1];
   if(length<2||offset+length>bytes.length)return null;
   if(marker>=192&&marker<=207&&![196,200,204].includes(marker)&&length>=7)
    return {height:bytes[offset+3]*256+bytes[offset+4],width:bytes[offset+5]*256+bytes[offset+6]};
   offset+=length;
  }
  return null;
 }
 async function inspect(file){
  const row={name:file.name,frame:null,preview:null,issue:null};
  if(!validFile(file.name)){
   row.issue='Nome ou extensão inválidos';return row;
  }
  if(!Number.isSafeInteger(file.size)||file.size<1||file.size>2097152){
   row.issue='Arquivo vazio ou acima de 2 MB';return row;
  }
  if(!globalThis.crypto?.subtle||typeof createImageBitmap!=='function'){
   row.issue='Navegador sem verificação segura';return row;
  }
  try{
   const buf=await file.arrayBuffer(),bytes=new Uint8Array(buf),mime=headerType(bytes,file.name);
   if(!mime||file.type&&file.type!==mime){row.issue='Formato real incompatível com a extensão';return row;}
   const dims=dimensionsFromHeader(bytes,mime);
   if(!dims||!dims.width||!dims.height||dims.width>8000||dims.height>8000||dims.width*dims.height>16000000){
    row.issue='Dimensões excessivas ou cabeçalho incompleto';return row;
   }
   const bitmap=await createImageBitmap(file);
   try{
    if(bitmap.width!==dims.width||bitmap.height!==dims.height){
     row.issue='Dimensões fora do limite';return row;
    }
    const size=Math.min(180/bitmap.width,180/bitmap.height,1),canvas=document.createElement('canvas');
    canvas.width=Math.max(1,Math.round(bitmap.width*size));canvas.height=Math.max(1,Math.round(bitmap.height*size));
    const ctx=canvas.getContext('2d');
    if(!ctx){row.issue='Não foi possível preparar prévia';return row;}
    ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);
    row.preview=canvas.toDataURL('image/jpeg',.75);
    const digest=new Uint8Array(await crypto.subtle.digest('SHA-256',buf));
    row.frame={name:file.name,mime,width:bitmap.width,height:bitmap.height,size_bytes:file.size,
     sha256:Array.from(digest,x=>x.toString(16).padStart(2,'0')).join(''),inspection:'HEADER_ONLY_SHA256'};
    if(bitmap.width<500||bitmap.height<500)row.issue='Menor que 500×500 px';
    else if(Math.abs(bitmap.width-bitmap.height)/Math.max(bitmap.width,bitmap.height)>.01)row.issue='Imagem não quadrada';
    else if(bitmap.width<1024||bitmap.height<1024)row.issue='Qualidade: abaixo de 1024 px';
    return row;
   }finally{bitmap.close?.();}
  }catch{row.issue='Não foi possível decodificar esta imagem';return row;}
 }
 function preview(){
  chosen.replaceChildren();
  if(!state.files.length){chosen.append(el('p','Selecione as imagens complementares.','mls-lf-help'));return;}
  for(const f of state.files){
   const box=el('figure',undefined,'mls-lf-photo');box.dataset.valid=String(!!f.frame&&!(f.issue||'').startsWith('Menor')&&!(f.issue||'').startsWith('Imagem não'));
   if(f.preview){const img=el('img');img.src=f.preview;img.alt='Mockup '+f.name;box.append(img);}
   box.append(el('figcaption',f.name),el('span',f.frame?f.frame.width+'×'+f.frame.height+' · '+Math.ceil(f.frame.size_bytes/1024)+' KB':'Não validado','mls-lf-help'));
   if(f.issue)box.append(el('span',f.issue,'mls-lf-help'));chosen.append(box);
  }
 }
 function projection(drafts=state.drafts){
  if(!drafts.length)return null;
  const index=Object.create(null),conflict=new Set();
  for(const d of drafts)for(const f of d.files)if(f.frame){
   const old=Object.getOwnPropertyDescriptor(index,f.name)?.value;
   if(old&&old.sha256!==f.frame.sha256)conflict.add(f.name);
   else if(!old)index[f.name]=f.frame;
  }
  for(const name of conflict)delete index[name];
  const input={schema:'mls_listing_factory_input_v1',marketplace:'SHOPEE_BR',items:drafts.map(d=>d.item)};
  return {input,review:planMlsListingFactory(input,index)};
 }
 function list(){
  queue.replaceChildren();
  const data=projection(),plan=data?.review,n=state.drafts.length;
  const totalPages=Math.max(1,Math.ceil(n/pageSize));
  state.page=Math.min(Math.max(0,state.page),totalPages-1);
  const first=state.page*pageSize;
  by('Page').textContent=n?'Exibindo '+(first+1)+'–'+Math.min(n,first+pageSize)+' de '+n+' · Página '+(state.page+1)+'/'+totalPages:'Nenhum rascunho';
  by('Previous').disabled=!plan||state.busy||state.page===0;
  by('Next').disabled=!plan||state.busy||state.page>=totalPages-1;
  by('Stats').textContent=n+' anúncio(s) · '+(plan?.summary.ready_for_review||0)+' pronto(s) para revisão · '+
   (plan?.summary.needs_correction||0)+' com pendências · '+(plan?.summary.batches||0)+' lote(s)';
  for(const id of ['ExportManifest','ExportReview','Clear'])by(id).disabled=!n||!plan||state.busy;
  for(const id of ['BatchFiles','BatchFolder'])by(id).disabled=!n||!plan||state.busy||state.editing!==null;
  if(!n){queue.append(el('p','Adicione uma arte para iniciar a fila.','mls-lf-help'));return;}
  if(!plan){queue.append(el('p','Fila inválida: revise SKUs ou códigos duplicados.','mls-lf-help'));return;}
  state.drafts.slice(first,first+pageSize).forEach((d,index)=>{
   const i=first+index;
   const outcome=plan.products[i],article=el('article',undefined,'mls-lf-item');
   article.dataset.ready=String(outcome.status==='READY_FOR_OPERATOR_REVIEW');
   const head=el('div',undefined,'mls-lf-item-head'),title=el('div');
   title.append(el('strong',(i+1)+'. '+d.item.title),el('p',d.item.client_ref+' · '+d.item.variants.length+' tamanho(s)','mls-lf-help'));
   head.append(title,el('strong',outcome.status==='READY_FOR_OPERATOR_REVIEW'?'Pronto para revisão':'Correção pendente'));article.append(head);
   const thumbs=el('div',undefined,'mls-lf-thumbs');
   for(const f of d.files.slice(0,9))if(f.preview){const img=el('img');img.src=f.preview;img.alt=f.name;thumbs.append(img);}
   article.append(thumbs);
   article.append(el('span',d.item.variants.map(v=>v.size+': '+fmt.format(v.price_cents/100)+(v.stock_quantity===null?' · estoque desconhecido':'')).join(' | '),'mls-lf-help'));
   if(outcome.errors.length||outcome.warnings.length)article.append(el('span','Pendências: '+outcome.errors.concat(outcome.warnings).join(', '),'mls-lf-help'));
   const actions=el('div',undefined,'mls-lf-actions');
   actions.append(button('Editar',()=>edit(i)),button('Remover',()=>{if(state.busy)return;reset();state.drafts.splice(i,1);list();tell('Rascunho removido apenas da fila local.');}));
   article.append(actions);queue.append(article);
  });
 }
 function reset(){
  state.sequence++;state.files=[];state.rows.clear();state.editing=null;state.busy=false;
  form.reset();by('Price').value='';input.value='';by('Save').textContent='Adicionar à fila de revisão';by('Save').disabled=false;
  by('Cancel').hidden=true;variantRows();preview();list();
 }
 function edit(i){
  const d=state.drafts[i];if(!d||state.busy)return;reset();state.editing=i;state.files=d.files.slice();
  by('BatchFiles').disabled=true;by('BatchFolder').disabled=true;
  by('Ref').value=d.item.client_ref;by('Title').value=d.item.title;by('Description').value=d.item.description;
  const standard=new Set([...sizes.querySelectorAll('[data-lf-size]')].map(x=>x.dataset.lfSize));
  const original=d.item.variants[0];by('Sku').value=original?.sku?.replace(/-[^-]+$/,'')||'';
  by('Price').value=shownPrice(original?.price_cents);
  const extras=[];
  for(const checkbox of sizes.querySelectorAll('[data-lf-size]'))checkbox.checked=d.item.variants.some(v=>v.size===checkbox.dataset.lfSize);
  for(const v of d.item.variants){
   if(!standard.has(v.size))extras.push(v.size);
   state.rows.set(v.size,{price:shownPrice(v.price_cents),quantity:v.stock_quantity===null?'':String(v.stock_quantity),manualPrice:true});
  }
  by('ExtraSizes').value=extras.join(', ');variantRows();preview();
  by('Save').textContent='Salvar alterações';by('Cancel').hidden=false;
  tell('Editando '+d.item.client_ref+(d.files.length?' · imagens locais disponíveis.':' · selecione novamente os mockups: o JSON contém apenas seus nomes.')+' Nenhuma informação foi publicada.');
  root.scrollIntoView?.({block:'start'});
 }
 function formDraft(){
  remember();const ref=by('Ref').value.trim(),prefix=by('Sku').value.trim(),available=selectedSizes();
  if(!/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(ref))throw Error('Informe um código interno válido, sem espaços.');
  if(!/^[A-Za-z0-9][A-Za-z0-9._\/-]{0,59}$/.test(prefix))throw Error('Prefixo SKU inválido.');
  if(!available?.length)throw Error('Selecione ao menos um tamanho válido.');
  const variants=available.map(size=>{
   const r=state.rows.get(size)||{},price=valuePrice(r.price),qty=String(r.quantity??'').trim();
   if(price===null)throw Error('Preço inválido para tamanho '+size+'.');
   if(qty&&!/^\d{1,7}$/.test(qty))throw Error('Quantidade inválida para '+size+'.');
   const quantity=qty===''?null:Number(qty);
   if(quantity!==null&&quantity>1000000)throw Error('Quantidade fora do limite: '+size+'.');
   return {sku:sku(size),size,price_cents:price,stock_quantity:quantity};
  });
  return {item:{client_ref:ref,title:by('Title').value,description:by('Description').value,
   images:state.files.length?state.files.map(x=>x.name):(state.editing===null?[]:state.drafts[state.editing].item.images.slice()),variants},files:state.files.slice()};
 }
 form.addEventListener('submit',event=>{
  event.preventDefault();if(state.busy){tell('Imagens ainda estão sendo verificadas.');return;}
  if(state.drafts.length>=500&&state.editing===null){tell('Limite de 500 rascunhos nesta fila.');return;}
  try{
   const candidate=formDraft(),items=state.drafts.slice();
   const at=state.editing===null?items.length:state.editing;
   if(state.editing===null)items.push(candidate);else items[at]=candidate;
   const data=projection(items);
   if(!data?.review)throw Error('SKU ou identificador duplicado. Revise as variações.');
   state.drafts=items;state.page=Math.floor(at/pageSize);
   const ready=data.review.products[at].status==='READY_FOR_OPERATOR_REVIEW';
   reset();tell(ready?'Rascunho pronto para revisão interna. Sem publicação nem estoque/tarifa comprovados.':
    'Rascunho salvo com pendências: veja a fila antes de exportar.');
  }catch(error){tell(error?.message||'Dados inválidos no formulário.');}
 });
 for(const checkbox of sizes.querySelectorAll('[data-lf-size]'))checkbox.addEventListener('change',variantRows);
 by('ExtraSizes').addEventListener('input',variantRows);by('Sku').addEventListener('input',variantRows);
 by('Price').addEventListener('input',()=>{remember();for(const v of state.rows.values())if(!v.manualPrice)v.price=by('Price').value.trim();variantRows(true);tell('Preço base aplicado aos tamanhos sem alteração individual.');});
 by('ApplyPrice').onclick=()=>{remember();for(const v of state.rows.values()){v.price=by('Price').value.trim();v.manualPrice=false;}variantRows(true);tell('Preço base aplicado a todos os tamanhos. Confira a margem antes da publicação futura.');};
 input.addEventListener('change',async()=>{
  const seq=++state.sequence,selected=[...input.files];input.value='';
  if(selected.length>30){tell('Seleção acima de 30 arquivos. Use 5 a 9 por anúncio.');return;}
  state.busy=true;state.files=[];by('Save').disabled=true;preview();list();
  tell('Decodificando arquivos e calculando hashes neste navegador…');
  const examined=new Array(selected.length);let cursor=0;
  async function worker(){while(cursor<selected.length){const i=cursor++;examined[i]=await inspect(selected[i]);if(seq!==state.sequence)return;}}
  await Promise.all(Array.from({length:Math.min(3,selected.length)},worker));
  if(seq!==state.sequence)return;
  state.files=examined;state.busy=false;by('Save').disabled=false;preview();list();
  tell(examined.length+' imagem(ns) analisada(s); '+examined.filter(x=>!x.frame||x.issue).length+' aviso(s).');
 });
 by('Cancel').onclick=()=>{reset();tell('Edição cancelada, fila preservada.');};
 by('Reset').onclick=()=>{reset();tell('Formulário limpo, fila preservada.');};
 function exportJson(payload,filename){
  const blob=new Blob([JSON.stringify(payload,null,2)+'\n'],{type:'application/json'});
  const url=URL.createObjectURL(blob);
  try{const a=el('a');a.href=url;a.download=filename;a.hidden=true;document.body.append(a);a.click();a.remove();
   tell('Arquivo '+filename+' gerado neste navegador; guarde os mockups originais.');}
  finally{setTimeout(()=>URL.revokeObjectURL(url),2500);}
 }
 by('ExportManifest').onclick=()=>{const d=projection();if(d?.review)exportJson(d.input,'mls-listing-factory-anuncios.json');};
 by('ExportReview').onclick=()=>{const d=projection();if(d?.review)exportJson(d.review,'mls-listing-factory-revisao.json');};

 by('Import').addEventListener('change',async()=>{
  const files=[...by('Import').files];by('Import').value='';
  if(state.busy){tell('Conclua primeiro a verificação das imagens atuais.');return;}
  if(files.length!==1){tell('Selecione somente um manifesto JSON.');return;}
  const file=files[0];
  if(!/^[^\/\\\u0000-\u001f\u007f]{1,150}\.json$/i.test(file.name)||
   !Number.isSafeInteger(file.size)||file.size<2||file.size>1048576){
   tell('O manifesto JSON precisa ter nome válido e até 1 MB.');return;
  }
  try{
   const value=JSON.parse(await file.text());
   const plan=planMlsListingFactory(value,Object.create(null));
   if(!plan)throw Error('O JSON não corresponde ao contrato MLS Listing Factory. Não é a revisão JSON.');
   if(!value.items.every((item,i)=>item.variants.length>0&&
    item.variants.length===plan.products[i].variants.length&&
    item.images.every(name=>validFile(name))&&new Set(item.images).size===item.images.length))
    throw Error('Arquivo contém SKU, variação ou nome de imagem inválido. Corrija o manifesto antes de importar.');
   if(!globalThis.confirm?.('Substituir a fila local por '+plan.summary.items+' anúncio(s) deste JSON? Reanexe os mockups em cada anúncio.'))return;
   state.drafts=value.items.map(item=>({item:{
    client_ref:item.client_ref,title:item.title,description:item.description,
    images:item.images.slice(),variants:item.variants.map(v=>({...v}))
   },files:[]}));
   state.page=0;reset();
   tell('Importados '+plan.summary.items+' anúncio(s) para conferência. Reanexe 5–9 mockups por arte antes de exportar a revisão final; imagens e estoque não foram validados.');
  }catch(error){tell(error?.message||'Não foi possível importar este manifesto JSON.');}
 });

 async function reattachBatch(picker){
  const selected=[...picker.files];picker.value='';
  if(state.busy){tell('Aguarde a verificação anterior terminar.');return;}
  if(state.editing!==null){tell('Salve ou cancele a edição atual antes de vincular imagens em lote.');return;}
  if(!state.drafts.length){tell('Importe rascunhos JSON ou adicione anúncios antes de selecionar imagens.');return;}
  if(selected.length<1)return;
  if(selected.length>200){tell('Máximo 200 imagens por seleção. Divida a pasta em partes.');return;}
  let bytes=0;const picked=new Map();
  for(const file of selected){
   if(!validFile(file.name)||!Number.isSafeInteger(file.size)||file.size<1||file.size>2097152){
    tell('Lote recusado: arquivo com nome inválido ou acima de 2 MB. Nenhum rascunho foi alterado.');return;
   }
   bytes+=file.size;
   if(bytes>64*1024*1024){tell('Lote acima de 64 MB. Selecione menos imagens; nada foi modificado.');return;}
   if(picked.has(file.name)){
    tell('Lote recusado: nome repetido '+file.name+'. Pastas com arquivos homônimos devem ser separadas; nenhum rascunho foi alterado.');return;
   }
   picked.set(file.name,file);
  }
  const needed=new Set(state.drafts.flatMap(d=>d.item.images));
  const matching=[...picked.values()].filter(file=>needed.has(file.name));
  const ignored=selected.length-matching.length;
  if(!matching.length){
   tell('Nenhum nome de arquivo corresponde às fotos informadas no JSON. Confira nomes e extensão.');return;
  }
  const sequence=++state.sequence;
  state.busy=true;by('Save').disabled=true;list();
  by('BatchStatus').textContent='Conferindo '+matching.length+' imagem(ns) locais em grupos de até três...';
  tell('Conferindo '+matching.length+' imagem(ns) locais. A fila permanece bloqueada durante a verificação.');
  const scanned=new Array(matching.length);let cursor=0;
  try{
   async function worker(){
    while(cursor<matching.length){
     const n=cursor++;
     scanned[n]=await inspect(matching[n]);
     if(sequence!==state.sequence)return;
    }
   }
   await Promise.all(Array.from({length:Math.min(3,matching.length)},worker));
   if(sequence!==state.sequence)return;
   const invalid=scanned.find(row=>!row?.frame||
    row.issue&&!row.issue.startsWith('Qualidade:'));
   if(invalid)throw Error('Lote recusado: '+invalid.name+' — '+(invalid.issue||'imagem incompleta')+'. Nenhum arquivo foi associado.');
   const manifest={schema:'mls_listing_factory_input_v1',marketplace:'SHOPEE_BR',
    items:state.drafts.map(d=>d.item)};
   const plan=planMlsDraftBatchMedia(manifest,scanned.map(row=>row.frame));
   if(!plan)throw Error('Não foi possível validar nomes e metadados do lote. Nenhum anúncio foi alterado.');
   const scannedMap=new Map(scanned.map(row=>[row.name,row]));
   for(const draft of state.drafts){
    for(const previous of draft.files){
     const current=scannedMap.get(previous.name);
     if(current&&previous.frame&&previous.frame.sha256!==current.frame.sha256)
      throw Error('Arquivo '+previous.name+' mudou de conteúdo (hash diferente). Renomeie ou revise a imagem individualmente; lote não aplicado.');
    }
   }
   const next=state.drafts.map(draft=>{
    const byName=new Map(draft.files.filter(row=>draft.item.images.includes(row.name)).map(row=>[row.name,row]));
    for(const name of draft.item.images)if(scannedMap.has(name))byName.set(name,scannedMap.get(name));
    return {item:draft.item,files:draft.item.images.filter(name=>byName.has(name)).map(name=>byName.get(name))};
   });
   const after=projection(next);
   if(!after?.review)throw Error('A revisão do lote foi rejeitada. Nenhum anúncio foi alterado.');
   state.drafts=next;
   const ready=after.review.summary.ready_for_review;
   const message=plan.matched_unique_files+' arquivo(s) associado(s) a '+plan.matched_item_count+
    ' anúncio(s); '+ready+' de '+after.review.summary.items+
    ' prontos para revisão interna. '+ignored+' arquivo(s) sem correspondência ignorado(s).';
   by('BatchStatus').textContent=message+' Associação por nome, não comprovação do mockup original: confira visualmente.';
   tell(message+' Sem upload ou publicação. Estoque, custos e permissões ainda exigem conferência.');
  }catch(error){
   const message=error?.message||'Erro de validação local do lote.';
   by('BatchStatus').textContent=message;
   tell(message);
  }finally{
   if(sequence===state.sequence){
    state.busy=false;by('Save').disabled=false;list();
   }
  }
 }
 by('BatchFiles').addEventListener('change',()=>reattachBatch(by('BatchFiles')));
 by('BatchFolder').addEventListener('change',()=>reattachBatch(by('BatchFolder')));
 by('Previous').onclick=()=>{if(state.busy)return;state.page=Math.max(0,state.page-1);list();};
 by('Next').onclick=()=>{if(state.busy)return;state.page++;list();};
 by('Clear').onclick=()=>{
  if(state.busy||!state.drafts.length)return;
  if(!globalThis.confirm?.('Limpar todos os rascunhos locais? Exporte o JSON antes.'))return;
  state.drafts=[];state.page=0;reset();tell('Fila removida apenas desta aba; a Shopee não foi alterada.');
 };
 variantRows();preview();list();
})();
`;
