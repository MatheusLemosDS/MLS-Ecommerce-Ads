# Resultado da loja por período

**Regra atual:** o MEI usa o DAS declarado de R$ 86,05 por mês em 2026, uma
única vez na competência. A estimativa anterior de 2% sobre produtos foi
substituída. A conta atual, a cobertura e o histórico automático estão em
[Conferência financeira](CONFERENCIA_FINANCEIRA.md). As referências a 2% e à
apuração manual de pedidos concluídos abaixo documentam versões anteriores.

**Atualização:** consumo automático de Ads e repasse previsto por produto estão
descritos em [Repasse por produto e consumo de anúncios](REPASSE_POR_PRODUTO_E_ADS.md).
O resultado aparece na tela inicial e a
coleta do período padrão começa automaticamente após a autenticação. Produtos
novos também passam pela descoberta automática de composição. A organização,
as regras e os temas estão em [Painéis e automação](PAINEIS_E_AUTOMACAO.md).
As referências abaixo a início manual descrevem a entrega anterior.

Atualização de 20/10/2026. O operador confirmou que o repasse numérico da amostra
é igual ao valor em reais da Shopee: um valor de R$ 50,00 aparece como `50`.
Essa evidência confirma a escala de Payment para esta loja. Não confirma a
unidade de uma fonte de anúncios diferente nem a liquidação dos pagamentos.
A unidade de Ads foi confirmada separadamente na atualização citada acima.

## Uso no painel

Em **Custos e margens → Resultado da loja**, escolha um intervalo de até quinze
dias e inicie a apuração. O padrão são os últimos sete dias de calendário de
São Paulo. O sistema avança por páginas enquanto a tela estiver aberta; é
possível parar e continuar a mesma apuração. O período padrão começa após a
autenticação; trocas de aba ou polling não disparam novas apurações.

A seleção reúne todos os pedidos `COMPLETED` **criados no intervalo**, até o
corte fixado no início. Não é um extrato de recebimentos ocorridos nesses dias.
Se atingir o limite de mil pedidos, duzentas páginas ou mil combinações de
produto/modelo, o relatório continua parcial e pede um intervalo menor. Erros
preservam as páginas já recebidas; continuar não soma pedidos repetidos.

O resumo mostra:

- **Repasse previsto:** soma de `escrow_amount`, sem descontar novamente as taxas
  já incluídas nesse campo.
- **Custo de produção:** quantidades vendidas multiplicadas pelo custo padrão
  atual de cada composição/tamanho, com as revisões de custos e vínculos usadas.
- **Saldo após produção:** repasse previsto menos custo de produção.
- **Resultado líquido previsto após anúncios e despesas:** estimativa disponível
  quando a coleta, os custos, as devoluções e os ajustes necessários estão completos.

Os custos cadastrados são padrões atuais, não prova do custo histórico de cada
pedido. Camisetas avulsas custam uma peça; kits com uma masculina e uma feminina
custam duas. O campo Shopee `original_cost_of_goods_sold` não é o custo de
produção cadastrado. As margens legadas dos kits são referências independentes
e não entram novamente nesta conta.

## Anúncios, despesas e pendências

O painel busca o **consumo de anúncios do mesmo intervalo** automaticamente após
a coleta financeira; também permite uma declaração manual. O imposto de 2%
é calculado separadamente sobre os produtos. Informe as outras despesas
externas ainda não incluídas no repasse, na produção ou nesse imposto.
Zero é uma declaração explícita de ausência, não o padrão
para um valor desconhecido. Não usar uma recarga de saldo como consumo de Ads.

Se houver dedução no campo combinado de recarga de anúncios/suporte técnico,
informe sua natureza antes de fechar a estimativa. Uma recarga de Ads é
reintegrada ao repasse antes de deduzir o consumo informado; suporte permanece
deduzido. Uma combinação sem classificação, um campo ausente, devoluções
presentes ou desconhecidas, dados incompletos ou valores sem precisão de
centavos mantêm a estimativa pendente.

O lucro liquidado continua desconhecido até haver conciliação de pagamentos,
devoluções e ajustes. `net_profit_cents` permanece `null`. A estimativa é
identificada como prevista, mesmo quando todos os dados usados estão completos.

## Variações e custo automático

Ao abrir **Produtos e variações**, o painel tenta resolver as associações
pendentes dos produtos cuja composição já é conhecida. Ao concluir uma apuração,
faz o mesmo para as variações encontradas no período e recalcula o resumo.
Não é necessário confirmar cada combinação de tamanhos.

O produto `22199878767` tem a composição avulsa confirmada pelo operador. O
catálogo observado de `58269212782` possui eixos feminino e masculino e 49
combinações de P a G3. Suas opções `MULHER P` e `HOMEM P`, por exemplo, são
reconhecidas somente no eixo correspondente. Não se aceitam prefixos arbitrários
nem um gênero no eixo oposto. A evidência pública limitada está em
[CATALOGO_KIT_OBSERVADO_58269212782.json](CATALOGO_KIT_OBSERVADO_58269212782.json).

Novos produtos com eixos inequívocos de tamanho são identificados automaticamente
como camisetas avulsas ou kits com uma peça de cada gênero. Casos ambíguos ficam
pendentes para definir a composição uma vez. Tamanhos identificáveis são
preenchidos em lote. Vínculos manuais têm prioridade e
rascunhos de edição são preservados. Nada altera o catálogo da Shopee.

## Publicação e proteção dos dados

Publicar os três Workers pelo Git já configurado, sem novos segredos, bancos ou
bindings. As tabelas da apuração são criadas no D1 financeiro existente; os
ajustes declarados e sua auditoria ficam no D1 administrativo. A coleta é
privada e exige sessão, Origin e CSRF. O transporte usa rotas internas fixas.

O relatório contém valores agregados, IDs de produto/modelo e quantidades.
Números de pedidos, compradores, respostas brutas, tokens e cursores não chegam
ao navegador. No banco da apuração, pedidos são identificados por hash; as
consultas ficam limitadas a sessenta apurações conservadas por trinta dias.

As verificações locais usam respostas simuladas e não comprovam uma nova
importação da loja em produção. A execução comercial de Ads e promoções
continua `LOCKED`.

Validação desta entrega: 475 testes Node, 14 verificações dos três Workers
compilados com D1 e 14 verificações no Chromium passaram. Foram conferidos
paginação, deduplicação, pausa/retomada, falhas preservando o progresso, custos
exatos, ajustes, rascunhos, composições desconhecidas e larguras de 320 a 1365
pixels. As configurações e os três dry-runs do Wrangler também passaram.
