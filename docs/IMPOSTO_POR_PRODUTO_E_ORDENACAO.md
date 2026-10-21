# Imposto por produto e ordenação do resultado

O imposto previsto de 2%, já disponível no resumo da loja, passa a integrar a
lista do período financeiro. Cada produto mostra repasse previsto, custo de
produção, imposto e saldo após produção e imposto quando os dados permitem.
A taxa e a base seguem a [confirmação do operador](IMPOSTO_2_POR_CENTO_CONFIRMADO.json).

## Associação do imposto

Um pedido que contém um único produto pode ter seu imposto inteiro associado
a esse produto. Várias variações do mesmo produto continuam sendo um produto
nesse critério. O imposto já foi arredondado por pedido na apuração; ele não é
recalculado pela base acumulada do produto nem multiplicado pela quantidade de
peças ou variações.

Pedidos com produtos diferentes mantêm o imposto em uma parcela sem rateio.
O painel não divide esse valor por preço ou quantidade, nem copia o imposto
inteiro para todos os produtos participantes.

O saldo completo de um produto exige leitura completa, repasse e produção
conhecidos, pedidos somente desse produto e cobertura integral de seu imposto.
Um produto com todos esses dados pode ter saldo calculado mesmo se outro
produto ainda tiver imposto pendente. Valores parciais ficam identificados
como parcela conhecida, sem pagar todo o custo com apenas parte do repasse.

Uma base ausente deixa o imposto pendente. Uma base explicitamente igual a zero
pode gerar imposto zero conhecido. Em um produto que só participa de pedidos
mistos, a ausência de parcela exclusiva não comprova imposto total zero.

## Visualizar muitos produtos

A lista permite ordenar por unidades no período, maior saldo previsto, menor
saldo previsto ou código do produto. Os saldos usam produção e imposto e ainda
aguardam conciliação de anúncios, outras despesas, devoluções e recebimentos.
A ordenação não representa um ranking de lucro liquidado ou de produtos campeões.

Valores zero e negativos conhecidos participam da ordenação normalmente.
Saldos desconhecidos ficam depois dos valores conhecidos tanto na ordem de
maior quanto na de menor saldo. Empates têm uma ordem estável por código.

Busca, filtro de ocorrência de devolução e ordenação consideram todos os
produtos carregados antes de separar as páginas de 20, 50 ou 100 produtos.
Alterar esses controles não consulta a Shopee, não edita custos ou despesas e
não limita a identificação automática à página visível. Atualizar o mesmo
período preserva os controles e os rascunhos de despesas.

## Totais e limites

Os impostos exclusivos e mistos reconciliam com o imposto total já calculado
na apuração. A produção usa os mesmos custos e vínculos salvos do resumo da loja.
Os cálculos globais de imposto, Ads, outras despesas e resultado não mudam com
a ordenação ou com o filtro da lista.

O saldo de produto é anterior à conciliação de Ads e outras despesas. O gasto
de anúncios do calendário não é atribuído artificialmente aos produtos, e os
pedidos mistos continuam sem rateio do repasse. Ocorrência de devolução não
autoriza presumir recuperação do imposto ou do custo de produção.

O detalhamento usa os registros e a evidência fiscal já armazenados. Não exige
novas chamadas à Shopee, tabelas, variáveis, segredos ou bindings. Respostas
antigas continuam aceitas com imposto por produto pendente. O mesmo commit
precisa estar ativo nos três Workers para usar o contrato completo.

## Validação

Passaram 615 testes Node, quinze verificações dos três Workers compilados com
D1 e catorze verificações no Chromium. Foram conferidos imposto por pedido,
várias variações do mesmo produto, cobertura independente, pedidos mistos,
valores ausentes, zeros, negativos, ordenação e filtros sobre uma base simulada
de 123 produtos. Paginação de 20, 50 e 100 produtos e temas claro e escuro foram
verificados entre 320 e 1365 pixels.

O contrato máximo testado com mil produtos e todos os detalhamentos cabe no
limite privado existente de 512 KiB. Configurações e dry-runs dos três Workers
passaram. Os testes não consultaram a loja em produção.
