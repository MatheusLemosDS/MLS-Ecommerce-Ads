# MLS Finance + MLS Returns — conciliação por pedido

Atualizado em **27/10/2026**. Este documento descreve o primeiro incremento da M2 do
[roadmap canônico](ROADMAP_MLS_COMMERCE_OS.md).

## Objetivo

Conferir, por pedido pago, as evidências já salvas de:

- repasse-base informado pela Shopee;
- ajuste financeiro assinado;
- repasse após ajuste quando a relação `base + ajuste = após ajuste` é exata;
- ocorrência de liberação encontrada no calendário da Shopee;
- valor da liberação quando ele é compatível com a evidência financeira;
- solicitações de devolução/reembolso e seus valores quando já disponíveis.

A conciliação não transforma uma liberação da Shopee em comprovante de depósito
bancário e não chama um pedido sem ocorrência no calendário de "não pago".

## Contrato negociado

O caminho privado App → Auth → Finance pode pedir:

```
X-Braza-Release-Contract: release-orders-v1
```

Quando a extensão está disponível, o Financeiro devolve
`finance_escrow_releases_v2`:

- `report`: o relatório `finance_escrow_releases_v1` exato;
- `orders`: `finance_escrow_release_orders_v1`.

Chamadores sem o header continuam recebendo o v1. Uma implantação mista pode
continuar usando o relatório legado sem inventar detalhe por pedido.

O detalhe público ao proprietário usa `business_escrow_releases_v2`. O endpoint
legado sem `evidence` preserva `business_escrow_releases_v1`.

## Estados por pedido

| Estado | Significado |
| --- | --- |
| `VERIFIED` | Existe uma única ocorrência de liberação e seu valor coincide exatamente com o repasse-base ou com o repasse após ajustes verificado. |
| `LOCATED_UNVERIFIED` | Existe uma única ocorrência, mas o valor não pôde ser compatibilizado com segurança. |
| `AMBIGUOUS` | Mais de uma ocorrência do calendário aponta para o mesmo pedido; nenhum valor individual é escolhido. |
| `NOT_LOCATED` | O pedido não apareceu no calendário consultado até o corte disponível. Isso não comprova falta de pagamento, falta de recebimento ou saldo a receber. |

A lista exposta ao navegador usa somente `order_hash` interno. Números privados
de pedido, tokens e credenciais não atravessam o contrato.

## Valores mostrados

Uma linha pode conter:

- repasse-base;
- ajuste informado;
- repasse após ajuste;
- valor liberado conferido;
- data da liberação;
- diferença entre liberação conferida e repasse-base.

O ajuste não é atribuído automaticamente a uma devolução específica. Quando a
liberação coincide com o repasse após ajustes, a diferença já está incorporada
nesse repasse e **não é descontada novamente** como reembolso.

A conferência de devoluções continua sendo uma evidência separada. O navegador
pode cruzar localmente o mesmo `order_hash` para mostrar, lado a lado, status e
valor de reembolso informado pela Shopee, sem criar outra consulta ao provedor.

## O que ainda não significa "a receber"

O resumo pode informar quantos pedidos ainda não têm liberação localizada neste
calendário e, quando disponível, a soma conhecida de seus repasses após ajustes.

Essa soma **não é apresentada como valor ainda a receber**, porque:

1. o calendário consultado tem um recorte temporal próprio;
2. um pedido pode aparecer em uma liberação posterior;
3. uma liberação da Shopee não comprova o crédito bancário;
4. múltiplas ocorrências e valores incompatíveis permanecem pendentes.

O cálculo global de "quanto a Shopee ainda precisa liberar" só deve ser habilitado
quando o sistema puder comprovar a semântica e a cobertura do ciclo de liberação
para a coorte completa, sem misturar liberação na plataforma com liquidação em
banco.

## MLS Finance, MLS Returns e MLS Auditor

A Central de Comando projeta os dados já carregados em tarefas locais:

- liberação ambígua → MLS Finance;
- valor liberado sem compatibilidade monetária → MLS Finance;
- evidência financeira ausente → MLS Finance;
- falha da fonte de liberações → MLS Auditor;
- pedidos ainda sem ocorrência no calendário → trabalho de conciliação, não
  alerta de "não recebido";
- divergência entre o repasse após ajuste visto pela conciliação de devoluções e
  pela conciliação de liberações → MLS Auditor e MLS Hermes ficam bloqueados.

Nenhum agente executa ação comercial nesta fase.

## Coleta e D1

Este incremento não introduz endpoint novo da Shopee.

Ele reutiliza:

- a evidência financeira já persistida por pedido;
- o calendário `get_escrow_list` já coletado pela auditoria financeira;
- a tabela existente `business_escrow_release_reports`.

O envelope v2 fica no mesmo payload. A leitura owner do detalhe usa o mesmo
snapshot local e não inicia coleta do provedor. Não há timer de navegador novo.

## Limites permanentes

- `realized_net_cents` permanece desconhecido sem liquidação comprovada;
- devolução aprovada não equivale automaticamente a débito/pagamento;
- liberação da Shopee não equivale a depósito bancário;
- valores ausentes não viram zero;
- duplicidades não são escolhidas arbitrariamente;
- conflitos entre fontes bloqueiam a conclusão em vez de escolher o valor mais
  conveniente;
- Ads/PROMO permanece **LOCKED**.
