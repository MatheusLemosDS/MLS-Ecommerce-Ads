import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {deflateSync} from 'node:zlib';
import {execFileSync} from 'node:child_process';
import {buildMlsVisualComparison,readMlsVisualReferences} from '../mls_visual_comparison.mjs';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const DIR='docs/visual-references/mls-2026-10-29';
const expected=[
 ['01_overview_aprovado.png',899,656,'9c77291ef81462d0c0eaec878e2aa990b2b02d61cea2703b97e73d7938b2fb8a'],
 ['02_finance_aprovado.png',515,317,'783def2e9075eb3e3fc82fc8b3f4d184c5c4aaa2c939bf3d401e5ece1d8bd5d8'],
 ['03_ads_aprovado.png',512,301,'a0adaab4282cbe3a3ae13848d820687b744e082b4ccb45f9b2fc715abc4c3af9'],
 ['04_production_aprovado.png',504,273,'5d98efb77e568228d36216fcd800d4d3eda692cbdffa0fee616b845e020cc364'],
 ['05_returns_aprovado.png',547,268,'cfe0e2e30a501ecbe5918f6a81cb05074c084e7a1aa835a15201702f23ffc3ab'],
 ['06_products_aprovado.png',515,281,'b2273b0a8ea3812e9e374685b63f3ccf52970ae5c4b84255ba3c50fcfd284f9a'],
];
function fixture(t){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'mls-visual-reference-test-'));
 fs.mkdirSync(path.dirname(path.join(root,DIR)),{recursive:true});fs.cpSync(path.join(ROOT,DIR),path.join(root,DIR),{recursive:true});
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));return root;
}
function png(width,height){
 const crc=buffer=>{let value=0xffffffff;for(const byte of buffer){value^=byte;for(let bit=0;bit<8;bit++)value=value&1?(value>>>1)^0xedb88320:value>>>1;}return (value^0xffffffff)>>>0;};
 const chunk=(type,payload)=>{const body=Buffer.concat([Buffer.from(type),payload]),head=Buffer.alloc(4),tail=Buffer.alloc(4);head.writeUInt32BE(payload.length);tail.writeUInt32BE(crc(body));return Buffer.concat([head,body,tail]);};
 const header=Buffer.alloc(13);header.writeUInt32BE(width);header.writeUInt32BE(height,4);header[8]=8;header[9]=6;
 return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',deflateSync(Buffer.alloc(height*(width*4+1)))),chunk('IEND',Buffer.alloc(0))]);
}
test('six original owner reference PNGs retain exact names, dimensions, bytes and SHA-256',()=>{
 const {manifest,references}=readMlsVisualReferences();
 assert.equal(manifest.archive_sha256,'0624a0ad1b7469dba36d3e2306c28a4e64bca545ea998fc7c30e0debe6ab99b0');
 assert.deepEqual(references.map(row=>[row.file,row.width,row.height,row.sha256]),expected);
 assert.equal(manifest.source,'OWNER_ATTACHMENT');assert.equal(manifest.numeric_values,'ILLUSTRATIVE_NOT_BUSINESS_DATA');
});
test('reference integrity rejects changed bytes, missing/duplicated names and symlinks',t=>{
 for(const kind of ['changed','missing','duplicate','symlink']){
  const root=fixture(t),directory=path.join(root,DIR),manifestFile=path.join(directory,'manifest.json');
  if(kind==='changed'){const file=path.join(directory,expected[0][0]),bytes=fs.readFileSync(file);bytes[bytes.length-5]^=1;fs.writeFileSync(file,bytes);}
  if(kind==='missing')fs.unlinkSync(path.join(directory,expected[0][0]));
  if(kind==='duplicate'){const manifest=JSON.parse(fs.readFileSync(manifestFile));manifest.references[1]=manifest.references[0];fs.writeFileSync(manifestFile,JSON.stringify(manifest));}
  if(kind==='symlink'){const file=path.join(directory,expected[0][0]);fs.unlinkSync(file);fs.symlinkSync(path.join(ROOT,DIR,expected[0][0]),file);}
  assert.throws(()=>readMlsVisualReferences({root}),/MLS_VISUAL_/);
 }
});
test('local comparison keeps full originals, unknown captures and human approval pending without runtime scripts',t=>{
 const captures=fs.mkdtempSync(path.join(os.tmpdir(),'mls-empty-captures-'));t.after(()=>fs.rmSync(captures,{recursive:true,force:true}));
 const before=readMlsVisualReferences().references.map(row=>row.sha256);
 const {html,report}=buildMlsVisualComparison({capturesDir:captures});
 assert.equal(report.state,'INCOMPLETE');assert.equal(report.human_approval,'PENDING');assert.equal(report.mockup_parity_approved,false);assert.equal(report.production_approved,false);
 assert.equal(report.checks.length,24);assert.ok(report.checks.every(check=>check.capture_state==='MISSING'&&check.capture_sha256===null));
 assert.equal((html.match(/src="data:image\/png;base64,/g)||[]).length,24);
 assert.match(html,/APROVAÇÃO HUMANA PENDENTE/);assert.match(html,/anotações aproximadas/);assert.match(html,/valores ilustrativos/);
 assert.doesNotMatch(html,/<script\b|<iframe\b|src="https?:/i);
 assert.deepEqual(readMlsVisualReferences().references.map(row=>row.sha256),before);
});
test('comparison rejects an existing capture with the wrong viewport instead of stretching it',t=>{
 const captures=fs.mkdtempSync(path.join(os.tmpdir(),'mls-wrong-capture-'));t.after(()=>fs.rmSync(captures,{recursive:true,force:true}));
 fs.copyFileSync(path.join(ROOT,DIR,expected[0][0]),path.join(captures,'approved-dark-desktop-overview.png'));
 assert.throws(()=>buildMlsVisualComparison({capturesDir:captures}),/MLS_VISUAL_CAPTURE_DIMENSIONS_INVALID/);
});
test('CLI creates a complete local comparison artifact but never grants visual or production approval',t=>{
 const captures=fs.mkdtempSync(path.join(os.tmpdir(),'mls-comparison-cli-'));t.after(()=>fs.rmSync(captures,{recursive:true,force:true}));
 const checks=[];
 for(const theme of ['dark','light'])for(const viewport of [{name:'desktop',width:1365,height:900},{name:'mobile',width:390,height:844}]){
  const bytes=png(viewport.width,viewport.height);
  for(const panel of ['overview','agent-finance','agent-ads','agent-production','agent-returns','agent-products']){
   fs.writeFileSync(path.join(captures,'approved-'+theme+'-'+viewport.name+'-'+panel+'.png'),bytes);
   checks.push({theme,viewport:viewport.name,width:viewport.width,height:viewport.height,panel,synthetic:true});
  }
 }
 const metadata={schema:'mls_approved_design_all_panels_qa_v1',owner_authenticated:false,production_approved:false,source:'synthetic owner',checks};
 fs.writeFileSync(path.join(captures,'results.json'),JSON.stringify(metadata));
 const output=path.join(captures,'review.html');
 const result=JSON.parse(execFileSync(process.execPath,[path.join(ROOT,'tools/mls_visual_comparison.mjs'),'--captures='+captures,'--output='+output],{encoding:'utf8'}));
 assert.equal(result.state,'PENDING_HUMAN_REVIEW');assert.equal(result.human_approval,'PENDING');assert.equal(result.checks,24);
 const html=fs.readFileSync(output,'utf8'),report=JSON.parse(fs.readFileSync(output.replace(/\.html$/,'.json'),'utf8'));
 assert.equal((html.match(/src="data:image\/png;base64,/g)||[]).length,48);
 assert.ok(report.checks.every(check=>check.capture_state==='AVAILABLE'&&check.capture_provenance==='DECLARED_SYNTHETIC_IN_QA_RESULTS'&&/^[a-f0-9]{64}$/.test(check.capture_sha256)));
 assert.equal(report.mockup_parity_approved,false);assert.equal(report.production_approved,false);assert.equal(report.human_approval,'PENDING');
 assert.doesNotMatch(html,/<script\b|<iframe\b|src="https?:/i);
 metadata.owner_authenticated=true;fs.writeFileSync(path.join(captures,'results.json'),JSON.stringify(metadata));
 assert.throws(()=>buildMlsVisualComparison({capturesDir:captures}),/MLS_VISUAL_QA_METADATA_INVALID/);
});
