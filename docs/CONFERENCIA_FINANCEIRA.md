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

## O que ainda falta para comprovar lucro recebido

O contrato integrado é `GET /api/v2/payment/get_escrow_detail`. O campo
`escrow_amount` é repasse esperado. `return_order_sn_list` indica referências
de devolução; não fornece, no contrato observado, valores efetivamente
reembolsados, itens afetados ou datas de liquidação.

Por isso, o histórico mantém `realized_net_cents: null` e
`realization: "UNVERIFIED"`, inclusive quando a previsão está completa.
**Recebimentos e reembolsos ainda não conciliados** não são uma diferença igual
a zero. Para fechar o resultado recebido, falta confirmar e integrar um
contrato oficial de liquidações e reembolsos efetivos, com identificação,
datas, valores e ajustes. A pesquisa pública desta entrega não confirmou esse
contrato: o acesso à documentação oficial foi bloqueado pelo proxy com HTTP 403.
Nenhum endpoint presumido foi introduzido.

Essas verificações melhoram a rastreabilidade do cálculo. A liberação de
alterações comerciais automáticas ainda depende também de atribuição,
estoque e limites de investimento validados, conforme o
[roadmap](ROADMAP_BRAZACOMMERCE.md).
