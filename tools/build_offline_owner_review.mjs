/**
 * Visual-only offline owner preview built from a synthetic D1 session.
 * NEVER deploys, reads Cloudflare secrets, or sends provider requests.
 * All original app scripts and form actions are deliberately removed.
 */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {compiledOwnerReportPage} from '../web/cloudflare/tests/owner-report-browser-fixture.mjs';

export const REVIEW_SECTIONS=Object.freeze([
 ['overview','Visão geral'],['agents','Equipe digital'],['agent-finance','Finance'],
 ['agent-ads','Ads'],['agent-products','Products'],['agent-production','Production'],
 ['agent-returns','Returns'],['agent-auditor','Auditor'],['agent-hermes','MLS Hermes'],
 ['products','Catálogo'],['production','Produção DTF'],['roadmap','Plano de evolução'],
 ['hermes','Automação Hermes'],['margins','Custos'],['history','Histórico']
]);

function escapeHtml(value){
 return String(value).replace(/&/g,'&amp;').replace(/</g,'&lt;')
  .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
const reviewCss=[
 'html[data-theme=dark]{scroll-behavior:auto}',
 '.review-strip{position:relative;z-index:100;display:grid;gap:9px;padding:16px 20px;color:#eff8ff;background:#071931;border-bottom:2px solid #4eacfa;font:12px/1.55 system-ui,sans-serif}',
 '.review-strip h1{font:800 18px/1.25 system-ui;margin:0;color:#eff8ff}',
 '.review-strip p{margin:0;color:#b9d1ee}.review-strip strong{color:#72d6ff}',
 '.review-strip nav{display:flex;gap:7px;overflow-x:auto;max-width:100%;padding:2px 0 7px}',
 '.review-strip nav a{flex:0 0 auto;display:inline-block;text-decoration:none;border:1px solid #3a6696;border-radius:9px;padding:7px 11px;background:#112d50;color:#e8f4ff;font-weight:650;white-space:nowrap}',
 '.review-strip nav a:hover,.review-strip nav a:focus-visible{border-color:#6ad5ff;background:#184673}',
 'main.workspace>section{display:none!important}',
 'main.workspace>section#overview{display:block!important}',
 'main.workspace:has(>section:target)>#overview,main.workspace:has(>section :target)>#overview{display:none!important}',
 'main.workspace>section:target,main.workspace>section:has(:target){display:block!important}',
 'main.workspace>section:target[hidden],main.workspace>section:has(:target)[hidden]{display:block!important}',
 'main.workspace>section.mission-workspace:target,main.workspace>section.mission-workspace:has(:target){display:grid!important}',
 '@media(max-width:850px){main.workspace>section.mission-workspace:target,main.workspace>section.mission-workspace:has(:target){display:block!important}}',
 '.review-inert-form{min-width:0}',
 '@media(max-width:600px){.review-strip{padding:13px}.review-strip nav{gap:6px}.review-strip nav a{padding:8px 9px}}'
].join('\n');

export function buildOfflineOwnerReview(html,{previewEnabled=false}={}){
 if(typeof html!=='string'||!html.includes('class="workspace"'))
  throw Error('REVIEW_SOURCE_NOT_OWNER');
 const foundBody=/<body(?:\s[^>]*)?>([\s\S]*?)<\/body\s*>/i.exec(html);
 if(!foundBody)throw Error('REVIEW_BODY_NOT_FOUND');
 const styles=[...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style\s*>/gi)].map(m=>m[1]);
 if(!styles.length)throw Error('REVIEW_STYLE_NOT_FOUND');
 // Preserve original styles, but remove all URLs and remote imports.
 const css=styles.join('\n').replace(/@import\b[^;]*;/gi,'')
  .replace(/url\([^)]*\)/gi,'none');
 let body=foundBody[1]
  .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi,'')
  .replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi,'')
  .replace(/<(?:iframe|object|embed|img|link|source|video|audio)\b[^>]*>/gi,'')
  .replace(/<\/(?:iframe|object|embed|video|audio)\s*>/gi,'')
  .replace(/\s(?:on[a-z]+|src|srcset|formaction|action)\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi,'');
 const targets=new Set(REVIEW_SECTIONS.map(([id])=>id));
 body=body.replace(/\shref\s*=\s*(?:"([^"]*)"|'([^']*)')/gi,(_all,a,b)=>{
  const raw=a??b;
  if(/^#[a-z0-9_-]+$/i.test(raw))return ' href="'+raw+'"';
  const match=/^\/admin\?tab=([a-z0-9_-]+)(?:&.*)?$/i.exec(raw);
  return ' href="'+(match&&targets.has(match[1])?'#'+match[1]:'#review-unavailable')+'"';
 });
 // Forms and every state-changing control are inert even when offline.
 body=body.replace(/<form\b[^>]*>/gi,'<div class="review-inert-form" data-review-form="disabled">')
  .replace(/<\/form\s*>/gi,'</div>')
  .replace(/<(button|input|select|textarea)\b/gi,'<$1 disabled="disabled"')
  .replace(/\s(?:target|ping)\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi,'');
 for(const [id] of REVIEW_SECTIONS)
  if(!body.includes('id="'+id+'"'))throw Error('REVIEW_MISSING_SECTION_'+id);
 if(/<script\b|<iframe\b|<img\b|<link\b|<form\b|\s(?:src|action|onload|onclick)\s*=/i.test(body))
  throw Error('REVIEW_UNSAFE_MARKUP');
 if([...body.matchAll(/\shref="([^"]*)"/g)].some(x=>!x[1].startsWith('#')))
  throw Error('REVIEW_EXTERNAL_LINK');
 if(/<\/style/i.test(css))throw Error('REVIEW_CSS_INVALID');
 const label=previewEnabled?'V3.6 habilitada apenas nesta simulação':'V3.6 desligada (release inicial)';
 const nav=REVIEW_SECTIONS.map(([id,name])=>'<a href="#'+id+'">'+escapeHtml(name)+'</a>').join('');
 const output=[
 '<!doctype html><html lang="pt-BR" data-theme="dark"><head><meta charset="utf-8">',
 '<meta name="viewport" content="width=device-width,initial-scale=1">',
 '<meta http-equiv="Content-Security-Policy" content="default-src &#39;none&#39;; script-src &#39;none&#39;; connect-src &#39;none&#39;; style-src &#39;unsafe-inline&#39;; img-src data:; font-src data:; form-action &#39;none&#39;; object-src &#39;none&#39;; base-uri &#39;none&#39;">',
 '<title>MLS Commerce OS · QA visual '+(previewEnabled?'ON':'OFF')+'</title>',
 '<style>',css,reviewCss,'</style></head>',
 '<body data-qa-synthetic="true" data-qa-preview="'+(previewEnabled?'on':'off')+'">',
 '<div class="review-strip"><h1>MLS Commerce OS · revisão visual isolada</h1>',
 '<p><strong>QA SINTÉTICA · SEM DADOS REAIS</strong> | '+label+'</p>',
 '<p>Somente prévia de layout. Sem JavaScript da loja, APIs, login, uploads, pedidos reais ou publicação. Controles de alteração estão desabilitados.</p>',
 '<nav aria-label="Navegação da prévia">'+nav+'</nav></div>',body,'</body></html>'
 ].join('\n');
 if(/<script\b|<form\b|<iframe\b|<img\b/i.test(output)||
  /href="(?:https?:|\/\/|\/admin)/i.test(output)||
  !output.includes('script-src &#39;none&#39;'))
  throw Error('REVIEW_NOT_SELF_CONTAINED');
 return output;
}

export async function writeOfflineOwnerReview(outputDir){
 if(typeof outputDir!=='string'||!outputDir.trim())throw Error('REVIEW_OUTPUT_REQUIRED');
 const [off,on]=await Promise.all([
  compiledOwnerReportPage(false,{ownerPreview:false}),
  compiledOwnerReportPage(false,{ownerPreview:true})
 ]);
 const offHtml=buildOfflineOwnerReview(off.html,{previewEnabled:false});
 const onHtml=buildOfflineOwnerReview(on.html,{previewEnabled:true});
 fs.mkdirSync(outputDir,{recursive:true});
 fs.writeFileSync(path.join(outputDir,'preview-off.html'),offHtml,'utf8');
 fs.writeFileSync(path.join(outputDir,'preview-on.html'),onHtml,'utf8');
 fs.writeFileSync(path.join(outputDir,'index.html'),[
  '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">',
  '<meta name="viewport" content="width=device-width,initial-scale=1">',
  '<meta http-equiv="Content-Security-Policy" content="default-src &#39;none&#39;; style-src &#39;unsafe-inline&#39;; form-action &#39;none&#39;">',
  '<title>MLS Commerce OS · QA visual</title>',
  '<style>body{font:16px/1.5 system-ui;background:#06162f;color:#edf7ff;max-width:780px;margin:8vh auto;padding:20px}',
  'a{display:block;padding:20px;margin:16px 0;color:#eaf5ff;background:#15375d;border:1px solid #528ad0;border-radius:12px;text-decoration:none}',
  'p{color:#acc7e7}</style></head><body><h1>MLS Commerce OS — prévia isolada</h1>',
  '<p><strong>QA sintética.</strong> Sem scripts da aplicação, dados da loja, integrações ou ações comerciais.</p>',
  '<a href="preview-off.html">Visualizar a V3.6 desligada (primeiro release)</a>',
  '<a href="preview-on.html">Visualizar a V3.6 habilitada apenas na simulação</a>',
  '<p>Abra estes arquivos no Chrome/Edge, sem instalar nada. Não é homologação autenticada.</p></body></html>'
 ].join('\n'),'utf8');
 fs.writeFileSync(path.join(outputDir,'manifest.json'),JSON.stringify({
  schema:'mls_offline_visual_review_v1',synthetic:true,realShopData:false,
  applicationScripts:false,networkRequests:false,cloudflareDeployment:false,
  ownerAuthenticated:false,productionReleaseApproved:false,
  sourceCommit:process.env.GITHUB_SHA||'local',
  modes:['OFF','ON_SYNTHETIC'],panels:REVIEW_SECTIONS.map(([id])=>id)
 },null,2)+'\n');
 fs.writeFileSync(path.join(outputDir,'README.txt'),
  'MLS Commerce OS — Prévia 100% OFFLINE.\nExtraia o ZIP e abra index.html no Edge/Chrome.\nNavegue pelos 15 painéis clicando nos links do topo. Botões e formulários estão inativos por segurança.\nOFF é a aparência do lançamento inicial; ON demonstra apenas a visibilidade da V3.6, sem publicação ou APIs.\nNão contém dados da sua loja. Este arquivo NÃO substitui a homologação autenticada nem autoriza merge ou deploy.\n','utf8');
 return {outputDir,offBytes:Buffer.byteLength(offHtml),onBytes:Buffer.byteLength(onHtml)};
}

if(process.argv[1]&&fileURLToPath(import.meta.url)===path.resolve(process.argv[1])){
 const args=process.argv.slice(2);
 if(args.length!==1||!args[0].startsWith('--output=')||!args[0].slice(9).trim())
  throw Error('Usage: node tools/build_offline_owner_review.mjs --output=/path/to/review');
 const report=await writeOfflineOwnerReview(path.resolve(args[0].slice(9)));
 process.stdout.write('MLS_OFFLINE_REVIEW_CREATED '+JSON.stringify(report)+'\n');
}
