# Produção diária e parâmetros do Hermes — 03/11/2026, Brasília

**Estado: `PUBLISHED_VERIFIED`.** Versão **2026-11-03.2 — Produção diária e parâmetros do Hermes**.
Branch `feature/production-daily-hermes-20261103`, base `d1aaa55eb92e820447318522c759b924d1c288cb`.

App publicado e conferido em **03/11/2026 às 13:14:46 Brasília**. Fonte `c106ad84145d6f27265783ead318b45eea8c8e2c`, head `fef88d1d53b0354976a5f7dd2b197303c91c0ce0`, PR [#109](https://github.com/MatheusLemosDS/MLS-Ecommerce-Ads/pull/109), CI [41670540646](https://github.com/MatheusLemosDS/MLS-Ecommerce-Ads/actions/runs/41670540646) aprovada. Consultar a PR para integração Git; publicação não comprova merge.

A Live anterior comprovada é **2026-11-03.1**, App `caa919a6-096f-4427-93a6-5fb50c0ac41d`,
Auth `ec385ca9-a986-49ec-abab-25a29daaf33b` e Finance `9ed0bd7d-269a-4e5f-81d0-63be8c6ac2c4`.
A PR [#108](https://github.com/MatheusLemosDS/MLS-Ecommerce-Ads/pull/108) foi integrada em
`d1aaa55eb92e820447318522c759b924d1c288cb`, em **03/11/2026 às 12:18:03 Brasília**, com CI final
[41660632960](https://github.com/MatheusLemosDS/MLS-Ecommerce-Ads/actions/runs/41660632960)
aprovada e árvore/vetor Live conferidos. O [guia anterior](MLS_M3_VARIANT_ORDER_EVIDENCE_2026_11_03.md)
preserva o corte de publicação e não foi reescrito.

## Caminho de uso

O incremento coloca **Produção → Fabricação e custos** na frente da operação.
Escolha dia/mês e consulte o histórico salvo. O gráfico mostra custos registrados
por dia, detalhe da data escolhida e empates de maior custo/quantidade registrada.
O painel de fabricação abre ao acessar Produção; abrir outro agente não inicia
a leitura desse ledger. A referência dos pedidos pagos fica em **Referência das
vendas**, com seu mês e fonte próprios. Ela usa custo atual/data do pedido;
peça física, unidade comercial e kit não se convertem automaticamente entre si.

Em **Hermes → Análises → relatório selecionado**, todos os parâmetros salvos,
incluindo anúncios, aparecem junto à decomposição do saldo. O proprietário
esclareceu que o cálculo da imagem estava correto; a melhoria é de leitura,
sem reescrever os valores históricos.

## Fabricação, custo histórico e cobertura

A fonte é o ledger confirmado pelo operador. A data é `produced_date` em
Brasília. Data de registro, pagamento, envio, cancelamento e montagem DTF não
provam outra data de fabricação. Cancelar uma venda não apaga o custo de uma
peça que foi realmente fabricada e registrada. Anulação/substituição continua
auditada: o registro anulado fica no histórico e sai da quantidade/custo ativo.

O custo utiliza a fotografia histórica salva por peça; mudar a tabela atual não
recalcula fabricação passada. Dia sem registro fica `NO_RECORDS`/desconhecido;
custo não informado fica `PARTIAL_COSTS`/desconhecido. Somente custo explicitamente
declarado como zero permite zero. Registros não comprovam toda a fabricação da
loja nem quitação de fornecedor/pagamento em caixa.

O maior custo só aparece quando todos os custos ativos registrados no mês são
conhecidos. Custo desconhecido em qualquer dia bloqueia esse pico estrito; um
subtotal não vira prova do maior gasto. Quantidades físicas registradas continuam
consultáveis com empates. Meses com apenas registros anulados continuam no histórico.
O mês atual termina no dia de Brasília da leitura salva, sem projetar dias futuros
como zero.

## Lucro diário em fonte independente

A comparação financeira utiliza somente a estimativa diária validada já salva
para o mês escolhido. Sua data é a criação dos pedidos pagos/cobertura financeira,
não a fabricação. O ranking usa todo o mês salvo elegível, e exclui pendências,
datas ausentes e o dia atual parcial. A janela visual curta não decide o melhor
dia do mês. Positivo/negativo e datas permanecem explícitos.

O ledger não é subtraído novamente da estimativa, cuja referência de produção
já foi descontada. Essa comparação não transforma estimativa em lucro final por
SKU, recebimento bancário ou fechamento M2.

## Hermes: parâmetros e datas preservados

Cada análise mantém o contexto financeiro congelado por execução. Valores,
fingerprint, protocolo legado e texto histórico não mudam com a atualização do
painel. A apresentação identifica dia de Ads/análise e, separadamente, intervalo
mensal financeiro e horário de captura usados naquela execução.

A relação apresentada, usando parâmetros do mesmo snapshot, é:

`repasse − produção de referência − imposto − anúncios − outras despesas + recarga reposta`.

O repasse já contém as deduções da Shopee; elas não são descontadas outra vez.
O resultado exibido permanece o valor registrado na análise. Parâmetro ausente
não é zero; erros/incompletude preservam os bloqueios. Abrir uma análise antiga
não a transforma em análise atual nem dispara uma execução paga.

## Compatibilidade, validação e publicação

Somente App é promovido. Auth/Finance, schemas legados, rotas, bindings,
configuração, domínios, flags e cron permanecem no vetor conhecido. Os gráficos
usam leituras salvas existentes, sem nova fonte Shopee/coletor/backfill ou fatos
criados para QA. Seis agentes, meses/rascunhos e correções devem ser preservados.

Validação completa: **3483 Node e 67 Python**, sem falhas/skips/cancelamentos; CI do head exato e QA sintética normal/minificada em 320/1365 px aprovadas.

| Worker | UUID publicado ou preservado | SHA-256 gerado | SHA-256 publicado |
| --- | --- | --- | --- |
| App | `81ca539d-6785-46f0-b854-fdb8861e80f6` | `f98abf022eb2b437bad2e14ef3d35b9d3bb04f2dd7733ab8e739e27f77273755` | `72f7a33ea88fc4171ca0dd06400a3fbee28790e493258d1192874e099c751e9f` |
| Auth | `ec385ca9-a986-49ec-abab-25a29daaf33b` | `47c83f87f191fd0e5ff503d9c4bcf4671cd986b0965e66e84f1a6ed952dac925` | `2a2c2433c6fba25d1c399991595c96e6b8a85045edb77879c8270c446cb45ad2` |
| Finance | `9ed0bd7d-269a-4e5f-81d0-63be8c6ac2c4` | `08ada5ecec92350f4f8301fdb7baa00f5f8083a0e8390296b2870e0ff3cdc1a5` | `e5bf80e14ff00e5b365bfbcfb25bf3a4dc1e42bf40bb0e4259909649eea1d5cd` |

App publicado; Auth/Finance e vetor/configuração/domínios/flags/cron conferidos. O publisher não consultou D1/owner/provedor nem criou fatos para QA.

## Histórico real antes da publicação

Conferência somente leitura em 03/11/2026 às 12:34:17 Brasília, anterior à publicação, não encontrou a tabela de registros de fabricação no banco verificado. Quantidades e datas eram desconhecidas, não um histórico vazio de custo zero. As vendas não permitem reconstruir datas reais de fabricação: o operador precisa confirmar os lotes/peças realmente produzidos e suas datas/custos. A entrega não criou fabricação.

## Continuidade e limites

O proprietário já autorizou melhorias validadas na Live; o estado preparado não
repete aquela aprovação. Disponibilidade técnica/QA sintética não comprovam uso
físico real, toda a fabricação, pagamento ou aceite operacional.

M2/M2.2 e o restante da M3 continuam abertos. Conferir fabricação/recebimentos
reais, origem/cobertura e o mesmo recorte no Seller Centre/banco antes de fechar
o mês. Não presumir valores ausentes, copiar a declaração de despesas de novembro
para outros meses ou valorar/reservar/consumir peça devolvida sem evidência própria.
Hermes permanece Observador; Ads/PROMO e escritas de preço/estoque seguem os gates.
