# Pesquisa GitHub Shopee → MLS Commerce OS — 28/10/2026

## Objetivo e decisão

Aproveitar conceitos, contratos de dados e testes de projetos públicos de Shopee e ERPs para acelerar MLS Finance M2, MLS Products/Pricing M3, MLS Creative/Marketplace M8 e supervisão pelo Hermes, SEM importar código indiscriminadamente ou executar escritas comerciais não autorizadas.

Fonte agregadora: https://github.com/topics/shopee

Projetos examinados (referências de arquitetura, não comprovantes de permissão Shopee):
1. Shopee SDK TypeScript (MIT): https://github.com/congminh1254/shopee-sdk — guias Auth, Product, Payment, Push, MediaSpace, Ads, Returns. O SDK oferece código de referência para assinatura, token refresh, métodos de API e contratos.
2. SellBridge (MIT): https://github.com/HanielCota/SellBridge — interface de conectores, filas/idempotência, recuperação de jobs, importação de catálogo CSV/XLSX, diagnósticos e API versionada. IMPORTANTE: o README informa que o conector Shopee real AINDA NÃO ESTÁ implementado; não tratá-lo como solução pronta.
3. AI Cross Border Ecommerce Agent Toolkit (MIT): https://github.com/heqiangdiao-wq/AI-Cross-Border-Ecommerce-Agent-Toolkit — agentes de pesquisa, estratégia SKU, listing, imagem, vídeo, Ads e avaliações; fórmulas e playbooks verificáveis. Não é ERP nem conexão Shopee funcional.
4. OmniTradeERP (MIT): https://github.com/nplszfl/OmniTradeERP — ideias para preço, previsão de estoque, anomalias e métricas; stack Java/Spring diferente do Cloudflare, não migrar.
5. EasyCb Go (MIT): https://github.com/easycb/easycb-go — estrutura multi-marketplace; Go é referência, não dependência para nossa UI/Workers.

## Constatações e cautelas

- Documentação comunitária != licença de endpoint na nossa conta. A API oficial pode variar por região, categoria do app, escopo e versão. Não realizar chamadas vivas sem autorização específica.
- O repositório Shopee SDK documenta perda de eventos push, lista de mensagens perdidas e confirmação de consumo. Confirmar last_message_id pode consumir TODAS as mensagens anteriores; o processo real deve primeiro autenticar payload, persistir, deduplicar e só então confirmar. Não copiar literalmente exemplos de Express ou assinatura sem confrontar docs oficiais.
- O guia llms.txt do SDK relata problemas históricos de método HTTP em get_escrow_detail_batch (GET/POST). A fonte correta deve ser o schema/versionamento atual da Shopee para a loja; testes de integração negativos e de timeout são indispensáveis.
- Shopee Ads pode exigir permissão especial e alguns endpoints foram descontinuados. Somente leitura/cenário nesta etapa; Ads/PROMO LOCKED.
- Token storage padrão do SDK usa Node fs e não deve ser levado para Cloudflare Workers; nossa fronteira Auth já existe.
- CSV/XLSX, título, quantidade, proporção de fotos, limite de 100 por operação e faixas de tarifas são requisitos a verificar na Open Platform/Seller Centre; os limites do protótipo Listing Factory são REGRAS INTERNAS de revisão, não promessa de conformidade oficial.
- Não copiar tabelas estimadas de tarifa do toolkit como tarifa Shopee Brasil. Usar apenas regras versionadas e observadas no Seller Centre.
- Não trazer scraping sensível, bot de cookies, RMT, falsos pedidos/avaliações ou ferramentas que driblem a Shopee.

## Fases de implementação ordenadas

| Fase | Prioridade | Função | Dependência | Gate |
| --- | --- | --- | --- | --- |
| F0 | P0 | Manter V3.6 PR #48 e M3 Observer PR #47 intactas | CI + QA owner | Main e deploy confirmados separadamente |
| F1 | P0 | Auditar capacidades por app/loja/endpoint, evidência de escopo e permissão | Open Platform + autorização explícita | Desconhecido não autoriza |
| F2 | P0 | MLS Listing Factory: preparar anúncio de camisetas/DTF em lote local, 5-9 imagens de acordo com política interna, SKU, tamanhos, preço e quantidade | Fichas do operador; custos/estoque reais necessários para publicação | Só DRAFT_ONLY, nenhuma rede |
| F3 | P0 | Finance: estudar escrow batch e relatórios; casar por pedido sem misturar mês de criação, liberação e banco | M2 issue #50 + método da API oficial | Sem ajuste financeiro antes de reconciliação |
| F4 | P1 | Push: receber eventos autenticados, idempotência, cursor e recuperar mensagens perdidas | Push capability oficial, assinatura validada | ACK somente após persistência e processamento |
| F5 | P1 | UI owner: formulário e upload local de imagens, preview/lotes, export JSON/CSV interno, status de validação, fila de revisão | F2 validado | Sem escrita externa |
| F6 | P1 | Publicação oficial em lote e media upload por API, com limite real, retorno assíncrono e dedupe por ref | App com permissão, M6 aprovação, price/stock verificados | Requer approval e audit logs; ADS/PROMO não alterados |
| F7 | P1 | MLS Ads inteligência: diagnóstico com fontes diretas vs amplas; ROAS break-even por SKU só com atribuição compatível | Ads API + M3 | Shadow, sem escrever |
| F8 | P2 | MLS Creative: título/descrição/9 imagens/mockup e análise de avaliações para corrigir listagens | regras oficiais por categoria, direitos sobre imagens | propostas revisadas, nunca publicação automática |
| F9 | P2 | Conector genérico para TikTok/ML | APIs e credenciais reais | sem conectores fictícios |

## Recursos concretamente implementados na PR #51

- web/cloudflare/src/mls-shopee-capability-audit.mjs: matriz de oito candidatos, todos desconhecidos por padrão; grants documentais NÃO habilitam IO/escrita.
- web/cloudflare/src/mls-listing-factory-planner.mjs: manifesto de 1 a 500 anúncios divididos em grupos internos de 100, análise de mockups, títulos, variações e estoque declarado. READY_FOR_OPERATOR_REVIEW não é READY_TO_PUBLISH.
- web/cloudflare/src/mls-lost-push-recovery.mjs: deduplicação só de metadados e fila de eventos em memória; nunca confirma consumo.
- tools/mls_listing_factory_cli.mjs: somente arquivo local, inspeção de cabeçalho PNG/JPEG e SHA-256, gera JSON de revisão. Não carrega imagens nem envia dados.
- web/cloudflare/tests/mls-listing-factory-foundations.test.mjs: testes negativos e de fluxo de arquivo/lotes.

Nenhuma API, endpoint, D1, financeiro, cron, autenticação, layout aprovado, preço real, Ads ou Shopee deve ser alterado nesta PR.

## Execução delegável

A implementação da interface está detalhada na issue #52. A auditoria do escrow batch está na issue #53. O webhook/replay está na issue #54. Todas mantêm a issue #50 como gate financeiro externo e a PR #51 como base de módulos offline.

## Critérios para fechar este levantamento

A documentação só é guia até a execução. Para cada API futura: confirmar licença/versão, grant/escopo, método, limites, paginação, retry, idempotência, estabilidade temporal, segurança do callback, compatibilidade Worker, QA sandbox e um pequeno piloto autenticado. Registrar os resultados no checkpoint sem presumir sucesso.
