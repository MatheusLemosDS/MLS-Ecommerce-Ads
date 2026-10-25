# Catálogo salvo e custo das vendas

## Produtos guardados

A aba Produtos usa um cadastro persistente no D1, com busca, paginação e detalhe
por variação. O índice percorre os seis estados oficiais da Shopee; produtos
excluídos continuam no histórico e não representam disponibilidade para venda.
O cadastro reaproveita os produtos já conhecidos das vendas e dos vínculos.
A primeira importação continua por páginas enquanto o painel está visível;
o cron também avança o trabalho sem depender da aba. A cobertura informa o que
já foi salvo e o que ainda aguarda identificação.

A lista abre pelos dados locais. O detalhe só é solicitado quando um produto
é aberto. Cada modelo conserva sua cor e seu tamanho reais: uma cor não recebe
por suposição todos os tamanhos de outra cor. Quantidade vendida, estoque e
quantidade de camisetas físicas em um kit são conceitos separados.

O índice de produtos lê somente IDs, estado e horário de atualização. Um produto
novo ou uma alteração confirmada enfileira a consulta das suas variações. Uma
alteração confirmada bloqueia o custo automático antigo até a conferência;
associações manuais explícitas são preservadas. A idade, isoladamente, não apaga
um custo salvo. Falhas mantêm os dados e a posição da fila com espera entre
tentativas. Consulte as [fontes do leitor oficial](PRODUCT_INDEX_READONLY.md).

## Custos por unidade e por kit

A prévia mostra primeiro camisetas avulsas P–GG e G1–G3, depois kits derivados.
O infantil usa a regra atualmente salva, com seus tamanhos configurados. Os
valores vêm das revisões do usuário: esta entrega não substitui o custo plus
alterado nem redefine a regra infantil para o valor inicial.

Custos completos já incluem os componentes declarados. No modo separado, um
componente por peça incide uma vez na avulsa e duas vezes no kit de duas peças;
um componente por kit não é aplicado a uma camiseta avulsa. Exceções por produto
ou modelo conservam prioridade. Quantidade multiplicada por custo sempre usa
uma leitura consistente das referências, sem combinar um tamanho antigo com
um preço de outra revisão.

Salvar custos reaplica os valores às quantidades guardadas. Não consulta os
pedidos novamente nem força uma nova identificação de todo o catálogo. O
histórico de versões só é carregado quando aberto.

## Semana e mês

Em Custos, **Custo de produção das vendas** mostra:

- Esta semana: segunda-feira até hoje, em Brasília, com detalhamento por dia.
- Mês selecionado: a coorte mensal, separada da semana atual, mesmo quando o
  usuário escolhe um mês anterior.

A semana usa uma leitura completa de pedidos e itens, sem consultar pagamentos.
A consulta fica salva e é atualizada em segundo plano. O mês reaproveita as
quantidades da coleta mensal. Quantidades completas anteriores sobrevivem à
virada do dia e são reprecificadas com os custos atuais enquanto entram dados
novos; a data coberta e o estado parcial permanecem explícitos.

Cancelados, em cancelamento e não pagos ficam fora da coorte de custo das vendas
pagas. Situações desconhecidas, itens faltantes, fonte incompleta ou antiga e
variações sem custo mantêm o total pendente. O subtotal identificado não vira
um custo completo nem um lucro líquido. Um período sem fonte não vira zero.

**Recalcular custos** lê apenas os dados salvos e preserva o horário da fonte.
**Atualizar vendas** consulta pedidos e cancelamentos. Na tela mensal, um cache
completo e recente abre sem reiniciar a coleta; dados antigos continuam com os
respectivos avisos. Recalcular não certifica que as vendas foram atualizadas.

Os totais aplicam custos cadastrados atualmente às unidades vendidas. Eles não
comprovam o desembolso histórico da fábrica, compras de insumos ou estoque. DAS,
anúncios e outras despesas continuam no resultado financeiro da loja e não são
descontados novamente neste subtotal de produção.

## Validação e limites

Testes com D1 real cobrem as revisões, cores com faixas de tamanho diferentes,
infantil, avulsas, kits, custos personalizados, cancelamentos, paginação, leases,
falhas, referências alteradas durante a leitura e a virada do dia. Os clientes
emitidos pelo Worker são executados em VM nas versões normal e minificada.
Testes de fonte e interface usam dados fictícios; a primeira varredura autenticada
da conta continua sendo evidência operacional separada da publicação do código.
