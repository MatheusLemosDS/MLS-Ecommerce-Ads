# Auditoria do roadmap e controle de devoluções reaproveitáveis

Auditoria de 01/11/2026 sobre a main `78efb0c9ebfa866c28d7be79414cb5324dd2c669` (PR96). Esta entrega corrige documentação e especifica trabalho pendente; não implementa estoque, não altera lucro, custos, pedidos, configuração ou publicação dos Workers.

## Conclusão

As entregas recentes são compatíveis com o roadmap e seus bloqueios de escrita permanecem ativos. A M2 continua aberta. Fundamentos visuais, M3 Observer/Listing Factory e partes assistidas da M8 foram antecipados por autorização do proprietário; isso não comprova conclusão dessas fases nem libera preços, campanhas ou estoque externos.

Existe uma lacuna relevante: custo estimado de produtos vendidos não é um registro de produção efetivamente incorrida. O sistema ainda não acompanha a peça devolvida, sua condição, seu valor recuperável e a posterior revenda. Essa lacuna deve ser resolvida antes de apresentar o ciclo de devolução/reaproveitamento como custo real preciso.

## Cobertura verificável da documentação

O [inventário da base auditada](MLS_RETURNS_REUSE_DOC_AUDIT_2026_11_01.inventory.json) identifica cada arquivo, tamanho e SHA-256:

| Categoria | Arquivos | Verificação |
| --- | ---: | --- |
| Documentos de texto | 120 | 98 Markdown varridos integralmente; 22 TXT tratados como documentos/artefatos |
| Documentos estruturados | 29 | JSON válido e revisão dirigida dos checkpoints e manifestos |
| Ferramentas históricas | 5 | Leitura e integridade dos pacotes, sem execução |
| Imagens | 78 | Inventário, assinatura PNG e hash; sem novo aceite visual |
| Total | 232 | Todos os arquivos rastreados de docs/ e os documentos de texto externos a docs/ |

São 225 arquivos em `docs/` e sete documentos de entrada/operação fora dessa pasta. A revisão verificou 217 links locais Markdown existentes, sem referências quebradas. As cinco fontes históricas e as 21 partes TXT das entregas Hermes foram confrontadas com seus manifestos; isso não executa nem reativa uma entrega antiga.

A revisão semântica concentrou-se no roadmap canônico, checkpoints, handoffs, guias financeiros/Returns/custos/produção/publicação/AI Sales e no código e testes correspondentes. Não se declara leitura humana linha a linha de cada artefato, aprovação de imagem, grant de API ou conferência bancária a partir desse inventário.

## Comportamento implementado hoje

| Situação | Comportamento observado no código | Limite |
| --- | --- | --- |
| Pedido CANCELLED, IN_CANCEL ou TO_RETURN | Sai da base paga elegível; seus itens deixam o custo estimado dessa base | Não preserva por si só a produção física já gasta |
| Pedido ainda elegível e com referência de devolução | Mantém o custo integral estimado; usa o repasse/ajustes conhecidos | Não identifica se a peça voltou ou pode ser revendida |
| Valor solicitado de reembolso | É evidência apresentada para conferência | Não constitui novo lançamento nem comprova estorno bancário |
| Ajuste de repasse confirmado | É incorporado uma vez ao repasse após ajustes | Não descontar novamente o reembolso solicitado |
| Nova venda de peça reaproveitada | Recebe novamente o custo de referência do SKU/quantidade | Não há vínculo com a unidade fabricada anteriormente |

Evidências de implementação:

- [Classificação e base financeira](../web/finance/src/business-period.mjs): `businessBucket`, agregação diária/mensal e exclusão de itens fora de completed/ongoing.
- [Regressão de cancelamento](../web/cloudflare/tests/business-daily-integration.test.mjs): a mudança de status remove tanto venda quanto custo estimado de R$15,90. Isso verifica a base elegível, não um livro de gastos físicos.
- [Repasse após ajustes](../web/cloudflare/src/business-adjusted-balance.mjs) e [testes](../web/cloudflare/tests/business-adjusted-balance.test.mjs): mudar o valor solicitado de reembolso não cria nova dedução.
- [Custeio por SKU](../web/cloudflare/src/production-costs.mjs): toda nova quantidade recebe custo de referência; componentes retidos ficam inativos no modo all-inclusive.
- [Returns persistido](../web/finance/src/returns-reconciliation.mjs) e [contrato](../web/finance/src/reconciliation-frame.mjs): identificadores internos, status e valores; sem recebimento físico, inspeção ou saldo de peças.
- [DTF persistido](../web/cloudflare/src/production-dtf-store.mjs): lotes, reservas e auditoria operacionais; não é estoque vendável nem registro do custo de cada camiseta.
- [Catálogo](../web/cloudflare/src/product-registry.mjs) e [Listing Factory](../web/cloudflare/src/mls-listing-factory-planner.mjs): atributos/composições e estoque declarado em rascunho não comprovam estoque físico.

O detalhe visível de Returns é limitado e informa truncamento; a criação de controle físico não pode considerar apenas as primeiras 40 ocorrências como lista completa. A identidade da devolução deve permanecer estável entre publicações mensais, sem criar estoque novamente a cada atualização.

## Regra correta para o controle novo

São três controles distintos:

1. **Financeiro da venda:** acompanhar solicitação, decisão e ajuste confirmado de repasse. Devolução ativa não significa automaticamente reembolso concluído; o valor já contido no repasse não é deduzido duas vezes.
2. **Caixa e custos incorridos:** produção efetivamente paga/incorrida continua registrada mesmo que o pedido seja cancelado. Reaproveitar uma peça não cria outro desembolso de fabricação nem apaga o anterior.
3. **Estoque e resultado por competência:** peça recebida, inspecionada e vendável pode recuperar valor em estoque. Esse valor não é receita ou dinheiro recebido. Sua recuperação e seu consumo na revenda precisam de lançamentos correspondentes para não contabilizar a fabricação duas vezes.

Na revenda, o novo desembolso pode limitar-se à embalagem e à etiqueta, conforme informado pelo proprietário, além de qualquer outro custo efetivamente confirmado. Para uma margem econômica por competência, o custo histórico da peça que saiu do estoque continua sendo consumido uma vez. A interface deve distinguir **novo gasto para atender o pedido** de **custo econômico do produto vendido**.

O custo all-inclusive atual pode incluir embalagem e etiqueta antigas já consumidas. Não é possível retirar esses componentes por adivinhação ou atribuir o valor integral do pacote à peça recuperada. É necessário confirmar a composição histórica e os novos custos incrementais, inclusive se aplicam por pedido, camiseta ou kit. Sem essa informação, quantidade pode ser conhecida e avaliação financeira continuar UNKNOWN.

Não alterar o custo global do SKU para cobrar apenas embalagem em uma revenda: isso também alteraria a referência de vendas que precisam de produção nova. O histórico atual guarda versões de configuração, mas os períodos são recalculados com referências atuais; ele não substitui o custo incorrido congelado por unidade/lote.

## Próximo incremento priorizado: M2.2, controle físico interno

| Etapa | Registro necessário | Bloqueio |
| --- | --- | --- |
| Produção incorrida | Ordem/lote, componentes, quantidade efetiva, data, custo histórico, revisão e proveniência | Status da venda não comprova que foi produzido |
| Aguardando recebimento | Caso e pedido originais, situação financeira e recebimento físico separado | ACCEPTED, CLOSED e REFUND_PAID não geram estoque |
| Recebimento e quarentena | Quantidade realmente recebida por componente do kit | Sem conferir o conteúdo não há quantidade vendável |
| Inspeção | Revendável, precisa reparo, avariada ou divergente; responsável e data | Item não vendável não fica disponível para nova venda |
| Identificação | Estampa/arte, SKU/variação confirmada, cor, tamanho e linha adulta/infantil | Camisetas diferentes não são intercambiáveis só por cor/tamanho |
| Lote recuperado | Quantidades disponíveis, reservadas, consumidas e baixadas; valor conhecido ou UNKNOWN | Sem duplicação por caso ou publicação |
| Reserva/revenda | Pedido de destino, unidade/lote utilizado e custos incrementais declarados | Reserva atômica; saldo não negativo e fabricação não cobrada novamente como novo desembolso |
| Conferência financeira | Caixa, estoque, custo consumido e repasse com vínculos auditáveis | Sem estorno artificial, dupla recuperação ou lucro realizado presumido |

A primeira entrega pode registrar recebimento, condição e quantidades sem alterar o resultado financeiro. A integração do custeio exige os valores históricos e incrementais confirmados, testes e conferência do operador. Não registrar retroativamente unidades como produzidas, recebidas ou vendáveis sem evidência.

Cada evento deve ter identidade idempotente, revisão/CAS, ator, data e reversão auditada. Um kit parcialmente devolvido retorna apenas as peças recebidas; não devolve automaticamente o kit completo. Reservas concorrentes não podem alocar a mesma unidade duas vezes.

Preservar separadamente mês de criação do pedido, data de produção, data do ajuste/reembolso, recebimento físico, revenda e movimentação bancária. Resultado por coorte de criação, fluxo de caixa e posição de estoque não devem ser somados como se fossem a mesma base.

Hermes pode preparar vínculos e sinalizar pendências. Recebimento e condição física exigem confirmação do operador ou evidência física validada. Nenhuma etapa autoriza atualizar estoque, pedidos, preços, campanhas ou pagamentos na Shopee.

## Aderência e correções da documentação

| Achado | Tratamento nesta auditoria |
| --- | --- |
| README descrevia Finance como novo/não conectado e preparação inicial como situação atual | Atualizar entrada para o estado publicado e separar setup de operação |
| Guia Git parecia garantir deploy automático | Identificar publicação controlada e necessidade de conferir versões; checks externos têm falha de causa não confirmada |
| Guias de imposto apresentavam 2% como regra atual | Marcar conteúdo histórico e apontar a política DAS-MEI mensal configurada, sem dupla dedução |
| Master current_release=96 e live_release=94 | Preservar release anterior como histórico e alinhar o ponteiro de Live |
| Retomada ainda pedia cursor antes de implementar paginação completa | Atualizar com PR93 e o corte observado de 182/182; manutenção futura continua necessária |
| M3/AI Sales ainda diziam módulos não integrados | Distinguir integração técnica via PR86 de fases completas, aceite e permissões |
| Produção incorrida/devolução física/reutilização ausentes | Acrescentar M2.2 e seus gates, sem declará-los implementados |

A issue [M2 #50](https://github.com/MatheusLemosDS/MLS-Ecommerce-Ads/issues/50) permanece aberta. Na consulta da auditoria havia 21 PRs antigas abertas, 18 DRAFT; vários conteúdos já foram reconciliados na PR86. O estado aberto da branch histórica não autoriza refazer merges, reativar flags ou repetir provisionamento. As evidências antigas são preservadas, com o contexto temporal explícito.

O fechamento continua exigindo repasses, devoluções, produção, anúncios e despesas no mesmo recorte, explicação das diferenças e confronto Seller Centre/banco. Pricing seguro, estoque externo e autonomia comercial não estão liberados por uma tela, teste ou estoque declarado em rascunho.

## Aceite do controle a implementar

- Reembolso encerrado sem recebimento não aumenta estoque.
- Produção confirmada não desaparece com o cancelamento da venda.
- Devolução duplicada ou republicada não duplica quantidade nem recuperação de custo.
- Kit parcial, estampa divergente, avaria e ausência de valor histórico permanecem explícitos.
- A mesma unidade não pode atender duas reservas; saldo físico nunca fica negativo.
- Alterar a tabela de preço/custo atual não reavalia silenciosamente um lote histórico confirmado.
- Embalagem/etiqueta novas são contabilizadas uma vez, na unidade correta, sem misturar o desembolso com consumo do valor em estoque.
- Reversões preservam trilha de auditoria e não reescrevem snapshots financeiros antigos.
- Nenhuma escrita externa ou anúncio é executado; sem valor ausente convertido em zero.

Esses são critérios de desenvolvimento futuro. A auditoria não afirma que o ledger, o reaproveitamento ou o fechamento financeiro já estejam implementados.

## Verificação desta atualização documental

Os 232 blobs da base auditada foram reconferidos por tamanho e SHA-256; o índice aponta para o commit imutável, não para versões editadas posteriormente. Na árvore atualizada foram verificados 247 links locais, sem referência quebrada, e todos os JSON foram analisados. A revisão independente confirmou que o ponteiro da Live agora corresponde à PR96, o histórico PR94 foi preservado e nenhum arquivo de runtime foi alterado. A integração Git exige a CI; esta auditoria não exige novo deploy.
