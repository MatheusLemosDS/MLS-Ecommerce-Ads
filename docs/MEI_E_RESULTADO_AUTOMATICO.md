# MEI e resultado automático

Em 24/10/2026, o operador confirmou regime **MEI** e DAS mensal normal de
**R$ 86,05**, sem multa e juros. Esse valor declarado substitui a estimativa
anterior de 2% sobre cada pedido na Visão geral.

## Conta do mês

O resultado previsto usa:

```
repasse previsto pela Shopee
− fabricação das unidades vendidas com custo cadastrado
− DAS-MEI de R$ 86,05, uma vez no mês de competência
+ recarga de anúncios já retida no repasse, quando identificada como recarga
− gasto efetivamente consumido na conta de anúncios, nas mesmas datas
− outras despesas cadastradas do mês
= resultado líquido previsto
```

As deduções da Shopee já estão incorporadas no repasse; comissão, serviço,
transação e frete não são subtraídos novamente. A diferença entre vendas dos
produtos e repasse é apresentada como diferença líquida, pois pode incluir
descontos, frete, subsídios e outros ajustes, além de taxas. Uma recarga de saldo
não é o gasto consumido em anúncios.

O DAS permanece devido na referência mensal mesmo sem vendas. Não há cobrança
por nota, multiplicação pela quantidade nem rateio inventado entre produtos.
O saldo individual dos pedidos exclusivos fica após produção, antes do DAS
mensal, dos anúncios e das despesas gerais. Isso não é lucro líquido por produto.

O valor declarado vale para 2026. Outro ano exige sua própria declaração;
o sistema não reaproveita silenciosamente o DAS de 2026 nem presume imposto
zero. A regra fiscal tem estado e auditoria separados por ano, com revisão e
proteção contra gravações concorrentes.

## Atualização sem refazer consultas manualmente

Ao abrir a Visão geral, o mês é coletado automaticamente com paginação, janelas
sem sobreposição, remoção de duplicidades e identificação dos custos. Enquanto
o painel está visível, os anúncios atualizam a cada minuto e os pedidos,
cancelamentos e repasses são consultados novamente a cada cinco minutos.
Ao voltar para a aba, uma consulta financeira vencida é retomada automaticamente.

As consultas não se sobrepõem. Uma pausa explícita, edição de despesas ou falha
de fonte interrompe a repetição; erros persistentes não disparam consultas sem
limite. A coleta não roda permanentemente com o navegador fechado: não foi
criado um novo cron nesta entrega.

Os horários do financeiro e dos anúncios aparecem separados. No mês atual,
uma leitura financeira com mais de quinze minutos bloqueia o líquido; Ads
recente não torna pedidos antigos recentes. Cancelados e não pagos ficam fora
das vendas pagas. Devoluções, pagamentos ausentes, custos incompletos e limites
de coleta permanecem pendências, sem virar zero.

## Precisão e limites

O DAS foi confirmado pelo operador. A consulta externa aos sites da Receita e
do Planalto não foi concluída neste ambiente; não foi inferida uma alíquota
governamental ou uma composição do DAS. O aplicativo não emite notas, apura
PGMEI, importa guias ou verifica o pagamento do DAS.

Custos de fabricação usam as referências atuais cadastradas. Outras despesas
fora da Shopee precisam estar registradas; o sistema não conhece custos de
contabilidade, aluguel, emissão de notas ou perdas não informadas. Uma eventual
cobrança de 2% pela emissão de notas seria uma despesa separada do DAS e não foi
confirmada como tal.

Repasse esperado é diferente de dinheiro liquidado em banco. Sem conciliação de
recebimentos, reembolsos, estoque e custos efetivamente incorridos, o sistema
continua apresentando **resultado líquido previsto**, não lucro real fechado.
