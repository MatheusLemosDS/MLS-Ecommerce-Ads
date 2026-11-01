> **Auditoria de devoluções e roadmap — 01/11/2026:** M2 permanece aberta. Custos de vendas elegíveis não são um ledger de produção incorrida; recebimento físico, inspeção, estoque reaproveitável e vínculo da revenda ainda não estão implementados. Nova prioridade M2.2 especifica esses controles e separa caixa, estoque e custo consumido, sem criar custos/quantidades por inferência. Auditoria da base PR96: 232 arquivos, 120 documentos de texto, 29 JSON, cinco ferramentas históricas e 78 imagens inventariadas; 217 links locais originais válidos. Alteração somente documental; última runtime publicada permanece PR96. [Relatório](docs/MLS_RETURNS_REUSE_ROADMAP_AUDIT_2026_11_01.md).

> **Margem parcial e ROAS PR96 publicados — 01/11/2026:** a Visão geral mostra a margem do saldo conhecido antes das despesas não declaradas. ROAS atualiza antes dos gráficos; falhas de painel ficam isoladas, com tabela e escopo antigos removidos. Um dia Ads válido informa o índice sem inventar curva ou comparação. App `27356953`; Auth/Finance e configuração preservados. CI 41334582368 verde: 3015 Node e 67 Python, sem skips; Chromium normal/minificado 320/1365 e replay real com falha injetada aprovados. Despesas de novembro continuam desconhecidas, sem zero presumido. A exceção exata do navegador do proprietário não foi capturada; M2/banco permanecem abertos. [Registro](docs/MLS_DAILY_MARGIN_ROAS_2026_11_01.md).

> **Correção do resultado de hoje PR95 publicada — 01/11/2026:** despesas de novembro ainda não declaradas eram ocultadas pelo cartão. A Live mostra o saldo parcial com motivo e acesso direto à confirmação; lucro/margem/gráficos continuam desconhecidos até a declaração. Hoje acompanha Brasília, datas históricas e rascunhos são preservados, e salvar despesas atualiza a leitura imediatamente. App `47e3de73`; Auth/Finance e configuração preservados. CI 41332958729 verde: 3.005 testes Node e 67 Python; Chromium normal/minificado 320/1365 e replay local da leitura real aprovados. Nenhuma despesa real presumida como zero. M2 e confronto Seller Centre/banco continuam abertos. [Registro](docs/MLS_TODAY_ESTIMATED_PROFIT_2026_11_01.md).

> **Release M2 PR94 publicada — 01/11/2026:** conciliação automática alterna o mês atual e o anterior. Cron natural confirmou 3/3 relatórios de outubro na mesma publicação (3 CHECKED, 0 ainda em conferência), com fonte, revisão, datas e cobertura conferidas. App `1a6ca4c3`; Auth/Finance preservados. CI 41325746160 verde: 2.977 testes Node e 67 Python, sem skips, incluindo Chromium. Primeira auditoria fria usa 48 de 50 chamadas permitidas. A recuperação histórica inclui o corte final real de Brasília. M2, confirmação de devoluções e confronto Seller Centre/banco continuam abertos. [Registro](docs/MLS_M2_PREVIOUS_MONTH_RETURNS_2026_11_01.md).

> **Release M2 PR93 publicada — 01/11/2026:** paginação durável do Pending validada na conta: 2 páginas, 182 registros e 182 pedidos. Encerramento e publicação App/Finance conferidos. Navegação local de 50 registros por página, sem novas consultas ao navegar; última lista completa preservada. App `2280e3b1`, Auth `37bead27`, Finance `e0b258a2`. CI 41318567672 verde: 2.908 testes Node, 67 Python e Chromium. Bytes, configurações, domínios, flags e cron conferidos. A varredura concluída não confirma saldo atômico, lucro mensal ou recebimento bancário; M2 e fechamento continuam abertos. [Registro](docs/MLS_M2_PENDING_PAGINATION_2026_11_01.md).

> **Release M2 PR92 publicada — 31/10/2026:** Pending recuperado e primeira página real validada (100 registros; continuação: sim), sem paginação nova. Pendências com evidências para Hermes, checklist de fechamento e navegação responsiva consolidados na Live. App`c8ab272d`, Finance`c1e31d3f`, CI41243934697 verde:2.842Node/67Python/Chromium. Bytes/config/flags/cron conferidos. Seller Centre/banco ainda NÃO COMPARADOS; M2 permanece aberta. [Registro](docs/MLS_M2_PENDING_CLOSEOUT_2026_10_31.md).

# MLS Commerce OS — instruções do repositório (ChatGPT, Codex e colaboradores)

> **Release M2 PR91 publicada — 31/10/2026:** App `7bd0dfa7`, código `9826b28`, CI41229871797 verde:2.772Node/67Python/Chromium. Calendários dos três meses anteriores em rodízio; retomada após virada e corte completo do mês, inclusive COMPLETE de recorte curto. Bytes/config/flags/Auth/Finance e tabelas/cursor conferidos. Primeira coleta natural do incremento na versão64174a2e às15:37:56Brasília: setembro RUNNING,1página/1registro/1de5intervalos, escopo exato e sem erro. [Registro](docs/MLS_M2_HISTORICAL_CALENDARS_2026_10_31.md). Calendário e M2/banco permanecem abertos.
> **Release M2 PR90 publicada — 31/10/2026:** App `17c1e9f1`, código `cf89fdd`, CI41218926278 verde:2.637Node/67Python/Chromium. Tracker ligado à fila, primeira conferência com espera própria e recuperação limitada de fontes do mês anterior. Cron natural confirmou setembro `COLLECTING`, 0/2 referências disponíveis e 1/2 calendários completos; ausência continua pendente. Bytes/config/flags/Auth/Finance e progresso após deploy conferidos. [Registro](docs/MLS_M2_RELEASE_TRACKER_2026_10_31.md). M2/banco e recuperação histórica continuam abertos.
> **Estado atual — 31/10/2026:** PR89 publicada no App `66e9c01f`, base mainPR88 `8bb9718`. CI41206928254 verde:2.536Node/67Python/Chromium; memória agregada, recorrências no contexto real do Hermes, ROAS diário e setas com datas, mantendo o estilo aprovado. Bytes/config/Auth/Finance preservados. Cron natural salvou primeiro corte da publicação14306,3intervalos/23páginas,zero erro. Registro `docs/MLS_AGENT_MEMORY_PERFORMANCE_2026_10_31.md`. Memória não treina pesos nem concede permissões; M2 e avaliação de eficácia permanecem abertas.
> **Estado atual — 31/10/2026:** PR88 publicada no App `c00861cf`, base PR87/main `51b2dfe`, CI41163101852 verde com 2.459 Node/67 Python/Chromium. Auditorias Returns, escopo da publicação e virada diária corrigidos; bytes/config/flags/Auth/Finance e cron natural verificados. Registro em `docs/MLS_M2_RETURNS_CONTINUITY_2026_10_31.md`. Próximo M2: agendar tracker de liberações posteriores; banco e escritas comerciais permanecem com gates.
> **Estado atual — 31/10/2026:** PR87 publicada no App oficial `17bb4a0c`, sobre mainPR86 `8d66525`; CI41159508485 verde2393Node/67Python/Chromium, Auth/Finance/config e flags preservados. Gráficos/topbar/globo e regra infantil16 conferidos em `docs/MLS_VISUAL_CHARTS_RELEASE_2026_10_31.md`. O proprietário autorizou continuar incrementos validados na Live. Notas DRAFT/sem deploy abaixo são históricas; M2 e gates comerciais permanecem abertos.

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

Pedido seguinte do proprietário: promover todas as melhorias preparadas para
a Live e manter esse destino nos próximos incrementos do roadmap. A release
`release/live-roadmap-improvements-20261030` reconcilia conscientemente a cadeia
PR84/83/79/76 com a main PR85, em vez de mesclar PRs históricas em duplicidade.
As duas flags owner podem ser ativadas após os testes. Preservar contratos,
rollback, dados reais e gates comerciais; registrar dependências externas.

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
