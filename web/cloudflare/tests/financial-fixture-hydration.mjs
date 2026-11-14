import {FINANCIAL_AUTOMATION_CSS,financialAutomationBody} from '../src/financial-automation-view.mjs';

// These small DOM fixtures index controls instead of parsing innerHTML. Add the
// exact trusted markup that the real workspace asset hydrates, leaving the
// original script graph untouched. Native-browser tests use the actual host.
const host='<div id="financialAutomationHost"><p class="notice" role="status">Carregando a área financeira. Se ela não abrir, recarregue a página.</p></div>';
export function hydrateFinancialFixtureHtml(html){
 if(typeof html!=='string')throw new TypeError('FINANCIAL_FIXTURE_HTML_INVALID');
 if(!html.includes('id="financialAutomationHost"'))return html;
 if(html.split(host).length!==2)throw Error('FINANCIAL_FIXTURE_HOST_CHANGED');
 return html.replace(host,'<div id="financialAutomationHost"><style>'+FINANCIAL_AUTOMATION_CSS+'</style>'+financialAutomationBody()+'</div>');
}
