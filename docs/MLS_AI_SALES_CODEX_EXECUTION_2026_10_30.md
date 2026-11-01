# Codex — plano histórico de execução do MLS AI Sales
**Criado:** 30/10/2026 · **Referência detalhada:** docs/MLS_AI_SALES_MVP_CODEX_2026_10_30.md

## Estado atual — 01/11/2026

A [PR #86](MLS_LIVE_ROADMAP_RELEASE_2026_10_30.md) já reconciliou e publicou
a base de AI Sales, gráficos, V3.6 e Listing Factory na versão oficial.
Estão disponíveis os planejadores, o estúdio com render local Node/FFmpeg,
as cinco abas owner-only, CRM/propostas assistidos e persistência de rascunhos.
O último App verificado é `27356953`, pela
[PR #96](MLS_DAILY_MARGIN_ROAS_2026_11_01.md), com Auth/Finance preservados.

Não reiniciar S0–S4 do zero nem mesclar novamente as PRs históricas de
preparação. Usar o [roadmap](ROADMAP_MLS_COMMERCE_OS.md) e o
[checkpoint](MLS_COMMERCE_OS_CHECKPOINT.json) para selecionar o próximo
incremento e comparar o contrato já implementado com a evidência exigida.

Publicação da base não significa integração comercial concluída: aceite real
do proprietário, direitos e bytes autorizados da mídia, estoque verificado,
grants oficiais por loja/canal e provedores/orçamento para LLM ou voz neural
continuam gates separados. FFmpeg roda fora do Worker; render em nuvem não foi
entregue por essa integração. APIs de postagem/afiliados e escritas comerciais
continuam bloqueadas. M2 e comparação Seller Centre/banco permanecem abertas.

## Plano preservado de 30/10/2026

As prioridades, restrições de branch e o prompt abaixo são o registro anterior
à integração da PR #86. Não são instruções atuais para refazer a preparação ou
presumir que os módulos ainda estão ausentes. Evidências e exemplos históricos
permanecem preservados.

## Pesquisa de repositórios pronta para reutilização — 30/10/2026

**LEITURA OBRIGATÓRIA ANTES DE S2/S4:** [MLS_AI_SALES_OPEN_SOURCE_AUDIT_2026_10_30.md](MLS_AI_SALES_OPEN_SOURCE_AUDIT_2026_10_30.md). O documento verifica código real, licenças e limitações de MoneyPrinterTurbo, TikTok Shop SDK com Affiliate Seller, Shopee SDK, OpenAPI TikTok, Remotion, OpenShorts e alternativas. Descreve o spike R0 para testar 3 vídeos de camisetas com mockups preservados antes de construir novo motor, e proíbe copiar demos não funcionais.

**Decisão provisória:** MoneyPrinterTurbo para POC local de vídeo (não substituir Workers); hsib19/tiktok-shop-sdk e isaackogan/TikTok-Shop-Api-SDKs para validação dos contratos do Affiliate Seller, sem grant real; congminh1254/shopee-sdk como referência para lacunas Shopee, sem substituir o conector existente. Remotion tem licença própria, OpenShorts tem exceção comercial em cloud/. Toda escrita TikTok/Shopee continua LOCKED. A PR #79 visual mantém prioridade.

## Leia isto antes de começar

O proprietário confirmou **Shopee e TikTok Shop ativos** e solicitou um **MVP integrado ao MLS Commerce OS** com geração de vídeos e gestão de afiliados. Não foi confirmado acesso às APIs. **Não confunda “loja ativa” com “API autorizada”.**

Na criação deste plano, o projeto ainda não estava pronto para inserir o módulo diretamente na interface: PR #76 era release visual draft e PR #79/issue #80 eram trabalho ativo de fidelidade visual. A PR #79 estava baseada na #76; o motor de gráficos era puro e ainda não estava integrado. Esse bloqueio de preparação foi superado pela integração descrita no estado atual acima.

- Repo: https://github.com/MatheusLemosDS/MLS-Ecommerce-Ads
- PR #76: https://github.com/MatheusLemosDS/MLS-Ecommerce-Ads/pull/76
- PR #79: https://github.com/MatheusLemosDS/MLS-Ecommerce-Ads/pull/79
- Issue #80: https://github.com/MatheusLemosDS/MLS-Ecommerce-Ads/issues/80
- Pendência Finance M2 #50: https://github.com/MatheusLemosDS/MLS-Ecommerce-Ads/issues/50
- Leia AGENTS.md, docs/ROADMAP_MLS_COMMERCE_OS.md e docs/MLS_COMMERCE_OS_CHECKPOINT.json.

**Regra de posse de branch:** nunca implemente o AI Sales na branch da PR #79. Aguarde a finalização/homologação visual e o HEAD de base aprovado. Quando autorizado, abra UMA branch de feature para S1–S4 e pequenas PRs testáveis sem tocar nas PRs de UI existentes. Enquanto isso, este material deve permanecer numa PR DRAFT de documentação, sem merge/deploy.

## Entregas do MVP

| ID | Fase | Arquivos sugeridos (confirmar ausência) | Aceite objetivo |
| --- | --- | --- | --- |
| S0 | Auditoria e fonte dos dados | docs/MLS_AI_SALES_CAPABILITIES.md, checklist de contratos | inventário real e matriz BR por provedor, nenhuma falsa permissão, zero writes |
| S1 | Domínio/planejadores puros | web/cloudflare/src/mls-ai-sales-contracts.mjs; mls-ai-sales-campaign-planner.mjs; mls-ai-sales-capability-audit.mjs; mls-ai-sales-profitability-gate.mjs | schema fechado, sem rede, sem modificar Worker gerado, com testes |
| S2 | Estúdio CLI offline | tools/mls_ai_sales_cli.mjs; tools/mls-ai-sales/* | seleção de artes, FFmpeg/ffprobe, vídeos MP4 originais, textos, export, hash, QA, zero upload |
| S3 | UX owner-only | web/cloudflare/src/mls-ai-sales-view.mjs, integração de build.py só após PR79 | flag MLS_AI_SALES_OWNER_PREVIEW OFF, QA desktop/mobile, fila/revisão, nenhum post |
| S4 | Gestão de afiliados | data model/CRM, importador manual e adaptador read-only após grants | criadores consentidos, propostas de comissão, rascunhos, métricas reais; convite externo bloqueado |
| S5 | Piloto externo assistido (fora do MVP inicial) | provider adapters após aprovação | uma ação aprovada, idempotência, status real e auditoria; sem autoativação |
| S6 | Otimização (futura) | ranking verificável | evidência suficiente e separação de mídia, vendas e repasses |

## Sequência detalhada e testes

### Passo A — inventariar o que existe
1. Faça checkout da base final aprovada; não presuma que a main contém V3.6/Listing Factory.
2. Procure os contratos em web/cloudflare/src/mls-listing-factory-planner.mjs, mls-listing-factory-view.mjs, mls-shopee-capability-audit.mjs, agent-registry.mjs, saved-catalog-view.mjs, dtf-view.mjs, mission-control.mjs, admin-view.mjs, admin-client.mjs.
3. Liste a origem real de product_id, variante, SKU, título, preço, custo, estoque e mídia, com null onde não houver prova. TikTok e Shopee devem ter IDs externos próprios.
4. Liste atributos reais de kits de 2 unidades e casos de duas estampas diferentes. Evite usar apenas regra nome-27 para fazer join.
5. Verifique o Git HEAD e CI do alvo; informe divergências do documento antes de editar.
6. Não altere tokens/Cloudflare. Consulte Seller Center somente com acesso do proprietário e autorização, jamais com simulação/scraping.

### Passo B — criar S1 sem tocar em Worker
1. Contratos de ProductSnapshot, CampaignPlan, VideoJob, Creator, Collaboration, Performance e Audit.
2. Validadores de escopo de loja, enum de estados, moeda/centavos, evidência por campo, prazo de validade de snapshot, imagem/copyright, tamanho/variante e precificação.
3. Planner determinístico: recebe snapshots/arquivos; devolve DRAFT, REVIEW_REQUIRED ou BLOCKED; nunca chama APIs externas.
4. Gate econômico: se falta custo/taxa/comissão, não propor percentual como seguro; se conta não suporta affiliate API, manter blocked.
5. Testes de kits, deduplicação, variantes, campos null, 0 válido, dados hostis, source incompatível, estoque desconhecido, rate-limit modelado. Incluir validação de ausência de efeitos colaterais.

### Passo C — S2 render local
1. Implementar CLI com flag --dry-run default, inputs exclusivamente de pasta/manifesto e output local definido.
2. Fazer preflight de FFmpeg/ffprobe, resolução/licença dos assets, duração, arquivo de vídeo e capacidade do disco.
3. Criar 2–3 templates originais (nostalgia retrô, detalhes produto e presente/kit), sempre preservando a estampa.
4. Geração de roteiros a partir de atributos comprovados; IA opcional, sem custo/acesso de rede em testes. TTS só com licença e configuração explícita.
5. Render MP4 vertical, thumbnail e legenda; exportar JSON com SHA-256 e provenance. Toda saída é rascunho.
6. Validar decodificação e repetibilidade com fixtures sem dados privados. Limite de 10 itens em piloto manual; não publicar.

### Passo D — S3 UI após estabilização visual
1. Implementar workspace/abas sobre o design aprovado, sem mexer nos seis cards de paridade da PR #79 sem concordância do proprietário.
2. Feature flag OFF, owner-only, nenhuma rota pública sensível, sem endpoints de escrita externa.
3. Preview, filtros por canal/produto/status, bloqueios explicados e aprovação/recusa de exportação.
4. Atualizar build.py se novos helpers JS forem inseridos no client; testar Worker compilado. Auth e Finance devem ser idênticos à base.
5. Screenshots 1365x900/390x844, desktop/mobile e tema claro/escuro; zero console errors.

### Passo E — S4 afiliados
1. Criador é pessoa externa real, com consentimento ou perfil público usado dentro dos termos; não gerar identidade falsa.
2. TikTok Shop: Affiliate API exige aprovação de app/partner; READ e MANAGE são scopes distintos. Implementar leitura de pedidos afiliados apenas se autorizado. Não gerar links de outro criador sem autorização.
3. TikTok Content Posting API também é separada; scope video.publish, consentimento, auditoria/visibilidade; não presumir âncora comprável de produto.
4. Shopee BR: vendedor participante pode operar programa de divulgação; sem endpoint/grant confirmado, usar integração manual, nunca browser bot.
5. Comparar comissão proposta versus preço/custo/taxas verificadas; se faltar dado, bloquear. Registrar conversões reais, cancelamentos e devoluções sem fabricar margem.
6. UI pode criar rascunhos de convite, mas não enviar mensagens automáticas em massa ou alterar comissão real.

### Passo F — gates de CI, QA e entrega
- npm ci
- npm test
- python3 -m unittest web/bridge/test_hermes_bridge.py tools/test_install_hermes_web_bridge.py tools/test_build_hermes_web_bridge_install.py tools/test_activate_hermes_web_bridge.py tools/test_build_hermes_web_bridge_activation.py -q
- npm run build
- Smoke do Worker compilado em modo flag OFF, depois owner-only ON quando a fase permitir.
- Validar hashes dos três Workers, contexto dos testes, nenhum deploy externo, grants ainda desconhecidos e blockers.
- Entregar PR DRAFT com resumo por arquivo, comandos/resultados verificáveis, capturas, checklist e pedido explícito de QA/aprovação.
- Não realizar merge, deploy, post TikTok/Shopee, convites, despesas, promoções ou alterações de campanha/preço/estoque sem aprovação por fase.

## Prompt objetivo para iniciar o Codex no momento certo

> Continue o repositório MatheusLemosDS/MLS-Ecommerce-Ads pelo HEAD realmente aprovado após a trilha visual #79/#76. Leia AGENTS.md, o roadmap/checkpoint canônicos, docs/MLS_AI_SALES_MVP_CODEX_2026_10_30.md e este arquivo. Implemente primeiro S0 e S1, somente contratos/planificadores/testes puros, sem modificar Worker App/Auth/Finance, D1, build.py, deploy, APIs externas ou a PR #79. Trate dados ausentes como UNKNOWN e qualquer write externo como LOCKED. Documente diffs, CI/hashes, bloqueios e uma única PR DRAFT para revisão. Não alegue integração TikTok/Shopee sem grant real.

**O que não solicitar ao proprietário prematuramente:** tokens, senhas, cópias de cookies, IDs de compradores, acesso administrativo amplo, decisão de comissões hipotéticas ou verba Ads. A primeira fase pode ser feita com contratos e fixtures sintéticas.

**Estado na criação do plano:** este arquivo organizava a execução; a implementação S0–S4 ainda estava pendente naquela etapa. Consultar o estado atual acima e o registro da PR #86 para distinguir a base publicada dos contratos e aceites externos ainda bloqueados.
