import test from 'node:test';
import assert from 'node:assert/strict';
import {parseReport} from '../src/admin-report.mjs';
test('report display preserves raw units and separate attribution, without inventing profit',()=>{
 const p=parseReport('Investimento raw: 40.41\nCliques: 289\nImpressões: 13588\nPedidos/conversões reportados    8    8\nROAS raw    9.58    9.58\nStatus econômico: UNKNOWN.\nRecomendação: OBSERVE.');
 assert.equal(p.investment,'40.41');assert.equal(p.clicks,'289');assert.deepEqual(p.orders,['8','8']);assert.deepEqual(p.roas,['9.58','9.58']);assert.equal(p.economic,'UNKNOWN');assert.equal(p.recommendation,'OBSERVE');assert.ok(!('currency' in p));
});
test('ambiguous or unsupported metrics stay only in original report',()=>{
 const raw='Investimento raw: 20\nInvestimento raw: 40\nGasto em reais: R$ 40,41\nROAS raw: 9.58\nRecomendação: OBSERVE.\nRecomendação: SCALE.';const p=parseReport(raw);assert.equal(p.investment,null);assert.equal(p.roas,null);assert.equal(p.recommendation,null);assert.equal(p.original,raw);
});
test('sections and arbitrary content preserved as text for safe display',()=>{
 const raw='Qualidade e limitações\n<script>alert(1)</script>\nDiagnóstico e recomendação\nSem confirmação de lucro.';const p=parseReport(raw);assert.equal(p.sections.length,2);assert.equal(p.sections[0].body,'<script>alert(1)</script>');assert.equal(p.original,raw);
});
