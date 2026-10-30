# MLS AI Sales — especificação de MVP e handoff implementável para Codex
**Data:** 30/10/2026 · **Status:** PLANEJADO / DOCUMENTAÇÃO SOMENTE · **Responsável pela execução futura:** Codex

> Este arquivo NÃO comprova que vídeos, APIs TikTok Shop, Shopee ou afiliados estejam integrados. Não há autorização para publicar, enviar convites, mudar comissões, consumir orçamento ou fazer deploy. Esta branch é SOMENTE DE DOCUMENTAÇÃO. A trilha visual prioritária atual é a PR #79 e issue #80.

## 0. Ordem obrigatória de leitura e trabalho

1. AGENTS.md e docs/ROADMAP_MLS_COMMERCE_OS.md (canônicos).
2. docs/MLS_COMMERCE_OS_CHECKPOINT.json e NEXT_CHAT_HANDOFF.txt.
3. PR #76 (release visual / V3.6 OFF) e PR #79 / issue #80 (visual parity do Codex).
4. docs/MLS_MOCKUP_PARITY_CODEX_2026_10_29.md NA BRANCH DA PR #79.
5. docs/MLS_LISTING_FACTORY_V1.md e docs/MLS_INTEGRATED_OWNER_RELEASE_2026_10_29.md NA BRANCH DA PR #76.
6. Este documento e docs/MLS_AI_SALES_CODEX_EXECUTION_2026_10_30.md.

**NÃO iniciar a implementação deste novo MVP enquanto o Codex estiver alterando os mesmos arquivos da PR #79.** Depois da QA e da decisão do proprietário sobre a PR #79 e a release #76, partir do commit de base realmente aprovado/mesclado. Se for autorizado um desenvolvimento isolado antes disso, desenvolver somente módulos puros/CLI sem alterar Worker App, shell, build.py, Auth, Finance ou branches das PRs existentes; revisão e integração apenas posteriormente.

## 1. Fotografia verificada do repositório em 30/10/2026

Repositório: https://github.com/MatheusLemosDS/MLS-Ecommerce-Ads

| Fonte | Estado observado | Implicação |
| --- | --- | --- |
| main | HEAD a96bb1c56aaea54a63bede5c177a0de8ab2ea890 | Base pública atual; não contém todo o código da V3.6/Listing Factory |
| PR #76 | DRAFT, HEAD c29d88f2c14281d1e6c142948129d2634a85bccb, base main | Candidato de release da UI com V3.6 owner OFF; não mesclar/deploy por este trabalho |
| PR #79 | DRAFT, HEAD 8d860b2c4f26531c53c4cdba0e06a14f51a7eef4, base PR #76 | Motor SVG puro + testes, **não** conectado ao Worker ou aprovado visualmente; prioridade do Codex |
| PR #78 | Fechada sem merge | CSS de referência visual rejeitado; não reutilizar como base |
| Issue #80 | Aberta | Implementação visual/paridade dos seis mockups |
| Issue #50 | Aberta | Auditoria Finance/Pending/escrow/Returns do Seller Centre não comprovada |
| Ads/PROMO | LOCKED | Não fazer operações comerciais |
| MLS Hermes | OBSERVER | Novo módulo só produz recomendações, tarefas e evidências |

**Histórico de CI documentado:** PR #79 registrou no seu HEAD 2.187 testes Node + 67 Python, builds App/Auth/Finance, run 40965851266 SUCCESS. Isso NÃO valida funcionalidades do AI Sales, nem aprovação visual, nem uma conta TikTok Shop, nem autorização de API.

**Base técnica já presente na PR #76:** web/cloudflare/src/mls-listing-factory-planner.mjs (contrato puro de planejamento SHOPEE_BR, modo DRAFT_ONLY); mls-listing-factory-view.mjs (UI owner, seleção local JPG/PNG, export JSON, retomada por arquivo, reanexação de mockups); mls-shopee-capability-audit.mjs (auditoria offline de permissões, NUNCA prova acesso real); agent-registry.mjs; mission-control.mjs; saved-catalog-view.mjs; dtf-view.mjs; approved-design-system.mjs; admin-view.mjs; admin-client.mjs; web/cloudflare/build.py.

**Detalhe determinante:** os arquivos brutos de mockups não são persistidos pela Listing Factory, apenas metadados/miniaturas/hashes em memória e JSON exportado. AI Sales não pode presumir que eles existam em um bucket remoto ou estejam acessíveis pelo Worker.

**Infra:** três Workers Cloudflare (brazacommerce-app, brazacommerce-auth, brazacommerce-finance), D1, aliases e contratos antigos preservados. npm requer Node 24 e npm 11 conforme package.json. O build inclui injeção explícita dos scripts do navegador via build.py; apenas criar um novo arquivo fonte não o disponibiliza ao Worker.

## 2. Objetivo de negócio, identidade e limite do MVP

O proprietário declarou que **as lojas Shopee e TikTok Shop já estão ativas**. Esta declaração NÃO significa que OAuth, scopes, TikTok Partner Center, APIs de afiliados ou permissão para publicar vídeos estejam ativos.

**Objetivo:** construir o MLS AI Sales como módulo do **MLS Commerce OS**, operado pelo **MLS Hermes**, para organizar produção de vídeos promocionais dos produtos reais da loja e relacionamentos com afiliados independentes. Conectar catálogo, arte, custo, inventário conhecido, criativos, campanhas, resultados e auditoria em uma única visão.

**Dois fluxos distintos que NÃO devem ser confundidos:**

A. **Vendas no perfil da própria loja:** gerar vídeos e pacotes publicáveis com seus produtos, usando link/produto vinculado pelo próprio vendedor. Isso NÃO gera comissão de afiliado sobre os próprios itens.

B. **Marketing de afiliados de terceiros:** preparar briefing, analisar criadores elegíveis, propor convites e taxas de comissão, registrar respostas, acompanhar vendas atribuídas e reconciliação. Não criar contas falsas, não criar perfis simulados fingindo ser pessoas reais, não usar autoafiliação para obter comissão, não fazer spam nem scraping.

**Alvo inicial de piloto (metas internas, não limite de API):** 10 produtos elegíveis, duas ou três receitas de vídeo e até três variações por produto, com um painel de aprovação e fila; iniciar criadores com operações assistidas. Não configurar publicação automática nem prometer volume de vendas.

**Não incluído no MVP:** agendamento autônomo de post público em massa, live AI, automação de contas e sessões humanas, envio automático de DMs, orçamento de Ads, alteração de preço/estoque, autorização silenciosa, amostras grátis sem aprovação, repasse financeiro, movimentação bancária, ou ML otimizado com atribuição fictícia.

## 3. Dados do produto e regras específicas de camisetas

Regra operacional informada pelo proprietário e a **confirmar nos SKUs/catalogo reais**: camiseta básica (não oversized) 100% algodão fio 30.1 penteado, estampa DTF nominal de 27,5 cm de largura, tamanhos P, M, G, GG, G1, G2, G3. SKU utilizado frequentemente no padrão nome-27, mas não pressupor que todos os anúncios obedecem a isso. Há kits casal, duas artes, quantidades múltiplas e anúncios legados com SKUs diferentes. A referência é o vínculo real entre marketplace, produto, variação e arte, e não uma substring de SKU.

- Resolver os produtos com **chave interna estável** (product_key), múltiplas referências externas por marketplace, variant_id e arte; manter shop_id/provider e fonte; nunca juntar produtos pelo título isolado.
- Preços por plataforma e variação são independentes. Quantidade, custo, taxa, estoque e comissão podem ser null/UNKNOWN; nunca converter para zero.
- Uma peça com arte enviada pelo usuário não pode ser redesenhada por modelo generativo; para mostrar camiseta real, usar mockup/licença/filmagem original e sobrepor fielmente a arte sem mudar sua geometria, orientação, cores ou proporções.
- Respeitar as diretrizes de mockups da loja: mockup isolado JPG 1:1 até 2 MiB quando destinado à Shopee; versões pretas/brancas separadas; sem marca d'água inventada; galeria existente de até nove imagens para anúncios. **Esses limites de JPG não são especificação dos vídeos.**
- Kit de duas peças deve ser representado com a quantidade real, tamanhos reais e vinculação correta; não transformar duas unidades em duas vendas.
- Não afirmar disponibilidade física, preço atual, desconto, estoque, prazo, tamanho, algodão ou benefício sem evidência do cadastro real ou confirmação do operador.

## 4. Arquitetura proposta — aproveitar o existente, sem monolito novo

### Camada de leitura do Commerce OS

- **ProductCatalogAdapter**: lê projeções existentes de produto/custo/variante e Listing Factory; devolve snapshots imutáveis com proveniência, idade e cobertura. Não criar coletor Shopee duplicado.
- **MarketplaceCapabilityAdapter**: auditabilidade por loja/ambiente/escopo/ação; UNKNOWN ou DENIED bloqueiam. Reusar a abordagem de mls-shopee-capability-audit.mjs como princípio, mas TikTok é outro provedor e outro contrato.
- **CreativeAssetManifest**: origem LOCAL_OPERATOR, DRIVE_AUTHORIZED ou R2_VERIFIED somente quando houver acesso real; hash SHA-256, nome, mime, dimensões, titularidade/licença, crop/autorização, vínculo com produto. Sem acesso implicitamente liberado ao Google Drive.
- **ProfitabilityGate**: calcula contribuição apenas com custo, taxas, preço e comissão verificáveis. Finance da Shopee não é fonte de lucro TikTok; não combinar unidades/moedas/lojas/atribuições.

### Camada de geração — Node local / worker de mídia dedicado, NÃO Cloudflare Worker App

- **CampaignPlanner (puro)**: combina produto permitido + objetivo + templates + política, retornando uma fila determinística de planos. Usa IA opcional para texto, nunca para inventar atributos.
- **ScriptAdapter (IA)**: roteiros e legendas curtas com citação dos atributos aprovados. Se sem chave de IA, template local determinístico.
- **VideoRenderer**: Node + FFmpeg (verificação de binário local, sem shell injection), compõe imagem/filmagem original, recortes, animações moderadas, tipografia, narração licenciada e legendas; duração inicial alvo 15–30 s, tela vertical 1080×1920, H.264/AAC MP4; validar os requisitos vigentes de cada canal na etapa de exportação.
- **MediaQA**: ffprobe, duração, orientação, vídeo realmente decodificável, áudio opcional coerente, legendas legíveis, direitos, fotos ligadas, selo/declaração de IA quando aplicável, hash do arquivo exportado. Rejeitar saída silenciosamente corrompida.
- **ApprovalQueue**: vídeo preparado -> QA -> aprovação do owner -> exportação. Opcional: agendamento apenas após autorização posterior para um método oficial de publicação.

**Não rodar FFmpeg, downloads arbitrários, render caro nem chaves de fornecedor no navegador/Worker App.** Em MVP, CLI local pode armazenar vídeo, miniatura, manifesto e log sanitizado em pasta escolhida pelo operador; no futuro usar fila durável e R2/autorização dedicada, sem sacrificar custo/latência do App.

### Camada de afiliados e desempenho

- **CreatorRegistry**: cadastro manual/consentido de criador real, nicho, plataforma, perfil verificado, autorização/evidência e status de conversa; não descobrir CPFs, emails ou dados privados por scraping.
- **CollaborationPlanner**: sugere produto, conteúdo, faixa de comissão/margem, briefing e rascunho de convite. Criação de colaboração e mudança de comissão são AÇÕES DE ESCRITA, bloqueadas até explicitamente aprovadas.
- **AffiliateOrderAdapter**: ler pedidos afiliados somente com API/scope realmente autorizados; deduplicar por ID privado guardado no backend; mostrar apenas contagens/agregados necessários; cancelar, estornar e atualizar comissão conforme status real.
- **AttributionEvaluator**: não confundir visualização, clique, ordem paga, ordem concluída e repasse; atribuição cruzada entre TikTok/Shopee só quando houver prova explícita de origem e período.
- **Auditor**: registrar input, decisão, aprovação, execução, evidência, falhas e motivo de bloqueio, sem token, PII ou dados de comprador.

### Fluxo resumido

~~~text
Catálogo/custos/SKUs existentes (read only) --> ProductSnapshot + Evidence
                                            --> CampaignPlanner --> roteiro/variantes
Mockups e vídeos originais --> AssetManifest --> Video Renderer CLI (Node+FFmpeg)
                                            --> MediaQA --> Owner Approval --> arquivos prontos
                                            --> [Publicador oficial futuro, gate fechado]
Afiliados independentes --> CreatorRegistry --> CollaborationPlanner --> Owner Approval
                                            --> [API oficial autorizada OU operação manual no Seller Center]
Pedidos atribuídos e dados reais --> Aggregator OBSERVER --> MLS Hermes + Auditor
~~~

## 5. Matriz de integrações — o que é realmente possível (30/10/2026)

| Integração | Evidência pública | Estado deste projeto | Fallback correto |
| --- | --- | --- | --- |
| TikTok Shop leitura de catálogo da loja | TikTok Shop Partner Center: Get Authorized Shops + Search Products após autorização | **UNVERIFIED** para esta loja; usuário só confirmou conta ativa | seleção/importação manual de URLs e produto, sem afirmar sincronização |
| TikTok Shop Affiliate read | Guia oficial menciona Search Seller Affiliate Orders e Seller Search Affiliate Open Collaboration Product (scope Read Seller Affiliate Collaborations) | **UNKNOWN/LOCKED**; Affiliate API desativada por padrão e exige aprovação de Partner/Account Manager | planilha/export do Seller Center com importação manual e validação |
| TikTok Shop Affiliate write | Guia oficial menciona Create Open/Target Collaboration, Edit Open Collaboration Settings, Generate Affiliate Product Promotion Link e remoção de criador | **LOCKED**, mesmo após conexão de leitura, até aprovação por ação e autorização expressa | passos assistidos, operador realiza no Affiliate Center |
| TikTok Creator Affiliate API | Requer autenticação independente e consentimento do criador; token de seller NÃO substitui token do criador | **NO_CREATOR_GRANT**, não solicitar consentimento em massa | registrar criador manualmente e esperar aceite |
| TikTok publicação de vídeo | TikTok for Developers Content Posting API, scope video.publish, aprovação/auditoria e consentimento da conta | **UNKNOWN/LOCKED**, API de vídeo NÃO é a mesma API de Affiliate nem garante âncora/produto TikTok Shop | pacote de vídeo/legenda para postagem manual |
| Shopee catálogos | Conexão/projeções Shopee existentes, capability audit offline em PR #76 | leitura existente limitada; não presumir permissão de criação de mídia/campanha | usar dados já coletados e apontar cobertura |
| Shopee afiliados de vendedores | Programa de Marketing de Divulgação do Vendedor Participante, regras oficiais e painéis de criadores | **SEM PROVA DE ENDPOINT oficial para automação de convites/comissões na conta BR** | gerir programa no Seller Center, importar relatórios permitidos |
| Shopee Video | Sem contrato/credencial de postagem automática verificada neste projeto | **LOCKED** | exportar vídeo e postar manualmente pelo aplicativo |
| Google Drive | Possível como mídia sob autorização específica | **NÃO CONECTADO AO MÓDULO** | escolher pasta local de artes/mockups |

Fontes oficiais (reler e comparar vigência, BR, scopes e termos ANTES de implementar chamadas):
- TikTok Shop Affiliate API Solution Guide: https://partner.tiktokshop.com/docv2/page/affiliate-integration
- TikTok Content Posting API — Getting Started: https://developers.tiktok.com/doc/content-posting-api-get-started
- TikTok Content Posting API — Direct Post: https://developers.tiktok.com/doc/content-posting-api-reference-direct-post
- TikTok Shop BR — restrições IA: https://seller-br.tiktok.com/university/essay?knowledge_id=2324329879832321
- TikTok Help — rótulo de IA: https://support.tiktok.com/pt_BR/using-tiktok/creating-videos/ai-generated-content
- Shopee BR — programa do vendedor participante: https://help.shopee.com.br/portal/4/article/76443-%5BPol%C3%ADticas%5D-Termos-e-Condi%C3%A7%C3%B5es-%7C-Programa-de-Afiliados-da-Shopee---Vendedor-Participante?seo=1

**Não usar exemplos de API em sandbox EUA como prova da disponibilidade na região BR.** Documentação do TikTok Shop lista aprovações de aplicativo/escopos e permite colaborações, mas a conexão desta loja e o escopo efetivo devem ser verificados. Uma credencial de seller não autoriza agir por um creator.

### Restrições de conteúdo

A política brasileira do TikTok Shop exige transparência quando conteúdo foi criado/significativamente alterado por IA, não personificar terceiros e não distorcer cor, material, estampa, tamanho ou características do produto. Na fase inicial, preferir vídeos compostos com fotos reais ou mockups fiéis e voz neutra/licenciada; avatares são opcionais e devem ser claramente identificados como sintéticos, sem depoimentos fictícios ou falsas avaliações. Não replicar identidade, nome ou voz de pessoas conhecidas sem direitos.

## 6. Contratos de dados propostos (novos; NÃO contratos já implementados)

**Proposta MLS AI Sales v1** — cada contrato precisa de validador puro, schema fechado, tipos estáveis e testes de ataques:

- **mls_ai_sales_product_snapshot_v1**: product_key, marketplace, shop_ref, platform_product_id, variant_ref, sku, title, verified_product_attributes, landing_url, price_cents, currency, cost_cents|null, fees_cents|null, inventory_units|null, observations[{source,observed_at,coverage}], media_refs[]; campo desconhecido fica null.
- **mls_ai_sales_campaign_plan_v1**: campaign_id, product_refs[], goal (STORE_VIDEO ou AFFILIATE_BRIEF), templates[], policy_version, channel, stage (DRAFT), asset_refs[], editor_state, creative_brief, blocked_reasons[], generated_at, operator_approval_id|null. Sem autoplay ou writes.
- **mls_ai_sales_video_job_v1**: job_id, idempotency_key, campaign_id, product_ref, template_id, input_hashes[], render_policy, desired_output, state (PLANNED/RENDERING/QA_BLOCKED/READY_FOR_OWNER/APPROVED/FAILED), error_code|null, output_hash|null, path_local|null; não guardar binário/PII em JSON de revisão.
- **mls_ai_sales_creator_v1**: internal_creator_id, provider, approved_handle, consent_evidence|null, seller_creator_access_grant_status, channel_fit, last_contact_at|null, status (DRAFT/ELIGIBLE/CONTACTED/RESPONDED/DECLINED/BLOCKED), no comprador ou dado pessoal excessivo.
- **mls_ai_sales_collaboration_v1**: plan_id, shop_ref, creator_ref, product_ref, commission_rate_bps|null, money_exposure_cents|null, margin_evidence, status (DRAFT/BLOCKED/APPROVED/SENT/ACCEPTED/EXPIRED), provider_id|null, owner_approval_id|null, idempotency_key.
- **mls_ai_sales_performance_v1**: source, marketplace, campaign_ref, product_ref, creator_ref|null, period, observed_at, currency, views|null, clicks|null, affiliate_orders|null, confirmed_sales_cents|null, attributable_ad_spend_cents|null, commission_cents|null, refunds_cents|null, coverage_status, source_evidence; NULL não é zero.
- **mls_ai_sales_action_audit_v1**: actor (OWNER/AGENT), verb, target, draft_hash, decision, gate_result, approved_at|null, executed_at|null, provider_result_status, redacted_evidence_ids. Sem tokens, dados do comprador ou pedidos sensíveis.

Regra de dinheiro: centavos inteiros por moeda, escopo e período. A margem de uma proposta só é READY quando houver prova compatível de preço, custo, tarifas, comissão e efeitos de desconto/devolução relevantes. Não usar cálculo bruto como lucro comprovado. Não dar nome de ROAS quando não há gasto e vendas atribuídas pela MESMA fonte.

## 7. UX pretendida, sem quebrar a paridade visual atual

Adicionar um workspace **MLS AI Sales** sob Criativos/Marketplaces quando a trilha visual PR #79 estiver aprovada, respeitando web/cloudflare/src/approved-design-system.mjs. Não alterar o grupo de seis agentes da Visão Geral aprovado pelo proprietário sem nova aprovação. O Hermes exibe o módulo como fonte de tarefas e alertas OBSERVER, não como agente executor irrestrito.

Abas propostas:
1. **Campanhas:** produtos selecionados, disponibilidade/cobertura e justificativa de bloqueio.
2. **Estúdio de vídeos:** jobs, template, roteiro, preview, validação, exportação.
3. **Afiliados:** criadores consentidos, rascunhos de convite, comissões propostas, estado de aceite.
4. **Desempenho:** métricas com fonte, período e confiabilidade, sem atribuição inventada.
5. **Integrações:** matriz de recursos por loja, autorização, scopes, políticas e motivos de bloqueio.

Botões devem funcionar ou estar desabilitados com motivo real. O dono deve poder cancelar jobs, aprovar/rejeitar exports, interromper qualquer operação externa e ver log de auditoria. A fase 1 NÃO deve adicionar uma rota pública que opere sem sessão; o preview deve ser owner-only e OFF por padrão.

## 8. Roadmap técnico incremental para Codex

### S0 — Discovery e baselines (READ ONLY)
- Confirmar HEAD da main/PR #76/#79 e diffs atuais ANTES de editar.
- Levantar contratos reais existentes de catálogo, mídia, custos, Hermes, listagem, URLs e autorização. Não supor esquema pelos nomes de arquivo.
- Criar matriz por loja/provedor dos grants TikTok Shop Seller e Affiliate / TikTok Posting API; marcar UNKNOWN até evidência sem compartilhar token.
- Congelar suíte e SHA reais de build; nenhum deploy ou mudança em configurações Cloudflare.
**Saída:** matriz com dados observados, lacunas e decisão explícita de arquitetura. Sem contar como API conectada.

### S1 — Domínio puro e planner (sem Worker runtime)
- Criar contratos/validadores e planejadores sem I/O externo.
- Arquivos sugeridos (nomes novos, confirmar ausência antes de criar): web/cloudflare/src/mls-ai-sales-contracts.mjs; mls-ai-sales-campaign-planner.mjs; mls-ai-sales-profitability-gate.mjs; mls-ai-sales-capability-audit.mjs.
- Criar testes Node determinísticos com fixtures sintéticas para camisetas e kits; verificar UNKNOWN, cross-store, idempotência e direitos de imagem.
**Saída:** planos de vídeo/collaboration somente DRAFT, sem alterar hashes dos três Workers.

### S2 — CLI de vídeos local e exportação
- Criar tools/mls_ai_sales_cli.mjs e módulos de render separados. Não presumir FFmpeg instalado; mostrar preflight com erro claro.
- Manifesto explícito de fotos/arte/filmagem, correspondência SKU/variation e licença; importação por pasta local com rejeição de traversal/symlink.
- Templates originais: nostalgia/anos 80, detalhes da peça, presente/kit; variáveis validadas por produto; roteiro, voz opcional, legendas, CTA sem alegações falsas.
- Renderizar MP4 vertical + thumbnail + descrição + manifesto + sha256; prévia local e reexecução idempotente; falta de mídia/direito gera BLOCKED.
- FFmpeg com spawn array e caminhos validados; limites de tempo, tamanho, paralelismo e disco. Sem upload externo.
**Saída:** 10 produtos / 2–3 templates / até 3 variações cada em fixtures; decodificação e parâmetros testados com ffprobe.

### S3 — UI preview owner-only (integração controlada após visual)
- Após PR #79 aprovada, adicionar um único workspace no App existente, usando layout/tokens aprovados; feature flag exata MLS_AI_SALES_OWNER_PREVIEW=ENABLED, default OFF, exigindo sessão de proprietário.
- Reutilizar as projeções existentes sem chamadas extras, e escopos de produtos/mídia. Mostrar fila, vídeos gerados (upload de arquivo local ou manifesto), QA/aprovação e links de export.
- Se embutir helpers no navegador, revisar web/cloudflare/build.py e testes compilados; não afetar hashes Auth/Finance nem alterar serviços legados.
**Saída:** owners conseguem revisar/exportar sem nenhum request externo de publicação.

### S4 — Afiliados OBSERVER/ASSISTED
- Criar registro de criadores com consentimento, segmento, origem, status, briefing e histórico de aprovações; importação de relatórios permitidos.
- TikTok Shop: implementar **somente leitura** de Seller Affiliate Orders se API e scopes estiverem explicitamente concedidos/validados para BR; sem grant, manter stub BLOCKED e importação manual validada.
- Gerar **rascunhos** de colaboração, convite e comissão calculados a partir de margem real; sem convite/edits por API.
- Shopee: integrar apenas o caminho oficial realmente disponível; caso contrário, export de relatórios e checklist de operação manual.
**Saída:** funil e painel de propostas sem convites enviados automaticamente, sem contatos falsos.

### S5 — Piloto de publicação e colaborações assistidas (FUTURO, GATE SEPARADO)
- Exigir auditoria de app, autorização do seller e, onde preciso, creator; confirmação de limites, termos BR, idempotência, rate-limit, retry seguro, kill switch e aprovação por ação.
- Separar TikTok Content Posting API (vídeo) da TikTok Shop Affiliate API (colaboração); validar âncora de produto e associação comercial como etapa própria — upload de vídeo não comprova produto comprável.
- Começar com um vídeo aprovado/uma colaboração aprovada e leitura posterior do resultado. Não ativar auto-post/convites em massa.
**Saída:** relatório de execução real e auditoria, com rollback onde suportado, só após autorização do proprietário.

### S6 — Otimização com dados observados (FUTURO)
- Ranking por eventos atribuídos/receita e margem com fonte real; teste A/B simples com resultados comparáveis.
- Orçamento de mídia, taxas e samples continuam LOCKED até políticas persistidas, limites, auditoria e aprovação específica.
- Sempre permitir desligar automação sem perder histórico.

## 9. Segurança e critérios de bloqueio

1. Toda chamada externa inicia **DENIED/UNKNOWN** até grant real. Nenhum OAuth simulado, automação de navegador do Seller Center, cookie copiado, scraping, bypass de captcha ou self-affiliation.
2. Toda escrita em Shopee, TikTok Shop ou TikTok requer permissão de provider válida, sessão owner, autorização explícita do operador, idempotency key, limite e auditoria. Em S0–S4, bloquear todas as escritas mesmo com token.
3. Credenciais exclusivamente em secrets server-side. Não commitar tokens, webhooks, callbacks, chaves de API, mídia privada, dados pessoais de criadores/compradores ou dumps de pedidos.
4. Receitas em vídeos devem ser verdadeiras: sem avaliações falsas, “últimas unidades” inventadas, descontos não verificados, depoimentos de avatares fingindo experiência real, marca/arte de terceiros sem direito.
5. Se custo, estoque, autorização ou mídia estiver ausente, marcar BLOCKED/UNKNOWN com motivo. Nunca usar 0 para preencher ausência.
6. Proteger contra SSRF, path traversal, upload de executáveis, XSS, excesso de mídia, nomes iguais, duplicatas, rate-limit, cron concorrente, replay e job perdido.
7. Guardar histórico mínimo de consentimento de criadores, com retenção/eliminação apropriadas. Evitar qualquer coleta de informações não necessárias.
8. Sinalizar conteúdo gerado ou alterado significativamente por IA antes de publicar, segundo política do TikTok Shop Brasil.
9. Não adicionar nova tabela D1, R2, Worker ou cron antes de necessidade provada, migração isolada e gate de rollback; arquivos temporários de vídeos não vão para D1.
10. Preservar os hashes dos Workers que não mudaram; **não** adulterar allowlist de hash para esconder diffs.
11. Jamais publicar a partir de PR de documento. Não mesclar nem alterar deployments da PR #76/#79 durante este planejamento.

## 10. Testes de aceitação por estágio

**S1:** validador rejeita shape extra/IDs incompatíveis, URLs maliciosas, dados ausentes, estoque null, custo null, comparação entre lojas, produto duplicado e kits duplicados. Zero válido não é null. Determinismo e idempotência verificáveis.

**S2:** fixtures com mockup real não privado de teste, arte orientada corretamente, camisa branca/preta, kit 2 unidades, ausência de áudio, arquivo JPG inválido, mídia corrompida, resolução baixa, nome repetido, limite de duração, abort e reinício; ffprobe verifica MP4 e hash; não existe chamada HTTP de publicação.

**S3:** owner OFF/ON, sessão expirada, usuário sem permissão, nav desktop 1365×900/mobile 390×844, estados READY/BLOCKED, XSS, downloads legítimos e botões bloqueados. Build compilado do Worker e scripts injetados devem ser testados.

**S4:** API desautorizada = bloqueio sem network; token revogado, rate-limit, erro 429, paginação, pedido repetido, cancelamento, devolução, moeda incompatível, comissões e fonte parcial; nenhum convite enviado.

**S5:** somente em fase própria, E2E sandbox/provider aprovado, consentimento da conta, aprovação explícita por payload, deduplica chamada, erro incerto não reenvia automaticamente, status realmente consultado, possibilidade de pausar/rollback, reconciliação.

Comandos canônicos:
~~~bash
npm ci
npm test
python3 -m unittest web/bridge/test_hermes_bridge.py tools/test_install_hermes_web_bridge.py tools/test_build_hermes_web_bridge_install.py tools/test_activate_hermes_web_bridge.py tools/test_build_hermes_web_bridge_activation.py -q
npm run build
~~~

Validar npm Node 24, a mesma CI de GitHub no HEAD exato, três Workers e testes Chrome. Se alguma suíte falhar, não alegar conclusão nem afrouxar asserts existentes. QA autenticada do proprietário é gate adicional, não substituída por fixtures.

## 11. Definição de pronto do **MVP** (não da automação futura)

- [ ] O módulo foi desenvolvido após a estabilização da PR #79, sem perda de funcionalidade do Commerce OS.
- [ ] Catálogo do projeto e variantes reais são referenciados com fonte/loja/tempo e sem valores inventados.
- [ ] Roteiros/legendas e vídeos verticais podem ser gerados localmente e exportados; fidelidade de estampas comprovada em QA.
- [ ] Cada vídeo tem hash, metadados, status de QA e aprovação/rejeição do operador.
- [ ] A UI owner-only mostra jobs, bloqueios, afiliados e métricas disponíveis, mantendo modo OBSERVER.
- [ ] A matriz de capacidades TikTok/Shopee existe, e APIs sem grant são bloqueadas sem rede.
- [ ] Propostas de afiliados incluem custo/margem, consentimento e estado, sem convite automático.
- [ ] Não há scraping, autoafiliação, falsa identidade, gravação de token no repo ou publicação automática.
- [ ] Testes completos, builds e QA desktop/mobile foram executados no SHA final e registrados.
- [ ] Documentação de operação, custos de geração por vídeo, limites e recuperação de falha foi entregue.
- [ ] Merge e deploy ficam PENDENTES até aprovação separada do proprietário.

## 12. Pendências externas que o Codex deve registrar, NÃO adivinhar

- Identificar no Seller Center BR quais funcionalidades de afiliados estão habilitadas para a loja, quais produtos podem receber comissão e quais regras de convite/relatório existem.
- Verificar se o desenvolvedor tem app TikTok Shop Partner Center cadastrado, acesso à Affiliate API e escopos específicos para BR; sem isso, integrar modo manual.
- Verificar se há app TikTok for Developers auditado e scope video.publish autorizado, e se existe API específica permitida para associar produto a vídeos shoppable nesta loja. Se não, fluxo manual.
- Localizar fonte estável e autorizada das artes/mockups: arquivo local selecionado, integração posterior Google Drive (com consentimento) ou R2. Não fingir que o JSON do Listing Factory contém os bytes.
- Validar termos atualizados e taxas reais de afiliados, itens elegíveis, produto, variantes, estoque, comissão e custo antes de liberar convites.
- Definir infraestrutura de renderização fora do Cloudflare Worker App; considerar licença/custo de TTS/IA e política de dados.
- Resolver bloqueios financeiros M2 (issue #50) antes de apresentar “lucro líquido comprovado” ou liberar decisões dependentes de rentabilidade.

## 13. Contrato de entrega por sprint

Cada sprint do Codex deve informar: branch/commit/PR, arquivos alterados, contratos concretos reutilizados, testes executados e logs resumidos (sem segredos), bloqueios UNKNOWN, screenshots quando UI, hashes App/Auth/Finance, confirmação de **zero publicação/zero write externo** e próximos gates. Atualizar ROADMAP e CHECKPOINT após a integração aprovada de cada sprint. Não misturar desenvolvimento deste módulo com design/correções da PR #79 em uma mesma PR.

**Primeira ação do Codex para este módulo:** executar S0 (discovery/baseline) e S1 (contratos puros) apenas quando a trilha visual e a escolha da base estiverem definidas. Nenhum trabalho externo ou publicação foi realizado pela criação deste documento.
