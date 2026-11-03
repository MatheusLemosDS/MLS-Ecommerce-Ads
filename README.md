<!-- M3_CONTRIBUTION_EVIDENCE_CURRENT -->
**Próxima entrega M3 em preparação:** versão proposta `2026-11-02.6 — M3 · Margens e evidências por produto`, `PREPARED_NOT_PUBLISHED`. O candidato detalha a contribuição dos pedidos exclusivos: margem/sinal conferidos, gráfico de composição, valores estritos versus conhecidos e motivos/quantidades pendentes. Uma única variação vendida só recebe evidência exclusiva quando todas as condições de fonte, quantidade e valor forem verificadas; múltiplas variações vendidas continuam sem atribuição financeira. Os campos legados v1 de margem/lucro por variação permanecem desconhecidos. Sem ratear pedidos mistos ou chamar diferença vendas–repasse de taxa. Ads, DAS mensal e despesas ficam fora dessa contribuição; referência atual de custo não é fabricação incorrida ou reaproveitamento. Seis agentes da inicial, mês/rascunhos e cenários existentes devem ser preservados. M2/M2.2 e o confronto Seller Centre/banco continuam abertos.

A última Live comprovada continua `2026-11-02.5`, App `124b7071-6152-44fa-bf44-5edf98eca2dc`, com Auth/Finance preservados. A [PR #106](https://github.com/MatheusLemosDS/MLS-Ecommerce-Ads/pull/106) foi integrada em `dea19f0ace932acccc917c63d8da46db417079c9`; CI documental [41565003839](https://github.com/MatheusLemosDS/MLS-Ecommerce-Ads/actions/runs/41565003839) aprovada e árvore/vetor Live conferidos. A preparação acima não publica a próxima versão. [Escopo, uso e limites](docs/MLS_M3_CONTRIBUTION_EVIDENCE_2026_11_03.md).
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

