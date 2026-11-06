# Sugestões para confirmar produção — 06/11/2026

**Sugestões para confirmar produção — `PREPARED_NOT_PUBLISHED`:** versão `2026-11-06.1 — Sugestões para confirmar produção`. No painel Produção, um contexto DTF salvo e o catálogo validado do mesmo produto/variação oferecem identidade e composição para conferência. A ação explícita preenche somente campos vazios; qualquer conflito bloqueia a aplicação inteira e as confirmações são desmarcadas. Quantidade vendida, custo comercial atual e dados do catálogo não viram fabricação, custo histórico por peça, estampa ou data real. O registro continua dependendo da confirmação existente do proprietário. Sem migração ou nova consulta ao provedor; seis agentes, meses/rascunhos, financeiro e corte de sexta às 13h preservados. Implementação preparada; validação completa, PR/head/CI, hashes e publicação ainda sem recibo. A Live confirmada continua na versão 2026-11-03.3. Primeiro corte natural de sexta confirmado em 06/11 às 13:00:51 Brasília: original `SCHEDULED`, fonte `NO_RECORDS`, sem comprovar custo zero ou fabricação. Próximo corte 13/11 às 13h. M2/M2.2 e Seller Centre/banco permanecem abertos. [Uso, evidências e limites](#como-usar).

## Como usar

1. Abra **Produção → Fabricação e custos → Produção realizada** (`/admin?tab=agent-production#incurredProductionDetails`) e carregue o histórico salvo.
2. No formulário de fabricação, selecione um contexto de pedido já salvo. A sugestão consulta somente o par exato produto/variação e seus dados persistidos; não atualiza o catálogo na Shopee.
3. Confira o produto, a variação, os atributos, a composição e a origem. Se houver mais de um componente, escolha a peça compatível com a fabricação real. O custo exibido é referência atual da unidade comercial; um kit não fornece automaticamente custo histórico de cada peça.
4. Use **Usar dados salvos** para aplicar a identidade sugerida ao rascunho. Campos já preenchidos são preservados. Um conflito bloqueia toda a aplicação; confira/corrija o rascunho conscientemente. As confirmações de identidade, fabricação e custo são reiniciadas após aplicar.
5. Informe ou confira a data real de fabricação, quantidade física, estampa e custo histórico conhecidos. Confirme novamente os fatos e use o envio existente para registrar. Apenas consultar ou aplicar a sugestão não salva fabricação.

## Origem, precisão e limites

O novo GET owner `/api/admin/production/proposal` exige a chave e o hash do contexto salvo. A leitura e o DTO validam os dados persistidos e o par exato produto/variação. O catálogo fornece identidade/atributos atuais; vínculos e receitas explícitas podem oferecer componentes. Uma composição ausente, ambígua ou alterada permanece pendente. Uma origem inválida, ausente ou cujo hash mudou não deve ser aplicada; o operador pode recarregar e selecionar novamente ou continuar o preenchimento manual. Um pedido cancelado pode continuar como contexto salvo de uma fabricação já realizada: seu status não confirma produção e o cancelamento não elimina um fato físico real. A sugestão de custo não aplica filtros de elegibilidade financeira. A resposta não retorna compradores nem número bruto de pedido.

O custo é **atual e por unidade comercial**, com revisões de origem quando disponíveis. Não é custo histórico de fabricação por peça, gasto bancário ou fabricação comprovada. Quantidade vendida, quantidade DTF e componentes do kit não determinam automaticamente quantas peças foram efetivamente fabricadas. Nenhuma data real, quantidade física, custo histórico ou arte/estampa é preenchida pela sugestão. O operador continua responsável por esses fatos.

A seleção da origem abre a leitura de sugestão; uma recarga explícita do workspace pode reler a origem selecionada. A Visão geral e o bootstrap não disparam essa leitura. Sessão encerrada, mudança de origem e respostas antigas não devem aplicar dados no novo contexto. Nenhuma leitura cria tabelas, migra dados, chama provedores, lança fabricação ou altera estoque, lucro, Hermes ou lançamentos financeiros. O POST existente continua exigindo a confirmação explícita e seus controles de origem/CSRF/idempotência.

## Primeiro fechamento natural de sexta

Em 06/11/2026 às 13:37:52 Brasília, uma conferência aprovada executou somente um SELECT de metadados. O corte original foi registrado naturalmente às **13:00:51**, como `SCHEDULED`, versão 1, para **30/10/2026 13h inclusive → 06/11/2026 13h exclusivo**, incluindo o fim de semana. Os limites coincidem com o período pedido; o próximo corte é 13/11/2026 às 13h. Tick/sucesso do agendador estavam recentes no momento da observação.

O relatório está `NO_RECORDS`, revisão de origem 0, e a tabela física estava ausente. Isso significa que **o gasto real continua desconhecido**. Não prova que nada foi produzido nem que o custo foi R$ 0. A conferência não retornou dinheiro, IDs individuais ou payloads, não acionou o cron manualmente e não escreveu fatos. Prova privada `first-friday-metadata-20261106T163752948788Z.json`, SHA256 `ae5ebca17930faafab97df5503089a4adb2e72aeb6b30f202b36d5076ef883f3`. A validação do agendamento é independente da publicação deste incremento e não confirma completude ou valores do ledger.

## Estado da entrega e evidências

`PREPARED_NOT_PUBLISHED`: implementação e documentação iniciais. Fonte preparada, head, PR, CI, contagens de testes, hashes e publicação deste candidato continuam **null/pendentes** até evidência concluída. A versão Live previamente conferida é 2026-11-03.3. Testes/CI/deploy ainda não são declarados aprovados.

## Próximos passos e fases abertas

Concluir validações e entrega técnica deste incremento; depois o proprietário deve conferir uma sugestão real e registrar somente peças que sabe terem sido fabricadas. Para semanas anteriores, pedidos/vendas sozinhos não comprovam as datas, quantidades e custos reais: confirmar os lotes e, nas sextas, a distribuição antes/a partir das 13h. Sem esses registros, os gastos exatos continuam pendentes.

M2, M2.2, retorno físico/reaproveitamento, ponte contábil e comparação no mesmo período com Seller Centre/banco continuam abertos. A produção física não é descontada uma segunda vez do lucro e o cancelamento de venda não apaga uma fabricação real. Nenhuma reserva, estoque externo, revenda ou escrita comercial é liberada. Histórico publicado em [fechamento semanal](MLS_PRODUCTION_WEEKLY_CLOSE_2026_11_03.md) e [produção diária/Hermes](MLS_PRODUCTION_DAILY_HERMES_2026_11_03.md) permanece preservado.
