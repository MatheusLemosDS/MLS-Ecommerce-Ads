# Validação do complemento financeiro — 13/11/2026

Este relatório acompanha o candidato local sobre `6578e21098ff799e59433af92880d249432ceeb4` (main após PR #120). Os 28 requisitos e 24 cenários foram reconciliados com os arquivos atuais na [matriz](MATRIZ_EXECUCAO.json), mantendo os inputs originais intactos. `VALIDADO_LOCAL` descreve o limite do teste indicado; não equivale a conclusão de todas as integrações, publicação ou aceitação financeira da loja.

## Execução observada nesta revisão

O [recibo JSON](validation/local-focused-20261113.json) contém a lista exata dos 20 arquivos e o comando `node --test --test-reporter=tap`: **169 aprovados; 0 falhas; 0 pulados; 0 cancelados**. Ambiente: Node/SQLite local, fontes e identidades sintéticas. O log bruto desta sessão está em `/tmp/financial-documentation-focused-20261113.tap` e não é dependência de execução do aplicativo.

Não somar esse total aos runs anteriores de 53 ou 42 testes: vários arquivos se repetem. Esta execução não incluiu a suíte completa do projeto, Python, CI, todos os Workers gerados, a verificação do domínio ou a sessão real do proprietário. Os gates finais e o recibo de publicação cabem à integração da release e devem ser acrescentados com evidência própria.

O candidato continuou recebendo alterações de integração depois desse run focalizado, incluindo o faseamento do job entre coleta e mutações de fechamento. Portanto, o recibo de 169 testes é evidência daquele corte local, não uma aprovação automática do candidato final. Os testes afetados devem passar novamente no gate final; não reutilizar essa contagem como resultado da versão publicada.

| Limite validado | Evidência de teste atual |
| --- | --- |
| Identidade nativa API/arquivo, revisão conservadora, conservação, centavos e limites | `web/cloudflare/tests/financial-event-ledger.test.mjs`; `web/finance/tests/financial-source-events.test.mjs` |
| Persistência, revisão/delta, concorrência, replay e auditoria atômica | `financial-event-store.test.mjs`; `financial-event-batch.test.mjs` em `web/cloudflare/tests` |
| 100 fatos sem uma chamada D1 por pedido | `financial-event-batch.test.mjs`: duas chamadas D1 quentes, 11 statements no lote; controle técnico separado de provisionamento |
| Calendários, aprovação/vigência, impostos por mês e ausência de herança automática | `web/cloudflare/tests/financial-accounting-policy.test.mjs` |
| Receita única entre venda/carteira/saque/banco; aportes e empréstimos; Ads; competência vs pagamento; recebível legítimo | `web/cloudflare/tests/financial-accounting-projection.test.mjs` |
| Estoque100/80/20 e devolução parcial/reuso por componente | Mesmo teste de projeção; **modelo puro**, não integração automática dos lotes físicos reais |
| Abertura + movimentos = fechamento bancário | `web/finance/tests/financial-bank-connector.test.mjs`; teste de projeção; nenhum conector real configurado |
| Snapshots, gates, versões imutáveis, retificação e revogação concorrente da configuração | `web/cloudflare/tests/financial-close-store.test.mjs` |
| API local, políticas, ingestão, histórico fechado e jobs | `web/cloudflare/tests/financial-automation-service.test.mjs` |
| Capacidades sem grant inventado, página parcial, lease, rate limit e autorização revogada | `web/finance/tests/financial-source-capabilities.test.mjs`, `financial-source-collection.test.mjs`, `financial-source-worker.test.mjs` |
| Componentes/datas observados e preservação de ausência histórica | `web/finance/tests/financial-order-components.test.mjs` |
| Alocações 1:N/N:1/N:N, parcelas, reversão, não reutilização de capacidade e transportes | `web/finance/tests/financial-cash-allocation.test.mjs`, `financial-cash-allocation-store.test.mjs`, `financial-allocation-frame.test.mjs`, `financial-allocation-worker.test.mjs` |
| UI/CSV canônicos, escopo, precisão, erro503 e autorização403 | `web/cloudflare/tests/financial-automation-client.test.mjs` |
| Empresas A/B, domínio App/Finance, DDL, imutabilidade, backfill/restore legado e novas escritas | `web/cloudflare/tests/tenant-sql-isolation.test.mjs`; `tenant-migration.test.mjs` |

Três cenários continuam **parciais no alcance ponta a ponta**: T08 (todos os desfechos financeiros de devolução), T14 (descoberta e acompanhamento efetivos de casos antigos) e T22 (todos os consumidores/Worker publicado e todos os gráficos pedidos). Nos demais cenários, o estado local refere-se aos modelos/serviços explicitamente listados; uma fixture da cadeia Wallet não prova que exista uma coleta Wallet operacional.

## Estoque persistente acrescentado após o primeiro run

O [recibo de nove testes](validation/inventory-focused-20261113.json) cobre o serviço `financial-inventory-bridge.mjs` com os serviços reais locais de fabricação, recebimento, inspeção, vínculos e razão. State kind `INVENTORY` guarda custos/fingerprints/revisões congelados e alocações imutáveis; não cria banco, dinheiro ou obrigação a partir da fabricação. O caso de 100 fabricadas e 80 vendidas mantém 20; revenda de uma peça devolvida recupera 1350 centavos históricos, dano de peça já consumida acrescenta 0 de perda.

A seleção de venda exige item original autorizado e evento de receita reconhecido, não somente valor de repasse. A UI recebe escolhas calculadas no servidor, sem campos para fabricar fingerprints/IDs. Retorno exige inspeção e vínculo ativo do mesmo lote e pedido; alteração posterior de inspeção transforma o efeito anterior em revisão. Reversão acrescenta histórico e mantém a competência original para retificação, sem alterar snapshots fechados.

O snapshot possui limites explícitos de até 150 lotes, 500 alocações e 190 KB; capacidade atingida devolve `CAPACITY_REACHED`/409 sem apagar fatos. Particionar/arquivar histórico além desses limites é uma evolução interna pendente.

A fonte emite até 50 eventos por página, com cursor amarrado à revisão `INVENTORY` e um lookup conjunto de vendas (≤6 chamadas D1 na fixture de 51 alocações). As fontes/políticas podem continuar parciais; registrar custos não comprova estoque de abertura ou completude da coorte. Usuário sem `returns.read` não consulta nem recebe provas dos recebimentos. Os DTOs físicos v1 continuam preservados, sem mudar seus flags de integração financeira.

Também passou o teste focalizado de 14 projeções, incluindo uma guarda de dia civil completo para Ads: sexta parcial da fabricação não absorve automaticamente todo o consumo diário. Esses runs são separados do primeiro run de 169 e não constituem soma de aceitação global.

## Contratos e fórmulas

O novo `financial_event_v1` usa escopo explícito de organização, loja, partição contábil e moeda. Cada lançamento contém sua conta física opaca `account_ref`. Débitos são positivos e créditos negativos; a soma do evento precisa ser zero. Resultado gerencial é o negativo da soma das contas de resultado reconhecidas na competência. Transferências patrimoniais não reconhecem a venda novamente. Somente eventos `CONFIRMED` são contabilizados; identidade conservadora fica em `REVIEW`.

As datas `event_at`, `competence_at`, `settlement_at`, `source_updated_at` e `observed_at` conservam funções diferentes. A competência depende da política aprovada; data de criação de pedido pago permanece estimativa histórica quando for essa a base. Despesa mensal salva é representada no fim da competência mensal, não como data diária exata de fabricação ou pagamento. Tributo fixo aprovado é reconhecido uma vez no mês, sem rateio diário inventado; pagamento não repete a despesa.

`financial_accounting_projection_v1` separa resultado, recebíveis, carteira disponível/retida, trânsito, banco e projeção. Saldo exige origem/fechamento compatíveis da mesma conta, moeda e intervalo. Um recebível legítimo pode permanecer aberto numa DRE encerrada; banco conciliado tem gates próprios. Ausência de fonte conserva `null`/`UNKNOWN`; série futura fica `NOT_OBSERVED`. Zero factual exige observação completa válida, inclusive um intervalo vazio efetivamente comprovado.

`financial_close_version_v1` congela snapshot, política, valores, revisões de eventos, cobertura e fonte. `ABERTO`, `EM_CONCILIACAO`, `PROVISORIO`, `PRONTO`, `FECHADO` e `RETIFICADO` têm transições no servidor. O snapshot é montado por callback confiável, nunca por totais do navegador. A transação verifica versão do fechamento, razão e configuração/fonte; uma aprovação de auto-fechamento retirada durante o job bloqueia a gravação. Mudança global do razão em outro período, sem alterar os fatos do período, não exige falsa retificação.

A semana de fabricação continua sexta13h→sexta13h Brasília. A semana financeira usa `CIVIL_FRIDAY_THURSDAY` ou `CIVIL_MONDAY_SUNDAY`; mês usa suas próprias competências civis, não a soma de semanas inteiras. Testes incluem fronteiras e fuso histórico com horário de verão. Ads diário não se transforma em corte horário exato sem fonte.

Os contratos antigos continuam separados: `business_month_v1`, `business_financial_closeout_v1`, `weekly_operating_report_v1` e DTOs físicos mantêm suas restrições `null`/`NOT_COMPARED` e seus avisos; o novo módulo não relaxa esses validadores para declarar conclusão.

## Armazenamento, escopo e migração

Os schemas novos são provisionados aditivamente, sem acrescentá-los ao antigo Admin `SCHEMA` nem mudar hashes `workspace_setup_v1`. O manifesto tenant inclui **59 objetos**:

- App: 14 tabelas e 14 triggers de `FINANCIAL_EVENT_SCHEMA`, `FINANCIAL_CLOSE_SCHEMA` e `FINANCIAL_AUTOMATION_SCHEMA`.
- Finance: 13 tabelas, 4 índices e 14 triggers de `FINANCIAL_CASH_ALLOCATION_SCHEMA`, `FINANCIAL_ORDER_COMPONENTS_SCHEMA` e `FINANCIAL_OBLIGATION_SCHEMA`.

A suíte instala os objetos completos em dois namespaces reais SQLite e verifica nomes, definições, valores independentes, bloqueio App↔Finance e triggers imutáveis. As novas tabelas não atribuem dados legados ao primeiro cadastro. O namespace comercial confiável deve corresponder exatamente ao contexto e domínio; uma wrapper válida de outra empresa não é aceita. As gravações comerciais dependem também do guard atômico de membership fornecido pela infraestrutura existente.

Idempotência dos eventos/lotes e snapshots foi ensaiada com queda de confirmação, corridas de revisão e perda de statement de auditoria. Backfill/backup/restore legados preservam bytes e novas escritas em testes sintéticos. Isso **não comprova migração do banco real ou base inicial completa do novo razão**. Não foram inventados saldos de abertura, fabricação antiga ou componentes históricos ausentes.

## Fontes efetivamente disponíveis e bloqueios

| Fonte/capacidade | Evidência atual | Trabalho restante |
| --- | --- | --- |
| Evidência salva de pedidos | Rota privada POST `/internal/finance/financial-sources-v1`, evidência V1/V2 por `run_id`, cursor e revisão; leitura minimizada sem nova consulta de provedor | Cobertura/grant real continuam independentes; cache pago não prova devoluções antigas, liberação, carteira ou banco |
| Componentes de pedido | Campos/datas capturados do retorno já existente de escrow/detail; históricos ausentes permanecem `NOT_CAPTURED`/parciais | Backfill autorizado e semântica completa dos componentes; captura não retroage sozinha |
| Wallet/Payout/descoberta antiga de Returns | Registro de capacidades e coletor genérico com pré-condições; **nenhuma consulta dessas APIs foi confirmada** | Documentação oficial acessível, método/contrato, grant real, adaptador e persistência ligados à coleta |
| Documentação oficial | Quatro páginas falharam no túnel com `URLError: Tunnel connection failed: 403 Forbidden`, antes da origem; tentativa escalada também não forneceu contrato | Falha de rede do ambiente não é resposta de falta de permissão da Shopee. Estado permanece `UNKNOWN` |
| Nubank/banco | Importador CSV/OFX legado; `financial-automation-cash-sources.mjs` lê registros/grupos importados, gerando propostas conservadoras em revisão | Nenhum adaptador/consentimento bancário real; falta extrato e saldos completos da mesma conta e identidade nativa adequada |
| Ads | `financial-automation-ads-sources.mjs` gera eventos diários `REVIEW` de cache/histórico salvo | Fuso e saldos/recarga nativos comprovados; revisão não é gasto confirmado no novo razão |
| Lotes, CMV e Returns físicos | Ponte persistente em `financial-inventory-bridge.mjs`, nove testes locais: lotes/custos congelados, itens originais + venda reconhecida, inspeção/vínculo, reversão e revisão | Cobertura integral da coorte/estoque de abertura e confirmação operacional; fonte V3 de itens ausente bloqueia alocação |
| Despesas e impostos | Leitura de despesa declarada, registry de snapshots de obrigações do App e política tributária aprovada | Fonte de obrigação não comprova pagamento; ligar evidência bancária/classificação e validar dados/regime/vigência |

A falta de um adaptador ou ponte é uma **lacuna de implementação**. A falta de grant, consentimento, sessão ou fonte real é uma **dependência externa**. A matriz mantém ambas; não encerra trabalho interno atribuindo-o apenas às credenciais.

Os runs legados representam coortes por criação do pedido. Não comprovam todos os pedidos criados antes e concluídos na competência financeira escolhida. Uma data `completed_at` observada pode sustentar aquele evento, mas não torna completo o conjunto de eventos reconhecidos por conclusão; o adaptador mantém essa cobertura parcial. O campo Shopee `original_cost_of_goods_sold` também não substitui custo histórico de fabricação da loja.

## Integrações locais posteriores

O backend informou e registrou **71/71** testes locais em `/workspace/financial-backend-validation-20261113.tap`, incluindo Worker estrito→callbacks App→lista/lookup V3 de item original, políticas, snapshots, observação econômica estável e jobs. A guarda final de state verifica revisão/hash, head e request na mesma transação. Budget em 72 execuções locais: máximo 36 chamadas D1/85 statements, dentro dos limites técnicos 50/100. Esses números descrevem aquele teste local, não uma execução real na conta.

O registry de obrigações/grupos registrou **46/46** locais em `/workspace/financial-obligation-combined-20261113.tap`: App ExpenseLedger→snapshot Finance recente→grupo `OBLIGATION_PAYMENT`, com parcelas, capacidade e fonte guardadas na transação. Propostas AP→BANK permanecem conservadoras em revisão quando a prova bancária é insuficiente; não descontam novamente a despesa. O ledger existente contém despesas operacionais declaradas pelo operador nas categorias fechadas `RENT`, `EMPLOYEES`, `BILL` e `OTHER`, com confirmação mensal preservada. Essa declaração é a fonte do registry. O banco genérico não cria automaticamente despesa, compra de estoque, retirada ou empréstimo; propostas sem classificação/evidência suficiente permanecem em revisão. Fonte de obrigação não certifica saldo nem classifica universalmente todo crédito/débito bancário.

O cliente passou pelos testes focados e perfis nativos normal/minificado, desktop/mobile e claro/escuro segundo os arquivos `financial-automation-client.test.mjs` e `financial-automation-client-chrome.test.mjs`. Componentes/estágios, cenários, vencimentos e seus CSVs usam os agregados do servidor. A última QA do Worker gerado deve ser registrada pelo gate final, após a última alteração do build. Runs se sobrepõem: não somar as contagens como se fossem testes distintos.

## Publicação e conferência operacional

**Nenhum recibo de CI/deploy ou observação da nova versão no domínio é afirmado por esta revisão documental.** A integração deve registrar commit, resultado dos gates obrigatórios, migrações/backup/rollback e bytes realmente servidos. Publicação técnica e conferência financeira são duas evidências distintas.

Para aceitar operacionalmente um fechamento, ainda é necessário comparar uma semana encerrada e um mês encerrado usando fontes equivalentes de pedidos/repasses, ajustes/devoluções, Ads, carteira/saques, banco, custo histórico e obrigações. Não há sessão autenticada/extrato real/grant confirmado para essa comparação nesta trilha. Nenhum lucro, saldo ou disponibilidade real foi certificado e nenhum movimento de dinheiro, mensagem ou fato operacional de QA foi criado por estes testes.

## Reversão técnica e alocações já existentes

As novas tabelas são aditivas e preservadas numa reversão. Antes de ativar o novo App, não existe uma interface pública nova criando grupos; uma falha nessa etapa permite reverter as versões anteriores mantendo os fatos. Depois de existirem alocações novas, a reversão preferencial é do App/Auth, conservando o Finance compatível com v1 e sua guarda contra reutilização no matcher antigo. Não rebaixar o Finance que conhece essas reservas para um matcher anterior sem verificar os grupos ativos e bloquear as escritas afetadas. A reversão de código não deve apagar nem ignorar reservas financeiras persistidas.
