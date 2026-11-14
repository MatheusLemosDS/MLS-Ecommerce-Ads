# Base financeira conferida

Inventário de código do complemento financeiro, em 13/11/2026, Brasília. A fonte imutável conferida é `6578e21098ff799e59433af92880d249432ceeb4` (main após PR #120). A auditoria recebida usou `0016c4b78d45c47066b259bbaf42578662e11e35`.

**Este documento registra a base inicial; não certifica a conta real, não executa coleta e não comprova a implementação dos novos requisitos.** Módulos que os agentes criam durante o trabalho ficam fora deste inventário imutável e serão ligados à matriz por evidência própria.

Os 24 caminhos de fonte citados pela auditoria permanecem byte a byte iguais nos dois commits. Os 53 módulos `web/finance/src` da árvore inicial não tiveram alteração nesse delta. A PR #120 reorganizou a apresentação V4.1, os controles de interface e os registros de release; não completou Wallet, Payout, razão financeiro ou fechamento definitivo.

A varredura estática encontrou 25 ocorrências distintas de pares módulo/caminho de API, incluindo consultas de pedidos, escrow, income, catálogo e Returns, além do transporte de tokens. Presença no código não comprova método/grant atual, sucesso da conta ou cobertura completa. Não há caminho Wallet, Payout ou `get_return_list` na árvore Finance inicial examinada.

O [inventário JSON](BASELINE_INVENTORY.json) contém hashes dos arquivos auditados, todos os módulos/caminhos encontrados, tabelas, schemas, rotas e consumidores. Rotas e tabelas foram extraídas do código; não equivalem a consultas do banco de produção.

| Função | Situação na base auditada e preservada | Fonte principal | Rota existente |
| --- | --- | --- | --- |
| Pedidos e vendas | `INTEGRADO_NO_CODIGO` | [web/finance/src/business-period.mjs](../../web/finance/src/business-period.mjs) | `/api/admin/shop-orders`<br>`/api/admin/finance/business-month-view` |
| Repasse por pedido / escrow | `INTEGRADO_NO_CODIGO` | [web/finance/src/business-period.mjs](../../web/finance/src/business-period.mjs) | `/api/admin/finance/business-month-view`<br>`/api/admin/finance/payment-sample` |
| Taxas, fretes, cupons e ajustes detalhados | `PARCIAL` | [web/finance/src/payment-sample.mjs](../../web/finance/src/payment-sample.mjs) | `/api/admin/finance/payment-sample`<br>`/api/admin/finance/closeout` |
| Saldo Pending e Income Overview | `INTEGRADO_NO_CODIGO` | [web/finance/src/income-overview.mjs](../../web/finance/src/income-overview.mjs) | `/api/admin/finance/income-overview` |
| Pending detalhado | `INTEGRADO_NO_CODIGO` | [web/finance/src/pending-income-scan.mjs](../../web/finance/src/pending-income-scan.mjs) | `/api/admin/finance/income-detail` |
| Liberações posteriores | `INTEGRADO_COM_LIMITES` | [web/finance/src/escrow-releases.mjs](../../web/finance/src/escrow-releases.mjs) | `/api/admin/finance/escrow-releases`<br>`/api/admin/finance/escrow-release-coverage` |
| Carteira e todos os seus movimentos | `A_IMPLEMENTAR` | [web/finance/src/provider-adapter.mjs](../../web/finance/src/provider-adapter.mjs) | Sem rota específica na base |
| Saques e pagamentos agrupados | `A_IMPLEMENTAR` | [web/finance/src/external-cash-worker.mjs](../../web/finance/src/external-cash-worker.mjs) | `/api/admin/finance/external-cash` |
| Depósitos bancários | `ENTRADA_MANUAL_ASSISTIDA` | [web/finance/src/cash-statement-import.mjs](../../web/finance/src/cash-statement-import.mjs) | `/api/admin/finance/external-cash` |
| Conciliação banco–transferência | `ASSISTIDA_1_PARA_1` | [web/finance/src/external-cash-matching.mjs](../../web/finance/src/external-cash-matching.mjs) | `/api/admin/finance/external-cash` |
| Totais do caixa por período | `INTEGRADO_COM_LIMITES` | [web/finance/src/external-cash-period.mjs](../../web/finance/src/external-cash-period.mjs) | `/api/admin/finance/external-cash`<br>`/api/admin/reports/weekly` |
| Devoluções financeiras | `INTEGRADO_COM_LIMITES` | [web/finance/src/returns-reconciliation.mjs](../../web/finance/src/returns-reconciliation.mjs) | `/api/admin/finance/reconciliation` |
| Devoluções de competências antigas | `PARCIAL` | [web/cloudflare/src/business-historical-returns.mjs](../../web/cloudflare/src/business-historical-returns.mjs) | `/api/admin/finance/reconciliation` |
| Devoluções físicas e inspeção | `INTEGRADO_SEM_VALORIZACAO_FINANCEIRA` | [web/cloudflare/src/physical-returns.mjs](../../web/cloudflare/src/physical-returns.mjs) | `/api/admin/returns/physical`<br>`/api/admin/returns/receipts`<br>`/api/admin/returns/manufacturing-links` |
| Produtos, kits e custo de referência | `INTEGRADO_COM_LIMITES` | [web/cloudflare/src/business-month.mjs](../../web/cloudflare/src/business-month.mjs) | `/api/admin/production-costs`<br>`/api/admin/cost-rules`<br>`/api/admin/variant-bindings` |
| Produção física | `INTEGRADO_SEM_PONTE_CONTABIL` | [web/cloudflare/src/incurred-production.mjs](../../web/cloudflare/src/incurred-production.mjs) | `/api/admin/production/incurred` |
| Despesas e parcelas | `CADASTRO_ASSISTIDO` | [web/cloudflare/src/expense-ledger.mjs](../../web/cloudflare/src/expense-ledger.mjs) | `/api/admin/finance/expense-ledger` |
| Impostos | `DECLARACAO_MEI` | [web/cloudflare/src/business-tax-policy.mjs](../../web/cloudflare/src/business-tax-policy.mjs) | `/api/admin/tax-policy`<br>`/api/admin/tax-policy/audit` |
| Anúncios e recarga | `INTEGRADO_COM_LIMITES` | [web/cloudflare/src/business-daily-summary.mjs](../../web/cloudflare/src/business-daily-summary.mjs) | `/api/admin/finance/ads-period`<br>`/api/admin/finance/store-adjustments` |
| Resultado diário e mensal | `ESTIMATIVA` | [web/cloudflare/src/business-month.mjs](../../web/cloudflare/src/business-month.mjs) | `/api/admin/finance/business-month-view` |
| Fechamento semanal de produção | `INTEGRADO` | [web/cloudflare/src/production-weekly-store.mjs](../../web/cloudflare/src/production-weekly-store.mjs) | `/api/admin/production/weekly-closing` |
| Relatório semanal operacional | `INTEGRADO_COM_BASES_SEPARADAS` | [web/cloudflare/src/weekly-operating-report.mjs](../../web/cloudflare/src/weekly-operating-report.mjs) | `/api/admin/reports/weekly` |
| Preparação mensal de fechamento | `PREPARACAO_SEM_FECHO_DEFINITIVO` | [web/cloudflare/src/business-financial-closeout.mjs](../../web/cloudflare/src/business-financial-closeout.mjs) | `/api/admin/finance/closeout` |
| Histórico mensal | `SNAPSHOT_DE_FONTES` | [web/cloudflare/src/business-month-publication.mjs](../../web/cloudflare/src/business-month-publication.mjs) | `/api/admin/finance/business-month-view` |
| Caixa livre e retirada | `A_IMPLEMENTAR_NOS_MODULOS_EXAMINADOS` | [web/cloudflare/src/business-financial-closeout.mjs](../../web/cloudflare/src/business-financial-closeout.mjs) | Sem rota específica na base |

Os estados acima descrevem implementação na base, não aprovação operacional. Os componentes monetários detalhados não são completados pela diferença entre venda e escrow; essa diferença conserva seu sentido informativo. `business_month_v1` exige `net_profit_cents:null`; `business_financial_closeout_v1` exige `realized_profit_cents:null` e comparações `NOT_COMPARED`; `weekly_operating_report_v1` mantém lucro realizado nulo. Os contratos físicos/fabricação v1 mantêm valoração desconhecida e integração financeira desabilitada. Os novos contratos devem coexistir com essas proteções.

O contexto comercial é resolvido no servidor em [commercial-context.mjs](../../web/cloudflare/src/commercial-context.mjs), com organização, loja, usuário, sessão, membership e revisão de autorização. O ambiente comercial usa wrappers de tabelas por tenant em `ACCOUNT_DB`; não herda credenciais de implantação. O [manifesto fechado de tabelas](../../web/cloudflare/src/tenant-schema-manifest.mjs) precisa incluir cada nova tabela antes de habilitar o armazenamento. Revalidação de autorização no retorno e durante jobs deve proteger revogação e troca de empresa. A loja legada exige mapeamento explícito, nunca associação ao primeiro cadastro.

## Evidência desta leitura

- Três inputs preservados com hashes e igualdade comprovada com os três membros do ZIP, sem extrair ou executar seu conteúdo.
- 25 funções mapeadas; 28 requisitos e 24 cenários registrados na [matriz de execução](MATRIZ_EXECUCAO.json).
- Nenhum teste financeiro, chamada de provedor, consulta ao D1 de produção ou observação Live foi executado por este inventário.
- As 27 verificações mencionadas no anexo pertencem à auditoria original. As contagens da release V4.1 são históricas. Nenhuma delas foi promovida a teste novo desta etapa.

A última publicação descrita nos documentos legados deve ser tratada como recibo histórico. A nova entrega exige conferência própria da HEAD, dos três Workers, configurações, versão e módulos servidos, além das evidências separadas de aceite financeiro.

## Extensão local posterior ao inventário inicial

O snapshot acima continua descrevendo a HEAD inicial. A implementação posterior está ligada por requisito na [matriz de execução](MATRIZ_EXECUCAO.json), por caminho em `current_extension` do [inventário JSON](BASELINE_INVENTORY.json) e por evidências na [validação](VALIDATION.md).

Foram acrescentados razão equilibrado, políticas/calendários, projeção contábil, snapshots de fechamento, serviço/cliente de automação, registro de capacidades/fontes, captura minimizada de componentes e alocações de caixa. O manifesto de isolamento passou a declarar 59 objetos novos, sem alterar o DDL Admin legado nem os hashes de configuração `workspace_setup_v1`.

A extensão agora contém CMV/estoque persistentes com seleção explícita de fontes reais e fila durável para casos antigos salvos. Não constitui coletor operacional de Wallet, conexão bancária real, alocação de CMV inferida automaticamente ou descoberta completa de novas devoluções antigas. Os componentes V2 só existem para respostas efetivamente capturadas, e runs por criação não comprovam a totalidade das conclusões de outra competência. Essas lacunas permanecem identificadas; não alteram retroativamente a situação descrita na tabela da base.
