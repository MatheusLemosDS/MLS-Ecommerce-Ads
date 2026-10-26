# Valores de devolução e saldo após ajustes

Incremento de **26/10/2026**, a partir de `b97d55e` (PR #6). Atende ao pedido
do operador para acompanhar o valor de uma devolução aprovada e seu resultado
financeiro. O painel usa as evidências já salvas, com o mesmo orçamento de
coleta e sem iniciar consultas individuais ao abrir os detalhes.

## O que aparece na Visão geral

Em **Conferir pedidos e devoluções**, o quadro **Valores das devoluções por
situação** mostra quantidade de solicitações, valores informados e cobertura.
Há três grupos separados:

- **Pedidos pagos:** pertencem à base de repasse do resumo mensal.
- **Pedidos em revisão:** incluem `TO_RETURN` e permanecem fora dos valores
  pagos até que a classificação financeira da origem mude.
- **Outros pedidos:** preservam ocorrências dos demais estados sem acrescentar
  seu valor à base paga.

Dentro de cada grupo, solicitações aceitas, `REFUND_PAID`, canceladas,
encerradas, em análise, em processamento, abertas, desconhecidas e ainda sem
detalhes permanecem separadas. O rótulo monetário é **Valor de reembolso
informado pela Shopee**. A data mostrada é a da consulta; não é uma data de
crédito ou débito presumida.

`ACCEPTED` não é classificado automaticamente como um pedido de reembolso
ainda em aberto. O comunicado oficial 905 informa que esse estado passou a
ser final no fluxo de Returns & Refunds. A informação disponível também não
estabelece, por si só, uma transferência bancária ou um débito específico no
saldo do vendedor. Os limites da pesquisa estão abaixo.

Quando faltam valores, o quadro mostra o subtotal conhecido e quantas
solicitações ainda não têm valor. Um valor explicitamente igual a zero continua
sendo zero. Uma lista vazia confirmada, uma referência desconhecida e falta de
permissão têm explicações distintas.

Os totais abrangem todas as referências identificadas no intervalo, mesmo
quando apenas quarenta solicitações estão visíveis. Se faltam intervalos ou
referências, a cobertura parcial permanece indicada. Os casos que ultrapassam
o limite interno de dois mil detalhes continuam contabilizados como pendentes.

## Repasse de cada pedido afetado

O detalhe mostra, quando a evidência já salva for compatível:

1. Repasse-base informado.
2. Ajuste com o sinal preservado.
3. Repasse informado após ajustes.
4. Horário original da consulta financeira.

O valor após ajustes é apresentado apenas quando a evidência em BRL satisfaz,
em centavos exatos, a relação `base + ajuste = após ajustes`. Essa é uma
verificação de consistência dos campos observados, não uma prova de que todos
os ajustes se referem às devoluções exibidas.

Pedidos `TO_RETURN` fora da base paga continuam com repasse indisponível nesta
conferência. O probe já existente para esses pedidos recupera referências de
devolução, mas não transforma o pedido em venda paga. O incremento não usa
zero para preencher essa ausência.

Pedidos afetados sem detalhes visíveis também aparecem, com a explicação de
referências ausentes, vazias ou de lista parcial. O detalhamento de repasses
fica limitado a quarenta pedidos por intervalo e prioriza os pedidos das
solicitações visíveis. As referências exibidas continuam sendo internas, sem
expor números originais de pedidos ou devoluções.

## Saldo após ajustes informados

O novo quadro calcula uma apresentação provisória para a mesma base paga:

```text
repasse informado após ajustes
− produção conhecida
− DAS da competência
− consumo de anúncios
− despesas declaradas
+ recarga de anúncios retida no repasse, quando identificada
= saldo após ajustes informados
```

A implementação confere também a expressão equivalente:

```text
saldo do resumo mensal + ajuste informado = saldo após ajustes informados
```

O valor de reembolso da tabela não participa novamente dessa soma. Por exemplo,
se a fonte informa repasse-base de R$ 100,00, ajuste de −R$ 20,00 e repasse
após ajustes de R$ 80,00, o cálculo parte dos R$ 80,00. Com R$ 50,00 de custos
e sem recarga, o saldo apresentado é R$ 30,00. Uma devolução de R$ 20,00
exibida separadamente não cria outro desconto no mesmo cálculo. Esse exemplo
não presume que o ajuste observado tenha sido causado por aquela devolução.

O cálculo exige a mesma publicação, execuções, revisões, datas, cobertura e
repasse-base do resumo mensal. Todos os intervalos e ajustes necessários
precisam estar disponíveis. A mudança de custo dentro da mesma publicação
recalcula a apresentação local; não mistura um relatório antigo com uma nova
base financeira nem provoca outra coleta.

O estado permanece **provisório**. Quando falta produção, o quadro identifica
**custos incompletos** e mostra somente o saldo com os custos conhecidos. Uma
fonte antiga conserva o aviso e suas datas originais. O resultado estrito do
mês, as pendências de devolução e o lucro realizado mantêm seus contratos.

### Diferença para o valor ainda a liberar

O repasse após ajustes pode incluir valores já liberados. Para calcular o
quanto ainda falta receber, seriam necessários vínculos completos entre a
base de pedidos, as liberações e os ajustes aplicáveis. O calendário de
liberações disponível não fornece, sozinho, esse saldo pendente.

Por isso, `remaining_receivable_cents` e `realized_net_cents` permanecem `null`.
O painel explica a ausência do valor ainda a liberar. A seção
[Liberações da Shopee](LIBERACOES_E_PEDIDOS.md) continua preservando sua base
de datas e suas próprias pendências.

## Compatibilidade e consumo

O Financeiro negocia `finance_reconciliation_v3`, preservando o relatório v1 e
o detalhe de revisão v1, e acrescenta `finance_reconciliation_money_v1` no
mesmo envelope. A extensão usa `X-Braza-Refund-Contract: refunds-v1` junto do
contrato já existente `finance-reconciliation-v2`. Auth ou Finance anteriores
podem devolver v1/v2 válidos na mesma chamada.

O App salva os valores no mesmo payload do relatório, com identidade e revisão
da fonte. A consulta administrativa `evidence=refunds-v1` devolve
`business_reconciliation_v3`; as leituras v1 e `review-v1` mantêm seus formatos.
Um v3 inválido não é aceito descartando sua extensão. Falhas preservam a última
evidência validada e seus horários.

Não foram acrescentadas tabelas, consultas SQL, chamadas à Shopee, timers ou
coletores. Os limites de duas chamadas externas por execução, cache e espera
após falha permanecem. O payload aumenta com o detalhamento, respeitando
64 KiB entre os Workers e 262 KiB no contrato do App; isso não é uma projeção
de economia na fatura do Cloudflare.

## Pesquisa oficial e alcance da evidência

Consulta em **26/10/2026**, usando somente fontes oficiais nesta continuidade:

- [Detalhes de devolução](https://open.shopee.com/documents/v2/v2.returns.get_return_detail?module=102&type=1): o trecho indexado define `refund_amount` como o valor do reembolso e identifica a consulta por `return_sn`.
- [Fluxo de devoluções](https://open.shopee.com/developer-guide/227): os trechos descrevem identificadores próprios por solicitação e o estado aceito após acordo no fluxo de refund-only.
- [Comunicado 905](https://open.shopee.com/announcements/905): informa a mudança de estado final para `ACCEPTED`. A grafia anterior no trecho é `RETURN_PAID`; não foi substituída por `REFUND_PAID` por inferência.
- [Detalhe financeiro](https://open.shopee.com/documents/v2/v2.payment.get_escrow_detail?module=97&type=1): o trecho descreve repasse esperado, sujeito a alteração antes de concluir o pedido.

As páginas completas retornaram 403 ou indisponibilidade na abertura; os fatos
legíveis vieram dos trechos oficiais indexados. Não foi confirmado um contrato
que associe universalmente `refund_amount`, `ACCEPTED`, `REFUND_PAID` ou
`CLOSED` a crédito bancário, débito do vendedor ou à data desse lançamento.
Também não foi confirmada uma correspondência individual entre devolução e
ajuste. Nenhum endpoint novo foi introduzido a partir desses trechos.

## Diagnóstico recebido e validação

O diagnóstico do operador, com `checked_at: 1793024105`, contém 313 pedidos,
252 pagos, 267 unidades com custo identificado, nenhuma unidade pendente,
cinco pedidos `TO_RETURN` em revisão e quatro pedidos pagos com devolução.
O saldo registrado é R$ 2.367,07, ainda provisório. Essa base mudou em relação
ao diagnóstico anterior; a ausência da pendência não é uma conferência
individual do mesmo pedido histórico.

A fonte financeira mais antiga tinha 1.146 segundos, acima dos 900 segundos
da política vigente, explicando `FINANCIAL_SOURCE_STALE`. O diagnóstico mostra
uma nova coleta em andamento, sem erro atual. Nenhum horário foi renovado
artificialmente para eliminar esse aviso.

As regressões usam coletores, bancos e Workers gerados, normais e minificados,
com respostas controladas. Conferem estados e coortes, reembolsos parciais,
valores ausentes e zero, ajustes positivos e negativos, truncamento, escopo,
compatibilidade, fonte antiga, custos incompletos e ausência de dupla dedução.
A confirmação dos valores de devolução da conta real depende das evidências
retornadas pela Shopee e disponíveis no painel autenticado.
