# Repasse por produto e consumo de anúncios

O imposto na lista e as opções de ordenação e paginação estão em
[Imposto por produto e ordenação](IMPOSTO_POR_PRODUTO_E_ORDENACAO.md).

O detalhamento de ocorrências e informação desconhecida de devoluções está em
[Devoluções e cobertura da consulta](DEVOLUCOES_E_COBERTURA.md).

A confirmação do operador em 20/10/2026 permite interpretar o consumo de Ads em
reais: `50` significa R$ 50,00. A evidência limitada, sem credenciais, está em
[ADS_BRL_CONFIRMADO_2026_10_20.json](ADS_BRL_CONFIRMADO_2026_10_20.json).

## Consumo automático no período

Após concluir uma apuração financeira, o painel consulta uma vez o consumo de
anúncios das mesmas datas. A leitura usa a conexão privada de Ads já existente.
O intervalo vem da apuração validada pelo servidor. Não é preciso cadastrar
novas variáveis, segredos ou bindings.

A soma usa somente o campo diário `expense`. Todos os dias precisam ter um
valor válido, não negativo e com precisão de centavos. Falhas, dias ausentes ou
valores inválidos deixam o total desconhecido; não viram zero. Um conjunto
completo de zeros explícitos vale zero. A resposta fica em cache administrativo
por até quinze minutos, vinculada à apuração; é possível atualizar manualmente.
Uma leitura parcial ou indisponível não causa repetição automática contínua.

O formulário permite escolher o consumo da Shopee ou informar um valor manual.
Declarações antigas continuam manuais. No modo automático, o servidor usa o
total validado do cache, mesmo que o navegador envie outro número. Se a leitura
expirar ou ficar indisponível, a estimativa líquida fica pendente. Rascunhos de
despesas, consumo manual e escolha da fonte são preservados nas atualizações.

As datas de calendário de Ads e a seleção de pedidos financeiros têm bases
diferentes. O fuso da fonte de Ads ainda não está confirmado. O consumo desse
intervalo não comprova quanto foi gasto nos pedidos concluídos selecionados,
nem quanto cada produto consumiu. O resultado continua uma estimativa
operacional por período, sem atribuição de Ads por produto.

## Produtos do período financeiro

O relatório mostra os produtos dos pedidos `COMPLETED` criados no intervalo,
separadamente das quantidades do catálogo diário, que incluem outros status.
Busca consulta todos os produtos do relatório; as páginas mostram vinte por vez.

Quando um pedido contém somente um produto, seu repasse previsto inteiro pode
ser associado a esse produto, inclusive se houver várias de suas variações.
Pedidos com produtos diferentes ficam em uma parcela sem rateio. Não se usa
preço de venda para inventar a distribuição de taxas ou do repasse.

Cada linha informa unidades, pedidos, cobertura de repasse, custo padrão atual
de produção, imposto e, quando houver cobertura integral, o saldo de repasse previsto
após produção e imposto. Se o produto participa de pedidos mistos, o saldo completo fica
pendente. Um valor conhecido apenas de parte dos pedidos não recebe o desconto
de todo o custo como se fosse um resultado completo.

Os custos usam as revisões salvas de composição e produção, não o custo
histórico efetivo de cada pedido. A presença de devoluções continua explícita.
`net_profit_cents` permanece `null`; o relatório não apresenta lucro liquidado
por produto. Nomes, fotos, estoque e atribuição de anúncios não são inventados.

## Regras contábeis preservadas

`escrow_amount` já inclui deduções da Shopee. Comissão, serviço, transação e
frete não são descontados novamente. A dedução combinada de recarga/suporte só
é reintegrada quando o operador a classifica como recarga de anúncios; suporte
permanece deduzido. Recarga de saldo não é consumo publicitário.

Despesas externas desconhecidas não recebem zero por padrão. Devoluções
presentes ou sem cobertura, custos incompletos e deduções não classificadas
mantêm a estimativa pendente. Liquidação, devoluções e ajustes ainda precisam
ser conciliados para comprovar lucro.

## Próximas dependências

O avanço entrega a primeira visão financeira por produto e reduz o trabalho de
informar Ads. Para identificar campeões por rentabilidade ainda faltam a
conciliação das devoluções e dos recebimentos, atribuição justificável dos
pedidos mistos e de anúncios, estoque e comparação em períodos compatíveis.
Campanhas e promoções continuam bloqueadas para execução automática.

As validações locais usam dados simulados e não comprovam uma nova consulta ou
conciliação da loja em produção. Os três Workers devem receber o mesmo commit
pelo Git já configurado.

Validação: 542 testes Node, onze verificações dos três Workers compilados com D1
e treze verificações no Chromium passaram. Foram conferidos pedidos exclusivos
e mistos, precisão monetária, cobertura diária de Ads, cache expirado, preservação
manual e de rascunhos, busca e paginação de 23 produtos, e temas claro/escuro de
320 a 1365 pixels. Configurações e dry-runs dos três Workers também passaram.
