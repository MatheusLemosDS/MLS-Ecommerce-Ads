# Resumo mensal, anúncios e líquido previsto

A navegação de anúncios tem três destinos: **Resumo mensal**, **Campanhas**
(com Product Ads e GMV Max) e **Automação**. Conexões ficam em configurações.
Os totais da conta aparecem somente no resumo. Os endereços antigos continuam
funcionando por redirecionamento autenticado.

O mês selecionado pode ter até 31 dias. Cada leitura da API mantém seu limite de
15 dias; o aplicativo divide o mês em até três intervalos sem sobreposição.
O mês atual termina no dia de hoje em Brasília. Um mês anterior usa todos os dias.

## Indicadores de anúncios

Admin e Ads compartilham a mesma projeção de gastos e atribuição:

- Investimento é a soma exata dos gastos diários em centavos. Ausências deixam
  o total pendente, sem preencher gasto zero.
- Vendas atribuídas e pedidos atribuídos usam atribuição ampla. Direta permanece
  separada, sem soma nem preenchimento de uma ampla ausente.
- ROAS mensal = soma das vendas atribuídas ÷ soma dos gastos. Não se faz média
  dos ROAS diários. O ROAS informado pela fonte fica preservado no detalhe diário.
- Saldo da conta é crédito disponível, separado do investimento.
- Datas e horário da leitura ficam identificados. A API não informa aqui o
  horário de corte de atualização da Shopee.

Por exemplo, R$ 1.011,37 de vendas atribuídas e R$ 52,61 de gasto dão ROAS
calculado de 19,223912. Um gasto atualizado de R$ 52,77, mantendo as vendas,
resulta em 19,165624. O código não altera gastos para forçar um ROAS informado.

## Resultado mensal da loja

O resumo principal lê todos os status dos pedidos criados no mês, separa os
pagos em andamento dos concluídos e exclui cancelados e não pagos das vendas.
Usa somente as APIs de lista, detalhe e Payment já utilizadas pela integração.
A identidade da loja, os itens e as quantidades de cada Payment são conferidos.

As vendas da loja vêm do valor dos produtos no Payment dos pedidos pagos.
As vendas atribuídas aos anúncios são outro indicador e ficam separadas.

A conta do líquido previsto é:

**Repasse previsto − produção − imposto de 2% − anúncios − outras despesas**.

O repasse já contém as taxas da Shopee. Elas não são descontadas novamente.
Se o ajuste financeiro for confirmado como recarga de crédito de anúncios,
seu valor é adicionado de volta uma vez, pois o investimento consumido é
calculado separadamente. Suporte técnico permanece no repasse.

A produção usa os custos atuais cadastrados e as quantidades de cada tamanho.
O imposto é estimado por pedido, com arredondamento por nota, sobre os produtos
antes das taxas da Shopee. Outras despesas são registradas uma única vez por mês,
com controle de versão e auditoria. Quando não houver, use **Não tenho outras
despesas**; ausência de declaração não é tratada como zero.

O líquido previsto é liberado quando todos os intervalos, valores de Payment,
custos, imposto, anúncios, classificação dos ajustes e despesas estão completos,
sem ocorrências de devolução ou situação de pedido ainda sem conferência.
Pagamento indisponível em um pedido ativo mantém suas quantidades e a pendência;
não vira venda zero nem prejuízo artificial.

Esse resultado é uma **estimativa operacional da coorte de criação do mês**,
com os anúncios do calendário e custos padrão atuais. Ele não confirma o lucro
já recebido em banco nem custos históricos reais por pedido. A consulta antiga
que cobre apenas concluídos fica recolhida em Consulta detalhada de pedidos
concluídos e não substitui a nova conta mensal de todos os pagos.

## Próxima etapa de automação

A área Automação concentra a referência de ROAS, a preparação das metas e as
sugestões disponíveis. Para escalar por lucro, ainda é necessário relacionar
margem, gasto de campanha, devoluções e estoque por produto, definir limites de
orçamento e perda, validar permissões e revisar a execução. A publicação de
anúncios, alteração de preços e mudança automática de orçamento seguem desativadas.
