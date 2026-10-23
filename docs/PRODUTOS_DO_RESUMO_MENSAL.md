# Produtos do resumo mensal

Atualização de 22/10/2026. O resumo mensal passa a apresentar uma lista de
produtos dos mesmos pedidos pagos usados nos totais da loja. A lista permite
buscar por produto ou variação, filtrar pendências, ordenar e mostrar 20, 50 ou
100 produtos por página. As variações ficam recolhidas nos detalhes de cada
produto. Não depende de confirmar cada produto para abrir o relatório.

## O que cada valor representa

Quantidade e produção incluem todas as unidades pagas do produto no mês,
inclusive as presentes em pedidos com outros produtos. Kits e camisetas
avulsas usam os vínculos e custos de produção atuais, na mesma revisão do
resumo da loja. Cancelados e não pagos permanecem excluídos.

Um pedido com um único produto permite atribuir seu valor inteiro a esse
produto, mesmo que contenha várias variações. Para esse grupo, o painel mostra:

`Contribuição = repasse previsto − produção dessas unidades − imposto de 2%`

Esse saldo usa o repasse informado pela Shopee. Comissão, serviço, transação
e frete já deduzidos não são descontados novamente. O ajuste de recarga/suporte
também permanece no repasse usado nesse saldo. Anúncios e outras despesas
ainda não foram conciliados por produto; por isso o valor não recebe o nome de
lucro nem de saldo antes dos anúncios. A classificação da recarga no resultado
mensal continua separada.

Pedidos com vários produtos ficam identificados, com seus valores em uma
parcela sem rateio. O custo de todas as unidades não é descontado de um repasse
que cobre somente pedidos exclusivos. A contribuição do grupo exclusivo pode
aparecer sem representar o resultado completo do produto.

Pagamento indisponível, custo exclusivo faltante ou devolução sem conciliação
deixa a contribuição pendente. Situações desconhecidas e cancelamentos ainda
em andamento bloqueiam os resultados por produto até que sejam conferidos.
Dados ausentes não recebem zero. A consulta incompleta não apresenta uma lista
parcial como se fosse o mês completo.

## Origem e limites

O Financeiro deriva o detalhamento do ledger já consultado, sem chamadas
adicionais à Shopee por linha e sem armazenar identificadores de pedidos no
navegador. Os valores conhecidos dos grupos exclusivos e mistos precisam
recompor os totais conhecidos da loja; as quantidades por variação também são
conferidas em cada fronteira privada.

Somente a resposta privada de `business-period` passa de 512 KiB para 1 MiB,
com limites de bytes declarados e recebidos, além dos limites de 1.000 pedidos
e variações por janela. Um mês continua usando até três janelas disjuntas. Não
há aumento de chamadas à API para produzir o detalhamento.

No banco administrativo, cada janela fica em uma linha própria e o registro
do mês guarda apenas referências pequenas. A leitura conjunta e a gravação
condicional são atômicas. Isso evita exceder o limite de tamanho de uma linha
do D1 ao reunir três janelas com muitos produtos, sem acumular versões de
quadros antigos a cada atualização. As tabelas são criadas automaticamente no
mesmo banco administrativo já configurado.

Caches antigos conservam os totais anteriores e mostram o detalhamento como
indisponível. Uma atualização mensal recompõe as janelas com o novo contrato;
o Financeiro pode aproveitar o ledger existente. Despesas salvas não são
duplicadas nem apagadas.

## Próxima etapa do plano

A contribuição ajuda a localizar produtos com custo pendente ou saldo
negativo após produção e imposto. Para decidir aumentos de investimento ainda
faltam gasto atribuído por produto, cobertura de campanhas no mesmo período,
estoque e limites definidos da operação. ROAS da conta não é margem por
produto. O relatório não apresenta lucro liquidado nem executa alterações de
campanhas.

Os três Workers devem receber o mesmo commit pelo Git. As verificações usam
respostas simuladas e não comprovam os dados ou os builds ativos em produção.
