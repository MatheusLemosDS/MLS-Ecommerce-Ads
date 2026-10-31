import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const REFERENCE_DIR='docs/visual-references/mls-2026-10-29';
const PNG=Buffer.from([137,80,78,71,13,10,26,10]);
const PANELS=Object.freeze([
 {id:'overview',name:'Visão Geral',file:'01_overview_aprovado.png',roi:[0,0,899,656]},
 {id:'agent-finance',name:'MLS Finance',file:'02_finance_aprovado.png',roi:[0,0,515,317]},
 {id:'agent-ads',name:'MLS Ads',file:'03_ads_aprovado.png',roi:[0,0,512,301]},
 {id:'agent-production',name:'MLS Production',file:'04_production_aprovado.png',roi:[0,0,504,256],note:'Há legenda de apresentação abaixo da moldura do aplicativo; ela não é parte da interface.'},
 {id:'agent-returns',name:'MLS Returns',file:'05_returns_aprovado.png',roi:[0,10,547,258],note:'Há texto de apresentação cortado acima da moldura do aplicativo; ele não é parte da interface.'},
 {id:'agent-products',name:'MLS Products',file:'06_products_aprovado.png',roi:[0,0,515,264],note:'Há legenda de apresentação abaixo da moldura do aplicativo; ela não é parte da interface.'},
]);
const esc=value=>String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const fail=code=>{throw Object.assign(Error(code),{code});};
const regular=file=>{let entry;try{entry=fs.lstatSync(file);}catch{fail('MLS_VISUAL_FILE_MISSING');}if(!entry.isFile()||entry.isSymbolicLink())fail('MLS_VISUAL_FILE_TYPE_INVALID');return entry;};
function readPng(file,maxBytes=8*1024*1024){
 const entry=regular(file);if(entry.size<33||entry.size>maxBytes)fail('MLS_VISUAL_IMAGE_SIZE_INVALID');
 const bytes=fs.readFileSync(file);
 if(!bytes.subarray(0,8).equals(PNG)||bytes.readUInt32BE(8)!==13||bytes.toString('ascii',12,16)!=='IHDR')fail('MLS_VISUAL_PNG_INVALID');
 const width=bytes.readUInt32BE(16),height=bytes.readUInt32BE(20);
 if(!width||!height||width>8192||height>8192)fail('MLS_VISUAL_IMAGE_DIMENSIONS_INVALID');
 return {bytes,width,height,sha256:hash(bytes)};
}

/** Read-only integrity check. The six original owner PNGs are never modified. */
export function readMlsVisualReferences({root=ROOT}={}){
 const directory=path.join(root,REFERENCE_DIR),manifestPath=path.join(directory,'manifest.json');
 if(regular(manifestPath).size>16384)fail('MLS_VISUAL_MANIFEST_INVALID');
 let manifest;try{manifest=JSON.parse(fs.readFileSync(manifestPath,'utf8'));}catch{fail('MLS_VISUAL_MANIFEST_INVALID');}
 if(manifest?.schema!=='mls_approved_visual_reference_manifest_v1'||manifest.source!=='OWNER_ATTACHMENT'||
  manifest.numeric_values!=='ILLUSTRATIVE_NOT_BUSINESS_DATA'||!Array.isArray(manifest.references)||manifest.references.length!==PANELS.length||
  !/^[a-f0-9]{64}$/.test(manifest.archive_sha256))fail('MLS_VISUAL_MANIFEST_INVALID');
 const references=PANELS.map(panel=>{
  const matches=manifest.references.filter(row=>row?.file===panel.file);if(matches.length!==1)fail('MLS_VISUAL_MANIFEST_FILES_INVALID');
  const record=matches[0],image=readPng(path.join(directory,panel.file));
  if(record.width!==image.width||record.height!==image.height||record.bytes!==image.bytes.length||record.sha256!==image.sha256)fail('MLS_VISUAL_REFERENCE_INTEGRITY_FAILED');
  const [x,y,width,height]=panel.roi;
  if(x<0||y<0||x+width>image.width||y+height>image.height)fail('MLS_VISUAL_REFERENCE_ROI_INVALID');
  return {...panel,width:image.width,height:image.height,bytes:image.bytes,sha256:image.sha256};
 });
 return {manifest,references};
}

/** Static local review artifact, without scripts, providers or approval logic. */
export function buildMlsVisualComparison({root=ROOT,capturesDir}={}){
 if(typeof capturesDir!=='string'||!capturesDir)fail('MLS_VISUAL_CAPTURES_REQUIRED');
 const {manifest,references}=readMlsVisualReferences({root});
 let qa=null;const qaFile=path.join(capturesDir,'results.json');
 if(fs.existsSync(qaFile)){
  if(regular(qaFile).size>1024*1024)fail('MLS_VISUAL_QA_METADATA_INVALID');
  try{qa=JSON.parse(fs.readFileSync(qaFile,'utf8'));}catch{fail('MLS_VISUAL_QA_METADATA_INVALID');}
  if(qa?.schema!=='mls_approved_design_all_panels_qa_v1'||qa.owner_authenticated!==false||qa.production_approved!==false||qa.source!=='synthetic owner'||!Array.isArray(qa.checks)||qa.checks.length>120)fail('MLS_VISUAL_QA_METADATA_INVALID');
 }
 const checks=[],sections=[];
 for(const reference of references){
  const pairs=[];
  for(const theme of ['dark','light'])for(const viewport of [{id:'desktop',width:1365,height:900},{id:'mobile',width:390,height:844}]){
   const filename='approved-'+theme+'-'+viewport.id+'-'+reference.id+'.png';
   const file=path.join(capturesDir,filename);let capture=null;
   if(fs.existsSync(file)){
    capture=readPng(file);
    if(capture.width!==viewport.width||capture.height!==viewport.height)fail('MLS_VISUAL_CAPTURE_DIMENSIONS_INVALID');
   }
   const provenance=qa?.checks.filter(check=>check?.panel===reference.id&&check.theme===theme&&check.viewport===viewport.id&&check.width===viewport.width&&check.height===viewport.height&&check.synthetic===true);
   const declaredSynthetic=capture&&provenance?.length===1;
   const check={panel:reference.id,theme,viewport:viewport.id,width:viewport.width,height:viewport.height,
    reference_sha256:reference.sha256,reference_app_frame_roi:reference.roi,roi_state:'MANUALLY_OBSERVED_APPROXIMATE_NOT_A_PIXEL_MASK',
    capture_file:filename,capture_sha256:capture?.sha256??null,capture_state:capture?'AVAILABLE':'MISSING',
    capture_provenance:declaredSynthetic?'DECLARED_SYNTHETIC_IN_QA_RESULTS':'UNKNOWN',human_approval:'PENDING'};
   checks.push(check);
   const refImage='<img alt="Referência original aprovada: '+esc(reference.name)+'" src="data:image/png;base64,'+reference.bytes.toString('base64')+'">';
   const appImage=capture?'<img alt="Captura sintética '+esc(reference.name)+' '+theme+' '+viewport.id+'" src="data:image/png;base64,'+capture.bytes.toString('base64')+'">':'<p class="missing">Captura indisponível: '+esc(filename)+'</p>';
   pairs.push('<article><h3>'+esc(reference.name)+' · '+theme+' · '+viewport.width+'×'+viewport.height+'</h3><div class="pair">'+
    '<figure>'+refImage+'<figcaption>Original '+reference.width+'×'+reference.height+' · números ilustrativos.</figcaption></figure>'+
    '<figure>'+appImage+'<figcaption>'+esc(filename)+' · '+(declaredSynthetic?'fixture sintética declarada no relatório de QA, não conta real.':'origem não comprovada pelo relatório de QA.')+'</figcaption></figure></div>'+
    '<p class="metadata">SHA da captura: '+esc(capture?.sha256??'INDISPONÍVEL')+'</p></article>');
  }
  sections.push('<section><h2>'+esc(reference.name)+'</h2><p>Área sugerida da moldura do aplicativo: x='+reference.roi[0]+', y='+reference.roi[1]+', largura='+reference.roi[2]+', altura='+reference.roi[3]+' pixels. '+esc(reference.note??'Toda a referência corresponde à moldura apresentada.')+'</p>'+pairs.join('')+'</section>');
 }
 const report={schema:'mls_visual_comparison_v1',reference_archive_sha256:manifest.archive_sha256,
  state:checks.some(check=>check.capture_state==='MISSING')?'INCOMPLETE':'PENDING_HUMAN_REVIEW',
  human_approval:'PENDING',mockup_parity_approved:false,production_approved:false,
  numeric_reference_values:'ILLUSTRATIVE_NOT_BUSINESS_DATA',capture_context:qa?'LOCAL_SYNTHETIC_QA_DECLARED_NOT_AUTHENTICATED_SELLER_CENTRE':'UNKNOWN',
  roi_policy:'ANNOTATIONS_ONLY_ORIGINAL_PNGS_UNCHANGED_NO_PIXELS_MASKED',checks};
 const html='<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'+
  '<meta http-equiv="Content-Security-Policy" content="default-src &#39;none&#39;; img-src data:; style-src &#39;unsafe-inline&#39;; script-src &#39;none&#39;">'+
  '<title>MLS · comparação visual para revisão</title><style>'+
  'body{margin:0;padding:24px;font:15px/1.6 system-ui,sans-serif;background:#f0f3f8;color:#142238}main{max-width:1700px;margin:auto}h1,h2,h3{line-height:1.25}h1{font-size:28px}section{margin-top:38px}article{padding:18px;margin:18px 0;background:white;border:1px solid #c5d0df;border-radius:12px}.notice{padding:16px;border:2px solid #a66a06;background:#fff3d6}.pair{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.52fr);gap:18px;align-items:start}figure{margin:0;min-width:0}img{display:block;width:100%;height:auto;border:1px solid #63718a;box-sizing:border-box}figcaption,.metadata{font-size:12px;overflow-wrap:anywhere}.missing{padding:32px;border:1px dashed #94520b;background:#fff5e4}.metadata{color:#4d5a6e}a{color:#064caa}@media(max-width:800px){body{padding:12px}.pair{grid-template-columns:minmax(0,1fr)}article{padding:12px}}'+
  '</style></head><body><main><h1>MLS Commerce OS · comparação visual</h1><p class="notice"><strong>APROVAÇÃO HUMANA PENDENTE.</strong> Este relatório não aprova paridade, merge ou deploy. As referências têm valores ilustrativos; as capturas usam fixtures sintéticas e não comprovam dados do Seller Centre.</p>'+
  '<p>As imagens são exibidas lado a lado com proporções preservadas. As referências pequenas representam composições desktop e não devem ser comparadas como breakpoints CSS de 515 pixels. Os recortes de moldura acima são apenas anotações aproximadas para revisão: nenhum pixel foi removido, mascarado, esticado em eixos independentes ou usado como fundo do aplicativo.</p>'+
  '<p>Comparar composição, posição relativa, densidade, tipografia, paleta e hierarquia. A adaptação de 390×844 é avaliada separadamente. Uma futura baseline de regressão deve ser uma captura nativa do aplicativo aceita pelo proprietário, com browser, fontes, tema e fixture fixados. Não calcular um percentual de aprovação entre estes PNGs ilustrativos e os dados reais.</p>'+sections.join('')+'</main></body></html>';
 if(Buffer.byteLength(html)>96*1024*1024)fail('MLS_VISUAL_REPORT_TOO_LARGE');
 return {html,report};
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  const args=process.argv.slice(2);if(args.length!==2||args.some(arg=>!arg.startsWith('--captures=')&&!arg.startsWith('--output=')))fail('MLS_VISUAL_USAGE_CAPTURES_AND_OUTPUT_REQUIRED');
  const captures=args.find(arg=>arg.startsWith('--captures='))?.slice(11),output=args.find(arg=>arg.startsWith('--output='))?.slice(9);
  if(!output||path.extname(output)!=='.html')fail('MLS_VISUAL_OUTPUT_HTML_REQUIRED');
  const {html,report}=buildMlsVisualComparison({capturesDir:captures});
  fs.mkdirSync(path.dirname(path.resolve(output)),{recursive:true});fs.writeFileSync(output,html);fs.writeFileSync(output.replace(/\.html$/,'.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({state:report.state,checks:report.checks.length,human_approval:report.human_approval,output:path.resolve(output)}));
 }catch(error){console.error(error.code||'MLS_VISUAL_REPORT_FAILED');process.exitCode=1;}
}
