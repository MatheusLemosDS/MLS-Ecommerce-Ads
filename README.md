<!-- PRODUCTION_WEEKLY_CLOSING_CURRENT -->
**Fechamento semanal da produção — `PUBLISHED_VERIFIED`:** versão `2026-11-03.3 — Fechamento semanal da produção`. Semana confirmada pelo proprietário: sexta anterior às 13h até sexta às 13h, Brasília, incluindo fim de semana e sem incluir o instante final. Relatórios no painel Produção, histórico retrospectivo identificado e fechamento original preservado com revisões posteriores. Registros de sexta exigem distribuição confirmada das peças antes/a partir de 13h; sem confirmação, ambas as semanas adjacentes permanecem pendentes. Custos históricos/NO_RECORDS e fabricação real ficam separados de vendas, lucro e caixa. Cron interno usa o trigger de minuto existente, independente do Hermes/coleta; sua observação natural é registrada separadamente e não se presume execução futura de sexta. App `26703f97-a986-476c-bef9-d51532f68eb7` publicado e conferido em 03/11/2026 às 23:23:33 Brasília. Fonte `5d570db1f6c7d7793c2c98cc5d1ee61508b81cda`, head `c84a10f44bde68d15916ecfd4d688870a7e0f739`, CI [41759155044](https://github.com/MatheusLemosDS/MLS-Ecommerce-Ads/actions/runs/41759155044) aprovada: 3524 Node e 67 Python. Auth/Finance e vetor dos três Workers/configuração/domínios/flags/cron conferidos. Integração Git: consultar a [PR #110](https://github.com/MatheusLemosDS/MLS-Ecommerce-Ads/pull/110); publicação/CI não comprovam merge. M2/M2.2 e Seller Centre/banco continuam abertos; dados ausentes não viram custo zero nem fabricação inventada. [Uso, origem e limites](docs/MLS_PRODUCTION_WEEKLY_CLOSE_2026_11_03.md).
<!-- END_PRODUCTION_WEEKLY_CLOSING_CURRENT -->

<!-- PRODUCTION_DAILY_HERMES_CURRENT -->
**Produção diária e leitura do Hermes — `PUBLISHED_VERIFIED`:** versão `2026-11-03.2 — Produção diária e parâmetros do Hermes`. Fabricação registrada por dia, data selecionável e histórico mensal com gráfico, maiores custos/quantidades registrados e empates. Dias sem registro/custo desconhecido não viram zero; pico de custo fica pendente se houver custo desconhecido no mês. Lucro diário é estimativa financeira salva pela data do pedido, separada da fabricação e sem segunda dedução. Hermes mantém valores, fórmulas e snapshots; a melhoria expõe Ads, parâmetros e diferença entre dia de Ads e recorte mensal. Apenas App; Auth/Finance, contratos, seis agentes, mês/rascunhos e gates comerciais preservados. App `81ca539d-6785-46f0-b854-fdb8861e80f6` publicado e conferido em 03/11/2026 às 13:14:46 Brasília. Fonte `c106ad84145d6f27265783ead318b45eea8c8e2c`, head `fef88d1d53b0354976a5f7dd2b197303c91c0ce0`, CI [41670540646](https://github.com/MatheusLemosDS/MLS-Ecommerce-Ads/actions/runs/41670540646) aprovada: 3483 Node e 67 Python. Auth/Finance e vetor dos três Workers/configuração/domínios/flags/cron conferidos. Integração Git: consultar a [PR #109](https://github.com/MatheusLemosDS/MLS-Ecommerce-Ads/pull/109); publicação/CI não comprovam merge. M2/M2.2 e Seller Centre/banco continuam abertos; registros não comprovam toda a fabricação da loja ou pagamento. [Uso, origem e limites](docs/MLS_PRODUCTION_DAILY_HERMES_2026_11_03.md).
<!-- END_PRODUCTION_DAILY_HERMES_CURRENT -->

<!-- M3_VARIANT_ORDER_EVIDENCE_CURRENT -->
**M3 paralela publicada e conferida — 03/11/2026 às 12:07:27 Brasília:** versão `2026-11-03.1 — M3 · Contribuição por variação e pedido`, `PUBLISHED_VERIFIED`. Produtos recebe contribuição de referência dos pedidos com um único par produto/modelo, permitindo vários modelos vendidos no mês quando cada pedido tem atribuição comprovada. Pedidos do mesmo produto com vários modelos e pedidos mistos permanecem em buckets distintos sem rateio. Finance → Auth → App publicados nessa ordem, com os três vetores de bytes e configuração/domínios/flags/cron conferidos após cada etapa. Fonte `4dbeeb3804493d9894536eb3a201aa58573adb2d`, head `ed9e86ce72b7d37486e51fc45f95ef7d232180cb`, CI [41658488625](https://github.com/MatheusLemosDS/MLS-Ecommerce-Ads/actions/runs/41658488625) aprovada: 3457 Node e 67 Python. Negociação opt-in e sidecar preservam os frames legados; v5 usa o mesmo GET mensal, sem nova consulta à Shopee ou backfill. Fonte sem captura continua `NOT_CAPTURED`; publicação não confirma cobertura natural da conta. Custo atual incide só na quantidade atribuída; tributo legado conserva arredondamento por pedido, DAS/Ads/despesas ficam fora e ajuste já no repasse não é reaplicado. Seis agentes, mês/rascunhos e cenários preservados. M2/M2.2 e o restante da M3 continuam abertos. Integração Git: consultar a [PR #108](https://github.com/MatheusLemosDS/MLS-Ecommerce-Ads/pull/108); publicação e CI não comprovam merge. [Uso, recibo e limites](docs/MLS_M3_VARIANT_ORDER_EVIDENCE_2026_11_03.md).
<!-- END_M3_VARIANT_ORDER_EVIDENCE_CURRENT -->

<!-- M3_CONTRIBUTION_EVIDENCE_CURRENT -->
**M3 paralela publicada e conferida — 03/11/2026 às 00:04:01 Brasília:** versão `2026-11-02.6 — M3 · Margens e evidências por produto`, `PUBLISHED_VERIFIED`. Produtos mostra contribuição exclusiva conferida, margem/sinal, gráfico de composição e motivos/quantidades pendentes, separando resultado estrito de valores conhecidos. Uma única variação vendida recebe evidência exclusiva somente com todos os gates válidos; múltiplas variações vendidas continuam sem atribuição financeira. Campos legados v1 de margem/lucro por variação permanecem desconhecidos. Sem rateio de dinheiro/custo misto, taxa inferida da diferença vendas–repasse ou dupla aplicação de ajuste já no repasse. Ads, DAS mensal e despesas ficam fora dessa contribuição; regime legado mantém sua referência de imposto, sem promovê-la a tributo oficial. Referência atual de custo não é fabricação/reaproveitamento. Fonte `c70b0304ec4502edabe44a7ae90e144d6a7e4b7b`, head `53580d2612b3661c8d76016a35fb5a14f41e69c9`, CI [41568940647](https://github.com/MatheusLemosDS/MLS-Ecommerce-Ads/actions/runs/41568940647) aprovada: 3400 Node e 67 Python. App `fef9da9e-bcfc-42e1-a8c4-e38b84a656bd` publicado e vetor dos três Workers conferido; Auth/Finance, configuração, domínios, flags e cron preservados. Sem nova API/SQL/coleta/provedor ou escrita comercial. Seis agentes da inicial, mês/rascunhos e hipóteses dos cenários preservados. M2/M2.2 e Seller Centre/banco continuam abertos. Integração Git: consultar a [PR #107](https://github.com/MatheusLemosDS/MLS-Ecommerce-Ads/pull/107); publicação e CI não comprovam merge. [Uso, recibo e limites](docs/MLS_M3_CONTRIBUTION_EVIDENCE_2026_11_03.md).
<!-- END_M3_CONTRIBUTION_EVIDENCE_CURRENT -->

<!-- OVERVIEW_AGENTS_RESTORE_RELEASE -->
**Atualização Live — 2026-11-02.4, Agentes de volta à página inicial:**
Os seis cartões do design aprovado voltaram à Visão geral, abaixo dos indicadores
e antes dos gráficos: Hermes, Finance, Ads, Products, Production e Returns.
Avatares, cores, estados e acessos aos painéis são preservados; a página Equipe
mantém os sete agentes e seus filtros.

Abrir `/admin?tab=overview#commandAgents`.
App `16ee9374-f16a-45b3-99a9-92669d296c9b` publicado e conferido em **02/11/2026 às 19:50:54 Brasília**;
Auth e Finance, configuração, domínios, flags e cron preservados. CI
[41539423858](https://github.com/MatheusLemosDS/MLS-Ecommerce-Ads/actions/runs/41539423858) aprovada: 3346 Node e 67 Python.
**PUBLISHED_VERIFIED:** consultar a [PR #105](https://github.com/MatheusLemosDS/MLS-Ecommerce-Ads/pull/105) para o estado atual da integração Git.
[Uso, validações e limites](docs/MLS_OVERVIEW_AGENTS_RESTORE_2026_11_02.md).
<!-- END_OVERVIEW_AGENTS_RESTORE_RELEASE -->

**Continuidade confirmada da PR104:** merge `41b95f6e93236fdfad42ff9b3deb9a85905d67ef`, em 02/11/2026 às 19:15:31 Brasília; CI documental [41534506552](https://github.com/MatheusLemosDS/MLS-Ecommerce-Ads/actions/runs/41534506552) aprovada e árvore/runtime conferidos. A nota anterior com integração pendente preserva o corte de publicação. Três descritores de fotos já passaram pelo leitor canônico após captura natural; a exibição real no CDN foi bloqueada pelo proxy do executor. Isso não confirma recebimento, fabricação ou fechamento financeiro.

<!-- SIMPLIFIED_OPERATIONS_RELEASE -->
**Atualização Live — 2026-11-02.3, Operação simples e produção por período:**

- **Devoluções:** fila com os dados salvos e confirmação física correta/problema;
  foto atual do produto e PNG local verificado, quando disponível neste dispositivo.
- **Produção:** custo histórico registrado por datas inclusivas de fabricação em
  Brasília; ausência de registros não significa gasto zero.
- **Navegação:** Produção, Devoluções e Financeiro visíveis entre sete destinos,
  com atalhos antigos, busca e histórico preservados.

Abrir `/admin?tab=agent-returns#physicalReturnsQueue`,
`/admin?tab=agent-production#incurredProductionDetails` e
`/admin?tab=agent-finance#businessMonthNetCard`.
Publicação Finance → Auth → App conferida em **02/11/2026 às 19:06:16 Brasília**;
App `4a556c39-bd1b-4962-84a6-b25bf5504e95`, Auth `d6f4397f-ac4d-45cf-93da-175df8305a6d`,
Finance `7001376b-f065-4e37-84ea-ee9ac2ea890c`. CI [41532391229](https://github.com/MatheusLemosDS/MLS-Ecommerce-Ads/actions/runs/41532391229)
aprovada: 3346 Node e 67 Python. Bytes e configuração dos três Workers
conferidos. **Integração Git pendente de recibo próprio na PR104.**
QA sintética não confirma captura natural de fotos ou recebimento/fabricação
reais. M2/M2.2 e confronto Seller Centre/banco continuam abertos.
[Uso, evidências e limites](docs/MLS_SIMPLIFIED_OPERATIONS_2026_11_02.md).
<!-- END_SIMPLIFIED_OPERATIONS_RELEASE -->

<!-- ORIGINAL_RETURN_ITEMS_RELEASE -->
**Atualização Live — 2026-11-02.2, itens e quantidades das devoluções:**
O MLS Returns mostra separadamente os itens salvos do pedido e da solicitação,
com horários e cobertura. Itens antigos sem evidência continuam desconhecidos;
unidades comerciais não são convertidas em peças recebidas ou estoque.
App `0a2955bc-e420-42a1-8c53-97f6fef04358`, Auth `e13c43ad-b096-411b-8ae7-92e24ff44991` e Finance
`5e3b4686-1011-4e24-a890-fa33050b8490` publicados e conferidos. Os registros físicos,
vínculos, valores financeiros e contratos legados foram preservados.
[Uso, evidências e limites](docs/MLS_ORIGINAL_RETURN_ITEMS_2026_11_02.md).
M2/M2.2 e confronto Seller Centre/banco continuam abertos.
<!-- END_ORIGINAL_RETURN_ITEMS_RELEASE -->

# MLS Commerce OS — App, Auth e Financeiro

Repositório do **MLS Commerce OS** para os três Workers Cloudflare já ativos:
App, Auth e Financeiro. Cada Worker tem build e publicação próprios. A conexão
financeira e as leituras reais foram verificadas; isso não comprova liquidação
bancária nem encerra a conciliação M2.

**Release anterior — PR #102, 02/11/2026:**
**2026-11-02.1 — Líquido mensal e histórico**. O painel diferencia saldo parcial
de líquido previsto completo, indica deduções ausentes e mantém data/último dia
parcial dos anúncios. Os sete agentes compartilham um seletor de mês sobre
fontes salvas; catálogo, DTF e controles físicos identificam seus próprios
escopos. Rascunhos, Voltar/Avançar e reload histórico são preservados.

App `8e1056d2-4e2f-4ffe-9100-84ea2758a0c5`; Auth `37bead27` e Finance `e0b258a2`
preservados. Código, configurações, domínios, flags e cron conferidos.
3205 testes Node e 67 Python aprovados, com Chromium
normal/minificado em 320/1365. Sessão real do proprietário não observada pelo
executor (HTTP403); replay privado de fontes reais e QA local são distintos.
[Uso, evidências e limites](docs/MLS_MONTHLY_NET_HISTORY_2026_11_02.md).

A declaração de outras despesas de novembro foi registrada separadamente após
confirmação explícita do proprietário, com auditoria e repetição segura. Cada
mês exige sua própria declaração; valores ausentes continuam desconhecidos.
A apresentação não altera o contrato financeiro, não reconcilia o banco nem
integra o reaproveitamento ao lucro. **M2/M2.2 permanecem abertas.**


```bash
npm ci
npm test
npm run build
```

As versões Node e Wrangler estão fixadas. Os arquivos `dist/*-worker.mjs` são
gerados a partir das fontes e não devem ser editados manualmente.

CI aprovada e merge em `main` não comprovam publicação. Os checks externos
Cloudflare Workers Builds estão em falha, com causa ainda não confirmada;
o acesso disponível aos logs retorna 403/12004. A publicação controlada via
Wrangler foi validada por bytes, versões e configuração dos três Workers.
Conferir a release e os gates atuais antes de publicar qualquer atualização.

Guia de publicação e histórico da configuração inicial:
[Publicação dos Workers](docs/PUBLICACAO_PELO_GIT.md). A configuração financeira
inicial em [Financeiro](web/finance/DEPLOY.md) é referência histórica; não recriar
D1, segredos ou autorização para uma atualização normal.

Segredos continuam no Cloudflare. Arquivos de credenciais, bancos, logs e
entregas antigas ficam fora do Git. O fluxo de Ads permanece LOCKED.


## Identidade e continuidade

A marca oficial do produto é **MLS Commerce OS**. Os nomes técnicos `brazacommerce-*`, domínio, bindings, rotas e contratos antigos permanecem temporariamente como aliases de compatibilidade e não devem ser renomeados sem uma migração específica.

Roadmap canônico: [MLS Commerce OS](docs/ROADMAP_MLS_COMMERCE_OS.md).  
Checkpoint para retomada: [MLS_COMMERCE_OS_CHECKPOINT.json](docs/MLS_COMMERCE_OS_CHECKPOINT.json).

Continuidade entre ChatGPT e Codex: [AGENTS.md](AGENTS.md) · [Handoff técnico](docs/MLS_CODEX_HANDOFF_2026_10_28.md) · [Pesquisa Shopee](docs/SHOPEE_RESEARCH_TO_MLS_2026_10_28.md) · [Listing Factory local](docs/MLS_LISTING_FACTORY_V1.md).

A PR #86 reconciliou a cadeia preparada de visual, V3.6, Products/Pricing
observador, Listing Factory e AI Sales na versão oficial. As PRs originais de
preparação que continuam abertas não devem ser mescladas novamente em
duplicidade. Integração local, prévia sintética e publicação não substituem
aceite real do proprietário, grants de APIs, estoque verificado ou direitos
da mídia; escritas comerciais continuam bloqueadas.

