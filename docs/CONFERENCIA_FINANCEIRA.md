# Conferência do resultado e histórico automático

A Visão geral reúne uma previsão do mês. Em **Conferência do resultado**, o
proprietário pode verificar a conta, a cobertura dos pedidos, os horários das
fontes e as versões das referências usadas. Consultar esse histórico não faz
novas chamadas à Shopee.

O cálculo é:

```
Repasse previsto, já com deduções da Shopee
− produção das unidades vendidas
− DAS-MEI da competência
− consumo de anúncios nas mesmas datas
− outras despesas declaradas
+ recarga retida no repasse, somente quando identificada como recarga
= resultado líquido previsto
```

Vendas dos produtos são uma informação de contexto; não são somadas outra vez
ao repasse. Taxas e frete já deduzidos do repasse não são descontados novamente.
Recarga de saldo não equivale a consumo de anúncios. Se o ajuste ainda não tem
natureza confirmada, a conta permanece pendente. Zero exige evidência ou uma
declaração explícita; campo desconhecido continua desconhecido.

Para este MEI, o DAS informado é **R$ 86,05 por mês em 2026**, uma única vez na
competência. Os 2% anteriores eram uma estimativa substituída por essa regra.
O cadastro não consulta o PGMEI nem comprova pagamento do DAS. Produção usa os
custos e vínculos cadastrados, com suas revisões; não é prova do custo histórico
efetivamente pago em cada pedido.

## O que o histórico preserva

Depois de concluir uma leitura mensal, o sistema registra automaticamente
mudanças nos valores, pendências, cobertura ou versões usadas. Consultas iguais
não geram outra versão. Apurações interrompidas no limite também podem guardar
o estado pendente; cada página intermediária de uma coleta em andamento não é
uma nova versão financeira.

Cada registro conserva a fórmula em centavos, valores disponíveis, pendências,
quantidades de pedidos por situação, período e versões de produção, vínculos,
regras de custo, DAS e despesas. Um SHA-256 identifica seu conteúdo financeiro.
Ele serve para verificar integridade interna; não é assinatura ou certificação
da Shopee. O histórico mantém as **128 versões mais recentes por mês**.

Os horários pertencem à observação preservada. A leitura atual pode ter os
mesmos valores e horários mais recentes sem produzir nova versão. Uma resposta
antiga não substitui uma observação posterior. O histórico é privado, exige
sessão do proprietário e não contém tokens, compradores ou números de pedidos.
Uma mudança futura não altera a explicação do resultado anteriormente guardado.

A identificação persistente de produtos e as revisões das classificações estão
descritas em [Custos automáticos e pendências](CUSTOS_AUTOMATICOS_E_PENDENCIAS.md).
O detalhe mensal pode mostrar um subtotal conhecido dos pedidos exclusivos,
separado do saldo final. Esse subtotal não comprova recebimento nem remove as
pendências do mês.

## Frescor, cancelamentos e devoluções

O Financeiro informa o primeiro e o último horário de consulta dos pedidos.
O App usa o mais antigo para conferir o frescor do mês atual: terminar agora
uma coleta pausada há vinte minutos não renova os dados anteriores. Contratos
legados usam o início da coleta como limite conservador. Uma fonte com mais
de quinze minutos mantém a previsão pendente até nova leitura.

Pedidos cancelados e não pagos ficam fora do conjunto pago. Cancelamentos em
andamento, estados desconhecidos e devoluções presentes ou sem cobertura
impedem liberar a previsão final. A população financeira é formada por pedidos
pagos **criados no mês**; o gasto de anúncios corresponde aos dias desse mês.
Essa combinação não demonstra atribuição de anúncios a cada pedido ou produto.

## Conferir as pendências de cada pedido

O atalho **Conferir pedidos e devoluções** abre as evidências salvas. A seção
separa pedidos em revisão, fora dos valores pagos, de pedidos pagos com
devolução identificada. Mostra a situação original, a disponibilidade das
referências, os detalhes consultados e a próxima conferência necessária.
As referências são internas do sistema; não são números pesquisáveis de
pedidos da Shopee. Abrir o detalhe não inicia uma consulta externa.

Um cancelamento em andamento não é automaticamente uma devolução sem
referência. Uma lista de referências vazia, quando confirmada pela fonte, é
diferente de uma referência ainda desconhecida. Nenhuma dessas situações,
isoladamente, encerra a revisão financeira do pedido. Os limites de cobertura,
compatibilidade e atualização estão em
[conferência de devoluções e ajustes](CONFERENCIA_DE_DEVOLUCOES_E_AJUSTES.md).

## O que ainda falta para comprovar lucro recebido

A base já integra três leituras distintas:

| Leitura | Evidência preservada | Limite da interpretação |
| --- | --- | --- |
| `GET /api/v2/payment/get_escrow_detail` | Repasse esperado, referências de devolução e campos de ajuste disponíveis por pedido. | Repasse esperado e ajuste informado não comprovam recebimento bancário. |
| `GET /api/v2/returns/get_return_detail` | Situação e valor de reembolso informado de cada referência exata de devolução. | O valor informado não comprova crédito bancário ou débito no repasse do vendedor e não é descontado novamente. |
| `GET /api/v2/payment/get_escrow_list` | Calendário de liberações, vínculos exatos com pedidos e parcelas monetárias compatíveis. | Liberação na Shopee, data de criação do pedido e depósito bancário são eventos distintos. |

O [cruzamento das liberações](LIBERACOES_E_PEDIDOS.md) mantém explícitos os
registros repetidos, valores incompatíveis e fontes ausentes. A consulta de
detalhes não encerra, por si só, a conciliação de recebimentos e reembolsos.
O [saldo após ajustes informados](VALORES_DE_DEVOLUCOES_E_SALDO_AJUSTADO.md)
acrescenta uma apresentação provisória: usa o repasse após ajustes da mesma
base paga, os custos identificados e a recarga reconhecida. Os valores das
devoluções ficam na conferência por situação, sem gerar outro desconto.
Por isso, o histórico mantém `realized_net_cents: null` e
`realization: "UNVERIFIED"`, inclusive quando a previsão está completa.

**Recebimentos e reembolsos ainda não conciliados** não são uma diferença igual
a zero. Falta conferir um período completo da conta com referências financeiras
compatíveis, explicar diferenças e identificar valores efetivos sem contar o
mesmo ajuste duas vezes. Os contratos e os limites da documentação consultada
estão nas pesquisas de [financeiro](PESQUISA_FINANCEIRA_SHOPEE.md) e
[liberações](PESQUISA_LIBERACOES_SHOPEE.md). Esta continuidade detalha evidências
existentes e não acrescenta uma API de liquidação ou uma autorização comercial.

Essas verificações melhoram a rastreabilidade do cálculo. A liberação de
alterações comerciais automáticas ainda depende também de atribuição,
estoque e limites de investimento validados, conforme o
[roadmap](ROADMAP_BRAZACOMMERCE.md).
