# Mission Control V3 — lote de interface (27/10/2026)

## Mudanças desta branch
- Cockpit desktop acima de 1250 px em grade: hero compacto e 6 indicadores em bloco 3x2; Hermes lateral; agentes em 6 cartões na largura; gráfico real permanece em seção própria abaixo.
- Tons e símbolos por especialidade nos cartões clicáveis, com foco de teclado; variação responsiva em 3/2/1 colunas quando necessário.
- Cabeçalhos, cards, Hermes e métricas dos workspaces menos altos para reduzir vazios; CSS limitado aos componentes Mission Control.
- Removidas subtabs duplicadas de prioridades e ferramentas; o breadcrumb continua navegando. O atalho para financeiro detalhado foi mantido.
- Destinos duplicados de ferramentas no mesmo agente passam por deduplicação de href; nenhum destino único foi removido.

## Limites honestos
- Não foi feita substituição de componentes de gráfico, endpoints ou manipulação de série financeira. A PR #32 continua sendo o contrato de tendências reais e estados vazios; o redesign **não** resolve falta de snapshots.
- A nova composição CSS ainda necessita execução de testes Node/Python, screenshots Chromium autenticadas desktop/mobile e aprovação do operador. O parse de sintaxe do módulo JS, retirando palavras-chave de export para teste estático, passou.
- Não assumir que referência visual foi reproduzida pixel a pixel: trata-se de um passo estrutural de maior impacto.
- Sem merge ou deploy; PR em draft.

## Revisões pendentes
1. Capturar DOM e screenshot 1440x900, 1920x1080, 390x844; checar grid, largura da sidebar, sobreposição e overflow.
2. Executar npm ci, npm test, npm run build e os testes/sha/integridade próprios do repo; corrigir falhas antes de publicação.
3. Fazer inventário de outras duplicidades de informação no Hub e workspaces, checando não remover recursos financeiros legados.
4. Estender charts Products/Production/Returns/Auditor somente para fontes históricas reais e compatíveis.
5. Conferência de Finance/Pending junto ao Seller Centre continua sendo gate M2 independente da aparência.
