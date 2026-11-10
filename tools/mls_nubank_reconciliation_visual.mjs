import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {existsSync,lstatSync,mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {compileNubankQaWorkers,startNubankQaFixture,NUBANK_QA_FILES,NUBANK_QA_MONTH,nubankQaHash} from './mls_nubank_reconciliation_fixture.mjs';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
export const NUBANK_LEGACY_QA_GUARDS=Object.freeze(['legacy_contracts_unchanged','overview_agents_preserved','daily_cost_chart_interactive','selected_day_drafts_preserved','weekly_cut_refresh_verified','friday_boundary_explicit','coverage_confirmation_explicit','weekly_originals_preserved','pricing_formula_unchanged','dto_unchanged','no_new_provider_reads','unknown_not_zero','month_drafts_preserved']);
const bankGuards=['nubank_parser_formats_verified','statement_file_preview_local','statement_import_explicit','statement_rows_deduplicated','external_cash_match_unlink_explicit','external_cash_replay_and_cas_verified','external_cash_protocol_private_finance','legacy_dto_and_financial_net_unchanged','no_real_statement_imports','six_agents_preserved','sidecar_only_after_owner_import'];
const agents=['hermes','finance','ads','products','production','returns'];
const suffix='bankReconciliation',selector=name=>'#'+suffix+name;
const bankPath='/api/admin/finance/external-cash';

export function collectNubankQaSourceSnapshot(root=ROOT){
 const files=execFileSync('git',['ls-files','-z','--cached','--others','--exclude-standard'],{cwd:root,encoding:'utf8'}).split('\0').filter(file=>
  /^web\/(?:cloudflare|finance)\/(?:src|tests)\/.*\.mjs$/.test(file)||file==='web/cloudflare/build.py'||/^tools\/.*\.(?:py|mjs)$/.test(file));
 for(const name of ['app','auth','finance'])files.push('dist/'+name+'-worker.mjs');
 const source_manifest=[...new Set(files)].sort().map(file=>{const absolute=path.join(root,file);assert.ok(lstatSync(absolute).isFile()&&!lstatSync(absolute).isSymbolicLink(),'QA_SOURCE_REGULAR_REQUIRED');const data=readFileSync(absolute);return {file,bytes:data.length,sha256:nubankQaHash(data)};});
 const generated_hashes=Object.fromEntries(['app','auth','finance'].map(name=>[name,source_manifest.find(item=>item.file==='dist/'+name+'-worker.mjs').sha256]));
 return {head:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),generated_hashes,source_vector_sha256:nubankQaHash(JSON.stringify(source_manifest)),source_manifest};
}

function regressionEvidence(file,source){
 if(!file)return null;
 const raw=readFileSync(file),value=JSON.parse(raw.toString('utf8'));
 assert.equal(value.schema,'mls_nubank_legacy_regression_evidence_v1');assert.deepEqual(value.generated_hashes,source.generated_hashes);
 assert.equal(value.sources?.head,source.head);assert.equal(value.sources?.source_vector_sha256,source.source_vector_sha256);
 assert.ok(value.checks&&NUBANK_LEGACY_QA_GUARDS.every(key=>typeof value.checks[key]==='boolean'),'QA_LEGACY_CHECKS_REQUIRED');
 assert.ok(Array.isArray(value.commands)&&value.commands.length>0,'QA_LEGACY_COMMAND_EVIDENCE_REQUIRED');
 for(const command of value.commands){assert.equal(command.exit_code,0);assert.ok(typeof command.command==='string'&&command.command.length>0);assert.ok(path.isAbsolute(command.log_file));assert.equal(nubankQaHash(readFileSync(command.log_file)),command.log_sha256);}
 return {value,file:path.resolve(file),sha256:nubankQaHash(raw)};
}

function assertSourceUnchanged(root,before){const after=collectNubankQaSourceSnapshot(root);assert.deepEqual(after,before,'QA_SOURCE_CHANGED_DURING_CAPTURE');}
async function settled(page){await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));}
async function bankReady(page){await page.waitForFunction(()=>!document.getElementById('bankReconciliationRefresh')?.disabled&&document.getElementById('bankReconciliationSummary')?.textContent.includes('Revisão'));}
async function screen(page,out,name,{bank=false}={}){
 await settled(page);const file=path.join(out,name+'.png');
 if(bank)await page.locator(selector('')).screenshot({path:file,animations:'disabled'});else await page.screenshot({path:file,animations:'disabled'});
 const bytes=readFileSync(file),result={file:path.basename(file),bytes:bytes.length,sha256:nubankQaHash(bytes)};
 if(bank){
  const anchor=name.endsWith('-preview')?'PreviewStatus':name.endsWith('-matched')?'Matches':name.endsWith('-unlinked')?'Summary':'Suggestions';
  await page.locator(selector(anchor)).evaluate(node=>scrollTo({top:Math.max(0,node.getBoundingClientRect().top+scrollY-170),behavior:'instant'}));await settled(page);
  const viewport=path.join(out,name+'-viewport.png');await page.screenshot({path:viewport,animations:'disabled'});const capture=readFileSync(viewport);result.viewport={file:path.basename(viewport),bytes:capture.length,sha256:nubankQaHash(capture)};
 }
 return result;
}
const bankCalls=fixture=>fixture.requests.filter(row=>row.path===bankPath);
const bankWrites=fixture=>bankCalls(fixture).filter(row=>['import','match','unlink'].includes(row.operation));
async function chooseBank(page){
 await page.locator(selector('FileNUBANK')).setInputFiles({name:'nubank-exclusivamente-sintetico.csv',mimeType:'text/csv',buffer:Buffer.from(NUBANK_QA_FILES.bank)});
 await page.locator(selector('ChooseNUBANK')).click();await page.locator(selector('AmountFormat')).selectOption('DECIMAL');await page.locator(selector('Account')).check();
 await page.waitForFunction(()=>document.getElementById('bankReconciliationLocalStatus').textContent.includes('reconhecidos'));
}
async function preview(page){await page.locator(selector('Preview')).click();await page.waitForFunction(()=>!document.getElementById('bankReconciliationConfirmImport').disabled);}
async function confirmImport(page){await page.locator(selector('ConfirmImport')).check();await page.locator(selector('Import')).click();}
async function waitRows(page,count){await page.waitForFunction(count=>document.querySelectorAll('#bankReconciliationRecords tbody tr').length===count,count);await bankReady(page);}
async function chooseTransfer(page){
 await page.locator(selector('FileSHOPEE')).setInputFiles({name:'shopee-exclusivamente-sintetico.csv',mimeType:'text/csv',buffer:Buffer.from(NUBANK_QA_FILES.transfer)});
 await page.locator(selector('ChooseSHOPEE')).click();await page.locator(selector('Separator')).selectOption(';');await page.locator(selector('DateFormat')).selectOption('YMD');await page.locator(selector('AmountFormat')).selectOption('DECIMAL');
 for(const [key,header]of Object.entries({date:'Data',amount:'Valor',external_id:'Identificador',reference:'Referência',status:'Situação',description:'Descrição'}))await page.locator(selector('Column'+key)).selectOption(header);
 await page.locator(selector('CompletedStatus')).fill('Concluído');await page.locator(selector('Account')).check();await page.locator(selector('Completed')).check();
}

async function outcome(browser,compiled,{root,out,width,theme,minify,source}){
 const fixture=await startNubankQaFixture(compiled),context=await browser.newContext({viewport:{width,height:960},deviceScaleFactor:1,colorScheme:theme,reducedMotion:'reduce'}),page=await context.newPage();
 const errors=[],external=[],networkFailures=[];page.on('pageerror',error=>errors.push(error.message));page.on('requestfailed',request=>networkFailures.push({path:new URL(request.url()).pathname,error:request.failure()?.errorText??'UNKNOWN'}));
 await context.route('**/*',route=>{const request=route.request();if(new URL(request.url()).origin!==fixture.origin){external.push(new URL(request.url()).origin);return route.abort();}return route.continue();});
 await page.addInitScript(theme=>{localStorage.setItem('braza-theme',theme);},theme);
 const id=(minify?'min':'normal')+'-'+width+'-'+theme,screenshots=[];
 try{
  await page.goto(fixture.origin+'/admin?tab=overview&month='+NUBANK_QA_MONTH,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>document.documentElement.dataset.activePanel==='overview'&&document.querySelectorAll('#commandCenterAgents>.agent-card').length===6&&!document.getElementById('bankReconciliationChooseNUBANK')?.disabled);
  await settled(page);assert.equal(await page.locator('#nubankQaSynthetic').count(),1);
  const overview=await page.evaluate(()=>({order:[...document.querySelectorAll('#commandCenterAgents>.agent-card')].map(n=>n.dataset.missionAccent),avatars:document.querySelectorAll('#commandCenterAgents .mls-agent-avatar svg').length,visible:[...document.querySelectorAll('#commandCenterAgents>.agent-card')].every(n=>n.checkVisibility({checkVisibilityCSS:true})),theme:document.documentElement.dataset.theme,width:innerWidth,scroll:document.documentElement.scrollWidth}));
  assert.deepEqual(overview.order,agents);assert.equal(overview.avatars,6);assert.equal(overview.visible,true);assert.equal(overview.theme,theme);assert.equal(overview.width,width);assert.ok(overview.scroll<=width+1);assert.equal(bankCalls(fixture).length,0,'QA_OVERVIEW_MUST_NOT_READ_BANK');assert.deepEqual(fixture.databaseCounts(),{records:0,imports:0,matches:0,unlinks:0,audit:0});
  screenshots.push(await screen(page,out,id+'-overview'));
  await page.locator('#commandCenterAgents>.agent-card[data-mission-accent=finance]').click();await bankReady(page);assert.equal(bankCalls(fixture).filter(row=>row.operation==='read').length,1);
  const financialBefore=await page.evaluate(()=>({day:globalThis.brazaDayDashboard?.getSnapshot?.()?.net_cents??null,month:globalThis.brazaMonthDashboard?.getSnapshot?.()?.balance_cents??null}));
  const beforeChoose=bankCalls(fixture).length;await chooseBank(page);assert.equal(bankCalls(fixture).length,beforeChoose,'QA_FILE_INSPECTION_MUST_STAY_LOCAL');assert.equal(bankWrites(fixture).length,0);
  await preview(page);assert.equal(fixture.databaseCounts().records,0,'QA_PREVIEW_MUST_NOT_PERSIST');assert.equal(bankWrites(fixture).length,0);assert.match(await page.locator(selector('PreviewStatus')).textContent(),/3 novas/);
  screenshots.push(await screen(page,out,id+'-preview',{bank:true}));
  fixture.conflictNextImport();await confirmImport(page);await page.waitForFunction(()=>document.getElementById('bankReconciliationStatus').textContent.includes('revisão mudou'));
  const cas=await page.evaluate(()=>({draft:!document.getElementById('bankReconciliationDraft').hidden,file:document.getElementById('bankReconciliationFileNUBANK').files.length,confirm:document.getElementById('bankReconciliationConfirmImport').checked,import_disabled:document.getElementById('bankReconciliationImport').disabled,preview_disabled:document.getElementById('bankReconciliationPreview').disabled}));
  assert.deepEqual(cas,{draft:true,file:1,confirm:false,import_disabled:true,preview_disabled:false});assert.equal(fixture.databaseCounts().records,1);
  await preview(page);fixture.loseNextImport();await confirmImport(page);await page.waitForFunction(()=>document.getElementById('bankReconciliationStatus').textContent.includes('mesma identificação'));
  assert.equal(fixture.databaseCounts().records,4,'QA_LOST_RESPONSE_IS_AFTER_REAL_LOCAL_COMMIT');await page.locator(selector('Import')).click();await waitRows(page,4);
  const lost=bankCalls(fixture).filter(row=>row.operation==='import'&&row.expected_revision===1);assert.equal(lost.length,2);assert.equal(lost[0].response_lost_after_commit,true);assert.equal(lost[0].request_id,lost[1].request_id);assert.equal(lost[0].body_sha256,lost[1].body_sha256);assert.equal(fixture.databaseCounts().imports,2);
  await preview(page);assert.match(await page.locator(selector('PreviewStatus')).textContent(),/3 duplicadas/);await confirmImport(page);await bankReady(page);assert.equal(fixture.databaseCounts().records,4);
  await chooseTransfer(page);await preview(page);assert.match(await page.locator(selector('PreviewStatus')).textContent(),/1 novas/);await confirmImport(page);await waitRows(page,5);
  await page.waitForFunction(()=>document.querySelectorAll('#bankReconciliationSuggestions>article').length===1);
  assert.equal(fixture.databaseCounts().matches,0,'QA_SUGGESTIONS_MUST_NOT_CREATE_MATCH');assert.equal(bankWrites(fixture).filter(row=>row.operation==='match').length,0);
  screenshots.push(await screen(page,out,id+'-suggestion',{bank:true}));
  const suggestion=page.locator(selector('Suggestions')+'>article').first(),matchButton=suggestion.locator('button').last();
  await matchButton.click();assert.equal(bankWrites(fixture).filter(row=>row.operation==='match').length,0);await suggestion.locator('input[type=checkbox]').check();await matchButton.click();assert.equal(bankWrites(fixture).filter(row=>row.operation==='match').length,0);
  await page.locator(selector('Reason')).fill('Conferência sintética explícita: crédito e transferência da mesma conta.');await matchButton.click();await page.waitForFunction(()=>document.querySelectorAll('#bankReconciliationMatches>article').length===1);assert.equal(fixture.databaseCounts().matches,1);
  screenshots.push(await screen(page,out,id+'-matched',{bank:true}));
  const confirmed=page.locator(selector('Matches')+'>article').first(),undo=confirmed.locator('button').last();
  await undo.click();assert.equal(fixture.databaseCounts().unlinks,0);await confirmed.locator('input[type=checkbox]').check();await page.locator(selector('Reason')).fill('');await undo.click();assert.equal(fixture.databaseCounts().unlinks,0);
  await page.locator(selector('Reason')).fill('Desfazer sintético explícito para conferir a trilha de auditoria.');await undo.click();await page.waitForFunction(()=>document.querySelectorAll('#bankReconciliationMatches>article').length===0&&document.querySelectorAll('#bankReconciliationSuggestions>article').length===1);await bankReady(page);
  const saved=await fixture.workspace();assert.equal(saved.records.length,5);assert.equal(saved.matches.length,0);assert.equal(saved.suggestions.length,1);assert.ok(saved.records.some(row=>row.amount_cents===0));assert.ok(saved.records.some(row=>row.amount_cents===-2500));
  const counts=fixture.databaseCounts();assert.deepEqual(counts,{records:5,imports:4,matches:1,unlinks:1,audit:6});
  const final=await page.evaluate(()=>({theme:document.documentElement.dataset.theme,width:innerWidth,scroll:document.documentElement.scrollWidth,visible:document.getElementById('bankReconciliation').checkVisibility({checkVisibilityCSS:true}),day:globalThis.brazaDayDashboard?.getSnapshot?.()?.net_cents??null,month:globalThis.brazaMonthDashboard?.getSnapshot?.()?.balance_cents??null,touch:[...document.querySelectorAll('#bankReconciliation button,#bankReconciliation select,#bankReconciliation input:not([type=checkbox])')].filter(n=>n.checkVisibility({checkVisibilityCSS:true})).map(n=>({height:n.getBoundingClientRect().height,id:n.id}))}));
  assert.equal(final.theme,theme);assert.equal(final.width,width);assert.ok(final.scroll<=width+1,'QA_BANK_HORIZONTAL_OVERFLOW');assert.equal(final.visible,true);assert.deepEqual({day:final.day,month:final.month},financialBefore);assert.ok(final.touch.every(row=>row.height>=44),'QA_TOUCH_TARGET_TOO_SMALL');
  assert.equal(errors.length,0,'QA_PAGE_ERRORS');assert.deepEqual(external,[],'QA_BROWSER_EXTERNAL_REQUESTS');assert.ok(fixture.privateHops.length>0);assert.equal(fixture.privateHops.filter(row=>row.stage==='APP_TO_AUTH').length,fixture.privateHops.filter(row=>row.stage==='AUTH_TO_FINANCE').length);
  assert.deepEqual(networkFailures,[],'QA_UNEXPECTED_NETWORK_FAILURE');assert.equal(lost[0].delivered_status,502,'QA_COMMITTED_RECEIPT_UNAVAILABLE_FAULT_REQUIRED');
  screenshots.push(await screen(page,out,id+'-unlinked',{bank:true}));assertSourceUnchanged(root,source);
  return {minify,width,theme,pass:true,page_errors:0,horizontal_overflow:false,synthetic:true,backend:'COMPILED_APP_AUTH_FINANCE_WITH_EPHEMERAL_SQLITE',overview_no_bank_get:true,overview_agents:overview.order,local_file_no_requests:true,preview_read_only:true,explicit_import:true,duplicate_rows:3,cas_draft_preserved:cas,lost_response_same_request_id:true,suggestions_only:true,explicit_match_and_unlink:true,zero_and_debit_preserved:true,legacy_financial_values_unchanged:true,touch_targets_at_least_44px:true,counts,private_hops:fixture.privateHops.length,blocked_nonbank_outbound_attempts:fixture.blockedOutbound.length,unexpected_external_requests:external.length,requests:fixture.requests,screenshots};
 }finally{await context.close();await fixture.close();}
}

export async function runNubankVisualQa({root=ROOT,out,regressionFile}={}){
 assert.ok(typeof out==='string'&&path.isAbsolute(out)&&out.startsWith('/tmp/'),'QA_PRIVATE_TMP_OUTPUT_REQUIRED');
 assert.ok(!existsSync(out),'QA_OUTPUT_MUST_BE_NEW');mkdirSync(out,{recursive:true,mode:0o700});
 const source=collectNubankQaSourceSnapshot(root),legacy=regressionEvidence(regressionFile,source);
 const {chromium}=await import(process.env.MLS_PLAYWRIGHT_MODULE||'/workspace/.braza-browser-validation/node_modules/playwright/index.mjs');
 const browser=await chromium.launch({executablePath:process.env.MLS_CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox','--disable-dev-shm-usage','--disable-background-networking','--disable-extensions']});
 const report={schema:'mls_nubank_reconciliation_qa_v1',generated_hashes:source.generated_hashes,sources:source,compilation:{},synthetic_only:true,owner_authenticated:false,live_verified:false,remote_writes:0,owner_real_mutation_requests:0,new_provider_calls:0,results:[],legacy_regression_evidence:legacy?{file:legacy.file,sha256:legacy.sha256,commands:legacy.value.commands}:null};
 for(const key of NUBANK_LEGACY_QA_GUARDS)report[key]=legacy?.value.checks[key]===true;
 for(const key of bankGuards)report[key]=false;
 try{
  for(const minify of [false,true]){
   const compiled=await compileNubankQaWorkers(root,minify);
   report.compilation[minify?'minified':'normal']=Object.fromEntries(Object.entries(compiled).map(([name,{source_sha256,compiled_sha256,bytes}])=>[name,{source_sha256,compiled_sha256,bytes}]));
   for(const width of [320,1365])for(const theme of ['light','dark']){
    const result=await outcome(browser,compiled,{root,out,width,theme,minify,source});report.results.push(result);
    writeFileSync(path.join(out,'results.partial.json'),JSON.stringify(report,null,2)+'\n',{mode:0o600});
   }
  }
  assertSourceUnchanged(root,source);
  // Parser formats are proven by its separately executed dedicated suite, not by a screenshot.
  const parserLog=path.join(out,'cash-statement-import.test.log');
  const parserResult=execFileSync(process.execPath,['--test','web/finance/tests/cash-statement-import.test.mjs'],{cwd:root,encoding:'utf8',timeout:60000});writeFileSync(parserLog,parserResult,{mode:0o600});
  report.parser_evidence={command:'node --test web/finance/tests/cash-statement-import.test.mjs',exit_code:0,log_file:parserLog,log_sha256:nubankQaHash(parserResult)};
  for(const key of bankGuards)report[key]=true;
  report.legacy_dto_and_financial_net_unchanged=report.results.every(row=>row.legacy_financial_values_unchanged)&&['legacy_contracts_unchanged','dto_unchanged','pricing_formula_unchanged'].every(key=>legacy?.value.checks[key]===true);
  report.overview_agents_preserved=report.results.every(row=>row.overview_agents.join(',')===agents.join(','));
  report.status=NUBANK_LEGACY_QA_GUARDS.every(key=>report[key])?'PASSED':'BANK_PASSED_LEGACY_EVIDENCE_PENDING';
  writeFileSync(path.join(out,'results.json'),JSON.stringify(report,null,2)+'\n',{mode:0o600});return report;
 }catch(error){report.status='FAILED';report.failure=String(error?.message??'QA_FAILED').slice(0,2000);writeFileSync(path.join(out,'results.failed.json'),JSON.stringify(report,null,2)+'\n',{mode:0o600});throw error;}
 finally{await browser.close();}
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  const args=process.argv.slice(2),options={};for(let index=0;index<args.length;index+=2){assert.ok(['--out','--regression-evidence'].includes(args[index])&&args[index+1],'QA_USAGE_OUT_AND_OPTIONAL_REGRESSION_EVIDENCE');options[args[index]==='--out'?'out':'regressionFile']=args[index+1];}
  const result=await runNubankVisualQa(options);process.stdout.write(JSON.stringify({status:result.status,out:options.out,outcomes:result.results.length,generated_hashes:result.generated_hashes})+'\n');
 }catch(error){process.stderr.write(String(error?.message??'NUBANK_VISUAL_QA_FAILED')+'\n');process.exitCode=1;}
}
