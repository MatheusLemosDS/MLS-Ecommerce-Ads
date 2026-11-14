# Validação do complemento financeiro — 13/11/2026

## Gate atual .3 — continuidade da fonte

Release **2026-11-13.3**, fonte `f68525ea1d136350ece9942433352accdf97d992`, preparado `3cf489e33071b32bc73e2efaf2aecfc62618d46a`; [CI 43531882471](https://github.com/MatheusLemosDS/MLS-Ecommerce-Ads/actions/runs/43531882471) aprovada: **4432 Node, zero falhas/ignorados/cancelados; 67 Python**. A execução local completa passou nos mesmos hashes. Os oito perfis sintéticos do Worker foram regenerados. Publicação técnica às 2026-11-14T00:22:15.598Z: App `9bfc21d6-dec9-4fa6-89d8-7ea1dec50993`, Auth `dfd2fc99-728f-4f29-96ee-a4b256c5640a`, Finance `50b31451-c6cf-4456-bd09-be5d1956e0da` retido. Os 17 GETs/redirecionamentos, oito assets e 24 perfis públicos passaram com respostas TLS verificadas e renderização CDP. Sem sessão Live do proprietário.

Na execução natural de 14/11 às 00:32:51 UTC, novembro avançou à fonte v2: 100 eventos de pedidos preservados e 13 eventos diários de Ads, sem novo SOURCE_INVALID ou reinício do cursor. A coleta continua parcial. A observação de 2026-11-14T00:33:17.899767+00:00 usou três SELECTs, zero escritas e nenhum cron forçado. Fonte v1→v2; ledger 100→113, exatamente 13 eventos `ADS_DAILY_CONSUMPTION_REVIEW`. As assinaturas de fonte/pedidos e o cursor foram preservados. O job permanece COLLECTING e os eventos REVIEW; isso não comprova lucro, saldo bancário ou fechamento. O alvo histórico de outubro tem `FINANCIAL_SOURCE_RUN_NOT_FOUND`, uma lacuna de fonte distinta do erro corrigido.

A correção move somente a amostragem do horário de validação para depois do callback e da revalidação de acesso. O teste de avanço do relógio falha no código anterior e passa na correção. O teste de observação/cutoff futuro passa nos dois cortes e mantém a rejeição sem alterar razão/checkpoint. Suites focadas: 35/35; pós-publicação de assets/gates: 64/64, execuções separadas da suíte4432. [Recibos técnicos, histórico .2 e retomada](publication-live-20261113.json); [proveniência final local/CI](validation/final-local-20261113.json). **Aceite financeiro real: NOT_PERFORMED; M2/M2.2 abertas.**


<!-- FINANCIAL_AUTOMATION_PUBLICATION -->
## Histórico da .2 — publicação inicial e primeira observação

Fonte `e6bbb189ec2331c0a07136c5b9f720e2e300b5d4`; CI[43527800185](https://github.com/MatheusLemosDS/MLS-Ecommerce-Ads/actions/runs/43527800185) concluída `success` para `e6bbb189ec2331c0a07136c5b9f720e2e300b5d4`. Resultado da execução completa final: **4430 Node; 0 falhas; 0 ignorados; 0 cancelados; 67 Python**. Proveniência e comandos em docs/financial-automation/validation/final-local-20261113.json. A contagem desta execução é própria; não somar os runs focalizados169/83, os testes de UI ou execuções anteriores.

A release2026-11-13.2 foi conferida em 2026-11-13T23:50:26.229Z: App`3cc631da-4a91-4fd0-b030-c41537cc8f43`, Auth`c00d5164-f663-4cdf-b137-28f345e181c2`, Finance`50b31451-c6cf-4456-bd09-be5d1956e0da`; fontes raw/configuração e assets em [publication-live-20261113.json](publication-live-20261113.json). Escopo público e autenticação em [publication-live-20261113.json](publication-live-20261113.json). A QA local é sintética: normal/minificado,320/1365px,claro/escuro; controles44px, navegação com documento novo comprovado, CSV canônico,403/503 e falha do asset.

**Aceite financeiro da conta real: NOT_PERFORMED.** Não houve comprovação de Wallet/Payout, conta/saldos bancários, coorte completa de conclusão, produção/estoque de abertura ou valores de uma semana/mês da loja. Ads/PROMO, saques e transferências não foram executados. A matriz continua separando validação local, gaps internos, dependências externas e aceitação financeira. O histórico focalizado abaixo descreve cortes anteriores e não define o recibo final.

### Primeira execução natural observada

Em 13/11/2026, o cron natural iniciou a nova coleta às 23:52:51 UTC e salvou a primeira página até 23:52:54 UTC. A observação somente por dez SELECTs às 23:54:35 UTC encontrou o job de novembro em `COLLECTING/COLLECT`, uma fonte salva e **100 eventos, todos `ORDER_FINANCIAL_REVIEW`**. Não apareceu `RETRY_WAIT` ou código de exceção naquela observação. As 15 pendências incluem mais páginas, coorte/recarga não comprovadas e fontes de carteira/banco ainda ausentes. O schema de fechamento ainda não tinha sido observado; não existe aceite de um fechamento ou saldo real por esse recibo. O observador não forçou o cron, não usou sessão do proprietário e não escreveu fatos. Evidência agregada e hash do recibo original em [publication-live-20261113.json](publication-live-20261113.json).

<!-- END_FINANCIAL_AUTOMATION_PUBLICATION -->

**Histórico da preparação local (anterior ao recibo final acima):**

Este relatório acompanha o candidato local sobre `6578e21098ff799e59433af92880d249432ceeb4` (main após PR #120). Os 28 requisitos e 24 cenários foram reconciliados com os arquivos atuais na [matriz](MATRIZ_EXECUCAO.json), mantendo os inputs originais intactos. `VALIDADO_LOCAL` descreve o limite do teste indicado; não equivale a conclusão de todas as integrações, publicação ou aceitação financeira da loja.

## Execução observada nesta revisão

O [recibo JSON](validation/local-focused-20261113.json) contém a lista exata dos 20 arquivos e o comando `node --test --test-reporter=tap`: **169 aprovados; 0 falhas; 0 pulados; 0 cancelados**. Ambiente: Node/SQLite local, fontes e identidades sintéticas. O log bruto desta sessão está em `/tmp/financial-documentation-focused-20261113.tap` e não é dependência de execução do aplicativo.

Não somar esse total aos runs anteriores de 53 ou 42 testes: vários arquivos se repetem. Esta execução não incluiu a suíte completa do projeto, Python, CI, todos os Workers gerados, a verificação do domínio ou a sessão real do proprietário. Os gates finais e o recibo de publicação da integração constam da seção final acima; este recibo focalizado169 continua histórico.

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

A preparação histórica abaixo não executou a publicação. O recibo final no início deste documento agora comprova CI, versões, bytes e verificações públicas desta entrega. Publicação técnica e conferência financeira continuam sendo duas evidências distintas.

Para aceitar operacionalmente um fechamento, ainda é necessário comparar uma semana encerrada e um mês encerrado usando fontes equivalentes de pedidos/repasses, ajustes/devoluções, Ads, carteira/saques, banco, custo histórico e obrigações. Não há sessão autenticada/extrato real/grant confirmado para essa comparação nesta trilha. Nenhum lucro, saldo ou disponibilidade real foi certificado e nenhum movimento de dinheiro, mensagem ou fato operacional de QA foi criado por estes testes.

## Reversão técnica e alocações já existentes

As novas tabelas são aditivas e preservadas numa reversão. Antes de ativar o novo App, não existe uma interface pública nova criando grupos; uma falha nessa etapa permite reverter as versões anteriores mantendo os fatos. Depois de existirem alocações novas, a reversão preferencial é do App/Auth, conservando o Finance compatível com v1 e sua guarda contra reutilização no matcher antigo. Não rebaixar o Finance que conhece essas reservas para um matcher anterior sem verificar os grupos ativos e bloquear as escritas afetadas. A reversão de código não deve apagar nem ignorar reservas financeiras persistidas.

## Guarda final de ajustes do repasse

O adaptador NET somente confirma receita quando os ajustes observados são zero e o componente de recarga/suporte técnico também foi observado como zero. Ajuste ou topup sem classificação mantém o evento em revisão, sem lançamentos reconhecidos; campo ausente não é convertido em zero. Os códigos ORDER_ADJUSTMENT_CLASSIFICATION_REQUIRED e ORDER_TOPUP_COMPONENT_REQUIRED indicam a próxima conferência. O cálculo estimado legado permanece preservado. A suíte focada do guard passou 83/83, incluindo persistência do CMV, paginação das pendências, fechamento impedido com fonte ambígua e competência no horário de verão de 2015. Log local: /workspace/financial-net-quality-guard-20261113.tap.

## Correção de continuidade — .3 publicada e retomada observada

A segunda execução natural, observada em 14/11/2026 às 00:00:07 UTC, encontrou `FINANCIAL_AUTOMATION_SOURCE_INVALID` na lane Ads. Os primeiros100 eventos e o checkpoint anterior foram preservados. A causa foi reproduzida com o leitor real de Ads: a ingestão validava `observed_at` contra o horário anterior aos awaits. A correção amostra o relógio somente depois da leitura e da revalidação de acesso, sem remover os limites de futuro. O teste de regressão falha no código anterior e passa após a correção; observação/cutoff realmente futuros continuam rejeitados sem alterar o razão ou checkpoint. Cinco suites focadas passaram35/35. **A correção passou nos gates completos e foi publicada; a retomada natural de novembro foi observada conforme o gate atual acima. Os cortes anteriores e suas falhas permanecem no histórico.**
