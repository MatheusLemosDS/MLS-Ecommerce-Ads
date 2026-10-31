> **Release M2 PR91 publicada — 31/10/2026:** App `7bd0dfa7`, código `9826b28`, CI41229871797 verde:2.772Node/67Python/Chromium. Calendários dos três meses anteriores em rodízio; retomada após virada e corte completo do mês, inclusive COMPLETE de recorte curto. Bytes/config/flags/Auth/Finance e tabelas/cursor conferidos. Primeira coleta natural do incremento na versão64174a2e às15:37:56Brasília: setembro RUNNING,1página/1registro/1de5intervalos, escopo exato e sem erro. [Registro](MLS_M2_HISTORICAL_CALENDARS_2026_10_31.md). Calendário e M2/banco permanecem abertos.
> **Continuação de 31/10/2026:** candidato de diagnóstico Pending sobre PR91, correção explícita Finance/Auth/App. Ainda sem lista Live validada. Ordem atual e publicação em [MLS_M2_PENDING_CLOSEOUT_2026_10_31.md](MLS_M2_PENDING_CLOSEOUT_2026_10_31.md).


> **Release M2 PR90 publicada — 31/10/2026:** App `17c1e9f1`, código `cf89fdd`, CI41218926278 verde:2.637Node/67Python/Chromium. Tracker ligado à fila, primeira conferência com espera própria e recuperação limitada de fontes do mês anterior. Cron natural confirmou setembro `COLLECTING`, 0/2 referências disponíveis e 1/2 calendários completos; ausência continua pendente. Bytes/config/flags/Auth/Finance e progresso após deploy conferidos. [Registro](MLS_M2_RELEASE_TRACKER_2026_10_31.md). M2/banco e recuperação histórica continuam abertos.

> **Estado atual — 31/10/2026:** PR89 publicada no App `66e9c01f`, base mainPR88 `8bb9718`. CI41206928254 verde:2.536Node/67Python/Chromium; memória agregada, recorrências no contexto real do Hermes, ROAS diário e setas com datas, mantendo o estilo aprovado. Bytes/config/Auth/Finance preservados. Cron natural salvou primeiro corte da publicação14306,3intervalos/23páginas,zero erro. [Registro](MLS_AGENT_MEMORY_PERFORMANCE_2026_10_31.md). Memória não treina pesos nem concede permissões; M2 e avaliação de eficácia permanecem abertas.

# Handoff atual — melhorias na versão Live, 30/10/2026

**Release M2 PR88 publicada — 31/10/2026:** auditorias de devolução
destravadas, comparação da mesma publicação e situações identificadas no MLS
Returns. A virada diária agora encerra e retoma a coleta sem erro artificial.
2.459 Node/67 Python/Chromium aprovados, App `c00861cf`, Auth/Finance e
configuração preservados. Cron natural confirmou 2/2 relatórios da publicação
e progresso após o deploy, sem falhas atuais. M2/banco continuam abertos.
[Registro](MLS_M2_RETURNS_CONTINUITY_2026_10_31.md).

**Release Live PR87 conferida — 31/10/2026:** gráficos com inspeção por
ponteiro/toque/teclado, escala PT-BR, iluminação e cabeçalho mobile corrigido.
2.393Node/67Python/Chromium aprovados, versão App `17bb4a0c`, código e
configuração conferidos. Regra infantil16 corrigida:356/356 unidades com
custo na leitura verificada. Próximo foco M2: estados de pedidos/devoluções.
[Registro visual atual](MLS_VISUAL_CHARTS_RELEASE_2026_10_31.md).

O proprietário autorizou promover todas as melhorias preparadas para a versão
Live e continuar os próximos incrementos validados ali, usando ambiente
separado apenas quando necessário. As antigas restrições de somente DRAFT e
nenhum merge/deploy foram substituídas para a aplicação. Escrita comercial,
gastos e alteração de OAuth continuam bloqueados; Hermes OBSERVER, Ads/PROMO
LOCKED. Não reiniciar o projeto nem presumir M2 encerrada.

Trabalho atual: `release/live-roadmap-improvements-20261030`, base oficial
`2ab4c9d8baa3c25e5816bcca14b4a0973ea73d5a`. O commit `b17df54` reconcilia o
pacote preparado até `4c149a7` com a correção de cancelamentos da PR #85.
Inclui visual/gráficos, V3.6, Products/Pricing observador, Listing Factory,
DTF, contexto do Hermes e cinco abas AI Sales. A persistência do workspace
AI Sales está **LIVE_VALIDATED**, com 2.382 Node e 67 Python aprovados na CI
41157082180 e App versão `2ffcefb4` conferido pela API/D1.

O acesso API Cloudflare está verificado. A PR #85 foi publicada e conferida
byte a byte, preservando bancos, domínios e cron. Os relatos de Cloudflare
indisponível abaixo pertencem à criação histórica da prévia PR #84, que segue
preservada com dados sintéticos. Não há sessão real owner nem aprovação humana
visual/auditiva comprovada por fixtures.

Testes integrais, CI, Chromium desktop/mobile, hashes e plano de retorno foram
conferidos nesta entrega. V3.6 e AI Sales estão ENABLED para owner, com role
review bloqueada. Código, configuração e saúde da coleta passaram na conferência
Cloudflare. Repetir essas etapas nos próximos incrementos, além do merge.

Fonte atual da entrega: [MLS_LIVE_ROADMAP_RELEASE_2026_10_30.md](MLS_LIVE_ROADMAP_RELEASE_2026_10_30.md).
Pendências externas: M2/Seller Centre/Pending/devoluções/liberações/banco;
provedor e orçamento LLM/voz neural; mídia autorizada; grants marketplace.
O render Node/FFmpeg funciona fora do Worker, não como render cloud implícito.
M3–M9 permanecem fases progressivas, sem declaração de conclusão total.

## Registros históricos — subordinados à orientação Live acima

Prévia de homologação na PR DRAFT #84: https://github.com/MatheusLemosDS/MLS-Ecommerce-Ads/pull/84 · implementação 1574f9e · 2.327 Node/67 Python aprovados, App/Auth/Finance inalterados. Naquele corte, acesso seguro à Cloudflare era a dependência para homologação online.

Homologação local — registro histórico de 30/10/2026: branch `feature/mls-owner-homologation-preview-20261030`, baseada na PR #83. Servidor Worker/SQLite real com dados sintéticos e exportação HTML interativa; sem alteração do App/Auth/Finance. Consultar `docs/MLS_OWNER_PREVIEW_CHECKPOINT.json` e `docs/MLS_OWNER_HOMOLOGATION_2026_10_30.md`. Naquele corte não existia URL de homologação nem autenticação Cloudflare e não havia autorização de merge/deploy. O pedido Live substituiu essas restrições; escritas comerciais continuam bloqueadas.

PR de integração DRAFT #83: https://github.com/MatheusLemosDS/MLS-Ecommerce-Ads/pull/83 · commits f513dca/54b87e5 · local2308Node/67Python,40capturas · Appa5ba3298…bbfb91c8. Conferir checks do HEAD; semmerge/deploy.

> Checkpoint histórico de preparação 30/10/2026: PR #79 congelada/CI verde `e7ce5009`/41131654577. Integração e AI Sales local implementados em `integration/mls-commerce-os-ai-sales-20261030`; conferir regressão/PR no checkpoint da missão e [guia de homologação](MLS_AI_SALES_INTEGRATION_2026_10_30.md). Naquele corte sem merge/deploy/writes; QA owner, M2/Seller Centre, grants e acesso LLM pendentes. Os registros abaixo são históricos.

# Handoff executável — MLS Commerce OS / Codex / ChatGPT — 28/10/2026

**Entrega mais recente — PR #86:** App Live versão `2ffcefb4`, flags V3.6 e
AI Sales ENABLED para owner, CI 41157082180 verde (2.382 Node/67 Python/Chrome).
Rascunhos persistem no D1 com CAS/CSRF; arquivos ficam locais e restauração
revoga aprovações. Hash, bindings, cron, coleta e Hermes conferidos; Finance/Auth
iguais à PR85. Não mesclar as PRs históricas em duplicidade. Continuar próximos
incrementos na Live após validação, preservando rollback e gates externos.
Fonte: [release](MLS_LIVE_ROADMAP_RELEASE_2026_10_30.md). M2 não foi encerrada.

Atualização operacional 30/10: o proprietário orientou entregar os próximos
incrementos validados na versão oficial; separar ambiente apenas se necessário.
Prévia demonstrativa PR #84 preservada. Correção isolada de cancelamentos na
branch `fix/cancelled-daily-profit-20261030`, baseada na main `a96bb1c`;
ver [registro atual](MLS_CANCELLED_DAILY_PROFIT_2026_10_30.md). As restrições
comerciais e os gates de M2 continuam aplicáveis.

PR #85: código `dbcfae7`, CI 41155020856 verde (2.129 Node/67 Python/Chromium).
App e Finance oficiais publicados e conferidos byte a byte pela API Cloudflare;
bindings/domínios/cron preservados. Atualização exclui cancelados após nova
publicação completa e revisita o mês anterior em oportunidades ociosas. M2
continua aberta; sessão owner real não foi executada nesta validação.

## Comece aqui

Repo: https://github.com/MatheusLemosDS/MLS-Ecommerce-Ads
Fonte de verdade: docs/ROADMAP_MLS_COMMERCE_OS.md + docs/MLS_COMMERCE_OS_CHECKPOINT.json.
Registro de pesquisa: docs/SHOPEE_RESEARCH_TO_MLS_2026_10_28.md
Manual Listing Factory: docs/MLS_LISTING_FACTORY_V1.md
Regras dos agentes: AGENTS.md

IMPORTANTE: não reiniciar o sistema. Os Workers legados em Cloudflare continuam canônicos, D1/financeiro/produtos/DTF já possuem contratos e testes. Ads/PROMO LOCKED.

## Branches observadas na abertura deste trabalho

- main b058e832f8450ce787370c4087cf78db9cca9fca: PR #46 já merged, CI 40769541414 verde.
- PR #48 feature/mission-v36-search-reconcile-main-20261028: V3.6 catálogo+fila DTF (draft, CI 40772868816: Node 2115, Python 67, NO MERGE/DEPLOY).
- PR #47 feature/mls-m3-products-pricing-observer-20261028: M3 ABC e simulador (draft, CI 40774245543: Node 2124, Python 67, NO MERGE/DEPLOY).
- Issue #50: M2 Seller Centre Finance/Pending/escrow/devoluções, não concluída.
- PR #51 feature/shopee-research-listing-factory-foundations-20261028: componentes offline e CLI, draft; CI #40782374293 verde.
- PR #56 feature/mls-listing-factory-owner-ui-20261028: editor owner Produtos em PR draft (baseado no código #51). Teste pré-refinamento Chrome/Node/Python CI #40784356050 verde; refinamento preço + limite de imagem em nova validação, SEM merge/deploy. Revalidar o HEAD antes de agir.

Não alterar branches da outra ferramenta ao mesmo tempo sem combinar a posse dos arquivos. Se o Codex estiver editando a PR #47, o ChatGPT trabalha só na PR #51; se quiser unificar, criar nova branch de integração e conferir os três conjuntos de commits/arquivos em ordem com CI.

## Já implementado na PR #51

1. Planner puro sem IO: web/cloudflare/src/mls-listing-factory-planner.mjs.
2. CLI local usando mockups verdadeiros: tools/mls_listing_factory_cli.mjs.
3. Permissões por evidência explícita: web/cloudflare/src/mls-shopee-capability-audit.mjs.
4. Planejamento offline do replay de eventos perdidos: web/cloudflare/src/mls-lost-push-recovery.mjs.
5. Testes de schema, segurança e CLI: web/cloudflare/tests/mls-listing-factory-foundations.test.mjs.

## Issues para dividir trabalho sem conflitos

- [#52 — UI owner Listing Factory](https://github.com/MatheusLemosDS/MLS-Ecommerce-Ads/issues/52): PR #56 draft em validação; Codex pode assumir QA/UX de desktop/mobile e resolver eventuais conflitos antes de merge, sem API externa.
- [#53 — Finance M2 escrow batch](https://github.com/MatheusLemosDS/MLS-Ecommerce-Ads/issues/53): verificar método/escopo e evidência do Seller Centre, sem tocar em produção sem aprovação.
- [#54 — Push lost events](https://github.com/MatheusLemosDS/MLS-Ecommerce-Ads/issues/54): preparar assinatura/idempotência/ACK persistido e testes depois que a autorização estiver confirmada.
- [#50 — Gate M2](https://github.com/MatheusLemosDS/MLS-Ecommerce-Ads/issues/50): obrigação do operador e do MLS Finance; não pode ser substituída por fixture.

## Próximas tarefas técnicas, nesta ordem

### 1. Inspecionar e finalizar PR #51
- Rodar npm ci; npm test; suíte Python padrão; npm run build.
- Corrigir testes sem retirar asserts existentes.
- Confirmar que o App/Auth/Finance gerados mantêm hashes da main se os módulos novos forem apenas offline.
- Validar manifesto real com JPG/PNG de teste e erro de faltante, duplicata, arquivo grande, symlink, variações, estoque desconhecido.
- Abrir revisão de segurança. Não integrar em main sem os gates.

### 2. UI owner Listing Factory (PR #56 — implementada em draft, QA final pendente)
- [x] Adicionado painel sob Produtos, sem nova rota pública. Reaproveita design/CSS; sem tocar Finance/Ads.
- [x] Seleção e inspeção local real PNG/JPEG, arte/título/descrição/SKUs/preços por tamanho/quantidades; prévias, fila local e export de dois JSON. Sem upload, sem persistência.
- [x] Nomes e hashes SHA-256 dos arquivos originais; gera miniaturas somente para preview, não altera mockup original nem exporta bytes.
- [x] `web/cloudflare/build.py` injeta o mesmo planner puro dentro do 14º script; testes do painel atualizados intencionalmente de 13 para 14. Chromium e hash App precisam passar no HEAD.
- [ ] Em integração final, reconciliar PR #48 sem sobrescrever os módulos de catálogo; a PR #56 não editou `saved-catalog-view.mjs`. Só aceitar merge/deploy após CI, visual owner e QA no celular.

### 3. Finance M2 — pesquisa escrow batch OFFLINE, sem mudar Auth/Finance até gate
- Verificar GET/POST, parâmetros e escopos em versão atual da API oficial; o Shopee SDK possui histórico de divergências nessa chamada.
- Comparar compatibilidade com o pipeline privado existente; não expor order_sn ao front.
- Só então desenhar novo adaptador financeiro com testes de timeout, paginação, dedupe, compatibilidade D1 e custo de request.
- Issue #50 depende de análise autenticada do Seller Centre pelo operador.

### 4. Push e recuperação sem perdas
- Confirmar disponibilidade na conta e assinatura real da Shopee, limites de retenção, cursor e idempotência.
- Em camada backend isolada, guardar evento validado ANTES de responder 200 ou confirmar consumo.
- Tratar redelivery e status-order-change em teste com duplicatas; persistir cursor por loja; nunca dar ACK no plano offline.
- Preservar cron como fallback de fonte e alertas sobre lacunas.

### 5. MLS Ads/Products/Creative
- Ler fonte de campanhas diretas e amplas sem inferir lucro por SKU; manter escrita LOCKED.
- Integrar tarifas oficiais por período/categoria e simulação M3 apenas depois de M2.
- Criar pack de imagens para listing com mockup e complementares, título, descrição e checklist de conformidade baseado em regras revisadas.
- Publicação em massa via API Shopee, se autorizada, somente numa fase M6 assistida com aprovação humana, idempotência, recheck, audit trail.

## Comandos de validação

~~~bash
npm ci
npm test
python3 -m unittest web/bridge/test_hermes_bridge.py tools/test_install_hermes_web_bridge.py tools/test_build_hermes_web_bridge_install.py tools/test_activate_hermes_web_bridge.py tools/test_build_hermes_web_bridge_activation.py -q
npm run build
~~~

O npm test já chama o pré-build do Worker. Registre o SHA exato da PR após CI verde, sem aceitar um SHA arbitrário para contornar testes.

## Prompt de handoff para Codex

Continue o MLS Commerce OS neste repositório. Leia AGENTS.md, o roadmap canônico, checkpoint, research e este handoff. Trabalhe somente no próximo incremento pendente, preservando main e PR #47/#48. Analise a PR #51 e seus testes; após aprovação, implemente a interface owner de preparação de anúncios na área Produtos, SEM upload externo e SEM publicar; acrescente validação real de arquivos e QA Chromium. Confira os contratos de build.py para helpers embutidos. Não toque em Finance/Auth/Ads/PROMO/D1/cron nem renomeie Workers. Quando concluir, abra PR draft com CI verde, referências e critérios pendentes; atualize todos os arquivos de continuidade. Nunca invente permissões da Shopee, estoque, tarifas ou lucro.

### Atualização técnica 28/10 — PR #56 última revisão

A PR #56 foi retargeted para a base `feature/shopee-research-listing-factory-foundations-20261028` para mostrar apenas o diferencial de UI sobre a PR #51. O commit de runtime mais recente é `1d8e7cc9dc86257e73ecce7e5331708f78d118d4`: o validador de nomes de arquivos passou a reutilizar `validFile`, corrigindo inconsistências de nomes curtos com o planejador. A execução [40784356050](https://github.com/MatheusLemosDS/MLS-Ecommerce-Ads/actions/runs/40784356050) foi verde **antes** da proteção de dimensões e desta correção. A execução [40784720891](https://github.com/MatheusLemosDS/MLS-Ecommerce-Ads/actions/runs/40784720891) falhou em quatro checks do hash exato, depois fixado, e num teste Chrome de nome curto, depois corrigido. **Não declarar o HEAD verde**: uma nova execução completa não foi iniciada automaticamente para o último commit. A PR temporária #57 foi fechada sem merge. Solução: Codex deve executar `npm ci && npm test`, testes Python e `npm run build` no último commit e registrar novo hash App do Worker; depois encaminhar QA autenticado desktop/mobile. Manter Ads/PROMO LOCKED e sem merge/deploy.

### Checkpoint PR #56 — retomada pelo JSON e CI final validado

O Listing Factory importa manifestos exportados (máximo 1 MiB, até 500 anúncios), recusa variantes inválidas e exige reanexar os mockups. Preço inicia em branco e depende do operador. A fila foi paginada em 8 por página, com testes Chrome para 19 rascunhos. O script de UI permanece sem fetch, storage, upload ou execução Shopee.

**VALIDADO:** a PR temporária #58 integrou somente os 13 arquivos de código/testes da PR #56 sobre a main documental atual. A CI final #40788713558 passou com 2.126 Node, 67 Python, Chrome e build dos três Workers; 13/13 hashes dos arquivos coincidem exatamente com a PR #56. Novo SHA App bbbe1b9efdf0a6c11e507c34c92730ddbb8502fb367c5cfe33c031ba3850d3cd, registrado sem reduzir verificação. PR #58 fechada sem merge. PR #56 restaurada à branch-base PR #51. **QA real autenticada desktop/mobile ainda pendente; não mesclar nem publicar externamente sem revisão.** Ver docs/MLS_LISTING_FACTORY_CI_2026_10_28.md.

### PR #60 — Anexar mockups em lote a 500 rascunhos

Implementado o bulk relink offline em cima da PR #56: seleciona até 200 fotos/64 MiB por vez (arquivos ou pasta), associa cada nome exato a todas as artes que o utilizam, detecta duplicação/arquivo trocado por hash e aborta sem efeitos parciais. Nunca faz upload. O usuário tem que confirmar visualmente que o nome corresponde à imagem esperada. Teste Node 500 drafts e Chrome real 19 drafts foram criados. Guia: docs/MLS_LISTING_FACTORY_BATCH_RELINK_2026_10_28.md. PR #60 draft, validação temporária #61. CI inicial #40790379512 passou 2.128/2.132 Node, só bloqueio SHA App novo; hash correto já adicionado para repetição da CI. Não mesclar/deploy antes do verde e QA owner. Depois integrar #51 → #56 → #60 e conciliar #48. Ads/PROMO LOCKED; M2 #50 aberta.

### PR #60 — CI final aprovado

A seleção de mockups em lote passou [CI 40790629421](https://github.com/MatheusLemosDS/MLS-Ecommerce-Ads/actions/runs/40790629421): **2.132 Node + 67 Python**, Chromium, build App/Auth/Finance. O runtime e os testes da branch #60 são iguais ao candidato de validação #61 em **14/14 blobs**, e #61 foi fechada sem merge. Novo SHA App 63da28d212c45d1e7e93444dbe4ac2ac49ad113af273dddf65370f668156180d; Auth/Finance não alterados. Ainda falta QA no login real desktop/mobile, integração #51 → #56 → #60 e preservação #48. Não há upload/marketplace write, M2 issue #50 aberta e Ads/PROMO LOCKED.

### Integração PR #63 — handoff 28/10/2026

Mission Control V3.6 da PR #48 e Listing Factory PRs #51/#56/#60 foram combinados numa branch isolada sobre a main: integration/mls-v36-search-listing-factory-20261028. A comparação Git confirmou 13/13 fontes da PR #60 e 7/7 da PR #48 idênticas, com união da allowlist SHA em tools/worker_project.mjs. CI #40792253729 SUCCESS (2.136 Node + 67 Python + Chrome, App/Auth/Finance builds), SHA App 8ed059ddb6f0901a48d277d6b9b806a23d52a1e5e105ed0e2e456e2aea6701f5. Nenhum merge/deploy de código. Próxima tarefa do Codex: QA autenticada desktop/mobile com catálogo real, fila DTF e mockups locais; depois escolher PR63 como release única ou merges sequenciais, não as duas opções. M2 #50 continua aberta, Ads/PROMO LOCKED. Documento: docs/MLS_V36_LISTING_FACTORY_INTEGRATION_2026_10_28.md.


### 29/10/2026 — PR #74, integração visual conforme mockup aprovado

Branch `design/approved-neon-all-panels-integration-20261029` baseada na `main`, PR #74 DRAFT. Consolidou código/testes visuais das PRs #69, #71, #72 e #73 e adicionou `web/cloudflare/src/approved-design-system.mjs`. Nova paleta compartilhada de todos os agentes, shell, KPIs, mini-sidebar interna dos sete especialistas, cabeçalhos Ads/Campanhas/Optimization/Conexões, tema escuro/claro, responsividade e leitura honesta das fontes, sem criar métricas ou históricos.

**Atenção técnica:** o App tem um empacotador manual `web/cloudflare/build.py` que remove imports. Ele foi atualizado para incluir `MLS_APPROVED_DESIGN_CSS` uma única vez em escopo externo, antes dos módulos Admin e Ads. Sem isso, a compilação do Worker original causou ReferenceError em testes de integração. **Não reverter a correção nem afrouxar os testes.**

A suíte completa agora usa TAP e concorrência de 3 arquivos para não esgotar memória do Node reporter ou Chrome, preservando os mesmos globs, 67 Python e builds. Teste `mls-approved-all-panels-chrome.test.mjs` verifica 15 seções no desktop 1365 e mobile 390 sem acessar dados reais. Teste `mls-approved-design-system.test.mjs` cobre tokens, diferenciação Observer/Ads e integridade de IDs. Revalidar o SHA final do Worker App e confirmar hashes Auth/Finance intocados; CI final e QA owner real são gates.

Continuam independentes: V3.6 de busca + Listing Factory nas PRs #63/#65/#68 (feature flag OFF), financeiro M2 issue #50 e Ads/PROMO LOCKED. **Não mesclar PR #74 e #68 em paralelo sem reconciliação e novo CI.** Não fazer deploy sem aprovação.


### 29/10/2026 — PR #75, uma única trilha de homologação (design aprovado + V3.6)

Branch `integration/mls-approved-ui-v36-owner-gated-20261029` derivada da PR #68 com mudanças visuais da PR #74. Reconciliados **quatro arquivos que ambos modificaram**: `admin-view.mjs` (paleta/todos painéis + menu de busca), `dtf-view.mjs` (cinco etapas + `searchLines/findLine`), `saved-catalog-view.mjs` (cockpit Produtos + `find`) e `build.py` (planner Listing Factory + CSS injetado no bundle App). Não alterar essa união ou substituir com a versão de somente uma das PRs.

Os testes de interface de #74 usam `compiledOwnerReportPage(...,{ownerPreview:false})` para representar o deploy inicial; a QA V3.6 continua usando `ownerPreview:true`. Teste novo `mls-v36-approved-integration-gates.test.mjs` protege os dois estados e os métodos de pesquisa em registros salvos. `MLS_V36_OWNER_PREVIEW` ausente = OFF. **Nada de write Shopee/Ads/PROMO.**

Antes de release: CI verde no HEAD exato, SHA App revisado e Auth/Finance iguais, QA real autenticada, revisão de Cloudflare/rollback e aprovação explícita. **Não mesclar separadamente #63/#65/#68/#69/#71/#72/#73/#74 se #75 for a trilha final.** Documento [MLS_INTEGRATED_OWNER_RELEASE_2026_10_29.md](MLS_INTEGRATED_OWNER_RELEASE_2026_10_29.md).
