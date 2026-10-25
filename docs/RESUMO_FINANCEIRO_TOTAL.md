# Resumo financeiro total da loja

A Visão geral calcula o saldo da loja pelos totais mensais. Ela não soma os saldos exclusivos dos produtos: pedidos com vários produtos já fazem parte do repasse mensal e da produção, uma única vez.

```text
repasse previsto da Shopee
+ recarga de anúncios confirmada, quando aplicável
− produção
− DAS-MEI mensal
− gasto com anúncios nas mesmas datas
− outras despesas declaradas
= resultado previsto
```

O repasse já contém as deduções informadas pela Shopee. A diferença entre vendas e repasse não é descontada novamente. O DAS-MEI de R$ 86,05 pertence ao mês, inclusive sem vendas; ele não se multiplica por nota, peça, pedido ou produto.

## Valores completos e pendências

| Estado mostrado | Condição | Interpretação |
| --- | --- | --- |
| Resultado líquido previsto | Todas as conferências do cálculo estrito estão completas. | Previsão após os custos cadastrados e despesas declaradas; não comprova recebimento no banco. |
| Saldo provisório da loja | Os componentes monetários estão disponíveis, mas há devoluções ou leituras antigas a conferir. | Aritmética da leitura informada, com seus avisos. Ajustes pendentes podem alterar o valor. |
| Saldo com custos identificados | O mês e as despesas estão disponíveis, mas faltam custos de produção. | Desconta somente a produção identificada. Ainda falta descontar os custos indicados; não é lucro líquido final. |
| Em apuração/conciliação | Coleta incompleta, pagamentos ausentes, falha da fonte, situação não reconhecida, imposto, anúncios, despesas ou tratamento da recarga ainda desconhecidos. | Não calcula um total com valores substituídos por zero. |

A faixa de custos mostra produção identificada, custos após o repasse e cobertura por unidades vendidas. Uma unidade de catálogo pode ser um kit; ela não é confundida com uma camiseta física nem com um pedido. Sem o detalhamento dos produtos, a cobertura fica desconhecida. Produção conhecida zero com unidades pendentes não significa custo total zero.

Com os valores da captura — repasse R$ 11.093,13, DAS R$ 86,05, anúncios R$ 1.308,92, recarga confirmada R$ 11,80 e despesas externas R$ 0,00 — há R$ 9.709,96 **antes da produção**. O saldo mostrado subtrai desse valor os custos identificados de toda a loja. A captura, isoladamente, não informa o custo total de todos os produtos e não permite afirmar um líquido final.

## Identificação automática

Produtos vendidos sem custo passam à frente dos produtos já precificados na fila automática. A prioridade só alcança trabalhos nunca tentados, sem lease ou falha anterior. Tentativas aguardando backoff, regras e correções manuais continuam preservadas. Nenhum custo é inferido apenas para completar o número.

## Limites e validação

O resumo de apresentação usa o quadro mensal já validado, calcula em centavos com BigInt e não altera o contrato da API. Abas antigas continuam compatíveis. O resultado estrito, seu histórico e os requisitos para automação não são liberados por um saldo parcial ou provisório.

Devoluções continuam exigindo conciliação: `return_order_sn_list` sozinho não prova o valor final reembolsado. Descontar um reembolso novamente quando já está incluído no repasse duplicaria a despesa. Os campos adicionais de Payment e eventual conciliação de carteira precisam de tratamento próprio antes de afirmar dinheiro liquidado.

Os testes cobrem os valores da captura, pedidos mistos, imposto e recarga uma vez, custos ausentes, devoluções, dados antigos, zeros legítimos, limites aritméticos e o helper realmente emitido no navegador normal e minificado.
