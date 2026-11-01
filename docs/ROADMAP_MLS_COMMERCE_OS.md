**M2.2b PR99 publicada no App — 01/11/2026:** ledger interno de produção declarada por peça/lote, com data de fabricação em Brasília, fotografia imutável do custo ou UNKNOWN, resumos semanais/mensais independentes e correção por anulação/substituição auditada. Quantidade DTF/kit não vira produção e CANCELLED não apaga os registros. “Referência de custo das vendas” permanece separada; sem dupla soma no resultado, valoração, reserva, revenda ou estoque externo. App `c33b1d03`; Auth/Finance e configuração preservados. CI 41347493170 verde: 3.099 Node, 67 Python e QA local/simulada normal/minificado 320/1365. Nenhum fato real de fabricação foi lançado para QA; uso real do proprietário não executado. M2 e M2.2 continuam abertas. [Registro do ledger](MLS_M22_INCURRED_PRODUCTION_2026_11_01.md).

**Registro histórico da primeira etapa M2.2 PR98 — 01/11/2026:** controle interno de recebimento, quarentena e inspeção, com entregas parciais, referências únicas por caso, CAS, auditoria e repetição idempotente. Identidade e quantidade são declaradas pelo operador; itens/quantidade originais ainda não verificados. Avaliação UNKNOWN, sem integração financeira, reserva, revenda ou estoque externo. App `2157c238`; Auth/Finance e configuração preservados. CI 41344331375 verde: 3.056 Node, 67 Python e Chromium local/simulado normal/minificado 320/1365. Uso físico real do proprietário não executado; M2 e M2.2 permanecem abertas. [Registro da etapa](MLS_M22_PHYSICAL_RETURNS_2026_11_01.md).

**Registro histórico da auditoria PR97, base PR96 — 01/11/2026:** M2 permanece aberta. Custos de vendas elegíveis não são um ledger de produção incorrida; recebimento físico, inspeção, estoque reaproveitável e vínculo da revenda ainda não estavam implementados nessa base. Nova prioridade M2.2 especifica esses controles e separa caixa, estoque e custo consumido, sem criar custos/quantidades por inferência. Auditoria da base PR96: 232 arquivos, 120 documentos de texto, 29 JSON, cinco ferramentas históricas e 78 imagens inventariadas; 217 links locais originais válidos. Alteração somente documental; naquele corte a última runtime publicada era PR96. [Relatório](MLS_RETURNS_REUSE_ROADMAP_AUDIT_2026_11_01.md).

**Margem parcial e ROAS PR96 publicados — 01/11/2026:** a Visão geral mostra a margem do saldo conhecido antes das despesas não declaradas. ROAS atualiza antes dos gráficos; falhas de painel ficam isoladas, com tabela e escopo antigos removidos. Um dia Ads válido informa o índice sem inventar curva ou comparação. App `27356953`; Auth/Finance e configuração preservados. CI 41334582368 verde: 3015 Node e 67 Python, sem skips; Chromium normal/minificado 320/1365 e replay real com falha injetada aprovados. Despesas de novembro continuam desconhecidas, sem zero presumido. A exceção exata do navegador do proprietário não foi capturada; M2/banco permanecem abertos. [Registro](MLS_DAILY_MARGIN_ROAS_2026_11_01.md).

**Correção do resultado de hoje PR95 publicada — 01/11/2026:** despesas de novembro ainda não declaradas eram ocultadas pelo cartão. A Live mostra o saldo parcial com motivo e acesso direto à confirmação; lucro/margem/gráficos continuam desconhecidos até a declaração. Hoje acompanha Brasília, datas históricas e rascunhos são preservados, e salvar despesas atualiza a leitura imediatamente. App `47e3de73`; Auth/Finance e configuração preservados. CI 41332958729 verde: 3.005 testes Node e 67 Python; Chromium normal/minificado 320/1365 e replay local da leitura real aprovados. Nenhuma despesa real presumida como zero. M2 e confronto Seller Centre/banco continuam abertos. [Registro](MLS_TODAY_ESTIMATED_PROFIT_2026_11_01.md).

> **Release M2 PR94 publicada — 01/11/2026:** conciliação automática alterna o mês atual e o anterior. Cron natural confirmou 3/3 relatórios de outubro na mesma publicação (3 CHECKED, 0 ainda em conferência), com fonte, revisão, datas e cobertura conferidas. App `1a6ca4c3`; Auth/Finance preservados. CI 41325746160 verde: 2.977 testes Node e 67 Python, sem skips, incluindo Chromium. Primeira auditoria fria usa 48 de 50 chamadas permitidas. A recuperação histórica inclui o corte final real de Brasília. M2, confirmação de devoluções e confronto Seller Centre/banco continuam abertos. [Registro](MLS_M2_PREVIOUS_MONTH_RETURNS_2026_11_01.md).

> **Release M2 PR93 publicada — 01/11/2026:** paginação durável do Pending validada na conta: 2 páginas, 182 registros e 182 pedidos. Encerramento e publicação App/Finance conferidos. Navegação local de 50 registros por página, sem novas consultas ao navegar; última lista completa preservada. App `2280e3b1`, Auth `37bead27`, Finance `e0b258a2`. CI 41318567672 verde: 2.908 testes Node, 67 Python e Chromium. Bytes, configurações, domínios, flags e cron conferidos. A varredura concluída não confirma saldo atômico, lucro mensal ou recebimento bancário; M2 e fechamento continuam abertos. [Registro](MLS_M2_PENDING_PAGINATION_2026_11_01.md).

> **Release M2 PR92 publicada — 31/10/2026:** Pending recuperado e primeira página real validada (100 registros; continuação: sim), sem paginação nova. Pendências com evidências para Hermes, checklist de fechamento e navegação responsiva consolidados na Live. App`c8ab272d`, Finance`c1e31d3f`, CI41243934697 verde:2.842Node/67Python/Chromium. Bytes/config/flags/cron conferidos. Seller Centre/banco ainda NÃO COMPARADOS; M2 permanece aberta. [Registro](MLS_M2_PENDING_CLOSEOUT_2026_10_31.md).

# Roadmap canônico — MLS Commerce OS


**Release M2 PR91 publicada — 31/10/2026:** calendários dos três meses anteriores em rodízio, retomada após virada e correção de COMPLETE cujo corte ainda não fecha o mês. App `7bd0dfa7`, CI41229871797 verde:2.772Node/67Python/Chromium; bytes/config/Auth/Finance preservados. Cron natural do incremento na versão64174a2e iniciou setembro às15:37:56Brasília:1página/1registro/1de5intervalos,RUNNING, sem erro e com escopo exato. Próximo: acompanhar conclusão e conciliar Returns/Pending/Seller Centre/banco; M2 aberta. [Registro](MLS_M2_HISTORICAL_CALENDARS_2026_10_31.md).

**Release M2 PR90 publicada — 31/10/2026:** acompanhamento de repasses ligado à fila, primeira conferência com cooldown próprio e recuperação limitada das referências expiradas do mês anterior. App `17c1e9f1`, CI41218926278 verde:2.637Node/67Python/Chromium, bytes/config/Auth/Finance preservados. Cron real confirmou setembro com fontes e calendário ausentes, sem inventar recebimento. Próximo: observar a recuperação, preencher calendários históricos e conciliar Returns/Pending/Seller Centre/banco; M2 continua aberta. [Registro](MLS_M2_RELEASE_TRACKER_2026_10_31.md).

**Release PR89 publicada — 31/10/2026:** memória dos agentes gravada automaticamente e usada nos detalhes das análises Hermes, ROAS diário real e indicadores com datas no visual aprovado. App `66e9c01f`, CI41206928254 verde2.536Node/67Python/Chromium; configuração e Auth/Finance preservados. Primeiro corte natural conferido:publicação14306,3intervalos/23páginas,zero erro. Memória descritiva não comprova eficácia de uma recomendação nem lucro bancário. [Registro](MLS_AGENT_MEMORY_PERFORMANCE_2026_10_31.md).

**Pedido do proprietário — 31/10/2026:** agentes devem melhorar com informações da operação, executar rotinas conhecidas dentro dos limites existentes e apresentar relatórios, solicitando confirmação para ações novas ou arriscadas. Incremento em validação: memória factual com correções/recorrências, ROAS diário de Ads e indicadores visuais no estilo aprovado. Não habilita execução comercial ou treino automático do modelo. [Registro](MLS_AGENT_MEMORY_PERFORMANCE_2026_10_31.md).

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

**Release Live PR #86 conferida:** visual e módulos preparados integrados à
main PR85, com rascunhos AI Sales persistentes. CI 41157082180: 2.382 Node,
67 Python e Chromium aprovados; App oficial versão `2ffcefb4` com ambas flags
owner ativadas, código/bindings/cron verificados. Auth/Finance preservados.
Registro completo: [release Live](MLS_LIVE_ROADMAP_RELEASE_2026_10_30.md).
M2 e integrações externas continuam abertas.

## Estado atual — entrega na versão Live, 30/10/2026

O proprietário autorizou: **“Implemente todas as melhorias na versão Live, e
continue assim com todo o próximo roadmap sem quebrar a versão ativa.”** Os
próximos incrementos validados têm como destino a versão oficial; ambiente
separado será usado apenas quando necessário. Essa orientação substitui as
restrições históricas de merge/deploy das PRs de preparação. Ela não autoriza
gastos, mudanças de OAuth nem escritas comerciais Shopee/TikTok/Ads.

Base oficial: `2ab4c9d8baa3c25e5816bcca14b4a0973ea73d5a` (PR #85).
As melhorias preparadas até `4c149a7e818306ddd91419494e75a12b6e14c1f4` foram
reconciliadas no commit `b17df54`, branch
`release/live-roadmap-improvements-20261030`, preservando a correção de
cancelamentos e a atualização histórica. A validação e a persistência do
workspace AI Sales foram concluídas tecnicamente e publicadas no App oficial
pela PR #86. CI, hashes, versões e conferência pós-publicação ficam no
[registro do release Live](MLS_LIVE_ROADMAP_RELEASE_2026_10_30.md).

O pacote preparado inclui o visual das seis referências e demais painéis,
gráficos com fontes verificadas, busca V3.6, catálogo/custos e DTF, Listing
Factory com SKUs/variações preservados, Products/Pricing observador, Hermes na
mesma publicação financeira e as cinco abas nativas do AI Sales. O render real
Node/FFmpeg continua fora do Worker; CRM, propostas e desempenho são assistidos.
As flags owner-only de V3.6 e AI Sales são independentes e sua ativação Live
precisa ser conferida no release, sem abrir acesso de review.

O acesso à API Cloudflare está verificado; “Cloudflare não autenticada” abaixo
descreve a criação histórica da prévia, não o ambiente atual. A prévia sintética
da PR #84 continua preservada. Sessão real do proprietário e aprovação humana
visual/auditiva não foram comprovadas por fixtures.

**M2 permanece aberta**: Seller Centre, Pending, devoluções, liberações e banco
exigem evidência real. LLM/voz neural dependem de provedor e orçamento
configurados; mídia exige direitos e bytes autorizados; publicação/afiliados
externos dependem dos grants oficiais por loja. Ads/PROMO e escritas comerciais
continuam LOCKED. M3–M9 não estão declaradas integralmente concluídas.

## Histórico de preparação — não substitui o estado acima

Prévia de homologação na PR DRAFT #84: https://github.com/MatheusLemosDS/MLS-Ecommerce-Ads/pull/84 · implementação 1574f9e · 2.327 Node/67 Python aprovados, App/Auth/Finance inalterados. Na criação da prévia, o acesso seguro à Cloudflare ainda era dependência para homologação online.

Homologação local — registro histórico de 30/10/2026: branch `feature/mls-owner-homologation-preview-20261030`, baseada na PR #83. Servidor Worker/SQLite real com dados sintéticos e exportação HTML interativa; sem alteração do App/Auth/Finance. Consultar `docs/MLS_OWNER_PREVIEW_CHECKPOINT.json` e `docs/MLS_OWNER_HOMOLOGATION_2026_10_30.md`. Naquele corte não existia URL de homologação nem acesso Cloudflare; merge/deploy ainda não estavam autorizados. Essas duas restrições foram substituídas pela orientação Live acima; escritas comerciais seguem bloqueadas.

PR de integração DRAFT #83: https://github.com/MatheusLemosDS/MLS-Ecommerce-Ads/pull/83 · commits f513dca/54b87e5 · local2308Node/67Python,40capturas · Appa5ba3298…bbfb91c8. Conferir checks do HEAD; semmerge/deploy.

### Roadmap anterior preservado

Atualizado em **30/10/2026**.

> **Corte histórico de preparação — 30/10/2026:** PR #79 congelada com CI verde `e7ce5009`/41131654577 e seis PNGs originais versionados. A branch `integration/mls-commerce-os-ai-sales-20261030` integra a preservação de SKUs, Products/Pricing observador e MVP local AI Sales com três MP4s reais PT-BR e cinco abas nativas; regressão final registrada no [checkpoint da missão](MLS_MASTER_MISSION_CHECKPOINT.json). [Guia de homologação e limites](MLS_AI_SALES_INTEGRATION_2026_10_30.md). Nesse corte não houve merge/deploy/writes. M2, QA owner, grants e acesso LLM continuavam externos; nenhum lucro bancário foi inventado.



**Orientação operacional de 30/10/2026:** os próximos incrementos validados têm
como destino o app oficial. Ambiente separado só quando necessário; a prévia
demonstrativa já criada na PR #84 continua disponível. A correção de atualização
de cancelamentos parte da main `a96bb1c`, sem integrar as branches visuais/AI.
Ver [auditoria e entrega](MLS_CANCELLED_DAILY_PROFIT_2026_10_30.md).

PR #85: correção de atualização de cancelamentos publicada no App/Finance
oficiais e verificada pela API Cloudflare; CI 41155020856 verde com 2.129 Node,
67 Python e Chromium. M2 permanece aberta para conciliação financeira real.

> **Checkpoint multi-branch 28/10/2026:** A main continua em b058e832 (PR #46 integrada); PR #48 de busca V3.6 segue draft/CI verde (2.115 Node + 67 Python); PR #47 M3 Products/Pricing Observer segue draft/CI verde (2.124 Node + 67 Python); PR #51 abre a pesquisa Shopee/Listing Factory, com CI inicial verde (2.122 Node + 67 Python). Nenhuma dessas três PRs foi integrada ou publicada. **M2 Finance continua aberta (issue #50).** A M3 de precificação comercial não está aprovada.
>
> Execução rastreada: issue #50 (M2), #52 (Listing Factory UI), #53 (escrow batch), #54 (push).
>
> Guia da pesquisa e implementação: [SHOPEE_RESEARCH_TO_MLS_2026_10_28.md](SHOPEE_RESEARCH_TO_MLS_2026_10_28.md) · [MLS_CODEX_HANDOFF_2026_10_28.md](MLS_CODEX_HANDOFF_2026_10_28.md) · [MLS_LISTING_FACTORY_V1.md](MLS_LISTING_FACTORY_V1.md).

> **ESTE É O ROADMAP CANÔNICO DO PROJETO.**
> Toda nova conversa, conexão, sessão do Codex ou continuidade deve começar por este arquivo e por
> [MLS_COMMERCE_OS_CHECKPOINT.json](MLS_COMMERCE_OS_CHECKPOINT.json).
> O arquivo `ROADMAP_BRAZACOMMERCE.md` passa a ser histórico e não deve receber novas decisões de produto.

## 1. Identidade oficial

**Nome do produto:** MLS Commerce OS  
**Posicionamento:** sistema operacional inteligente para e-commerce.  
**Inteligência central:** MLS Hermes.  
**Objetivo:** reunir operação, finanças, produtos, Ads, produção, criativos, marketplaces e automação em uma única plataforma, com agentes especializados que observam, recomendam, executam dentro de limites e auditam o próprio trabalho.

A marca anterior **BrazaCommerce** permanece somente como legado técnico durante a migração segura.

### Regra de migração de nome

Nesta fase, mudar primeiro tudo que o usuário vê. **Não renomear ainda:**

- Workers `brazacommerce-app`, `brazacommerce-auth` e `brazacommerce-finance`;
- bindings e bancos D1;
- domínio `app.brazacommerce.com.br`;
- cookies, headers `X-Braza-*`, nomes de schemas, tabelas e chaves persistidas;
- rotas públicas/privadas;
- identificadores usados por Cloudflare, Shopee, Hermes ou testes de compatibilidade.

Esses nomes são aliases técnicos de compatibilidade. A migração interna só acontece em fase própria, com alias, rollback e teste de produção.

## 2. Referência de produto e experiência

A referência visual/produtiva informada pelo operador é o ecossistema apresentado pelo Seller.IA Club/Instagram: interface limpa, especialistas em um único lugar, diagnóstico executivo e acesso rápido às ações.

O MLS Commerce OS **não deve copiar a interface literalmente**. A referência define o nível mínimo esperado de clareza e percepção de produto. Nossa meta é ir além, conectando os especialistas a uma mesma base operacional e permitindo autonomia progressiva, auditável e limitada.

### Central de Comando — experiência alvo

A tela inicial deve responder rapidamente:

- lucro estimado hoje;
- vendas hoje;
- pedidos pagos;
- margem;
- gasto de Ads;
- TACOS/ROAS quando a base for compatível;
- devoluções e reembolsos;
- repasse previsto;
- despesas e vencimentos;
- alertas prioritários;
- produtos campeões e produtos em risco;
- estado dos agentes.

Os detalhes técnicos continuam disponíveis por drill-down, sem competir com o resumo executivo.

## 3. Arquitetura multiagente

Todos os agentes usam a **mesma verdade operacional**. Um custo alterado em Produtos deve repercutir em Financeiro, Pricing, Ads e Hermes sem cópias divergentes.

### MLS Hermes — Supervisor

Responsável por:

- receber e resumir os estados dos agentes;
- ordenar prioridades;
- detectar conflitos entre recomendações;
- verificar permissões e limites antes de qualquer ação;
- encaminhar tarefas ao especialista correto;
- explicar ao operador o que aconteceu, por quê e com quais evidências.

Hermes não deve inventar dados ausentes nem ignorar bloqueios de confiabilidade.

### Agentes especializados

| Agente | Responsabilidade principal | Estado inicial |
| --- | --- | --- |
| **MLS Finance** | lucro diário/mensal, repasses, DAS, despesas, caixa e conciliação | Base existente; transformar em agente observador |
| **MLS Ads** | ROAS, TACOS, CPA, orçamento, escalar/manter/otimizar/pausar | Leitura existente; execução LOCKED |
| **MLS Pricing** | preço mínimo, preço ideal, margem, ponto de equilíbrio e ROAS mínimo | Planejado |
| **MLS Products** | SKUs, curva ABC, contribuição, cadastro, oportunidades e qualidade dos dados | Base parcial existente |
| **MLS Production** | pedidos, fila DTF, artes, lotes, gargalos e estado operacional | Base DTF existente |
| **MLS Creative** | mockups, fotos, títulos, descrições, criativos e vídeos | Planejado |
| **MLS Inventory** | estoque vendável, reservas, cobertura e reposição | Bloqueado por contrato de estoque |
| **MLS Marketplace** | Shopee, TikTok Shop, Mercado Livre e sincronização | Shopee primeiro; demais progressivos |
| **MLS Returns** | cancelamentos, devoluções, reembolsos e impacto financeiro | Base existente; conciliação incompleta |
| **MLS Auditor** | qualidade dos dados, consistência, permissões e auditoria dos agentes | Evoluir a partir das auditorias existentes |

## 4. Contrato mínimo de cada agente

Cada agente deve ter um estado persistente ou projetável com:

- `agent_id` e versão do contrato;
- modo de autonomia;
- status: saudável, trabalhando, atenção, bloqueado ou erro;
- última análise e próxima execução;
- fontes e idade dos dados;
- tarefas abertas;
- recomendações propostas;
- ações aprovadas;
- ações executadas;
- resultado observado;
- evidências/referências da decisão;
- permissões;
- limites financeiros e operacionais;
- motivo explícito de bloqueio;
- trilha de auditoria.

Agentes não podem usar texto do modelo como única evidência para movimentar dinheiro ou alterar campanhas.

## 5. Modos de autonomia

### OBSERVER — Observador
Analisa, explica e abre tarefas. Não altera sistemas externos.

### ASSISTED — Assistido
Propõe uma ação concreta e exige aprovação explícita do operador antes da execução.

### AUTONOMOUS — Autônomo limitado
Executa somente ações que estejam dentro de políticas persistidas e verificadas no backend.

Uma ação autônoma de Ads, por exemplo, só poderá acontecer se as regras exigidas estiverem satisfeitas: margem mínima, limite diário/mensal, qualidade dos dados, estoque/cobertura, frequência máxima de alteração, perda máxima e ausência de bloqueios financeiros.

**Ads/PROMO permanece LOCKED até a fase específica de escrita oficial e piloto controlado.**

## 6. Estrutura de navegação alvo

A evolução da interface deve convergir para:

1. **Início** — Central de Comando.
2. **Agentes** — equipe digital e fila de trabalho.
3. **Financeiro** — MLS Finance + MLS Returns.
4. **Produtos** — MLS Products + MLS Pricing.
5. **Produção** — MLS Production.
6. **Ads** — MLS Ads.
7. **Criativos** — MLS Creative.
8. **Automação** — políticas, aprovações e execuções.
9. **Marketplaces** — MLS Marketplace.
10. **Histórico** — auditoria completa.

No celular, priorizar Início, Agentes, Produtos, Produção, Ads e Mais.

## 7. Fases da conversão MLS Commerce OS

### M0 — Branding seguro e continuidade canônica — **PUBLICADO**
- [x] Definir nome MLS Commerce OS.
- [x] Definir MLS Hermes como supervisor.
- [x] Definir família inicial de agentes.
- [x] Definir Observer / Assisted / Autonomous.
- [x] Criar este roadmap canônico.
- [x] Criar checkpoint de continuidade.
- [x] Iniciar troca do branding visível no login, gestão e Ads.
- [x] Validar suíte/CI e publicar o branding pela PR #11.
- [ ] Conferir visual real autenticado em desktop e celular.
- [ ] Manter aliases técnicos antigos sem renomear infraestrutura.

**Critério de saída:** marca nova publicada sem regressão, roadmap canônico e checkpoint apontando para a versão publicada.

### M1 — Central de Comando + Agent Registry — **PUBLICADO**
Criar uma nova home seguindo a hierarquia visual definida:

- faixa executiva Hoje;
- lucro/vendas/Ads/margem/pedidos/alertas;
- bloco “Seus agentes”;
- status e última atividade de cada agente;
- prioridades do dia;
- caixa de conversa/ações do MLS Hermes;
- detalhes antigos recolhidos por drill-down.

Implementar primeiro um **Agent Registry somente leitura**, sem criar novas chamadas à Shopee. Os agentes devem projetar o estado das fontes já existentes.

Agentes iniciais na tela:
1. MLS Finance;
2. MLS Ads;
3. MLS Products;
4. MLS Production;
5. MLS Returns;
6. MLS Auditor;
7. MLS Hermes Supervisor.

**Critério de saída:** a Central de Comando deve conseguir dizer “o que está acontecendo e o que precisa de ação” usando apenas dados existentes, sem executar alterações comerciais.

**Publicação:** PR #12, merge `91fc0cf169f67a9440a8e58a033c925b9ce98eed`. Agent Registry em modo Observer, sem chamadas externas adicionais, com CI 2.008 + 67 e deploy dos três Workers confirmado.


### M1.1 — Redesign Mission Control (opção 3) — **INTEGRADO / VALIDAÇÃO VISUAL PENDENTE**

Entrega visual solicitada e aprovada pelo operador em 27/10/2026.
A PR #29, merge `2522f33132563d19704c6f6c57ff4206067bc2ab`,
transforma a Central de Comando em um overview executivo mais enxuto e abre
**uma tela individual** ao selecionar cada agente (tabs com URL estável):

- `/admin?tab=agents`: Hub da equipe, status e navegação.
- `/admin?tab=agent-finance`: MLS Finance, com os mesmos controles e nós de
  lucro diário/mensal, Pending, conciliação e despesas, sem duplicar o D1.
- `/admin?tab=agent-ads`: MLS Ads, leituras observadas e links para campanhas
  e Ads atuais sem execução externa.
- `/admin?tab=agent-products`: MLS Products, cobertura de custos e catálogo.
- `/admin?tab=agent-production`: MLS Production, referência DTF e custos.
- `/admin?tab=agent-returns`: MLS Returns, estados, alertas e conciliação.
- `/admin?tab=agent-auditor`: MLS Auditor, diferenças e confiança nas fontes.
- `/admin?tab=agent-hermes`: MLS Hermes e seu controle de coleta já existente.

Identidade visual: tema premium/futurista, acentos próprios por agente,
cards, navegação hierárquica, responsivo e `prefers-reduced-motion`.
**Não exibir gráficos históricos inventados:** as telas usam os snapshots
financeiros já existentes, com valores ausentes como desconhecidos. Pricing,
Creative, Inventory e Marketplace aparecem apenas como **planejados**.

Nenhuma mudança no backend, na autorização Shopee, nos bancos D1, nos
cron triggers, nos schemas, no cálculo de lucro ou nas permissões Ads/PROMO.

Validação PR #29: **2.080 testes Node + 67 Python**, incluindo Chrome real
de navegação entre Central de Agentes, Finance e Returns. CI final da
`main` reexecutado com sucesso; builds Cloudflare App/Auth/Finance `SUCCESS`.
PR #30 corrige apenas teste financeiro intermitente sobre dígitos acidentais
em hashes; não modifica runtime. CI final `main` run `40585084151` sucesso. O primeiro disparo de builds do merge da PR #29 falhou; a PR #30 (somente teste, mesmo código App) publicou as três versões com SUCCESS, identificadas no checkpoint.

**M2 continua sendo a fase de negócio atual.** Este redesign é uma melhoria
de UX da M1, não uma antecipação de Pricing, Ads autônomo ou M3. Falta apenas
a conferência visual autenticada do novo layout e o gate financeiro M2.

### M1.2 — Refinamento visual Mission Control V2 — **PUBLICADO / APROVAÇÃO VISUAL PENDENTE**

## 27/10/2026 — Mission Control V2 corrigido para refletir a opção 3

O operador rejeitou a primeira implementação visual por ainda parecer o
layout anterior. A **PR #31** (merge `74e23ff5f8bd7888f54b98a61ff20e82fa10a583`)
refez o próprio cockpit da Visão Geral, não só o link dos agentes:
hero orbital azul-naval do Hermes, seis cartões com avatares robóticos
neon por especialidade, métricas coloridas, comparação dos três valores
monetários observados do dia e distribuição dos estados reais dos agentes.

A Central de Agentes e os sete workspaces individuais ganharam avatares
maiores, cabeçalhos de vidro escuro, gradientes coloridos, subtabs e
painéis mais legíveis, em desktop, mobile e tema claro/escuro. O modo
escuro foi **inspecionado em screenshot real do Chrome**, com a captura
gerada apenas de um cenário de teste sem dados de loja. A captura
temporária foi removida do código final de CI.

**Validação:** PR run `40589733166` e main `40589983415`,
**2.082 Node / 0 falhas + 67 Python**. Teste Chromium real confirma
seis agentes, nenhum placeholder restante, gradientes calculados, ícones,
dois painéis de observação, ausência de valores fictícios e zero erros JS.
Check-runs Cloudflare para App/Auth/Finance **SUCCESS** no merge V2.

Sem mudanças no backend, banco, custos, OAuth, contratos Shopee, cron ou
Ads/PROMO. Gráficos de barras do dia só usam vendas/lucro estimado/gasto
Ads do snapshot realmente validado; proporção de agentes saudáveis é
contagem do Agent Registry, **não** rentabilidade nem lucro comprovado.

**A aprovação visual final segue pendente** após login no dispositivo do
operador. Fase financeira continua **M2**, Pending atual e repasses
devem ser comparados ao Seller Centre antes de fechar; sem compromisso
de competência ou liquidação bancária.

### M2 — Finance/Returns confiáveis como agentes observadores — **EM ANDAMENTO / PONTO DE RETOMADA**
Continuar a fase financeira atual:

- fechar cruzamento de liberações por pedido;
- exibir valor de devolução/reembolso por situação;
- identificar diferenças, duplicidades e referências sem correspondência;
- manter lucro realizado desconhecido quando não houver liquidação comprovada;
- transformar pendências em tarefas do MLS Finance/Returns;
- adicionar vencimentos de despesas e contas no resumo do agente.

**Incremento publicado — PR #13:** conciliação de liberações por pedido com repasse-base, ajuste, repasse após ajuste, valor liberado verificável e cruzamento local com devoluções. Estados `NOT_LOCATED`, `AMBIGUOUS`, `LOCATED_UNVERIFIED` e `VERIFIED`. O sidecar v2 reutiliza a coleta/cache existentes; não cria endpoint Shopee, tabela D1 ou polling. [Detalhes](CONCILIACAO_POR_PEDIDO_MLS_FINANCE_RETURNS.md).

**Incremento publicado — PR #14:** acompanhamento temporal separa o mês de criação dos pedidos dos calendários de liberação posteriores. O contrato privado `release-coverage-v1` lê somente a coorte e os ledgers já salvos no Finance, sem capability de rede Shopee. O tracker acompanha uma coorte anterior por cron, preserva falhas, desacelera após identidade completa no corte e mostra a cobertura para meses passados. `identity_complete_at_cutoff` não comprova fim do ciclo, depósito bancário ou saldo ainda a liberar.

**Incremento publicado — PR #16:** o MLS Finance agora lê o `get_income_overview` em background e mostra **Pendente atual na Shopee** separado do mês. Para a loja local, o contrato atual diferencia `Released` e `Pending`; `pending_amount` é tratado como snapshot atual, não como competência, depósito bancário ou lucro. O round-robin financeiro passa a `RELEASES -> RETURNS -> INCOME` sem aumentar o orçamento de uma leitura privada por oportunidade. [Pesquisa](PESQUISA_INCOME_OVERVIEW_SHOPEE_2026_10_27.md).

**Incremento publicado — PR #18:** o MLS Finance agora resume **contas atrasadas, vencendo hoje, próximos 7 dias e próximo vencimento** a partir das datas declaradas no ledger. O `business-month-view-v4` reutiliza o mesmo `LEFT JOIN` mensal já existente, sem query D1 adicional, tabela nova, polling ou chamada Shopee. `NOT_ITEMIZED` continua desconhecido em vez de zero; marcar como pago permanece controle interno e não comprova liquidação bancária.

**Incremento publicado — PR #19:** o MLS Finance agora coleta `get_income_detail` para **Pending atual** somente quando o Income Overview confirma valor pendente maior que zero. A primeira página mantém até 100 registros, `has_more` sinaliza cobertura parcial e `order_sn` nunca sai do Finance Worker: a UI recebe apenas hashes internos, moeda, status, escrow estimado e previsão de liberação. O bloco **Pending atual por pedido** faz somente leitura local D1 ao ser aberto. O round-robin financeiro passa a `RELEASES -> RETURNS -> INCOME -> INCOME_DETAIL`, mantendo uma leitura privada por oportunidade. [Pesquisa](PESQUISA_INCOME_DETAIL_SHOPEE_2026_10_27.md).

**Incremento publicado — PR #21:** o MLS Finance agora audita localmente o Pending atual antes de qualquer paginação: compara de forma descritiva o `pending_amount` do Overview com o subtotal visível de `estimated_escrow_amount`, registra cobertura, `has_more`, quantidade de valores convertíveis e sincronia dos snapshots. `OBSERVED_MATCH` não prova saldo/competência; `OBSERVED_DIFFERENT` vira validação no Seller Centre, não erro contábil. A seção fechada continua sem leitura D1 extra e a auditoria não cria chamada Shopee. [Detalhes](AUDITORIA_PENDING_ATUAL_MLS_FINANCE.md).

**Estado atual desta fase — 01/11/2026:** a PR93 já validou paginação durável do Pending em duas páginas, com 182 registros/pedidos no corte observado; a PR94 confirmou os três relatórios de Returns da publicação de outubro. Essas evidências não são cobertura permanente, desfecho de reembolso, recebimento físico ou depósito bancário. Ainda faltam reconciliar as situações em revisão, conferir o calendário de liberações da publicação exata, declarar despesas do mês e confrontar Seller Centre/banco no mesmo recorte. Manter `remaining_receivable` separado do Pending atual; horizonte esgotado não prova ausência de liberação posterior.

**Critério de saída:** período completo conciliado com explicação de cada diferença material.

### M2.1 — Shopee API: auditoria de permissões e robustez financeira (pesquisa 28/10)

Esta é uma trilha técnica independente que **não substitui o gate de saída da M2**:

- [x] Levantar SDKs da API oficial, ERP/filas e Agent Toolkit, registrando links, licenças, limitações e riscos na pesquisa canônica.
- [x] Adicionar matriz offline de capacidades candidatas (PR #51). UNKNOWN/DENIED bloqueiam; uma evidência GRANTED isolada jamais autoriza executar chamadas.
- [x] Planejar recuperação de push perdida com deduplicação somente de metadados e confirmação bloqueada até persistência (PR #51).
- [ ] Operador verificar categoria do app, escopos, região BR, endpoints disponíveis, validade da autorização Finance e dados do Seller Centre, sem compartilhar tokens.
- [ ] Validar contrato/método GET ou POST e lote do escrow batch conforme a versão oficial, antes de tocar no Finance Worker. A comunidade documenta divergência histórica.
- [ ] Validar identidade/cursor, replay e assinatura de webhook em sandbox antes de criar fila real ou habilitar ACK.
- [ ] Confirmar M2 Pending, liberações e devoluções (issue #50). Não presumir depósito bancário.

### M2.2 — Produção incorrida e devolução reaproveitável — **PARCIAL / CONTROLE FÍSICO E LEDGER DECLARADO PUBLICADOS**

A [primeira etapa PR98](MLS_M22_PHYSICAL_RETURNS_2026_11_01.md) entrega o controle físico interno definido pela [auditoria de devoluções e roadmap](MLS_RETURNS_REUSE_ROADMAP_AUDIT_2026_11_01.md). A [etapa M2.2b PR99](MLS_M22_INCURRED_PRODUCTION_2026_11_01.md) acrescenta o registro histórico independente da fabricação declarada. Os fatos são informados pelo operador; publicação técnica e testes simulados não comprovam recebimentos, toda a fabricação da loja ou pagamentos reais, nem encerram a fase.

- [x] Separar o controle interno de recebimento, quarentena e inspeção da situação/reembolso na Shopee. CLOSED/REFUND_PAID não criam peças recebidas.
- [x] Registrar identificação declarada de estampa, cor, tamanho, adulto/infantil e modelagem masculina/feminina/unissex; peças sem identificação confirmada não se tornam reaproveitáveis.
- [x] Registrar entregas parciais e partição exata da inspeção, com referência única por caso, eventos idempotentes, CAS, auditoria, reinspeção e anulação sem apagar o histórico.
- [ ] Conferir os itens e as quantidades originais esperadas de cada solicitação e a composição efetiva dos kits. Os registros atuais não fazem essa comparação; kit parcial não vira kit completo.
- [x] Primeira etapa M2.2b: registrar fabricação declarada pelo operador por peça/lote em ledger independente, com data de produção, identidade, quantidade, revisão, origem opcional e fotografia imutável do custo declarado ou UNKNOWN. CANCELLED não apaga esses registros; não somar o ledger novamente à referência de produção do resultado atual.
- [ ] Vincular a peça efetivamente devolvida ao registro histórico de fabricação correto, conferindo identidade e quantidades originais/recebidas sem reutilizar o mesmo fato indevidamente. O vínculo DTF atual não comprova fabricação nem esse pareamento.
- [ ] Confirmar a decomposição histórica de peça/estampa recuperáveis e embalagem/etiqueta já consumidas, além dos custos incrementais de reparo e nova embalagem. As referências all-inclusive não podem ser divididas automaticamente sem fatos do operador.
- [ ] Reservar e consumir a unidade correta na revenda, com embalagem/etiqueta incrementais declaradas. Não alterar o custo global do SKU nem registrar nova fabricação da mesma peça.
- [ ] Separar caixa de custo por competência: recuperação em estoque não é receita/dinheiro; recuperação e consumo do valor histórico precisam de lançamentos correspondentes.
- [ ] Validar o ciclo original → devolução → inspeção → revenda, inclusive mudança de mês, custos ausentes e reservas concorrentes, antes de integrá-lo ao resultado financeiro.

O controle físico e o ledger publicados oferecem contagens e custos internos declarados, com avaliação de estoque UNKNOWN/null. Não alteram totais financeiros, reservas, revendas ou estoque externo. Custos registrados não comprovam pagamento nem a completude da produção real da loja. Valoração e lucro dependem de evidências adicionais e da futura integração contábil sem dupla contagem; uso físico real do proprietário e o ciclo completo permanecem sem validação. M2 e M2.2 continuam abertas.

### M3 — Products + Pricing Intelligence
- contribuição por SKU;
- curva ABC;
- custo e margem por produto/variação;
- preço mínimo;
- preço-alvo;
- preço promocional seguro;
- ROAS mínimo/ponto de equilíbrio somente quando a base de receita for compatível;
- bloqueio por custo/atribuição/estoque desconhecido.

#### M3.0 Observer e M3-L0 Listing Factory antecipada — base técnica integrada

Os fundamentos Observer/Listing Factory e a busca V3.6 foram reconciliados na Live pela PR86 e preservados nas releases seguintes. As PRs originais e seus planos de integração são registros históricos: não repetir a sequência #51 → #56 nem refazer merges apenas porque essas branches continuam abertas.

- [x] Base técnica local: catálogo/variações, rascunhos/importação/exportação, pesquisa e visual integrado; a prévia sintética continua preservada.
- [ ] Aceite visual do operador e grants por loja/categoria continuam evidências próprias; integração técnica não os comprova.
- [ ] M3.1: custo incorrido e histórico por unidade/lote, taxas/frete/impostos por SKU/período, sem rateio arbitrário de pedidos mistos.
- [ ] M3.2: preços mínimo/alvo/promocional e ROAS por SKU somente com M2 confiável, estoque verificado e atribuição apropriada.
- [ ] Reutilização de peças devolvidas exige o controle físico M2.2 e vínculo do lote à revenda; custo global do SKU não deve ser reduzido para uma única revenda.
- [ ] M8 externo: MediaSpace/publicação em lote exige permissões reais, M6, idempotência, direitos e tratamento de resultado incerto. Fundamentos locais de Creative/AI Sales publicados não liberam escrita comercial.

**Política de classificação:** READY_FOR_OPERATOR_REVIEW no preparador só significa que o rascunho passou regras internas locais; não significa READY_TO_PUBLISH nem confirmação de permissões, estoque, tarifa ou compatibilidade na Shopee.

### M4 — MLS Ads em Shadow Mode
- contrato oficial de campanha/atribuição;
- ranking Escalar / Manter / Otimizar / Pausar;
- recomendações sem escrita;
- simulação do impacto;
- comparação posterior entre recomendação e resultado real;
- MLS Auditor valida a evidência antes de liberar proposta.

### M5 — MLS Hermes Supervisor operacional
- fila única de tarefas;
- conflitos entre agentes;
- prioridade por impacto financeiro, urgência e confiança;
- comandos em linguagem natural;
- “Faça as seguras” somente para ações já classificadas como aprováveis;
- trilha de raciocínio operacional resumida em evidências, não cadeia de pensamento.

### M6 — Escrita assistida
Somente após contratos oficiais e permissões reais:
- ações comerciais específicas;
- aprovação humana por ação/lote;
- idempotência;
- resposta incerta tratada como estado desconhecido;
- rollback quando tecnicamente possível;
- auditoria.

### M7 — Autonomia limitada
- políticas persistidas;
- teto de Ads;
- perda máxima;
- margem mínima;
- estoque mínimo;
- frequência de alteração;
- kill switch;
- aprovação para elevação de limites;
- auditor acompanhando o executor.

### M8 — MLS Creative + Marketplace
- títulos, descrições, mockups, fotos e vídeos;
- avaliação de desempenho dos criativos;
- publicação somente com contrato oficial;
- TikTok Shop e Mercado Livre usando a mesma camada de agentes.

### M9 — MLS Commerce OS maduro
Ciclo:
**coletar → entender → priorizar → recomendar → aprovar/executar → verificar → aprender → auditar.**

## 8. Base técnica já disponível

A conversão não reinicia o projeto. O MLS Commerce OS herda integralmente o que já foi publicado:

- coleta automática em segundo plano;
- financeiro por pedido;
- resumo diário e mensal;
- custos por produto/variação e regras;
- reconhecimento infantil e histórico do tamanho removido;
- despesas, parcelas, aluguel, funcionários e boletos;
- devoluções e ajustes;
- liberações/escrow e reconciliação parcial;
- Ads e calendário;
- catálogo salvo;
- Produção/DTF;
- Hermes com contexto financeiro;
- auditorias, checkpoints e proteção contra dados incompatíveis;
- abertura do painel desacoplada das configurações;
- redução de gravações D1 redundantes.

Base anterior à conversão: **PR #10**, merge
`9c418fd3010f46957d1ce52345baacd76041c788`.

Conversão de identidade M0 publicada pela **PR #11**, merge
`3dab8f0be54d331bcded1fba4c09e9bfdf68256b`. CI de `main` passou e App/Auth/Finance foram publicados. A **M1** foi publicada pela PR #12; o próximo desenvolvimento começa em **M2**.

## 9. Regras permanentes de continuidade

1. **Nunca recomeçar o projeto do zero.**
2. Ler primeiro este roadmap e o checkpoint JSON.
3. Preservar integralmente sistemas já publicados, salvo correção comprovada.
4. Nova funcionalidade deve usar a mesma verdade financeira/catálogo sempre que possível.
5. Não duplicar coletores só para alimentar agentes.
6. Não chamar recomendação de lucro comprovado.
7. Não transformar aprovação de devolução em comprovante bancário.
8. Não atribuir Ads a SKU sem contrato/evidência válida.
9. Não executar Ads, promoção, preço ou estoque externamente enquanto a ação estiver LOCKED.
10. Toda autonomia precisa de limites persistidos, concorrência segura, idempotência e auditoria.
11. Toda entrega relevante atualiza este arquivo e `MLS_COMMERCE_OS_CHECKPOINT.json`.
12. O antigo `ROADMAP_BRAZACOMMERCE.md` é somente histórico.

## 10. Próximo passo ao retomar

A fase canônica é **M2 — Finance/Returns confiáveis como agentes observadores**.

Retomar por:
1. Conferir itens e quantidades originais esperados e preparar o vínculo da peça devolvida ao registro histórico de fabricação correto, preservando identidade, data e quantidades recebidas. O ledger interno M2.2b já está entregue; não refazer sua implementação nem supor fabricação pela quantidade DTF/kit.
2. Confirmar com fatos do operador a decomposição histórica de peça/estampa versus embalagem/etiqueta consumidas e os custos incrementais de reparo/nova embalagem, antes de valorar ou alocar peças na revenda. Não dividir automaticamente all-inclusive; manter UNKNOWN e projetar a ponte contábil sem somar o custo novamente ao resultado atual.
3. Manter a paginação do Pending já entregue, renovar a cobertura da publicação exata e acompanhar revisões/Returns/calendários existentes sem reiniciar coleta ou catálogo.
4. Declarar despesas do mês e confrontar o mesmo recorte com Seller Centre e banco. Somente concluir M2 com diferenças materiais explicadas; lucro realizado exige liquidação comprovada.
5. Manter Ads/PROMO, alterações externas de preço/estoque e autonomia comercial bloqueados enquanto seus gates permanecerem abertos.

## Registros históricos abaixo

As entradas datadas a seguir preservam incidentes, planos e evidências de 27–30/10. Estados DRAFT/OFF/sem deploy e instruções de integração descrevem aquele corte; não substituem o estado atual acima nem autorizam rollback, reprovisionamento ou merge repetido.


**Incremento integrado — PR #22, evidência local de Pending:** acrescentar ação
manual de copiar um JSON sanitizado com estado, cobertura, valores agregados e
horários da auditoria Pending. É um apoio para a observação da conta real,
não substitui o Seller Centre, não acessa Shopee e não libera paginação,
recebível ou lucro realizado. Merge `2e35ac0267757f748912f36756c89584aa13efe6`;
CI PR `40559446787` e main `40559823142`, **2.064 Node + 67 Python**.
Deploy Cloudflare e conferência autenticada do Seller Centre continuam pendentes de evidência.

## Alerta operacional — recuperação de interface (27/10/2026)

O operador informou que o painel deixou de carregar e os agentes sumiram.
A PR #22, apesar de CI verde, é a alteração de runtime mais recente.
Prioridade imediata: **rollback isolado da PR #22 na aplicação**, branch
`hotfix/restore-agent-panels-after-pr22`, preservando M1 e os demais incrementos M2 já publicados.
Este hotfix não deve criar nenhum novo endpoint, rede, polling ou acesso à
Shopee. A causa definitiva requer logs/browser; não confundir ausência do
painel com exclusão de dados. Até confirmação da publicação Cloudflare e
teste autenticado, estado do incidente: **NÃO RESOLVIDO**.


## P1: diagnóstico público e hotfix de navegação dos agentes (27/10/2026)

A PR #24 foi usada **somente em branch** como teste anônimo e encerrada sem
merge. GitHub Actions run `40563757410` confirmou DNS de App/Auth/Gateway;
`/login` HTTP 200 com branding MLS, `/health` HTTP 200,
`/` e `/admin` redirecionam 303, e `/api/admin/bootstrap`
anônimo retorna 401 (esperado). Isso **não testa uma sessão autenticada**.

A inspeção do código encontrou que a entrada **Agentes** ficava em "Mais
opções" e usava `#commandAgents` sem reabrir o `overview` quando outra aba
estava ativa. Além disso, `commandCenterAgents` iniciava vazio antes do
JavaScript, fazendo todos os cartões sumirem se a hidratação falhasse.

A PR #25 (merge `7c62247058066e49b6f86544de359786b2bd60ac`) move Agentes para a navegação principal, tanto
no desktop quanto no celular; o clique muda primeiro para a Visão geral e
depois rola para a equipe. Seis cartões de placeholder "Aguardando dados" são
renderizados pelo Worker sem pressupor valor financeiro; a hidratação os
substitui pelos dados reais. Não há novos requests, coletores, D1 ou alterações
na Shopee. CI PR `40564669598` e main `40564933755` passaram com **2.064
Node + 67 Python**. Os três check-runs Cloudflare Workers Builds do merge
também reportaram **SUCCESS**.

**Incidente permanece aberto.** O usuário ainda não confirmou a tela pós-PR25.
Histórico real de cota D1 em 26/10 merece nova verificação em 27/10; não
inferir automaticamente que a cota esteja esgotada hoje. Recuperação de
navigation/placeholder não equivale à retomada das consultas financeiras.


## 27/10/2026 — PR #26: diagnóstico autenticado seguro, incidente P1 ainda aberto

A falha de carregamento **começou antes da PR #22**; logo a reversão isolada
não era diagnóstico suficiente. O CI de PRs #23 e #25 e os builds Cloudflare
foram aprovados, porém a tela financeira autenticada continuou indisponível
segundo o operador.

A **PR #26** foi integrada pelo merge `4310316be3ac3cf449fde975697a869e2529fb53`, testes
**2.070 Node + 67 Python** na branch (run `40570346863`) e no main
(run `40570582583`). Check-runs Cloudflare de App/Auth/Finance foram
**SUCCESS**. Isso comprova a validação e builds, não a execução de sessão
autenticada no dispositivo.

Nova página `https://app.brazacommerce.com.br/admin/diagnostics`:
funciona separadamente do painel principal, exige cookie de proprietário e
permite **Copiar diagnóstico**. `GET /api/admin/diagnostics` confirma a
sessão e faz somente `SELECT 1 AS ok` com prazo de 3,5s, sem esquema,
gravações nem provedores. A página verifica também a presença do HTML de
Agentes e a **rota financeira já existente**, `business-month-view-v4`,
que por sua vez pode executar manutenção normal de esquema/cache; nenhuma
nova ação comercial é criada. O relatório contém somente estados HTTP,
códigos seguros, booleanos de HTML, duração, mês e marcador do release.

**Próximo passo obrigatório:** receber JSON com esquema
`mls_owner_panel_report_v1` e comparar `owner_probe.d1` com
`finance_month.http/error`. Nada de supor bloqueio do D1 ou erro de frontend
sem observar esses campos. Não alterar credenciais Shopee, chaves, D1 ou custos.

Se o link direto redirecionar para login, autenticar como proprietário e usar
o link estático "Diagnosticar carregamento" do topo do Admin, no mesmo
navegador; abrir um link cross-site pode não enviar cookie SameSite=Strict na
primeira navegação. Caso o JavaScript do diagnóstico também falhe, enviar
somente a tela de diagnóstico, sem credenciais.


## Incidente P1 — causa JS reproduzida e corrigida pela PR #28 (27/10/2026)

A investigação em **Chromium real** encontrou dois erros que os testes anteriores
de HTML/VM não detectavam:

1. `Cannot read properties of null (reading 'expense_schedule')`:
   `buildMlsAgentRegistry` permitia `undefined === undefined` quando o
   snapshot mensal ainda não existia e tentava acessar `month.expense_schedule`.
2. `Invalid regular expression` durante a inicialização: bytes de controle
   incluídos no JavaScript inline eram processados pelo tokenizer HTML, que
   substitui U+0000 por U+FFFD, destruindo a ordem de um range de regex e
   impedindo outros scripts de iniciarem.

A **PR #28** (merge `6ea975e13694f094bba034103b7572d30b07e308`) adicionou o guard de `month` antes de
consultar despesas e codifica caracteres de controle não imprimíveis no HTML
do Admin como escapes JavaScript antes de enviá-los ao navegador.

Validação: CI PR `40576473744`, CI `main` `40576723167`,
**2.073 testes Node, 0 falhas + 67 Python**. Teste Chromium real com
consulta financeira simulada em HTTP 503: registry instalado, seis agentes
hidratados, zero placeholders remanescentes, valor diário indisponível
sem inventar lucro, **zero erros de JavaScript**. Build checks Cloudflare
App/Auth/Finance concluídos **SUCCESS**.

Limites: o teste simula sessão de proprietário e não lê a conta privada;
a conexão da rota mensal em produção continua sem evidência do operador.
**Não afirmar ainda que lucro diário, repasses ou D1 estejam funcionando**.
Se a página voltar a hidratar agentes mas os números permanecerem em branco,
usar `/admin/diagnostics` para obter `owner_probe` e `finance_month`.
Nenhuma autorização da Shopee, orçamento Ads, dado persistido ou Worker Auth/
Finance foi alterado pela correção.

## M2 — PR #32: gráficos financeiros observacionais + setas de lucro/prejuízo (27/10/2026)

O operador solicitou gráficos mais úteis e indicadores visuais de
lucro/prejuízo em verde/vermelho. A PR #32 (merge `78f1ed1514bcc72a4bfebc069e7c39ce3f466995`)
agrega uma série SVG diária de até **14 dias**, reutilizando **exclusivamente**
o projetor `business_daily_summary_v1` já validado pelo
`brazaDayDashboard`. Não há nova query D1, `fetch`, cron ou endpoint Shopee.

Agora a **Visão Geral**, **MLS Finance** e **MLS Ads** têm seletor
Resultado/Vendas/Ads. Os cartões da Central sinalizam resultados estimados
positivos (verde), negativos (vermelho) e diferenças monetárias com
setas ↑/↓ e percentual quando a base anterior não é zero.

**Comparação só entre datas consecutivas, completas, com cobertura validada**.
Hoje parcial não é comparado com ontem fechado; o chip identifica as datas
efetivamente comparadas. Dias sem dados interrompem linhas, não viram zero.
Saldo após custos conhecidos é exibido como parcial, e o aumento do gasto
em Ads é laranja (não prova prejuízo). Lucro realizado, saldo bancário e
atribuição Ads por SKU continuam não comprovados.

CI PR `40599192490` e main `40599428231`: **2.087 testes
Node / 0 falhas e 67 Python**, com Chrome real confirmando os três
gráficos SVG, setas, valores, abas horizontais e zero erros JS.
Cloudflare Builds App/Auth/Finance: **SUCCESS**.

Status do produto: M2 financeira permanece EM ANDAMENTO e ainda precisa
verificação autenticada dos dados reais da loja e da comparação Pending
x Seller Centre. A mudança é UI/consumo local do snapshot validado, sem
alterações comerciais e sem desbloqueio Ads/PROMO.

### M3-L1 — Reanexação de mockups em lote (PR #60 draft)

- [x] Seleção local de arquivos ou pasta: até **200 imagens e 64 MiB** por execução, decodificação JPG/PNG e SHA-256 em até três operações simultâneas.
- [x] Associação pelo nome exato a todos os anúncios importados que utilizam a mesma foto, evitando editar cada arte individualmente.
- [x] Falha atômica para nome duplicado, hash diferente, imagem inválida, limite excedido; arquivo extra é ignorado com contagem e aviso.
- [x] Testes puros até 500 anúncios e Chromium real em 19 anúncios, cobrindo parcial/completo/duplicado/trocado.
- [x] **CI GREEN** #40790629421: 2.132 Node + 67 Python, Chromium e três Workers; 14/14 arquivos de runtime e testes idênticos ao candidato #61, que foi fechado sem merge.
- [ ] QA autenticada desktop/celular com mockups reais, integração #51 → #56 → #60 e revisão da PR #48. Nenhum upload/publicação comercial.

Guia: [MLS_LISTING_FACTORY_BATCH_RELINK_2026_10_28.md](MLS_LISTING_FACTORY_BATCH_RELINK_2026_10_28.md). M2 issue #50 permanece aberta e nenhuma publicação Shopee é autorizada.

### M1/M3-L2 — Integração V3.6 + Fábrica de Anúncios (PR #63, DRAFT)

- [x] Combinar busca global da PR #48 com os módulos das PRs #51, #56 e #60 sobre a main canônica, sem modificar Finance/Auth/D1/OAuth, Ads ou cron.
- [x] Verificar integridade de arquivos: 13/13 blobs da PR #60 e 7/7 da PR #48 preservados. Allowlist dos Workers recebe somente o novo SHA App exato.
- [x] CI #40792253729 **GREEN: 2.136 Node + 67 Python**, Chrome real e três builds; App SHA 8ed059ddb6f0901a48d277d6b9b806a23d52a1e5e105ed0e2e456e2aea6701f5.
- [x] Adicionar teste de coexistência do catálogo, DTF, busca e editor local em HTML normal/minificado.
- [ ] QA visual autenticada do operador em desktop/celular e decisão de release: PR #63 única ou PRs #48/#51/#56/#60 sequenciais, não ambas.
- [ ] M2 Finance issue #50 e permissões Shopee ainda bloqueiam qualquer ação comercial automática. Ads/PROMO LOCKED.

[Evidência e plano de QA](MLS_V36_LISTING_FACTORY_INTEGRATION_2026_10_28.md).


## 29/10/2026 — integração visual de todos os painéis existentes · PR #74 (DRAFT)

**Design aprovado fixado** a partir do mockup fornecido pelo proprietário: escuro azul-marinho, componentes neon discretos, KPIs e cards por agente, navegação especializada, responsividade e cores Finance verde / Ads laranja / Products azul / Production roxo / Returns vermelho / Auditor ciano. Uma única camada CSS em `web/cloudflare/src/approved-design-system.mjs` é compartilhada pelo App administrativo e pelas rotas Ads.

- **PR #74** consolida os reworks individuais #69 (Plano de Evolução), #71 (Agentes), #72 (Produtos) e #73 (Produção DTF) em branch única baseada na `main`. Os testes e fontes dos quatro reworks foram incorporados sem merge da `main`.
- Shell, Visão Geral, sete especialistas, Finance/Returns/Auditor, Hermes, Dashboard Ads, Campanhas, Optimization/Automação, Conexões, Custos, Histórico e 15 seções do proprietário são cobertos por estilos e testes de integração. Relatórios/Notificações não recebem telas fictícias se não houver rota real.
- Mini navegação interna dos sete especialistas usa âncoras de ferramentas e indicadores existentes; evita duplicar fórmulas ou renderizar dados inventados.
- **Sem alterações comerciais:** nenhuma publicação, modificação de campanha, Ads/PROMO, preço ou estoque; `DTF_CLIENT` e `DTF_ENGINE_CLIENT` preservados. O projeto financeiro M2 (#50) continua aberto.
- V3.6 Listing Factory e busca (#63/#65/#68) ainda **não publicadas**; a integração com o design será reconciliada antes do primeiro release, com feature flag OFF, homologação autenticada do proprietário e rollback preparado.
- A CI testa Node completo, 67 Python, builds dos três Workers e Chrome sintético 1365×900/390×844, incluindo 15 seções; **CI verde por si só não equivale a aprovação visual do proprietário nem deploy**.
- Documentação: [MLS_APPROVED_DESIGN_SYSTEM_2026_10_29.md](MLS_APPROVED_DESIGN_SYSTEM_2026_10_29.md). Trilha visual: issue #70; release seguro: issue #67.

**Status ao registrar:** PR #74 em DRAFT, ainda não publicada, com CI integrado em validação. Não fazer merge/deploy até CI final e aprovação explícita.


## 29/10/2026 — candidato único de homologação visual + V3.6 · PR #75

- Trilha `#63 → #65 → #68 → #75` incorpora o design aprovado #74 **por integração manual dos arquivos compartilhados**, sem mesclar as PRs visuais anteriores separadamente.
- **Flag de release `MLS_V36_OWNER_PREVIEW`: ausente/inválida = OFF**; valor exatamente `ENABLED` e sessão owner habilitam apenas busca V3.6 e Listing Factory local. Não ativa publicação na Shopee ou Ads/PROMO.
- `admin-view.mjs`, `dtf-view.mjs`, `saved-catalog-view.mjs` e `build.py` tiveram código de duas trilhas reconciliado preservando contratos originais.
- Todos os painéis existentes mantêm o design aprovado, com QA desktop 1365×900/mobile 390×844 e testes integrados OFF/ON. **Não há merge/deploy nem homologação com conta real.**
- Manual: [MLS_INTEGRATED_OWNER_RELEASE_2026_10_29.md](MLS_INTEGRATED_OWNER_RELEASE_2026_10_29.md); PR [#75](https://github.com/MatheusLemosDS/MLS-Ecommerce-Ads/pull/75). M2 Finance #50 e Ads/PROMO continuam bloqueados para execução.
