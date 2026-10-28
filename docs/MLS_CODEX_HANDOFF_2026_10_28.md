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
- PR #51 feature/shopee-research-listing-factory-foundations-20261028: primeira entrega modular da pesquisa; conferir CI/head antes de mexer.

Não alterar branches da outra ferramenta ao mesmo tempo sem combinar a posse dos arquivos. Se o Codex estiver editando a PR #47, o ChatGPT trabalha só na PR #51; se quiser unificar, criar nova branch de integração e conferir os três conjuntos de commits/arquivos em ordem com CI.

## Já implementado na PR #51

1. Planner puro sem IO: web/cloudflare/src/mls-listing-factory-planner.mjs.
2. CLI local usando mockups verdadeiros: tools/mls_listing_factory_cli.mjs.
3. Permissões por evidência explícita: web/cloudflare/src/mls-shopee-capability-audit.mjs.
4. Planejamento offline do replay de eventos perdidos: web/cloudflare/src/mls-lost-push-recovery.mjs.
5. Testes de schema, segurança e CLI: web/cloudflare/tests/mls-listing-factory-foundations.test.mjs.

## Próximas tarefas técnicas, nesta ordem

### 1. Inspecionar e finalizar PR #51
- Rodar npm ci; npm test; suíte Python padrão; npm run build.
- Corrigir testes sem retirar asserts existentes.
- Confirmar que o App/Auth/Finance gerados mantêm hashes da main se os módulos novos forem apenas offline.
- Validar manifesto real com JPG/PNG de teste e erro de faltante, duplicata, arquivo grande, symlink, variações, estoque desconhecido.
- Abrir revisão de segurança. Não integrar em main sem os gates.

### 2. UI owner Listing Factory (nova PR empilhada sobre #51 depois de CI)
- Adicionar painel sob Produtos, sem nova rota pública. Reaproveitar design e CSS; sem tocar Finance/Ads.
- Selecionar imagens locais, informar arte/título/descrição/SKUs/preços/quantidades, visualizar 5-9 imagens e erros de regra; exportar manifesto JSON de revisão, sem upload.
- Vincular 1:1 aos nomes e hashes locais, sem transformar mockup em estampa ou redimensionar fotos sem autorização.
- Em web/cloudflare/build.py congelar helpers inseridos via template literal. Chromium: 13 scripts existentes não devem mudar sem revisão explícita.
- Ficar compatível com PR #48 que também edita saved-catalog-view.mjs; fazer merge de conflitos conscientemente.

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
