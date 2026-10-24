# Custos personalizados

Para associar pelo tipo do produto e pelo tamanho, use também as
[regras automáticas por variação](CUSTOS_AUTOMATICOS_POR_VARIACAO.md).
A regra inicial de camiseta infantil aplica R$ 12,50 aos tamanhos 4 a 16
confirmados; calças, shorts e outros produtos podem ter regras próprias.

Em **Custos → Custos de produção**, a seção **Custos para qualquer produto**
permite cadastrar calça, moletom, camiseta, kit casal ou outro produto. Cada
perfil representa o custo completo de **uma unidade vendida**. Os valores são
informados pelo responsável pela loja; a Shopee não fornece custos de produção.
Não há custos padrão inventados para calças, moletons ou outros produtos.

## Cadastrar e aplicar em lote

1. Use **Adicionar custo personalizado** e preencha **Nome do custo** e
   **Custo completo por unidade vendida · R$**.
2. Em **Aplicar o custo aos produtos**, informe um ou vários **Código dos
   produtos na Shopee**, separados por vírgula ou espaço. Também é possível usar
   **Configurar custo** na lista de Produtos para preencher o código.
3. Selecione o **Custo personalizado**, deixe **Código da variação · opcional**
   vazio e use **Aplicar custo**. A associação cobre todas as variações atuais e
   futuras desses produtos, sem configurar uma por uma.
4. Confira as associações e use **Salvar custos de produção**. Até salvar, as
   alterações são apenas rascunhos.

Um perfil pode ser usado por vários produtos. Alterar seu valor atualiza a
referência de todos os produtos associados. Para uma variação com custo
diferente, informe um único produto e o código exato da variação antes de
aplicar o perfil correspondente.

## Prioridade e cálculo

A ordem de aplicação é:

1. Custo personalizado da variação exata.
2. Custo personalizado geral do produto.
3. **Padrão de camisetas**, quando houver vínculo válido de tamanho ou kit.

Sem uma dessas referências, o custo permanece pendente. O sistema não deduz a
composição de uma calça ou de um moletom a partir do tamanho da camiseta.

O custo personalizado é multiplicado somente pela quantidade vendida. Para um
kit, cadastre o custo do kit inteiro: ele **não é dobrado** pela quantidade de
peças nem recebe os componentes do padrão de camisetas. Um perfil é uma
referência de custo; ele não altera o catálogo da Shopee.

## Histórico e resultado da loja

Cada salvamento gera uma versão com histórico. Uma edição de outra sessão
bloqueia a gravação desatualizada: os rascunhos são preservados para consulta e
revisão por **Carregar custos salvos** e **Revisar custos atuais**. Uma página
antiga que desconheça os campos personalizados não pode apagá-los ao salvar.

O resumo mensal e seus produtos usam as mesmas referências atuais de
produção. Ao salvar, o painel solicita o recálculo; custos faltantes continuam
pendentes, sem serem tratados como zero. As versões anteriores permanecem no
histórico; isso não transforma o custo atual em custo histórico da venda.

Para esta loja **MEI**, o **DAS mensal de R$ 86,05 em 2026**, confirmado pelo
operador, é descontado uma vez no resumo do mês. A regra anterior de 2% por
pedido não participa do resultado MEI. O DAS não é multiplicado pelos produtos
nem rateado no saldo individual. Veja [MEI e atualização automática](MEI_E_RESULTADO_AUTOMATICO.md).

O resultado líquido previsto também depende dos dados financeiros, anúncios e
demais despesas do período. Ele é uma estimativa: a liquidação bancária e os
recebimentos efetivos ainda não estão conciliados.
