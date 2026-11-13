#!/usr/bin/env node
import assert from 'node:assert/strict';
import {readFileSync,existsSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const directory=fileURLToPath(new URL('./',import.meta.url));
const root=path.resolve(directory,'../..');
const read=name=>JSON.parse(readFileSync(path.join(directory,name),'utf8'));
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const input=read('input/MATRIZ_FUNCIONAL_MLS_CODEX.json');
const coverage=read('functional-coverage.json');
const manifest=read('input-manifest.json');
const prompt=readFileSync(path.join(directory,'input/PROMPT_CODEX_MLS_LAYOUT.txt'),'utf8');
const ids=rows=>rows.map(row=>row.id);
const count=values=>Object.fromEntries([...new Set(values)].sort().map(value=>[value,values.filter(item=>item===value).length]));

assert.equal(input.quantidade_requisitos,233);
assert.equal(input.quantidade_familias_graficos,22);
assert.equal(coverage.requisitos.length,233);
assert.equal(coverage.graficos.length,22);
assert.equal(new Set(ids(coverage.requisitos)).size,233);
assert.equal(new Set(ids(coverage.graficos)).size,22);
const additional=coverage.requisitos_adicionais||[];
assert.equal(new Set(ids(additional)).size,additional.length);
assert.ok(additional.every(row=>!ids(input.requisitos).includes(row.id)&&row.id.startsWith('EXTRA-')),'Additional findings must not replace supplied requirement IDs');
assert.deepEqual(ids(coverage.requisitos),ids(input.requisitos),'No requirement may be lost, reordered or invented under an existing ID');
assert.deepEqual(ids(coverage.graficos),ids(input.graficos),'Keep the 22 supplied chart family identities');

for(const entry of manifest.inputs){
 const bytes=readFileSync(path.join(root,entry.copied_path));
 assert.equal(bytes.length,entry.bytes,entry.copied_path);
 assert.equal(digest(bytes),entry.sha256,entry.copied_path);
}
for(const entry of manifest.history||[]){
 const bytes=readFileSync(path.join(root,entry.archived_path));
 assert.equal(bytes.length,entry.bytes,entry.archived_path);
 assert.equal(digest(bytes),entry.sha256,entry.archived_path);
}
for(const [index,row] of coverage.requisitos.entries()){
 const original=input.requisitos[index];
 for(const field of ['id','grupo','requisito','classificacao','ja_presente_no_prompt_v3','descricao','criterio_de_aceite'])
  assert.deepEqual(row[field],original[field],row.id+' must preserve '+field);
 assert.ok(prompt.includes(row.descricao)&&prompt.includes(row.criterio_de_aceite),row.id+' prompt/matrix correspondence');
 assert.ok(row.cobertura&&typeof row.cobertura==='object',row.id+' coverage dimensions');
 for(const dimension of ['inventario','implementacao','validacao_local','validacao_integracao','publicacao','verificacao_live','bloqueio_intencional'])
  assert.equal(typeof row.cobertura[dimension],'string',row.id+' '+dimension);
 for(const field of ['evidencias_de_validacao','bloqueios_intencionais_preservados','pendencias_externas'])assert.ok(Array.isArray(row[field]),row.id+' '+field);
 if(row.cobertura.validacao_local==='PASSOU')
  assert.ok(row.evidencias_de_validacao.some(e=>e.ambiente==='LOCAL_SINTETICO'&&e.resultado==='PASSOU'),row.id+' local pass requires local result');
 if(row.cobertura.publicacao==='PUBLICADO')
  assert.ok(row.evidencias_de_publicacao?.some(e=>e.resultado==='PUBLICADO'&&e.commit&&e.recibo),row.id+' published requires commit and receipt');
 if(row.cobertura.verificacao_live==='VERIFICADO')
  assert.ok(row.evidencias_de_publicacao?.some(e=>e.resultado==='VERIFICADO'&&e.url?.startsWith('https://app.brazacommerce.com.br')&&e.horario),row.id+' Live result needs correct domain and time');
 for(const evidence of [...row.evidencias_de_validacao,...(row.evidencias_de_publicacao||[])]){
  assert.equal(typeof evidence,'object',row.id+' structured evidence');
  assert.ok(evidence.ambiente&&evidence.resultado,row.id+' evidence environment/result');
  for(const source of evidence.comando?.match(/web\/[A-Za-z0-9_./-]+\.test\.mjs/g)||[])assert.ok(existsSync(path.join(root,source)),row.id+' command cites missing test '+source);
  if(evidence.arquivo){
   const target=path.isAbsolute(evidence.arquivo)?evidence.arquivo:path.join(root,evidence.arquivo);
   assert.ok(existsSync(target),row.id+' missing evidence '+evidence.arquivo);
   if(evidence.sha256)assert.equal(digest(readFileSync(target)),evidence.sha256,row.id+' evidence bytes changed');
  }
 }
}
for(const [index,row] of coverage.graficos.entries()){
 const original=input.graficos[index];
 for(const field of ['id','titulo_e_situacao_auditada','contrato_auditado'])assert.equal(row[field],original[field],row.id+' source contract');
 assert.ok(row.cobertura&&Array.isArray(row.evidencias_de_validacao),row.id+' independent chart evidence');
}

const inventory=read('baseline-active-inventory.json');
assert.equal(inventory.base_commit,'a5bd38a0902b38ecc3e90a747601eba330e7813e');
assert.equal(inventory.worker_sha256,'378d3e24a853d441ebd06249282f77d060f8d01f0cc27e01209487d0f68737a1');
assert.equal(inventory.route_observations.filter(row=>row.path).length,272);
assert.equal(inventory.route_observations.filter(row=>!row.path).length,9);
assert.equal(inventory.route_observations.filter(row=>row.profile==='anonymous-public'&&row.path).length,8);
assert.ok(inventory.route_observations.filter(row=>!row.path).every(row=>row.outbound_attempts===0));
assert.ok(inventory.compositions.every(row=>row.duplicate_ids.length===0));

const report={schema:'mls_v41_documentation_validation_v1',checked_at:new Date().toISOString(),result:'PASSOU',meaning:'Input bytes, exact requirement/chart preservation, independent evidence dimensions and cited artifact consistency. This does not run functional tests or validate the site.',requirements:coverage.requisitos.length,additional_requirements:additional.length,chart_families:coverage.graficos.length,requirement_states:count(coverage.requisitos.map(row=>row.estado)),local_validation_states:count(coverage.requisitos.map(row=>row.cobertura.validacao_local)),publication_states:count(coverage.requisitos.map(row=>row.cobertura.publicacao)),live_states:count(coverage.requisitos.map(row=>row.cobertura.verificacao_live)),coverage_sha256:digest(readFileSync(path.join(directory,'functional-coverage.json'))),input_manifest_sha256:digest(readFileSync(path.join(directory,'input-manifest.json')))};
if(process.argv.includes('--write'))writeFileSync(path.join(directory,'documentation-validation.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
