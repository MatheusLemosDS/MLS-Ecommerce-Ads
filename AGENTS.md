# MLS Commerce OS — instruções do repositório (ChatGPT, Codex e colaboradores)

> **Homologação local validada, 30/10/2026:** a continuação da PR #83 cria somente ferramentas locais em `feature/mls-owner-homologation-preview-20261030`. Worker App permanece no hash `a5ba3298…bbfb91c8`; Auth/Finance inalterados. Estado e testes em `docs/MLS_OWNER_PREVIEW_CHECKPOINT.json`. Prévia e exemplos são sintéticos; sem Cloudflare autenticada, staging online, merge ou deploy. As notas anteriores abaixo são históricas.

> **Missão mestre 30/10/2026, estado mais recente:** PR #79 congelada, CI verde `e7ce5009`/41131654577. Integração local em `integration/mls-commerce-os-ai-sales-20261030`, guia `docs/MLS_AI_SALES_INTEGRATION_2026_10_30.md` e checkpoint `docs/MLS_MASTER_MISSION_CHECKPOINT.json`. Motor SVG integrado; AI Sales em preview owner independente, OFF padrão. Esta nota atualiza o checkpoint histórico abaixo. Sem merge/deploy/writes; M2 e QA owner pendentes.

> **Checkpoint de 29/10/2026 para Codex nesta branch:** prioridade única é a [PR #79](https://github.com/MatheusLemosDS/MLS-Ecommerce-Ads/pull/79) e [issue #80](https://github.com/MatheusLemosDS/MLS-Ecommerce-Ads/issues/80), com o briefing `docs/MLS_MOCKUP_PARITY_CODEX_2026_10_29.md`. Os seis PNGs originais foram recebidos em 30/10/2026 e estão em `docs/visual-references/mls-2026-10-29/`, com hashes no manifesto. PR #78 foi fechada **sem merge** por não atingir fidelidade. PR #76 permanece DRAFT. Nenhum deploy, Ads/PROMO ou Shopee write é autorizado. **Motor SVG desta branch não está integrado à UI.**

Leia, nesta ordem, antes de qualquer alteração:
1. docs/ROADMAP_MLS_COMMERCE_OS.md (fonte canônica da estratégia).
2. docs/MLS_COMMERCE_OS_CHECKPOINT.json (estado técnico e branches).
3. docs/MLS_CODEX_HANDOFF_2026_10_28.md (próximas tarefas testáveis).
4. docs/SHOPEE_RESEARCH_TO_MLS_2026_10_28.md (fontes externas e restrições).

## Regras que não podem ser ignoradas

- Produto: MLS Commerce OS. MLS Hermes é supervisor, modo OBSERVER até autorização específica.
- PR #48: busca V3.6 sobre a main. PR #47: M3 Products/Pricing Observer. PR #51: fundamentos da pesquisa Shopee/Listing Factory. PR #56: UI owner Listing Factory, empilhada sobre #51. São branches diferentes; NÃO combinar ou fazer merge automático; revalidar conflitos e CI por ordem.
- A main de referência está no merge documental da PR #55: a137b9d68971a632fceee2c8c41ab236bbc90a69. Antes de trabalhar, releia a main e os PRs porque outros agentes podem ter avançado.
- M2 Finance/Returns NÃO foi encerrada: Seller Centre, Pending, liberações e devoluções devem ser validados na conta. Issue #50.
- Não inventar lucros, estoque, taxas, preços, vendas, eventos ou permissões Shopee. Dados ausentes = UNKNOWN/BLOCKED, jamais zero.
- Ads/PROMO continuam LOCKED. Nunca enviar anúncios, alterar preços/campanhas, criar promoção, confirmar eventos de push, reconectar OAuth ou modificar pedidos sem permissão real e aprovação do operador. M6/M7 definem os gates de escrita.
- Jamais incluir tokens, callbacks, cookies, order_sn privados, buyer data ou arquivos pessoais em commits, logs, testes ou respostas. Fixtures determinísticas e sem dados reais.
- Preservar os três Workers legados brazacommerce-app, brazacommerce-auth, brazacommerce-finance, bindings, D1, URLs, headers, cookies e rotas até migração específica.
- Não copiar bibliotecas Shopee/ERP inteiras para o runtime; revisar a licença de cada dependência, compatibilidade Cloudflare, payload real, permissões por loja/região e a documentação oficial.
- No Shopee SDK externo há divergências históricas GET/POST em escrow batch: validar método contra schema v2 e ambiente oficial antes de construir transporte.
- Arquivos de mockup são inspecionados localmente apenas por cabeçalho. SHA-256 identifica bytes, NÃO garante decodificação, política oficial ou direitos autorais.
- Não reduzir nem desativar suites de teste ou a lista exata de hashes reconhecidos dos Workers. Se adicionar função embutida em script, atualizar também web/cloudflare/build.py (freeze_client_helpers) e testar Worker gerado.

## Desenvolvimento e publicação

Orientação do proprietário em 30/10/2026: entregar os próximos incrementos
validados na versão oficial; criar ambiente separado apenas quando necessário.
Preservar a prévia demonstrativa da PR #84 para consulta. Isso não integra
automaticamente PRs visuais/AI antigas nem autoriza escritas comerciais Shopee/Ads.

1. Criar branch pequena a partir de um commit verificado ou PR base explícita.
2. Manter mudanças puras de planejamento separadas de Finance/Auth/Ads/DTF e da publicação externa.
3. npm ci; npm test (pré-build e testes Node); python3 -m unittest web/bridge/test_hermes_bridge.py tools/test_install_hermes_web_bridge.py tools/test_build_hermes_web_bridge_install.py tools/test_activate_hermes_web_bridge.py tools/test_build_hermes_web_bridge_activation.py -q; npm run build.
4. Exigir CI GitHub verde, verificação exata do App/Auth/Finance e, se houver UI, Chromium e QA autenticado desktop/mobile.
5. Nunca considerar merge em main como confirmação de Cloudflare deploy. Conferir cada Worker e origem/corte dos dados separadamente.
6. Atualizar o roadmap, checkpoint, docs/MLS_CODEX_HANDOFF_2026_10_28.md e NEXT_CHAT_HANDOFF.txt ao completar cada fase; registrar id do PR, commit e gates pendentes.

Para usar o gerador local: docs/MLS_LISTING_FACTORY_V1.md. Usar Node >=24. Nenhum script deste projeto deve publicar na Shopee por padrão.

- PR #56: retomada JSON, preço vazio por segurança, fila com oito por página. CI final verde #40788713558 em candidato sem conflitos PR #58 (13/13 arquivos idênticos), SHA App bbbe1b9efdf0a6c11e507c34c92730ddbb8502fb367c5cfe33c031ba3850d3cd. PR #58 fechada sem merge; #56 novamente empilhada sobre #51. Falta QA visual autenticada, merge ordenado e validação real de permissões/financeiro. Não publicar automaticamente.

- PR #60: associação de mockups por nome exato e hash (até 200 imagens/64 MiB por vez), base #56 → #51. CI #40790629421 verde: 2.132 Node + 67 Python + Chrome, 14/14 blobs idênticos à validação temporária #61 (fechada sem merge). Sem publicar ou tocar em Ads/PROMO; próxima entrega é QA autenticada e integração ordenada com PR #48 protegida. Guia: docs/MLS_LISTING_FACTORY_BATCH_RELINK_2026_10_28.md.

- PR #63 é o candidato de integração V3.6 busca de produtos/DTF + Listing Factory. CI #40792253729 verde (2.136 Node, 67 Python, Chrome), App SHA 8ed059ddb6f0901a48d277d6b9b806a23d52a1e5e105ed0e2e456e2aea6701f5; 13/13 arquivos PR60 e 7/7 PR48 preservados. Continua DRAFT, não mesclar/deploy antes da QA owner desktop/mobile. Release único PR63 OU sequencial PR48→51→56→60, não ambos. M2 #50 e Ads/PROMO LOCKED.

- PR #63 agora inclui reparo mobile do Listing Factory (`390px` não cresce para `469px`); CI próprio #40794715203 attempt2 GREEN (2.136 Node/67 Python). QA sintética PR #65 CI #40794727173 GREEN (2.137 Node/67 Python, Chrome desktop 1365 e mobile 390); capturas #12862897797 marcadas DADOS SINTÉTICOS. PR65 empilhada sobre #63 com diff de apenas teste e workflow. Não é homologação real; não mesclar/deploy sem QA owner e M2 issue #50.
