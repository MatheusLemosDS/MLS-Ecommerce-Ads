# Handoff executável — MLS Commerce OS / Codex / ChatGPT — 28/10/2026

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
