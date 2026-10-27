import test from 'node:test';
import assert from 'node:assert/strict';
import {enhanceAdsPageHtml,ADS_PRESENTATION_CSS} from '../src/ads-presentation.mjs';
import {shellMobileNavigation,SHELL_NAVIGATION_CSS} from '../src/shell-navigation.mjs';

const sample=()=>`<!doctype html><html lang="en"><head><title>Advertising Dashboard - MLS Commerce Ads</title><style>.fixture::after{content:"Advertising Spend"}</style></head><body>${shellMobileNavigation('/dashboard')}<div class="app"><aside class="sidebar"><div class="logo">MLS Commerce <span>Ads</span></div><a class="nav active" href="/dashboard">Dashboard</a></aside><main class="main"><div class="top"><div><h1>Advertising Dashboard</h1><div class="subtitle">Real Shopee advertising performance</div></div><div class="system">System Online</div></div><div class="cards"><div class="card"><div class="label">Advertising Spend</div><div class="value">R$ 123,45</div></div></div><table><thead><tr><th>Orders</th></tr></thead><tbody><tr><td class="campaign-name"><strong>Orders</strong></td><td>7</td><td>123.45</td></tr></tbody></table><a href="/campaigns?filter=active&amp;id=12345">Customer &lt;name&gt;</a></main></div><script>const fixture={label:'Orders',value:123.45};</script></body></html>`;

test('Ads presentation localizes UI and branding while preserving provider values and executable blocks',()=>{
 const result=enhanceAdsPageHtml(sample());
 assert.match(result,/<html lang="pt-BR">/);
 assert.match(result,/<title>Painel de anúncios · MLS Commerce OS<\/title>/);
 assert.match(result,/<h1>Painel de anúncios<\/h1>/);
 assert.match(result,/<div class="label">Investimento em anúncios<\/div>/);
 assert.match(result,/<th>Pedidos atribuídos<\/th>/);
 assert.match(result,/<span class="ads-brand-name">MLS Commerce OS<\/span>/);
 for(const value of ['<div class="value">R$ 123,45</div>','<strong>Orders</strong>','<td>7</td>','<td>123.45</td>',
  'href="/campaigns?filter=active&amp;id=12345"','Customer &lt;name&gt;',
  '<script>const fixture={label:\'Orders\',value:123.45};</script>','<style>.fixture::after{content:"Advertising Spend"}</style>'])assert.ok(result.includes(value),value);
});

test('presentation does not inject a duplicate financial banner or privileged links into restricted Ads content',()=>{
 const result=enhanceAdsPageHtml(sample());
 assert.equal((result.match(/class="ads-source-banner"/g)||[]).length,0);
 assert.doesNotMatch(result,/href="\/admin/);
 assert.match(result,/<div class="ads-top-actions"><button[^>]*data-braza-theme-toggle/);
});

test('legacy login receives matching presentation and keeps the form method and field names',()=>{
 const result=enhanceAdsPageHtml('<html lang="en"><head><title>MLS Commerce Ads</title></head><body><div class="brand">MLS Commerce <span>Ads</span></div><h1>Shopee Ads Intelligence</h1><div class="right"><h2>Sign in</h2><form method="POST" action="/login"><label>Username</label><input name="username" required><label>Password</label><input type="password" name="password" required><button>Sign in</button></form></div></body></html>');
 assert.match(result,/<body class="ads-login">/);
 assert.match(result,/<title>MLS Commerce OS<\/title>/);
 assert.match(result,/<h2>Entrar<\/h2>/);
 assert.match(result,/<label>Usuário<\/label>/);
 assert.match(result,/<form method="POST" action="\/login">/);
 assert.match(result,/<input type="password" name="password" required>/);
 assert.match(result,/data-braza-theme-toggle/);
 assert.ok(!result.includes('class="ads-source-banner"'));
});

test('mobile review navigation has three primary destinations and keeps grouped connections and accessible theme controls',()=>{
 const html=shellMobileNavigation('/campaigns');
 for(const destination of ['/dashboard','/campaigns','/optimization','/integrations','/logout'])assert.ok(html.includes('href="'+destination+'"'),destination);
 assert.doesNotMatch(html,/href="\/admin/);
 for(const destination of ['/advertising','/gmv-max','/opportunities','/performance'])assert.ok(!html.includes('href="'+destination+'"'),destination);
 for(const label of ['Anúncios','Campanhas','Automação','Conexões','Mais opções'])assert.ok(html.includes(label),label);
 assert.match(html,/class="workspace-nav-link active" href="\/campaigns" aria-current="page"/);
 assert.match(html,/workspace-nav-mobile/);
 assert.match(html,/<button[^>]*type="button"[^>]*data-braza-theme-toggle[^>]*aria-label="Alterar tema"/);
 assert.ok(!SHELL_NAVIGATION_CSS.includes('float:'));
 for(const property of ['--surface','--app-bg','--accent','--text','--muted','--line','--positive','--negative'])assert.ok(ADS_PRESENTATION_CSS.includes(property),property);
});
