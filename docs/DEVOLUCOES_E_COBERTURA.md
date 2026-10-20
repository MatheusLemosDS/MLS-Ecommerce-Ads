# Devoluções e cobertura da consulta

O painel passa a separar automaticamente os pedidos da apuração financeira em
três grupos, usando os dados que já foram consultados e armazenados:

- **Com ocorrência:** a resposta de Payment informou pelo menos uma referência
  de devolução vinculada ao pedido.
- **Sem indicação na consulta:** a resposta informou uma lista vazia.
- **Sem informação:** a resposta não informou o campo de devoluções.

Uma ausência de campo não vira zero. Mesmo quando existem pedidos sem
informação, as ocorrências conhecidas continuam visíveis. As contagens dos três
grupos somam os pedidos importados na apuração. Durante uma coleta incompleta,
o painel identifica os valores como parciais.

## O que significam os valores

Cada grupo mostra a soma do **repasse previsto dos seus pedidos** quando todos
esses valores são conhecidos e têm precisão exata de centavos. Não é o valor
reembolsado, o prejuízo ou o dinheiro que será perdido com devoluções.
Valores ausentes ou sem precisão suficiente continuam pendentes, sem
arredondamento para produzir um total aparente.

O repasse total continua incluindo todos os grupos. Nenhuma soma é descontada
novamente, nem se presume a recuperação do custo de produção ou do estoque.
A presença de devolução ou de informação desconhecida mantém o resultado
líquido previsto pendente. O valor reembolsado e o lucro liquidado continuam
desconhecidos nesta projeção.

## Encontrar os produtos afetados pela pendência

Na lista do período financeiro, o filtro permite ver todos os produtos, os que
participam de pedidos com ocorrência, os que participam de pedidos sem
informação ou os que aparecem em pedidos sem indicação na consulta. O filtro
combina com a busca e consulta todos os produtos antes de separar as páginas.
Um produto pode aparecer em mais de um grupo porque participa de vários pedidos.

Uma ocorrência pertence ao **pedido**. Se esse pedido contém vários produtos,
não é possível afirmar qual item foi devolvido. As mensagens mostram essa
limitação; o painel não marca cada produto do pedido como devolvido. O repasse
de pedidos mistos continua separado, sem rateio presumido.

## Compatibilidade e próximos passos

O detalhamento é calculado dos registros financeiros existentes. Não exige
novas permissões, chamadas à Shopee, tabelas, segredos ou intervenção por produto.
Apurações já armazenadas recebem o detalhamento na leitura. Respostas antigas
sem esse contrato continuam utilizáveis, com cobertura indicada como pendente.

A evidência documental disponível confirma `return_order_sn_list` no nível do
pedido. Ela ainda não confirma os valores efetivos de reembolso, os itens
afetados, a recuperação de mercadoria nem a liquidação bancária. Esses contratos
e dados precisam ser conferidos antes de fechar a conciliação monetária. A
ausência de uma ocorrência na consulta também não garante que não haverá
devolução posterior ao corte.

As consultas continuam limitadas a pedidos `COMPLETED` criados no intervalo.
Este relatório não é uma lista de todos os cancelamentos e devoluções da loja
por data do evento. Ads e promoções continuam sem execução automática.

## Validação e publicação

Passaram 562 testes Node, trinta verificações dos três Workers compilados com
D1 e 25 verificações no Chromium, incluindo a regressão financeira e de Ads.
Foram conferidos os três grupos, contagens sobrepostas em pedidos mistos,
valores ausentes, precisão monetária, busca e filtro antes da paginação,
rascunhos e compatibilidade com respostas antigas. Temas claro e escuro foram
conferidos entre 320 e 1365 pixels. Configurações e dry-runs dos três Workers
também passaram.

As validações usaram dados simulados, sem chamadas à loja em produção. A entrega
usa os builds pelo Git já configurados; aguarde o mesmo commit ficar ativo no
App, Auth e Financeiro para conferir o novo detalhamento.
