# Imposto de 2% e resultado após custos conhecidos — histórico

**Política configurada atualmente nesta loja:** o operador declarou regime MEI
e DAS de **R$ 86,05 por mês de competência em 2026**, aplicado uma vez no mês.
Esse é o valor declarado para esta conta/ano, não uma alíquota ou valor legal
universal. Outra competência anual exige sua própria declaração. A estimativa
anterior de 2% foi substituída; a conta atual está em
[MEI e resultado automático](MEI_E_RESULTADO_AUTOMATICO.md) e
[Conferência financeira](CONFERENCIA_FINANCEIRA.md).

## Registro original da estimativa anterior

O texto, a confirmação e os exemplos abaixo preservam a implementação antiga
de 2%. Não aplicar essa política ao cálculo atual nem deduzi-la junto do DAS.

A associação do imposto à lista financeira e sua ordenação estão em
[Imposto por produto e ordenação](IMPOSTO_POR_PRODUTO_E_ORDENACAO.md).

O operador confirmou que uma venda de produtos de R$ 100,00, antes das taxas da
Shopee, gera R$ 2,00 de imposto. A confirmação limitada está em
[IMPOSTO_2_POR_CENTO_CONFIRMADO.json](IMPOSTO_2_POR_CENTO_CONFIRMADO.json).

## Base e cálculo

O painel passa a calcular o **imposto previsto de 2%** sobre o valor dos produtos
pago pelo comprador, informado por Payment em `original_cost_of_goods_sold`.
Não aplica a alíquota sobre `escrow_amount`, pois esse repasse já sofreu deduções
da Shopee. O campo de valor dos produtos também não é custo de fabricação.

A estimativa considera uma nota por pedido da apuração, com arredondamento
monetário de meio centavo para cima em cada pedido. Depois soma os impostos.
Por exemplo, duas bases de R$ 0,25 geram R$ 0,01 cada e R$ 0,02 no período;
recalcular 2% sobre a soma dessas bases daria um resultado diferente.

A taxa e a base foram confirmadas pelo operador. Os valores das notas fiscais
emitidas, eventuais notas parciais e seu critério real de arredondamento ainda
não foram importados. Por isso o valor aparece como imposto **previsto**. A base
segue os mesmos pedidos concluídos criados no período da apuração financeira.

Os valores precisam estar presentes, não negativos e em centavos exatos. Base
ausente, inválida ou com fração de centavo não vira zero e deixa a cobertura
incompleta. Zero explícito é aceito. O imposto automático fica separado do custo
de produção, das taxas já descontadas pela Shopee e das outras despesas.

## Último cartão

Uma consulta completa podia continuar mostrando “Em apuração” porque ainda não
havia declaração de despesas salva, mesmo com Ads automático disponível.
O painel passa a mostrar **saldo após custos conhecidos** quando repasse,
produção, imposto e anúncios estão completos e os demais requisitos permitem
a conta. Esse subtotal ainda não desconta outras despesas não declaradas.

O **resultado líquido previsto** aparece após informar e salvar as outras
despesas, ou usar **Não tenho outras despesas** para declarar zero explicitamente.
O botão de informar despesas leva diretamente ao campo. Carregar ou atualizar
a página não presume zero nem salva uma declaração em nome do operador.

A conta do líquido previsto é o repasse menos produção, imposto de 2%, consumo
de anúncios e outras despesas declaradas, com o tratamento já existente para
recarga de Ads ou suporte. Comissões, taxas e frete já incorporados ao repasse
não são descontados novamente. Se alguma condição ainda estiver pendente, o
cartão informa o motivo, sem apresentar a consulta concluída como carregamento.

## Despesas antigas

O campo anterior se chamava “Impostos e outras despesas”. Seu valor salvo pode
já conter imposto. Esses registros são preservados e precisam de uma revisão
explícita antes do novo líquido previsto: se já incluíram o imposto, retire-o
do campo de **outras despesas** antes de salvar.

Novos salvamentos registram que as outras despesas excluem o imposto de 2%
automático. O histórico anterior permanece preservado. A interface mantém
rascunhos durante atualizações e não altera o valor antigo silenciosamente.

## Dados, publicação e limites

A base é lida da resposta Payment que o importador já consulta, sem novas APIs
ou permissões. Uma tabela auxiliar no D1 financeiro existente registra somente
base, hashes de identidade e integridade e horário, vinculados ao registro
original. As gravações são atômicas com a página importada; retenção e limite
de consultas também limpam a evidência auxiliar.

Uma apuração antiga sem essa base continua legível, com imposto pendente.
Ao iniciar o mesmo período, ela deixa de ser reutilizada e uma nova coleta busca
a base automaticamente. Uma base realmente ausente na Shopee continua pendente
sem causar novas tentativas contínuas.

Não há variáveis, segredos ou bindings novos. Os três Workers precisam receber
o mesmo commit pelo Git já configurado. Devoluções, ajustes não classificados,
fontes incompletas e recebimentos ainda sem conciliação conservam suas
pendências. O lucro liquidado continua desconhecido.

## Validação

Passaram 595 testes Node, 32 verificações dos três Workers compilados com D1
e 24 verificações no Chromium. Foram conferidos base bruta e imposto por pedido,
arredondamento, transação e integridade da evidência auxiliar, cache antigo,
despesas sem duplicidade de imposto, subtotal automático, declaração explícita
de zero, rascunhos, devoluções e campos pendentes. Os cinco cartões foram
conferidos nos temas claro e escuro entre 320 e 1365 pixels.

As configurações e os dry-runs dos três Workers passaram. Os testes usam dados
simulados e não comprovam uma nova apuração da loja em produção.
