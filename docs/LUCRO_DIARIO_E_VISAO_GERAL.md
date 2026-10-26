# Lucro estimado por dia e organização da Visão geral

Continuidade de 26/10/2026, após o operador confirmar que a correção de abertura
da PR #8 funcionou. O pedido seguinte foi tornar os painéis mais claros e
permitir encontrar o lucro diário. O incremento permanece na fase de
confiabilidade financeira do roadmap.

## Como usar

O primeiro bloco da **Visão geral** é **Lucro estimado do dia**, com **Hoje**,
**Ontem** e uma data específica. A data dos pedidos usa Brasília. Abaixo ficam
vendas, consumo de anúncios e quantidade de pedidos pagos. O cálculo completo,
os horários das fontes e as pendências ficam em uma seção expansível.

O resultado do mês aparece em seguida, com seu saldo antes dos indicadores de
apoio. Despesas, devoluções, liberações, produtos e cálculo mensal têm atalhos
próprios. Despesas deixam de ficar dentro da explicação do cálculo. Produtos e
cálculos começam fechados; seus atalhos abrem o destino antes de focá-lo.
As métricas antigas de hoje no Hermes ficam em um grupo de monitoramento.

## O que o valor significa

O diário usa os pedidos **pagos criados naquela data**. Não usa a data de
aprovação da devolução, liberação do repasse ou recebimento bancário.

```text
repasse dos pedidos pagos criados no dia
+ ajuste líquido informado, quando completo e compatível
+ recarga identificada, se a classificação confirmada exige sua reposição
− produção das unidades vendidas no dia
− anúncios na data informada pela Shopee
− parcela diária do DAS mensal declarado
− parcela diária das despesas mensais confirmadas
= lucro estimado do dia
```

Quando a origem não informa o ajuste completo, a estimativa usa o **repasse
base**, identifica essa base e mantém a pendência. Não transforma o ajuste
ausente em zero. Um ajuste conflitante também fica identificado. Reembolsos
não são deduzidos outra vez quando o valor já está no ajuste do repasse.

O custo de produção usa os custos por variação da mesma referência do mês,
incluindo as regras e evidências históricas já aprovadas. Não usa custo médio
por produto nem divide o custo mensal entre os pedidos. Custo incompleto
permite somente **saldo após custos conhecidos**, distinguido do lucro completo.
Ausência de pagamento, Ads, DAS, despesas ou classificação necessária impede
concluir o valor correspondente. Um dia comprovadamente sem pedidos ainda pode
ter anúncios e despesas e, portanto, resultado negativo.

Pedidos usam a data de criação em Brasília; Ads usa a data de calendário
informada pela fonte, cujo fuso continua não confirmado. Esse consumo não
comprova atribuição a um pedido, produto ou campanha. O resultado permanece uma
estimativa operacional, sujeita a mudanças de situação e devoluções; os campos
de líquido realizado e saldo efetivamente a receber continuam desconhecidos.

## Rateio diário dos custos mensais

Somente os custos fixos mensais são distribuídos. Lucro, vendas, repasse,
produção e anúncios não são rateados entre os dias.

Para um custo mensal confirmado `M`, o dia `d` de um mês com `N` dias recebe:

```text
floor(M × d / N) − floor(M × (d − 1) / N)
```

O cálculo usa centavos inteiros e o mês completo, inclusive nos meses ainda em
andamento. A soma das parcelas do mês inteiro coincide com o custo mensal.
Os dias já coletados não absorvem antecipadamente os custos dos dias futuros.

O resumo mensal mantém sua política anterior: desconta o DAS e as despesas
integrais por competência. Por isso, a soma parcial dos resultados diários pode
diferir do saldo mensal. A resposta inclui a parcela alocada e o restante do
mês. No diário, usa-se apenas o total de despesas **confirmado no resultado
mensal**, sem somar novamente os lançamentos do contas a pagar. Rascunhos de
despesas não entram automaticamente nesse total.

## Origem, publicação e compatibilidade

A coleta Finance já recebia `create_time`, mas não guardava a data necessária
para separar o resultado por dia. O dado passa a integrar a evidência privada
`financial_order_evidence_v2`, no mesmo registro e na mesma transação já
existentes. Evidências v1 continuam legíveis. Datas ausentes ou inválidas ficam
sem data; não são inferidas do número do pedido nem do horário de consulta.

O contrato privado mantém `finance_business_period_v1`. A extensão opcional
`finance_business_daily_v1` é negociada por
`X-Braza-Daily-Contract: daily-profit-v1`. Cada intervalo tem uma linha por dia
e um grupo sem data. Cobertura, dinheiro e quantidades dos grupos devem somar
exatamente o intervalo original. Há limites de tamanho; uma extensão muito
grande é omitida inteira, preservando o resumo anterior sem truncar valores.

O App conserva essa extensão nas cópias imutáveis da publicação. O contrato
`business_month_view_v3` acrescenta `business_daily_summary_v1`, calculado com
essas mesmas cópias e com os custos, Ads e despesas usados no resumo exibido.
Identidades e revisões da publicação, fontes e custos precisam coincidir.
Os contratos públicos v1/v2 preservam suas formas para abas antigas.

Publicações anteriores sem detalhamento diário mostram a pendência até uma
nova coleta normal trazer as datas. Se houver pedidos sem data em uma janela,
os dias daquela janela permanecem indisponíveis; outras janelas completas da
mesma publicação podem ser mostradas. Não há preenchimento por divisão do mês
nem nova varredura iniciada pela abertura do painel. Um corte capturado no meio
do dia continua parcial mesmo quando consultado no dia seguinte.

Na implantação gradual, Auth ou Finance antigos podem devolver o contrato
anterior, que o App aceita. Um rollback do App após persistir a extensão deve
preservar o projector capaz de lê-la; uma versão anterior com contrato fechado
não deve ser reinstalada isoladamente sobre esses registros. Esse cuidado não
exige alterar configurações, domínios, bancos ou permissões comerciais.

## Consumo e verificação

O diário não acrescenta timer, endpoint de coleta, chamada à Shopee ou consulta
SQL no App. Mudar o dia dentro do mês é local. Escolher outro mês usa a leitura
do resumo salvo já existente. Finance associa a evidência privada na consulta
dos pedidos comprometidos, com a mesma quantidade de statements e chamadas.
O `LEFT JOIN` pode ler mais linhas locais e os registros passam a carregar mais
bytes; isso não equivale a consumo faturável zero nem a uma estimativa de fatura.
O cron e as frequências de atualização permanecem os mesmos.

O pacote do App ultrapassa o antigo teto local de importação de 2 MiB.
As ferramentas de captura e importação aceitam agora fonte de até 4 MiB,
com teto agregado de 5 MiB para a exportação. O hash exato da fonte revisada,
UTF-8 válido, os limites de configuração e a remoção de segredos continuam
obrigatórios. Esses tetos são locais às ferramentas, não limites da Cloudflare.

Os testes cobrem a coleta real com respostas sintéticas da Shopee, publicação,
recálculo com custos atuais, ajustes sem dedução duplicada, centavos do rateio,
virada do dia em Brasília, intervalos sem data, campos antigos, limites de
tamanho, respostas fora de ordem, seleção de mês e projector serializado.
A abertura sem D1 continua sendo a única etapa exigida para confirmar a sessão;
ausência de cálculo diário não bloqueia o resumo mensal válido.

Nenhum teste usa esses valores sintéticos para afirmar o lucro real da conta.
A validação de publicação dos três Workers e uma observação autenticada da
conta são evidências distintas dos testes de código.
