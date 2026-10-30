# MLS Commerce OS — MISSÃO ÚNICA de fidelidade visual e gráficos reais
**Data:** 29/10/2026. **Status:** IMPLEMENTAÇÃO PARCIAL, **NÃO PUBLICADA**.  
**Responsável pela continuação:** Codex no repositório GitHub \`MatheusLemosDS/MLS-Ecommerce-Ads\`.  
**Branch EXCLUSIVA:** \`feature/mls-mockup-parity-real-charts-20261029\`. **Base verificada:** PR #76 HEAD \`c29d88f2c14281d1e6c142948129d2634a85bccb\`.  
**IMPORTANTE:** PR #78 é protótipo CSS rejeitado visualmente. NÃO empilhar seus 36 KB de CSS sobrescritos; aproveitar conceitos se úteis, mas reconstruir componentes de modo limpo. PR #77 é QA sintética antiga, NÃO baseline visual aprovado.

## 0. Instrução para Codex — começar aqui
1. Abrir esta branch e ler \`AGENTS.md\`, \`docs/ROADMAP_MLS_COMMERCE_OS.md\`, \`docs/MLS_COMMERCE_OS_CHECKPOINT.json\`, \`docs/MLS_INTEGRATED_OWNER_RELEASE_2026_10_29.md\`.
2. Importar os **seis PNGs originais** enviados pelo proprietário no pacote \`MLS_CODEX_VISUAL_REFERENCES_2026-10-29.zip\` (entregue na conversa ChatGPT). Copiar somente referências não executáveis para \`docs/visual-references/mls-2026-10-29/\`. Preservar conteúdo, dimensões e hashes; NÃO transformar screenshot em fundo do app. Não é foto de cliente nem dados reais.
3. Implementar UMA branch/PR, sem paralelizar patches CSS em #76/#77/#78. Nenhum merge ou deploy automático. Documentar diffs visuais e provas de origem para cada métrica.
4. Testar renderização **do Worker compilado e autenticado em fixture D1 sintética**, V3.6 OFF e ON, desktop **1365x900** e mobile **390x844**; capturar cada painel via Chrome/Playwright. Testar também as interações de dados, não só o DOM.
5. Somente depois de CI verde, capturas revisadas e QA autenticada do proprietário solicitar aprovação separada de merge/deploy. **Não ativar escrita Shopee ou Ads/PROMO.**

## 1. Critério visual — não aceitar parecido
Referências exatas, do proprietário, em ordem:
| ID | Arquivo no ZIP de referências | Composição obrigatória |
|---|---|---|
| overview | \`01_overview_aprovado.png\` (899×656) | Sidebar compacta azul-marinho, topbar com busca, hero globo, **seis KPIs na mesma linha**, **seis cards neon de agentes na mesma linha** (Hermes, Finance, Ads, Products, Production, Returns), três painéis inferiores lado a lado: Desempenho geral, Últimas atividades, Prioridades |
| finance | \`02_finance_aprovado.png\` (515×317) | Verde, mini-sidebar própria, hero com avatar e ação, quatro KPIs, tabs horizontais, **barras de repasse** à esquerda e **donut de conciliação** à direita |
| ads | \`03_ads_aprovado.png\` (512×301) | Roxo/magenta, quatro KPIs, tabs, gráfico linha/área de campanhas e donut distribuição investimento |
| production | \`04_production_aprovado.png\` (504×273) | Ciano, quatro KPIs, abas, barras produção do dia e ordens em andamento |
| returns | \`05_returns_aprovado.png\` (547×268) | Rosa/vermelho, quatro KPIs, abas, barras horizontais motivos e donut status |
| products | \`06_products_aprovado.png\` (515×281) | Laranja, quatro KPIs, abas, donut margem e ranking produtos por lucro |

Os PNGs são **contrato de composição, cores, tipografia, ritmos, densidade, bordas, glows e avatares**, mas seus números são apenas **ilustrativos**; nunca copiar valores sintéticos para produção. Recriar avatares/botões/componentes em HTML/SVG/CSS de modo editável e responsivo (não usar os screenshots como background).

**Critério visual automático:** criar teste de comparação \`toHaveScreenshot\` / diff no Chromium com fonte, viewport, zoom e fixture congelados. Os PNGs de mockup NÃO são bitmaps de captura do app, portanto começar com *comparação humana por sobreposição* e medidas de geometria; uma vez implementado e aprovado, congelar **baselines do app** reproduzíveis para regressões. Não mascarar todo o painel nem afrouxar \`maxDiffPixels\` para fazer passar. O teste de screenshot NÃO certifica sozinho fidelidade ao mockup: exigir checklist humano por 6 telas.
**Mobile:** versão adaptada da mesma linguagem visual sem overflow, menu acessível, ações com área de toque ≥ 44 px e gráficos responsivos.

## 2. Diretriz técnica — sem reescrita de backend
- Fonte oficial do código: \`web/cloudflare/src/admin-view.mjs\`, \`agent-registry-view.mjs\` (HTML da Central de Comando), \`mission-control.mjs\` (sete especialistas, dados e séries), \`approved-design-system.mjs\` (CSS), \`admin-client.mjs\` (bootstrapping), \`dtf-view.mjs\` e \`saved-catalog-view.mjs\`.
- Roteiro de compilação explícito: \`web/cloudflare/build.py\` e \`tools/build_workers.mjs\`; código cliente embutido não é automaticamente empacotado por importar um novo módulo. **Ao integrar qualquer helper, registrar no freezer/build, testar Worker gerado e seus scripts inline.**
- O Worker App exportado é \`dist/app-worker.mjs\`; Auth/Finance devem permanecer byte a byte idênticos ao HEAD base.
- Reutilizar \`brazaDayDashboard.getTrend()\` com schema \`mls_mission_daily_trend_v1\` e dados reais; \`mlsAgentRegistry.getSnapshot()\` e \`brazaSavedCatalog\`, \`brazaDtfWorkspace\` como fontes **somente de leitura**.
- O branch já contém \`web/cloudflare/src/mls-verified-charts.mjs\` (engine SVG sem dependência externa; área, barras, barras horizontais e donut) e \`web/cloudflare/tests/mls-verified-charts.test.mjs\` para impedir zeros inventados e agregações ilegítimas. **Ainda não estão integrados ao client**. Continuar pelo contrato e conectar via build sem abrir exceções de segurança.
- Não adicionar APIs de escrita, deps via CDN, reescrever D1, alterar Auth/Finance ou chamar Shopee mais vezes para "preencher" gráficos. Recursos ilegítimos continuam bloqueados.

## 3. Contrato obrigatório para todo gráfico
O renderer deve receber \`{kind, metric, unit, points|segments, source, period, verified_at, coverage, status}\`. A validação da origem deve ocorrer em adapter **antes** de renderizar:
- \`status=READY\`: fonte validada, escopo/loja/período compatíveis, unidades coerentes, denominador real (se ratio), cobertura suficiente, valores dentro de inteiro seguro.
- \`status=PARTIAL\`: gráfico apenas dos pontos conhecidos, com lacunas **desconectadas**, legenda de parcial e nenhum "0" inserido automaticamente. Proporções que exijam fechamento não podem ser desenhadas.
- \`status=UNAVAILABLE\`: componente desenhado como estado vazio no mesmo espaço e estilo, com explicação e link para a fonte. Não exibir curva inventada ou texto de sucesso.
- \`status=ERROR\`: erro técnico seguro, sem segredos nem pedidos em logs ou capturas.
- Fonte e janela explícitas: **data de criação de pedido ≠ data de repasse ≠ competência bancária**. \`net_cents\` é estimativa, não saldo de banco.
- Donut só com **categorias mutuamente exclusivas** somando ao total observado; se parcial/incompleto, renderizar estado vazio.
- Barras por hora só com eventos temporalmente registrados. Não redistribuir um total diário por horários.
- Receita de Ads e ROAS somente com atribuição verificada pela fonte, mesmo período/campanha; não dividir vendas totais por gasto de Ads.
- Lucro por SKU somente com atribuição de pedido, custo, taxa, devoluções e base verificadas. Estoque desconhecido não vira estoque positivo.
- Input textual via \`textContent\`/escaping; nenhum \`innerHTML\` derivado de fornecedor sem sanitização.
- Testes unitários para 0 válido, null ausente, negativos, overlap, granulação temporal, duplicados, totais divergentes, períodos distintos e ataques XSS.

## 4. Mapeamento fiel por tela, respeitando fonte
| Painel | Elemento visual exigido | Dados que existem / prova exigida para completar |
|---|---|---|
| Overview | 6 KPIs + sparkline e gráfico área | \`registry.day\`, \`registry.priorities\` e \`brazaDayDashboard.getTrend()\`; conservar série histórica atual, refazer só estilo e interatividade |
| Overview | Atividades dos agentes | **Não existe licença para inventar eventos**. Mapear logs auditados com timestamp, agente e ação; se indisponível, vazio \`Sem atividade auditada no período\` |
| Overview | Prioridades do dia | \`registry.priorities\` existentes; ordenar por severidade real e data quando disponíveis |
| Finance | Barras "Repasses da Shopee" | Requer histórico de repasses por data **real de liberação**; a contagem \`releases_verified\` não equivale a valores depositados |
| Finance | Donut "Status de conciliação" | Requer conjunto exclusivo e completo de IDs de repasses/ocorrências, com denominador conhecido; \`verified\`, \`evidence_conflicts\`, \`unverified\` não devem ser somados sem exclusividade |
| Ads | Linha de gasto/desempenho | Gasto diário disponível em \`getTrend().points[].ads_spend_cents\`; cliques, impressões, vendas por campanha e ROAS exigem contrato de Ads validado |
| Ads | Distribuição de investimento | Somente se origem fornecer gastos mutuamente exclusivos por tipo/posicionamento com período e total compatíveis |
| Production | Barras por hora | Fonte DTF com timestamp real por conclusão; quando ausente, **estado vazio**, e não uma curva sintética |
| Production | Ordens em andamento | Fila DTF salva (\`registry.sources.dtf_queue\`) se houver registros detalhados e IDs válidos; contagem de linhas ≠ pedidos/unidades |
| Returns | Barras por motivo | Motivos canônicos observados da Shopee; sem motivos, não converter estados em causas |
| Returns | Donut de status | IDs únicos e estados mutuamente exclusivos, incluindo pendente/indefinido |
| Products | Donut por faixa de margem | Requer lucro e custo atribuído por produto com cobertura e denominador; \`catalog.total\`/índice não prova margem |
| Products | Ranking por lucro | Só após reconciliação financeira por SKU; não inventar nomes, preços ou lucros |

**Bloqueios atuais:** M2 issue #50 (Finance conciliação Seller Centre, retornos, repasses e depósito); M3 Pricing/estoque não liberado. Os elementos ausentes não significam que a UI falhou; significam **fonte/contrato não pronto**. Uma tela pode estar visualmente concluída, porém com recurso comercial "AGUARDANDO FONTE REAL" — documentar exatamente.

## 5. Critérios de funcionamento real
1. Clique em sidebar/tabs troca painel sem recarregar nem perder login; menu e subabas ativos. Nem todo botão do mockup é permitido: "Criar campanha", "Nova ordem", "Exportar" só se a ação real existente e autorizada for mapeada; caso contrário, bloqueio explícito e não um botão placebo.
2. Alterar período realmente filtra os dados compatíveis; séries e totais mudam juntos, sem cross-period. Zero dados mostra vazio, não linha reta simulada.
3. Tooltips/legendas exibem data, unidade, fonte e estado parcial. Interação por mouse, teclado e leitor de tela; \`prefers-reduced-motion\` respeitado.
4. Autoatualização segue evento/cadência existente. Não adicionar polling agressivo nem requests à Shopee.
5. DTF, catálogo, Finance, Auth, login, Hermes e Listing Factory V3.6 OFF devem continuar funcionais. V3.6 ON continua owner-only com flag \`MLS_V36_OWNER_PREVIEW=ENABLED\` exata.
6. Smoke autenticado de todos os 15 workspaces, screenshot de 6 referências em desktop/mobile, sem overflow ou JS error. Testar com dados parciais, ausentes e zero, preservando segurança.
7. CI verde no SHA final: \`npm ci && npm run build && npm test\`, 67 testes Python, builds App/Auth/Finance e hash exato auditado do App novo; Auth/Finance inalterados. Não alterar hash allowlist sem provar digest real do build e revisar diff.
8. **QA do proprietário e autorização explícita** antes de merge em main e deploy controlado. Builds Cloudflare pausados conforme confirmação anterior; rever isso antes de publicar. Rollback do App precisa de UUID completo, sem alterar D1.

## 6. Estratégia para acabar com o ciclo de CSS
Trabalhar em uma única branch usando **componentes semânticos**: \`MlsAppShell\`, \`MlsKpi\`, \`MlsAgentCard\`, \`MlsAgentWorkspace\`, \`MlsChart\`, \`MlsActivityFeed\`, \`MlsPriorityList\`. Remover duplicidade de CSS usando tokens, grid definido em um arquivo e separação do contrato de dados do render.
**Proibido:** outra camada gigante \`!important\` sobre o CSS antigo, renomear IDs críticos, criar mockups em CSS descolados do Worker real, mudar a referência a cada iteração.
**Ordem de execução:** (A) shell + overview pixel-aligned; (B) componentes comuns dos cinco painéis; (C) integrar gráficos e fontes reais por adapter; (D) snapshots/diff de seis telas + mobile; (E) smoke autenticado + PR final.
A PR deve permanecer em DRAFT até entrega integral e documentar a checklist de cada item. Não dividir em várias PRs concorrentes.
