<!-- FINANCIAL_AUTOMATION_CURRENT -->
**Complemento financeiro — `PUBLISHED_VERIFIED` somente no escopo técnico/público:** versão `2026-11-13.2`, conferida em **13/11/2026 às 20:50:26 Brasília** em https://app.brazacommerce.com.br/admin?tab=agent-finance#financialAutomation. MLS Finance reúne resultado por competência, recebíveis/carteira, saques, banco, despesas, devoluções, conciliação e fechamentos versionados. Gráficos, detalhes e CSV usam os mesmos valores canônicos; custo histórico por peça, reaproveitamento inspecionado e pagamento de despesas exigem as evidências e confirmações aplicáveis. Fonte `e6bbb189ec2331c0a07136c5b9f720e2e300b5d4`, [CI 43527800185](https://github.com/MatheusLemosDS/MLS-Ecommerce-Ads/actions/runs/43527800185) aprovada: 4430 Node e 67 Python; sem somar execuções repetidas. Vetor App/Auth/Finance e assets conferidos nos recibos. Carteira/saques e banco automático ainda não têm adaptadores/grants reais comprovados; Ads, coorte de conclusão e demais lacunas da matriz permanecem parciais. QA autenticada é sintética/local; **aceite financeiro da conta real não realizado**, M2/M2.2 abertos. Publicação não comprova merge Git. [Uso, recibo e limites](financial-automation/README.md).

**Próximo corte financeiro:** comprovar fontes oficiais e coorte equivalente, resolver as lacunas internas por requisito e conferir uma semana e um mês encerrados com Seller Centre, banco e produção reais. Não promover M2/M2.2 nem a matriz por sucesso do deploy.
<!-- END_FINANCIAL_AUTOMATION_CURRENT -->

<!-- LAYOUT_REFERENCE_PARITY_CURRENT -->
**Layout da referência — `PUBLISHED_VERIFIED` no escopo técnico/público:** versão `2026-11-13.1`, conferida em **13/11/2026 às 16:17:09 Brasília** em https://app.brazacommerce.com.br/admin?tab=overview. Menu, cabeçalho, indicadores e seis agentes seguem o HTML fornecido; Finance abre o resultado e seus gráficos reais antes dos formulários; Produção prioriza calendário/custos; conta e login preservam formulários e permissões. Fonte `7c3b5cc2913f03177d8c2a1288325b78194dd5ad`, [PR #120](https://github.com/MatheusLemosDS/MLS-Ecommerce-Ads/pull/120), [CI](https://github.com/MatheusLemosDS/MLS-Ecommerce-Ads/actions/runs/43486058949) aprovada: 4.115 Node/67 Python, sem falhas ou testes ignorados. QA atual: 72 capturas, 1.208 alvos de pelo menos 44×44px e oito perfis nativos do login legado. A primeira conferência pública registrou um seletor de tema de 41,5px; correção App-only e nova CI precederam o aceite final de 15 GETs, sete assets e 24 perfis públicos. Três Workers ativos/latest a 100%; configurações, dados e cálculos preservados. Sem sessão Live do proprietário: aceite autenticado Live/financeiro não executado. M2/M2.2 e dependências comerciais permanecem abertas; consultar a PR para integração Git. [Mudanças, uso e recibos](MLS_LAYOUT_REFERENCE_PARITY_2026_11_13.md).
<!-- END_LAYOUT_REFERENCE_PARITY_CURRENT -->

<!-- V41_LAYOUT_COMMERCIAL_CURRENT -->
**V4.1 — `PUBLISHED_VERIFIED` no escopo técnico/público:** versão `2026-11-12.1`, publicada e conferida em **13/11/2026 às 13:14:50 Brasília** em https://app.brazacommerce.com.br. Navegação e painéis profissionais, seis agentes na inicial, gráficos com fontes reais e base de contas/empresas/equipe em banco separado. Fonte `7ec3ffa0ed27366eca0792d5d277979bb991f679`, [PR119](https://github.com/MatheusLemosDS/MLS-Ecommerce-Ads/pull/119), [CI43456719793](https://github.com/MatheusLemosDS/MLS-Ecommerce-Ads/actions/runs/43456719793) aprovada: 4.106 Node/67 Python. Finance→Auth→App ativos/latest100%, fontes raw/configuração e seis assets atuais+quatro retidos conferidos; 15 GETs e 24 perfis públicos aprovados. Não houve sessão real do proprietário: painéis autenticados e aceite M2/M2.2 não executados na Live. E-mail, cobrança, novas conexões e políticas comerciais ainda dependem de configuração/aprovação. Merge Git é conferido separadamente. [Mudanças, uso, recibos e limites](v4/RELEASE.md).
<!-- END_V41_LAYOUT_COMMERCIAL_CURRENT -->

<!-- WEEKLY_OPERATING_CURRENT -->
**Relatório semanal da operação — `PUBLISHED_VERIFIED`:** versão `2026-11-11.2`, conferida em 11/11/2026 às 18:49:55 Brasília. **Relatórios** reúne fabricação sexta13h→sexta13h Brasília, estimativa das vendas em sete dias civis e movimentação importada Nubank/Shopee, com gráficos, períodos, fontes e pendências separados. Fabricação não é deduzida novamente; transferência e crédito não são somados como duas receitas. Finance → Auth → App e cinco assets públicos com hash conferidos; configuração, domínios, flags, cron, fórmulas, fatos e seis agentes preservados. Fonte `4a9fce1dbaf8df80142fedf627a3d06325b3579e`, CI [43104305899](https://github.com/MatheusLemosDS/MLS-Ecommerce-Ads/actions/runs/43104305899) aprovada: 3.905 Node e 67 Python; QA sintética em oito perfis, falhas de weekly/production e 42 capturas. Sem sessão real do proprietário ou fatos de teste na conta; cobertura ausente permanece pendente e lucro realizado desconhecido. TikTok Shop vem a seguir: aplicativo existente, Order API ainda não liberada; Mercado Livre e XLSX Shopee pendentes. M2/M2.2 abertas. Consultar a [PR #118](https://github.com/MatheusLemosDS/MLS-Ecommerce-Ads/pull/118) para integração Git; publicação não comprova merge. [Uso e evidências](MLS_WEEKLY_OPERATING_REPORT_2026_11_11.md).
<!-- END_WEEKLY_OPERATING_CURRENT -->

<!-- ORDER_OPERATIONS_CURRENT -->
**Pedidos e operação — `PUBLISHED_VERIFIED`:** versão `2026-11-11.1`, conferida em 11/11/2026 às 16:54:57 Brasília. **Pedidos** abre o quadro por pedido, datas, filtros, etapas internas auditadas e status Shopee separado; atualização periódica de 60s enquanto visível e revisão quando itens/quantidades mudam. Pedidos abertos já impressos voltam à revisão. App `c55d7ef5-625e-4d7b-be8e-ab3ff71b5b85` e três assets públicos com hash conferidos; Auth/Finance, configuração anterior exceto migração ASSETS, domínios, flags, cron, fórmulas, fabricação, sexta13h e seis agentes preservados. Fonte `0e086c13e8058c6aa96b2465f0782879c8bdbbeb`, CI [43087471264](https://github.com/MatheusLemosDS/MLS-Ecommerce-Ads/actions/runs/43087471264) aprovada: 3.833 Node e 67 Python; QA Chromium sintética normal/minificado ×320/1365 ×claro/escuro e falhas dos três assets. Sem sessão real do proprietário nem fatos de teste na conta. Consultar a [PR #117](https://github.com/MatheusLemosDS/MLS-Ecommerce-Ads/pull/117) para a integração Git; publicação não comprova merge. Mercado Livre/TikTok, relatório financeiro semanal unificado e XLSX Shopee continuam pendentes; M2/M2.2 abertas. [Uso, evidências e próximos passos](MLS_ORDER_OPERATIONS_2026_11_11.md).
<!-- END_ORDER_OPERATIONS_CURRENT -->

<!-- NUBANK_CASH_RECONCILIATION_CURRENT -->
**Conciliação com extrato Nubank — `PUBLISHED_VERIFIED`:** versão `2026-11-10.1`, 10/11/2026. Em **MLS Finance → Banco e transferências**, confira extrato Nubank CSV/OFX e transferências Shopee CSV, prepare a prévia sem salvar e importe somente após a confirmação das linhas. Sugestões exigem revisão; confirmar e desfazer vínculos preserva a auditoria. A data do dinheiro fica separada da data dos pedidos e o lucro previsto permanece inalterado. Finance → Auth → App publicados e os três vetores de bytes/versões, configuração, domínios, subdomínios, flags e cron conferidos após cada etapa; verificação final em 10/11/2026 às 14:02:41 Brasília. Head `9b546e8e65278470e62c919d0711d05b2f55a18d`, CI [42857825794](https://github.com/MatheusLemosDS/MLS-Ecommerce-Ads/actions/runs/42857825794) aprovada com 3.761 testes Node e 67 Python; QA Chromium sintética normal/minificado ×320/1365 ×claro/escuro. A suíte local teve 3.760/3.761 por indisponibilidade CDP antes da navegação; o mesmo arquivo passou isoladamente, sem alterar o teste. Nenhum arquivo Nubank real foi importado nesta entrega; contratos legados, `BANK` em `NOT_COMPARED`, produção e lucro preservados. M2/M2.2 e o confronto operacional Seller Centre/banco continuam abertos. Consultar a [PR #116](https://github.com/MatheusLemosDS/MLS-Ecommerce-Ads/pull/116) para o estado atual da integração Git. [Uso, evidências e limites](MLS_NUBANK_RECONCILIATION_2026_11_10.md).
<!-- END_NUBANK_CASH_RECONCILIATION_CURRENT -->

<!-- PRODUCTION_WORKSPACE_CURRENT -->
**Produção diária e fechamento semanal — `PUBLISHED_VERIFIED`:** versão `2026-11-09.3`, 09/11/2026. Produção separa Diário e mês, Fechamento semanal, Registrar produção, intervalo e Referência das vendas; DTF continua acessível. Gráficos usam os registros salvos e permitem selecionar por clique ou teclado. Registrar neste dia preenche somente por ação explícita e preserva rascunhos; campos opcionais ficam separados. Conferir este dia abre a declaração existente do intervalo; sexta exige escolher antes ou a partir de 13h. O diário é agregação dos lotes mais declaração de completude, sem novo artefato diário imutável. Ao cruzar o corte semanal, a tela relê o GET existente após tolerância de 65s; reentrada/foco e espera limitada por artefato evitam permanecer numa prévia antiga. App publicado e vetor dos três Workers conferido em 2026-11-09T23:53:15-03:00. Fonte `e1f74f6763a8ebb407402e2808fca2430d12b9a0`, head `85c59749c0f93a909bc5ab00a05013155fab6921`, CI [42744288094](https://github.com/MatheusLemosDS/MLS-Ecommerce-Ads/actions/runs/42744288094) aprovada: 3660 Node e 67 Python; Chromium sintético normal/minificado, 320/1365 e claro/escuro. Consultar a [PR #115](https://github.com/MatheusLemosDS/MLS-Ecommerce-Ads/pull/115) para a integração atual; recibo de publicação não prova merge. Semana preservada: sexta 13h inclusiva → sexta 13h exclusiva, Brasília, com fim de semana e oito intervalos de conferência. Relatório capturado e total declarado conferido são distintos; originais/revisões não são reescritos. Ausência de lotes/custos não vira zero nem fabricação derivada das vendas. Fórmulas, DTOs, Auth/Finance, Hermes, seis agentes, mês/rascunhos e custos cadastrados, incluindo infantil R$ 13,50 verificado na entrega anterior, preservados. Sem novo endpoint, cron ou fato real criado para QA. M2/M2.2 e comparação Seller Centre/banco continuam abertos. [Uso, evidências e limites](MLS_PRODUCTION_WORKSPACE_2026_11_09.md).
<!-- END_PRODUCTION_WORKSPACE_CURRENT -->

<!-- EDITABLE_COSTS_CURRENT -->
**Edição simples dos custos de produção — `PUBLISHED_VERIFIED`:** versão `2026-11-09.2`, 09/11/2026. Em Custos e regras, edite os valores dos tipos em um formulário visível e use Salvar valores; identificação e tamanhos ficam nas regras avançadas. Produtos oferece acesso direto ao valor do tipo. Alterar um tipo vale para todos os produtos associados, respeitando custos personalizados. A gravação usa a revisão e a auditoria existentes; conflitos e rascunhos não são descartados. A leitura restrita anterior à entrega confirmou Camiseta infantil em R$ 13,50, regra ativa na revisão 8; esse valor já estava salvo, sem nova alteração de configuração por esta entrega. As referências antigas de vendas usam a regra atual nos dados salvos. A tabela de fabricação realizada não estava presente; isso não comprova fabricação zero nem autoriza inventar lotes antigos. App publicado e vetor dos três Workers conferido em 2026-11-09T22:32:44-03:00. Fonte `2f11437b15ae656fecf38c9838c240fb3169ea28`, head `c61a9caf5316285d946ba3d1b35bc556623c1086`, CI [42734971744](https://github.com/MatheusLemosDS/MLS-Ecommerce-Ads/actions/runs/42734971744) aprovada: 3630 Node e 67 Python; Chromium sintético normal/minificado, 320/1365 e claro/escuro. O recibo registra a publicação; consultar a [PR #114](https://github.com/MatheusLemosDS/MLS-Ecommerce-Ads/pull/114) para a integração atual. Fórmulas, DTOs, Auth/Finance, Hermes, seis agentes, mês/rascunhos, fabricação e fechamento semanal preservados; sem novo endpoint, consulta ao provedor, migração ou fato real criado para QA. M2/M2.2 e comparação Seller Centre/banco continuam abertos. [Uso, evidências e limites](MLS_EDITABLE_COSTS_2026_11_09.md).
<!-- END_EDITABLE_COSTS_CURRENT -->

<!-- DAILY_RESULT_CLARITY_CURRENT -->
**Resultado diário e devoluções às claras — `PUBLISHED_VERIFIED`:** versão `2026-11-09.1`, 09/11/2026. Na Visão geral, a explicação do cartão diário fica visível. No detalhamento do dia, aparecem os pedidos com devolução informada, a cobertura ainda desconhecida, a base do repasse e o aviso quando devoluções/reembolsos ainda podem alterar a estimativa, inclusive nos estados parciais. A produção descontada corresponde aos itens dos pedidos pagos criados na data selecionada; a fabricação real por data continua separada. Ads da data e parcelas diárias de DAS/despesas mantêm os cálculos existentes. Devolução informada não comprova reembolso já conciliado ou crédito automático de produção/reaproveitamento. App publicado e vetor dos três Workers conferido em 2026-11-09T19:56:08-03:00. Fonte `fb4b91901f4e1cf8cf67ace57533ddef013a7f5c`, head `cf6978bd70ede20dad4123874459ad7924d233e7`, CI [42714393350](https://github.com/MatheusLemosDS/MLS-Ecommerce-Ads/actions/runs/42714393350) aprovada: 3602 Node e 67 Python; Chromium sintético normal/minificado, 320/1365 e claro/escuro. O recibo registra a publicação; o estado atual da integração deve ser consultado na [PR #113](https://github.com/MatheusLemosDS/MLS-Ecommerce-Ads/pull/113). Fórmulas, DTOs, leituras, Hermes, seis agentes, meses/rascunhos, fabricação e fechamento semanal preservados; sem novos endpoints/provedores ou fatos reais criados. M2/M2.2 e comparação Seller Centre/banco continuam abertos. [Uso, evidências e limites](MLS_DAILY_RESULT_CLARITY_2026_11_09.md).
<!-- END_DAILY_RESULT_CLARITY_CURRENT -->

<!-- PRODUCTION_COVERAGE_CURRENT -->
**Conferência da fabricação por período — `PUBLISHED_VERIFIED`:** versão `2026-11-06.2`. Em Produção, confira os oito intervalos da semana de sexta 13h a sexta 13h, em Brasília. Cada intervalo encerrado exige declarar que todos os lotes reais foram registrados ou confirmar explicitamente que não houve fabricação. Ausência de registro continua desconhecida; custo pendente e sexta sem distribuição confirmada impedem o total conferido. Alterar lotes/cortes do intervalo torna a declaração anterior desatualizada; a retirada explícita mantém auditoria. A conferência não cria lotes, não usa vendas/DTF como fabricação e não altera os relatórios semanais originais, lucro ou estoque. App publicado e vetor dos três Workers conferido em 2026-11-09T18:53:03-03:00. Fonte `7f7f8498472806e6a311aa5c44f28104466040d6`, head `bb8b0f57cd681ca2a6b11b2ea8087572216eb597`, CI [42333118493](https://github.com/MatheusLemosDS/MLS-Ecommerce-Ads/actions/runs/42333118493) aprovada: 3586 Node e 67 Python. O recibo registra a publicação; o estado atual da integração deve ser consultado na [PR #112](https://github.com/MatheusLemosDS/MLS-Ecommerce-Ads/pull/112). PR111 integrada em `673dc8f4d3c6c36eaa41fcf33ae264130fa9ba18`, com vetor Live da versão 2026-11-06.1 conferido separadamente. Primeiro corte natural de sexta observado em 06/11 às 13:00:51 Brasília, fonte NO_RECORDS naquele corte; isso não comprova gasto zero. M2/M2.2 e Seller Centre/banco permanecem abertos. [Uso, evidências e limites](MLS_PRODUCTION_COVERAGE_2026_11_06.md).
<!-- END_PRODUCTION_COVERAGE_CURRENT -->

<!-- PRODUCTION_CONFIRMATION_PROPOSAL_CURRENT -->
**Sugestões para confirmar produção — `PUBLISHED_VERIFIED`:** versão `2026-11-06.1 — Sugestões para confirmar produção`. No painel Produção, um contexto DTF salvo e o catálogo validado do mesmo produto/variação oferecem identidade e composição para conferência. A ação explícita preenche somente campos vazios; qualquer conflito bloqueia a aplicação inteira e as confirmações são desmarcadas. Quantidade vendida, custo comercial atual e dados do catálogo não viram fabricação, custo histórico por peça, estampa ou data real. O registro continua dependendo da confirmação existente do proprietário. Sem migração ou nova consulta ao provedor; seis agentes, meses/rascunhos, financeiro e corte de sexta às 13h preservados. App publicado e vetor dos três Workers conferido em 2026-11-06T14:01:47-03:00. Fonte `7eddce75f93106ef07f5c8c07647cb8469fb1ca4`, head `c8511feea6ee6769eff5b6a202b2be37776af326`, CI [42255966529](https://github.com/MatheusLemosDS/MLS-Ecommerce-Ads/actions/runs/42255966529) aprovada: 3555 Node e 67 Python. Integração Git ainda depende da CI documental e merge da [PR #111](https://github.com/MatheusLemosDS/MLS-Ecommerce-Ads/pull/111). Primeiro corte natural de sexta confirmado em 06/11 às 13:00:51 Brasília: original `SCHEDULED`, fonte `NO_RECORDS`, sem comprovar custo zero ou fabricação. Próximo corte 13/11 às 13h. M2/M2.2 e Seller Centre/banco permanecem abertos. [Uso, evidências e limites](MLS_PRODUCTION_CONFIRMATION_PROPOSAL_2026_11_06.md).
<!-- END_PRODUCTION_CONFIRMATION_PROPOSAL_CURRENT -->

<!-- PRODUCTION_WEEKLY_CLOSING_CURRENT -->
**Fechamento semanal da produção — `PUBLISHED_VERIFIED`:** versão `2026-11-03.3 — Fechamento semanal da produção`. Semana confirmada pelo proprietário: sexta anterior às 13h até sexta às 13h, Brasília, incluindo fim de semana e sem incluir o instante final. Relatórios no painel Produção, histórico retrospectivo identificado e fechamento original preservado com revisões posteriores. Registros de sexta exigem distribuição confirmada das peças antes/a partir de 13h; sem confirmação, ambas as semanas adjacentes permanecem pendentes. Custos históricos/NO_RECORDS e fabricação real ficam separados de vendas, lucro e caixa. Cron interno usa o trigger de minuto existente, independente do Hermes/coleta; sua observação natural é registrada separadamente e não se presume execução futura de sexta. App `26703f97-a986-476c-bef9-d51532f68eb7` publicado e conferido em 03/11/2026 às 23:23:33 Brasília. Fonte `5d570db1f6c7d7793c2c98cc5d1ee61508b81cda`, head `c84a10f44bde68d15916ecfd4d688870a7e0f739`, CI [41759155044](https://github.com/MatheusLemosDS/MLS-Ecommerce-Ads/actions/runs/41759155044) aprovada: 3524 Node e 67 Python. Auth/Finance e vetor dos três Workers/configuração/domínios/flags/cron conferidos. Integração Git: consultar a [PR #110](https://github.com/MatheusLemosDS/MLS-Ecommerce-Ads/pull/110); publicação/CI não comprovam merge. M2/M2.2 e Seller Centre/banco continuam abertos; dados ausentes não viram custo zero nem fabricação inventada. [Uso, origem e limites](MLS_PRODUCTION_WEEKLY_CLOSE_2026_11_03.md).
<!-- END_PRODUCTION_WEEKLY_CLOSING_CURRENT -->

<!-- PRODUCTION_DAILY_HERMES_CURRENT -->
**Produção diária e leitura do Hermes — `PUBLISHED_VERIFIED`:** versão `2026-11-03.2 — Produção diária e parâmetros do Hermes`. Fabricação registrada por dia, data selecionável e histórico mensal com gráfico, maiores custos/quantidades registrados e empates. Dias sem registro/custo desconhecido não viram zero; pico de custo fica pendente se houver custo desconhecido no mês. Lucro diário é estimativa financeira salva pela data do pedido, separada da fabricação e sem segunda dedução. Hermes mantém valores, fórmulas e snapshots; a melhoria expõe Ads, parâmetros e diferença entre dia de Ads e recorte mensal. Apenas App; Auth/Finance, contratos, seis agentes, mês/rascunhos e gates comerciais preservados. App `81ca539d-6785-46f0-b854-fdb8861e80f6` publicado e conferido em 03/11/2026 às 13:14:46 Brasília. Fonte `c106ad84145d6f27265783ead318b45eea8c8e2c`, head `fef88d1d53b0354976a5f7dd2b197303c91c0ce0`, CI [41670540646](https://github.com/MatheusLemosDS/MLS-Ecommerce-Ads/actions/runs/41670540646) aprovada: 3483 Node e 67 Python. Auth/Finance e vetor dos três Workers/configuração/domínios/flags/cron conferidos. Integração Git: consultar a [PR #109](https://github.com/MatheusLemosDS/MLS-Ecommerce-Ads/pull/109); publicação/CI não comprovam merge. M2/M2.2 e Seller Centre/banco continuam abertos; registros não comprovam toda a fabricação da loja ou pagamento. [Uso, origem e limites](MLS_PRODUCTION_DAILY_HERMES_2026_11_03.md).
<!-- END_PRODUCTION_DAILY_HERMES_CURRENT -->

<!-- M3_VARIANT_ORDER_EVIDENCE_CURRENT -->
**M3 paralela publicada e conferida — 03/11/2026 às 12:07:27 Brasília:** versão `2026-11-03.1 — M3 · Contribuição por variação e pedido`, `PUBLISHED_VERIFIED`. Produtos recebe contribuição de referência dos pedidos com um único par produto/modelo, permitindo vários modelos vendidos no mês quando cada pedido tem atribuição comprovada. Pedidos do mesmo produto com vários modelos e pedidos mistos permanecem em buckets distintos sem rateio. Finance → Auth → App publicados nessa ordem, com os três vetores de bytes e configuração/domínios/flags/cron conferidos após cada etapa. Fonte `4dbeeb3804493d9894536eb3a201aa58573adb2d`, head `ed9e86ce72b7d37486e51fc45f95ef7d232180cb`, CI [41658488625](https://github.com/MatheusLemosDS/MLS-Ecommerce-Ads/actions/runs/41658488625) aprovada: 3457 Node e 67 Python. Negociação opt-in e sidecar preservam os frames legados; v5 usa o mesmo GET mensal, sem nova consulta à Shopee ou backfill. Fonte sem captura continua `NOT_CAPTURED`; publicação não confirma cobertura natural da conta. Custo atual incide só na quantidade atribuída; tributo legado conserva arredondamento por pedido, DAS/Ads/despesas ficam fora e ajuste já no repasse não é reaplicado. Seis agentes, mês/rascunhos e cenários preservados. M2/M2.2 e o restante da M3 continuam abertos. Integração Git: consultar a [PR #108](https://github.com/MatheusLemosDS/MLS-Ecommerce-Ads/pull/108); publicação e CI não comprovam merge. [Uso, recibo e limites](MLS_M3_VARIANT_ORDER_EVIDENCE_2026_11_03.md).
<!-- END_M3_VARIANT_ORDER_EVIDENCE_CURRENT -->

<!-- M3_CONTRIBUTION_EVIDENCE_CURRENT -->
**M3 paralela publicada e conferida — 03/11/2026 às 00:04:01 Brasília:** versão `2026-11-02.6 — M3 · Margens e evidências por produto`, `PUBLISHED_VERIFIED`. Produtos mostra contribuição exclusiva conferida, margem/sinal, gráfico de composição e motivos/quantidades pendentes, separando resultado estrito de valores conhecidos. Uma única variação vendida recebe evidência exclusiva somente com todos os gates válidos; múltiplas variações vendidas continuam sem atribuição financeira. Campos legados v1 de margem/lucro por variação permanecem desconhecidos. Sem rateio de dinheiro/custo misto, taxa inferida da diferença vendas–repasse ou dupla aplicação de ajuste já no repasse. Ads, DAS mensal e despesas ficam fora dessa contribuição; regime legado mantém sua referência de imposto, sem promovê-la a tributo oficial. Referência atual de custo não é fabricação/reaproveitamento. Fonte `c70b0304ec4502edabe44a7ae90e144d6a7e4b7b`, head `53580d2612b3661c8d76016a35fb5a14f41e69c9`, CI [41568940647](https://github.com/MatheusLemosDS/MLS-Ecommerce-Ads/actions/runs/41568940647) aprovada: 3400 Node e 67 Python. App `fef9da9e-bcfc-42e1-a8c4-e38b84a656bd` publicado e vetor dos três Workers conferido; Auth/Finance, configuração, domínios, flags e cron preservados. Sem nova API/SQL/coleta/provedor ou escrita comercial. Seis agentes da inicial, mês/rascunhos e hipóteses dos cenários preservados. M2/M2.2 e Seller Centre/banco continuam abertos. Integração Git: consultar a [PR #107](https://github.com/MatheusLemosDS/MLS-Ecommerce-Ads/pull/107); publicação e CI não comprovam merge. [Uso, recibo e limites](MLS_M3_CONTRIBUTION_EVIDENCE_2026_11_03.md).
<!-- END_M3_CONTRIBUTION_EVIDENCE_CURRENT -->

**Live — 02/11/2026 às 19:50:54 Brasília:** versão `2026-11-02.4 — Agentes de volta à página inicial`; seis cartões Hermes, Finance, Ads, Products, Production e Returns restaurados abaixo dos indicadores e antes dos gráficos, com avatares, cores e estados das fontes salvas. App `16ee9374-f16a-45b3-99a9-92669d296c9b` publicado e vetor dos três Workers conferido; Auth/Finance, configuração, domínios, flags e cron preservados. Fonte `4d1a968f4482e8dc3deb3b2a97847a91479eacf7`, head `7a8b548830fd68a0216cb7c1b4b6fb3f554c78de`, CI [41539423858](https://github.com/MatheusLemosDS/MLS-Ecommerce-Ads/actions/runs/41539423858) aprovada: 3346 Node e 67 Python. **PUBLISHED_VERIFIED:** publicação técnica comprovada; consultar a [PR #105](https://github.com/MatheusLemosDS/MLS-Ecommerce-Ads/pull/105) para o estado atual da integração Git. Equipe completa, navegação e controles existentes preservados; M2/M2.2 continuam abertas. [Uso, evidências e limites](MLS_OVERVIEW_AGENTS_RESTORE_2026_11_02.md).

**Continuidade confirmada da PR104:** merge `41b95f6e93236fdfad42ff9b3deb9a85905d67ef`, em 02/11/2026 às 19:15:31 Brasília; CI documental [41534506552](https://github.com/MatheusLemosDS/MLS-Ecommerce-Ads/actions/runs/41534506552) aprovada e árvore/runtime conferidos. A nota anterior com integração pendente preserva o corte de publicação. Três descritores de fotos já passaram pelo leitor canônico após captura natural; a exibição real no CDN foi bloqueada pelo proxy do executor. Isso não confirma recebimento, fabricação ou fechamento financeiro.

**Live PR104 — 02/11/2026 às 19:06:16 Brasília:** versão `2026-11-02.3 — Operação simples e produção por período`; Finance `7001376b-f065-4e37-84ea-ee9ac2ea890c`, Auth `d6f4397f-ac4d-45cf-93da-175df8305a6d` e App `4a556c39-bd1b-4962-84a6-b25bf5504e95` publicados nessa ordem, com bytes/configuração/domínios/flags/cron conferidos após cada etapa. Fonte `c7a7b35677fc30a408644225978aecd90d5fe826`, head `94d62aa047263fbf478faf79aa87542a3ebb5037`, CI [41532391229](https://github.com/MatheusLemosDS/MLS-Ecommerce-Ads/actions/runs/41532391229) aprovada: 3346 Node e 67 Python. Fila de devoluções com dados salvos e confirmação física atômica, custo por datas de fabricação em Brasília e sete destinos operacionais. Foto atual do produto e PNG local verificado continuam separados; kits/ausências não viram peças ou custo zero. **PUBLISHED_VERIFIED_INTEGRATION_PENDING:** integração Git ainda requer recibo próprio. QA foi local/sintética; captura natural de fotos, recebimento/fabricação reais e Seller Centre/banco não foram comprovados. M2/M2.2 e ponte contábil continuam abertas. [Mudanças, uso, recibo e limites](MLS_SIMPLIFIED_OPERATIONS_2026_11_02.md).

**Live PR103 — itens e quantidades das devoluções, 02/11/2026 às 17:45:00 Brasília:** versão visível `2026-11-02.2`; Finance `5e3b4686`, Auth `e13c43ad` e App `0a2955bc` publicados nessa ordem e conferidos após cada etapa. CI 41520727701 aprovada no head `2e255910`: 3248 Node e 67 Python. Bytes dos três Workers conferidos; configuração, domínios, flags e cron preservados. Consulta no MLS Returns separa unidades comerciais do pedido e da solicitação, com fonte/cobertura; legado sem captura segue desconhecido. Não altera `original_quantities`, físico/fabricação, vínculos, estoque ou lucro; sem nova requisição ao provedor ou backfill. Captura natural real pós-deploy ainda requer conferência separada; M2/M2.2 permanecem abertas. Integração Git é conferida pelo estado da PR103 vinculada. [Mudanças, uso e recibo](MLS_ORIGINAL_RETURN_ITEMS_2026_11_02.md). As entregas abaixo preservam o histórico.

**Live PR102 — líquido mensal e histórico, 02/11/2026 às 11:44:54 Brasília:** versão visível `2026-11-02.1`, App `8e1056d2` publicados e conferidos. Saldo mensal separado identifica despesas desconhecidas e Ads salvos com data/dia parcial; barra de mês dos agentes consulta o histórico salvo, preservando rascunhos e escopos. CI 41463788001 aprovada no head `2f13eaa1`: 3.205 Node e 67 Python aprovados. Bytes dos três Workers, Auth/Finance, configuração e domínios conferidos. A integração em main é conferida separadamente pelo estado da PR102 vinculada. A ausência de outras despesas de novembro foi declarada pelo proprietário e registrada separadamente, sem zero presumido. Resultado estrito/Hermes e gates comerciais preservados; M2/M2.2 continuam abertas. [Mudanças, uso e recibo](MLS_MONTHLY_NET_HISTORY_2026_11_02.md). As entregas abaixo preservam o histórico.

**Live PR101 — navegação e novidades, 01/11/2026 às 19:25:21 Brasília:** versão visível `2026-11-01.1`, App `358957d4`; cartão na Visão geral, acessos diretos, busca que abre os formulários e roadmap visual atualizado publicados e conferidos. CI 41356444549 aprovada no head `f5584fe3`; Auth/Finance e configuração preservados. A integração em main é conferida separadamente pelo estado da PR vinculada; CI e recibo identificam a publicação runtime. Próximo: proprietário conferir os três acessos e um recebimento real; M2/M2.2, conciliação e itens originais permanecem abertos. [Mudanças, uso, validação e limites](MLS_LIVE_UPDATE_DISCOVERY_2026_11_01.md). As entregas abaixo preservam o histórico.

**Comunicação das próximas entregas:** apresentar mudanças concretas, local e modo de uso, Git versus Live, passos manuais/pendências do operador e validações com limitações. Contagens de testes são evidência complementar; não substituem explicar o resultado ao proprietário. Cada mudança visível deve atualizar `APP_RELEASE` e suas notas visíveis no mesmo incremento; disponibilidade técnica não confirma dados reais, aceite operacional ou encerramento das fases.

**M2.2c PR100 publicada no App — 01/11/2026, 18:40:06 Brasília:** associação interna OWNER_CONFIRMED entre recebimento e fabricação, com limites globais de quantidade, origem congelada, CAS/auditoria e desvinculação explícita. Quantidades originais continuam UNAVAILABLE; SKU/lote não prova peça individual. App `2b1d820a`; Auth/Finance e configuração preservados. CI 41352590915 verde: 3.143 Node, 67 Python, 44 testes novos e 13 cenários D1; QA local/simulada normal/minificada 320/1365 aprovada, sem fatos Live. Valoração, reserva, revenda e ponte financeira permanecem abertas; uso real do proprietário não executado. Triggers D1 persistem no rollback: código antigo pode retornar 503; recuperar com código compatível e desvinculação explícita. PR100 ainda aguardava CI documental/merge no recibo. [Registro da associação](MLS_M22_RETURN_MANUFACTURING_LINKS_2026_11_01.md).

**Registro histórico M2.2b PR99 — 01/11/2026:** ledger interno de produção declarada por peça/lote, com data de fabricação em Brasília, fotografia imutável do custo ou UNKNOWN, resumos semanais/mensais independentes e correção por anulação/substituição auditada. Quantidade DTF/kit não vira produção e CANCELLED não apaga os registros. “Referência de custo das vendas” permanece separada; sem dupla soma no resultado, valoração, reserva, revenda ou estoque externo. App `c33b1d03`; Auth/Finance e configuração preservados. CI 41347493170 verde: 3.099 Node, 67 Python e QA local/simulada normal/minificado 320/1365. Nenhum fato real de fabricação foi lançado para QA; uso real do proprietário não executado. M2 e M2.2 continuam abertas. [Registro do ledger](MLS_M22_INCURRED_PRODUCTION_2026_11_01.md).

**Registro histórico da primeira etapa M2.2 PR98 — 01/11/2026:** controle interno de recebimento, quarentena e inspeção, com entregas parciais, referências únicas por caso, CAS, auditoria e repetição idempotente. Identidade e quantidade são declaradas pelo operador; itens/quantidade originais ainda não verificados. Avaliação UNKNOWN, sem integração financeira, reserva, revenda ou estoque externo. App `2157c238`; Auth/Finance e configuração preservados. CI 41344331375 verde: 3.056 Node, 67 Python e Chromium local/simulado normal/minificado 320/1365. Uso físico real do proprietário não executado; M2 e M2.2 permanecem abertas. [Registro da etapa](MLS_M22_PHYSICAL_RETURNS_2026_11_01.md).

**Registro histórico da auditoria PR97, base PR96 — 01/11/2026:** M2 permanece aberta. Custos de vendas elegíveis não são um ledger de produção incorrida; recebimento físico, inspeção, estoque reaproveitável e vínculo da revenda ainda não estavam implementados nessa base. Nova prioridade M2.2 especifica esses controles e separa caixa, estoque e custo consumido, sem criar custos/quantidades por inferência. Auditoria da base PR96: 232 arquivos, 120 documentos de texto, 29 JSON, cinco ferramentas históricas e 78 imagens inventariadas; 217 links locais originais válidos. Alteração somente documental; naquele corte a última runtime publicada era PR96. [Relatório](MLS_RETURNS_REUSE_ROADMAP_AUDIT_2026_11_01.md).

**Margem parcial e ROAS PR96 publicados — 01/11/2026:** a Visão geral mostra a margem do saldo conhecido antes das despesas não declaradas. ROAS atualiza antes dos gráficos; falhas de painel ficam isoladas, com tabela e escopo antigos removidos. Um dia Ads válido informa o índice sem inventar curva ou comparação. App `27356953`; Auth/Finance e configuração preservados. CI 41334582368 verde: 3015 Node e 67 Python, sem skips; Chromium normal/minificado 320/1365 e replay real com falha injetada aprovados. Despesas de novembro continuam desconhecidas, sem zero presumido. A exceção exata do navegador do proprietário não foi capturada; M2/banco permanecem abertos. [Registro](MLS_DAILY_MARGIN_ROAS_2026_11_01.md).

**Correção do resultado de hoje PR95 publicada — 01/11/2026:** despesas de novembro ainda não declaradas eram ocultadas pelo cartão. A Live mostra o saldo parcial com motivo e acesso direto à confirmação; lucro/margem/gráficos continuam desconhecidos até a declaração. Hoje acompanha Brasília, datas históricas e rascunhos são preservados, e salvar despesas atualiza a leitura imediatamente. App `47e3de73`; Auth/Finance e configuração preservados. CI 41332958729 verde: 3.005 testes Node e 67 Python; Chromium normal/minificado 320/1365 e replay local da leitura real aprovados. Nenhuma despesa real presumida como zero. M2 e confronto Seller Centre/banco continuam abertos. [Registro](MLS_TODAY_ESTIMATED_PROFIT_2026_11_01.md).

> **Release M2 PR94 publicada — 01/11/2026:** conciliação automática alterna o mês atual e o anterior. Cron natural confirmou 3/3 relatórios de outubro na mesma publicação (3 CHECKED, 0 ainda em conferência), com fonte, revisão, datas e cobertura conferidas. App `1a6ca4c3`; Auth/Finance preservados. CI 41325746160 verde: 2.977 testes Node e 67 Python, sem skips, incluindo Chromium. Primeira auditoria fria usa 48 de 50 chamadas permitidas. A recuperação histórica inclui o corte final real de Brasília. M2, confirmação de devoluções e confronto Seller Centre/banco continuam abertos. [Registro](MLS_M2_PREVIOUS_MONTH_RETURNS_2026_11_01.md).

> **Release M2 PR93 publicada — 01/11/2026:** paginação durável do Pending validada na conta: 2 páginas, 182 registros e 182 pedidos. Encerramento e publicação App/Finance conferidos. Navegação local de 50 registros por página, sem novas consultas ao navegar; última lista completa preservada. App `2280e3b1`, Auth `37bead27`, Finance `e0b258a2`. CI 41318567672 verde: 2.908 testes Node, 67 Python e Chromium. Bytes, configurações, domínios, flags e cron conferidos. A varredura concluída não confirma saldo atômico, lucro mensal ou recebimento bancário; M2 e fechamento continuam abertos. [Registro](MLS_M2_PENDING_PAGINATION_2026_11_01.md).

> **Release M2 PR92 publicada — 31/10/2026:** Pending recuperado e primeira página real validada (100 registros; continuação: sim), sem paginação nova. Pendências com evidências para Hermes, checklist de fechamento e navegação responsiva consolidados na Live. App`c8ab272d`, Finance`c1e31d3f`, CI41243934697 verde:2.842Node/67Python/Chromium. Bytes/config/flags/cron conferidos. Seller Centre/banco ainda NÃO COMPARADOS; M2 permanece aberta. [Registro](MLS_M2_PENDING_CLOSEOUT_2026_10_31.md).

# Roadmap canônico — MLS Commerce OS


**Release M2 PR91 publicada — 31/10/2026:** calendários dos três meses anteriores em rodízio, retomada após virada e correção de COMPLETE cujo corte ainda não fecha o mês. App `7bd0dfa7`, CI41229871797 verde:2.772Node/67Python/Chromium; bytes/config/Auth/Finance preservados. Cron natural do incremento na versão64174a2e iniciou setembro às15:37:56Brasília:1página/1registro/1de5intervalos,RUNNING, sem erro e com escopo exato. Próximo: acompanhar conclusão e conciliar Returns/Pending/Seller Centre/banco; M2 aberta. [Registro](MLS_M2_HISTORICAL_CALENDARS_2026_10_31.md).

**Release M2 PR90 publicada — 31/10/2026:** acompanhamento de repasses ligado à fila, primeira conferência com cooldown próprio e recuperação limitada das referências expiradas do mês anterior. App `17c1e9f1`, CI41218926278 verde:2.637Node/67Python/Chromium, bytes/config/Auth/Finance preservados. Cron real confirmou setembro com fontes e calendário ausentes, sem inventar recebimento. Próximo: observar a recuperação, preencher calendários históricos e conciliar Returns/Pending/Seller Centre/banco; M2 continua aberta. [Registro](MLS_M2_RELEASE_TRACKER_2026_10_31.md).

**Release PR89 publicada — 31/10/2026:** memória dos agentes gravada automaticamente e usada nos detalhes das análises Hermes, ROAS diário real e indicadores com datas no visual aprovado. App `66e9c01f`, CI41206928254 verde2.536Node/67Python/Chromium; configuração e Auth/Finance preservados. Primeiro corte natural conferido:publicação14306,3intervalos/23páginas,zero erro. Memória descritiva não comprova eficácia de uma recomendação nem lucro bancário. [Registro](MLS_AGENT_MEMORY_PERFORMANCE_2026_10_31.md).

**Pedido do proprietário — 31/10/2026:** agentes devem melhorar com informações da operação, executar rotinas conhecidas dentro dos limites existentes e apresentar relatórios, solicitando confirmação para ações novas ou arriscadas. Incremento em validação: memória factual com correções/recorrências, ROAS diário de Ads e indicadores visuais no estilo aprovado. Não habilita execução comercial ou treino automático do modelo. [Registro](MLS_AGENT_MEMORY_PERFORMANCE_2026_10_31.md).

**Release M2 PR88 publicada — 31/10/2026:** auditorias de devolução
destravadas, comparação da mesma publicação e situações identificadas no MLS
Returns. A virada diária agora encerra e retoma a coleta sem erro artificial.
2.459 Node/67 Python/Chromium aprovados, App `c00861cf`, Auth/Finance e
configuração preservados. Cron natural confirmou 2/2 relatórios da publicação
e progresso após o deploy, sem falhas atuais. M2/banco continuam abertos.
[Registro](MLS_M2_RETURNS_CONTINUITY_2026_10_31.md).

**Release Live PR87 conferida — 31/10/2026:** gráficos com inspeção por
ponteiro/toque/teclado, escala PT-BR, iluminação e cabeçalho mobile corrigido.
2.393Node/67Python/Chromium aprovados, versão App `17bb4a0c`, código e
configuração conferidos. Regra infantil16 corrigida:356/356 unidades com
custo na leitura verificada. Próximo foco M2: estados de pedidos/devoluções.
[Registro visual atual](MLS_VISUAL_CHARTS_RELEASE_2026_10_31.md).

**Release Live PR #86 conferida:** visual e módulos preparados integrados à
main PR85, com rascunhos AI Sales persistentes. CI 41157082180: 2.382 Node,
67 Python e Chromium aprovados; App oficial versão `2ffcefb4` com ambas flags
owner ativadas, código/bindings/cron verificados. Auth/Finance preservados.
Registro completo: [release Live](MLS_LIVE_ROADMAP_RELEASE_2026_10_30.md).
M2 e integrações externas continuam abertas.

## Estado atual — entrega na versão Live, 30/10/2026

O proprietário autorizou: **“Implemente todas as melhorias na versão Live, e
continue assim com todo o próximo roadmap sem quebrar a versão ativa.”** Os
próximos incrementos validados têm como destino a versão oficial; ambiente
separado será usado apenas quando necessário. Essa orientação substitui as
restrições históricas de merge/deploy das PRs de preparação. Ela não autoriza
gastos, mudanças de OAuth nem escritas comerciais Shopee/TikTok/Ads.

Base oficial: `2ab4c9d8baa3c25e5816bcca14b4a0973ea73d5a` (PR #85).
As melhorias preparadas até `4c149a7e818306ddd91419494e75a12b6e14c1f4` foram
reconciliadas no commit `b17df54`, branch
`release/live-roadmap-improvements-20261030`, preservando a correção de
cancelamentos e a atualização histórica. A validação e a persistência do
workspace AI Sales foram concluídas tecnicamente e publicadas no App oficial
pela PR #86. CI, hashes, versões e conferência pós-publicação ficam no
[registro do release Live](MLS_LIVE_ROADMAP_RELEASE_2026_10_30.md).

O pacote preparado inclui o visual das seis referências e demais painéis,
gráficos com fontes verificadas, busca V3.6, catálogo/custos e DTF, Listing
Factory com SKUs/variações preservados, Products/Pricing observador, Hermes na
mesma publicação financeira e as cinco abas nativas do AI Sales. O render real
Node/FFmpeg continua fora do Worker; CRM, propostas e desempenho são assistidos.
As flags owner-only de V3.6 e AI Sales são independentes e sua ativação Live
precisa ser conferida no release, sem abrir acesso de review.

O acesso à API Cloudflare está verificado; “Cloudflare não autenticada” abaixo
descreve a criação histórica da prévia, não o ambiente atual. A prévia sintética
da PR #84 continua preservada. Sessão real do proprietário e aprovação humana
visual/auditiva não foram comprovadas por fixtures.

**M2 permanece aberta**: Seller Centre, Pending, devoluções, liberações e banco
exigem evidência real. LLM/voz neural dependem de provedor e orçamento
configurados; mídia exige direitos e bytes autorizados; publicação/afiliados
externos dependem dos grants oficiais por loja. Ads/PROMO e escritas comerciais
continuam LOCKED. M3–M9 não estão declaradas integralmente concluídas.

## Histórico de preparação — não substitui o estado acima

Prévia de homologação na PR DRAFT #84: https://github.com/MatheusLemosDS/MLS-Ecommerce-Ads/pull/84 · implementação 1574f9e · 2.327 Node/67 Python aprovados, App/Auth/Finance inalterados. Na criação da prévia, o acesso seguro à Cloudflare ainda era dependência para homologação online.

Homologação local — registro histórico de 30/10/2026: branch `feature/mls-owner-homologation-preview-20261030`, baseada na PR #83. Servidor Worker/SQLite real com dados sintéticos e exportação HTML interativa; sem alteração do App/Auth/Finance. Consultar `docs/MLS_OWNER_PREVIEW_CHECKPOINT.json` e `docs/MLS_OWNER_HOMOLOGATION_2026_10_30.md`. Naquele corte não existia URL de homologação nem acesso Cloudflare; merge/deploy ainda não estavam autorizados. Essas duas restrições foram substituídas pela orientação Live acima; escritas comerciais seguem bloqueadas.

PR de integração DRAFT #83: https://github.com/MatheusLemosDS/MLS-Ecommerce-Ads/pull/83 · commits f513dca/54b87e5 · local2308Node/67Python,40capturas · Appa5ba3298…bbfb91c8. Conferir checks do HEAD; semmerge/deploy.

### Roadmap anterior preservado

Atualizado em **30/10/2026**.

> **Corte histórico de preparação — 30/10/2026:** PR #79 congelada com CI verde `e7ce5009`/41131654577 e seis PNGs originais versionados. A branch `integration/mls-commerce-os-ai-sales-20261030` integra a preservação de SKUs, Products/Pricing observador e MVP local AI Sales com três MP4s reais PT-BR e cinco abas nativas; regressão final registrada no [checkpoint da missão](MLS_MASTER_MISSION_CHECKPOINT.json). [Guia de homologação e limites](MLS_AI_SALES_INTEGRATION_2026_10_30.md). Nesse corte não houve merge/deploy/writes. M2, QA owner, grants e acesso LLM continuavam externos; nenhum lucro bancário foi inventado.



**Orientação operacional de 30/10/2026:** os próximos incrementos validados têm
como destino o app oficial. Ambiente separado só quando necessário; a prévia
demonstrativa já criada na PR #84 continua disponível. A correção de atualização
de cancelamentos parte da main `a96bb1c`, sem integrar as branches visuais/AI.
Ver [auditoria e entrega](MLS_CANCELLED_DAILY_PROFIT_2026_10_30.md).

PR #85: correção de atualização de cancelamentos publicada no App/Finance
oficiais e verificada pela API Cloudflare; CI 41155020856 verde com 2.129 Node,
67 Python e Chromium. M2 permanece aberta para conciliação financeira real.

> **Checkpoint multi-branch 28/10/2026:** A main continua em b058e832 (PR #46 integrada); PR #48 de busca V3.6 segue draft/CI verde (2.115 Node + 67 Python); PR #47 M3 Products/Pricing Observer segue draft/CI verde (2.124 Node + 67 Python); PR #51 abre a pesquisa Shopee/Listing Factory, com CI inicial verde (2.122 Node + 67 Python). Nenhuma dessas três PRs foi integrada ou publicada. **M2 Finance continua aberta (issue #50).** A M3 de precificação comercial não está aprovada.
>
> Execução rastreada: issue #50 (M2), #52 (Listing Factory UI), #53 (escrow batch), #54 (push).
>
> Guia da pesquisa e implementação: [SHOPEE_RESEARCH_TO_MLS_2026_10_28.md](SHOPEE_RESEARCH_TO_MLS_2026_10_28.md) · [MLS_CODEX_HANDOFF_2026_10_28.md](MLS_CODEX_HANDOFF_2026_10_28.md) · [MLS_LISTING_FACTORY_V1.md](MLS_LISTING_FACTORY_V1.md).

> **ESTE É O ROADMAP CANÔNICO DO PROJETO.**
> Toda nova conversa, conexão, sessão do Codex ou continuidade deve começar por este arquivo e por
> [MLS_COMMERCE_OS_CHECKPOINT.json](MLS_COMMERCE_OS_CHECKPOINT.json).
> O arquivo `ROADMAP_BRAZACOMMERCE.md` passa a ser histórico e não deve receber novas decisões de produto.

## 1. Identidade oficial

**Nome do produto:** MLS Commerce OS  
**Posicionamento:** sistema operacional inteligente para e-commerce.  
**Inteligência central:** MLS Hermes.  
**Objetivo:** reunir operação, finanças, produtos, Ads, produção, criativos, marketplaces e automação em uma única plataforma, com agentes especializados que observam, recomendam, executam dentro de limites e auditam o próprio trabalho.

A marca anterior **BrazaCommerce** permanece somente como legado técnico durante a migração segura.

### Regra de migração de nome

Nesta fase, mudar primeiro tudo que o usuário vê. **Não renomear ainda:**

- Workers `brazacommerce-app`, `brazacommerce-auth` e `brazacommerce-finance`;
- bindings e bancos D1;
- domínio `app.brazacommerce.com.br`;
- cookies, headers `X-Braza-*`, nomes de schemas, tabelas e chaves persistidas;
- rotas públicas/privadas;
- identificadores usados por Cloudflare, Shopee, Hermes ou testes de compatibilidade.

Esses nomes são aliases técnicos de compatibilidade. A migração interna só acontece em fase própria, com alias, rollback e teste de produção.

## 2. Referência de produto e experiência

A referência visual/produtiva informada pelo operador é o ecossistema apresentado pelo Seller.IA Club/Instagram: interface limpa, especialistas em um único lugar, diagnóstico executivo e acesso rápido às ações.

O MLS Commerce OS **não deve copiar a interface literalmente**. A referência define o nível mínimo esperado de clareza e percepção de produto. Nossa meta é ir além, conectando os especialistas a uma mesma base operacional e permitindo autonomia progressiva, auditável e limitada.

### Central de Comando — experiência alvo

A tela inicial deve responder rapidamente:

- lucro estimado hoje;
- vendas hoje;
- pedidos pagos;
- margem;
- gasto de Ads;
- TACOS/ROAS quando a base for compatível;
- devoluções e reembolsos;
- repasse previsto;
- despesas e vencimentos;
- alertas prioritários;
- produtos campeões e produtos em risco;
- estado dos agentes.

Os detalhes técnicos continuam disponíveis por drill-down, sem competir com o resumo executivo.

## 3. Arquitetura multiagente

Todos os agentes usam a **mesma verdade operacional**. Um custo alterado em Produtos deve repercutir em Financeiro, Pricing, Ads e Hermes sem cópias divergentes.

### MLS Hermes — Supervisor

Responsável por:

- receber e resumir os estados dos agentes;
- ordenar prioridades;
- detectar conflitos entre recomendações;
- verificar permissões e limites antes de qualquer ação;
- encaminhar tarefas ao especialista correto;
- explicar ao operador o que aconteceu, por quê e com quais evidências.

Hermes não deve inventar dados ausentes nem ignorar bloqueios de confiabilidade.

### Agentes especializados

| Agente | Responsabilidade principal | Estado inicial |
| --- | --- | --- |
| **MLS Finance** | lucro diário/mensal, repasses, DAS, despesas, caixa e conciliação | Base existente; transformar em agente observador |
| **MLS Ads** | ROAS, TACOS, CPA, orçamento, escalar/manter/otimizar/pausar | Leitura existente; execução LOCKED |
| **MLS Pricing** | preço mínimo, preço ideal, margem, ponto de equilíbrio e ROAS mínimo | Planejado |
| **MLS Products** | SKUs, curva ABC, contribuição, cadastro, oportunidades e qualidade dos dados | Base parcial existente |
| **MLS Production** | pedidos, fila DTF, artes, lotes, gargalos e estado operacional | Base DTF existente |
| **MLS Creative** | mockups, fotos, títulos, descrições, criativos e vídeos | Planejado |
| **MLS Inventory** | estoque vendável, reservas, cobertura e reposição | Bloqueado por contrato de estoque |
| **MLS Marketplace** | Shopee, TikTok Shop, Mercado Livre e sincronização | Shopee primeiro; demais progressivos |
| **MLS Returns** | cancelamentos, devoluções, reembolsos e impacto financeiro | Base existente; conciliação incompleta |
| **MLS Auditor** | qualidade dos dados, consistência, permissões e auditoria dos agentes | Evoluir a partir das auditorias existentes |

## 4. Contrato mínimo de cada agente

Cada agente deve ter um estado persistente ou projetável com:

- `agent_id` e versão do contrato;
- modo de autonomia;
- status: saudável, trabalhando, atenção, bloqueado ou erro;
- última análise e próxima execução;
- fontes e idade dos dados;
- tarefas abertas;
- recomendações propostas;
- ações aprovadas;
- ações executadas;
- resultado observado;
- evidências/referências da decisão;
- permissões;
- limites financeiros e operacionais;
- motivo explícito de bloqueio;
- trilha de auditoria.

Agentes não podem usar texto do modelo como única evidência para movimentar dinheiro ou alterar campanhas.

## 5. Modos de autonomia

### OBSERVER — Observador
Analisa, explica e abre tarefas. Não altera sistemas externos.

### ASSISTED — Assistido
Propõe uma ação concreta e exige aprovação explícita do operador antes da execução.

### AUTONOMOUS — Autônomo limitado
Executa somente ações que estejam dentro de políticas persistidas e verificadas no backend.

Uma ação autônoma de Ads, por exemplo, só poderá acontecer se as regras exigidas estiverem satisfeitas: margem mínima, limite diário/mensal, qualidade dos dados, estoque/cobertura, frequência máxima de alteração, perda máxima e ausência de bloqueios financeiros.

**Ads/PROMO permanece LOCKED até a fase específica de escrita oficial e piloto controlado.**

## 6. Estrutura de navegação alvo

A evolução da interface deve convergir para:

1. **Início** — Central de Comando.
2. **Agentes** — equipe digital e fila de trabalho.
3. **Financeiro** — MLS Finance + MLS Returns.
4. **Produtos** — MLS Products + MLS Pricing.
5. **Produção** — MLS Production.
6. **Ads** — MLS Ads.
7. **Criativos** — MLS Creative.
8. **Automação** — políticas, aprovações e execuções.
9. **Marketplaces** — MLS Marketplace.
10. **Histórico** — auditoria completa.

No celular, priorizar Início, Agentes, Produtos, Produção, Ads e Mais.

## 7. Fases da conversão MLS Commerce OS

### M0 — Branding seguro e continuidade canônica — **PUBLICADO**
- [x] Definir nome MLS Commerce OS.
- [x] Definir MLS Hermes como supervisor.
- [x] Definir família inicial de agentes.
- [x] Definir Observer / Assisted / Autonomous.
- [x] Criar este roadmap canônico.
- [x] Criar checkpoint de continuidade.
- [x] Iniciar troca do branding visível no login, gestão e Ads.
- [x] Validar suíte/CI e publicar o branding pela PR #11.
- [ ] Conferir visual real autenticado em desktop e celular.
- [ ] Manter aliases técnicos antigos sem renomear infraestrutura.

**Critério de saída:** marca nova publicada sem regressão, roadmap canônico e checkpoint apontando para a versão publicada.

### M1 — Central de Comando + Agent Registry — **PUBLICADO**
Criar uma nova home seguindo a hierarquia visual definida:

- faixa executiva Hoje;
- lucro/vendas/Ads/margem/pedidos/alertas;
- bloco “Seus agentes”;
- status e última atividade de cada agente;
- prioridades do dia;
- caixa de conversa/ações do MLS Hermes;
- detalhes antigos recolhidos por drill-down.

Implementar primeiro um **Agent Registry somente leitura**, sem criar novas chamadas à Shopee. Os agentes devem projetar o estado das fontes já existentes.

Agentes iniciais na tela:
1. MLS Finance;
2. MLS Ads;
3. MLS Products;
4. MLS Production;
5. MLS Returns;
6. MLS Auditor;
7. MLS Hermes Supervisor.

**Critério de saída:** a Central de Comando deve conseguir dizer “o que está acontecendo e o que precisa de ação” usando apenas dados existentes, sem executar alterações comerciais.

**Publicação:** PR #12, merge `91fc0cf169f67a9440a8e58a033c925b9ce98eed`. Agent Registry em modo Observer, sem chamadas externas adicionais, com CI 2.008 + 67 e deploy dos três Workers confirmado.


### M1.1 — Redesign Mission Control (opção 3) — **INTEGRADO / VALIDAÇÃO VISUAL PENDENTE**

Entrega visual solicitada e aprovada pelo operador em 27/10/2026.
A PR #29, merge `2522f33132563d19704c6f6c57ff4206067bc2ab`,
transforma a Central de Comando em um overview executivo mais enxuto e abre
**uma tela individual** ao selecionar cada agente (tabs com URL estável):

- `/admin?tab=agents`: Hub da equipe, status e navegação.
- `/admin?tab=agent-finance`: MLS Finance, com os mesmos controles e nós de
  lucro diário/mensal, Pending, conciliação e despesas, sem duplicar o D1.
- `/admin?tab=agent-ads`: MLS Ads, leituras observadas e links para campanhas
  e Ads atuais sem execução externa.
- `/admin?tab=agent-products`: MLS Products, cobertura de custos e catálogo.
- `/admin?tab=agent-production`: MLS Production, referência DTF e custos.
- `/admin?tab=agent-returns`: MLS Returns, estados, alertas e conciliação.
- `/admin?tab=agent-auditor`: MLS Auditor, diferenças e confiança nas fontes.
- `/admin?tab=agent-hermes`: MLS Hermes e seu controle de coleta já existente.

Identidade visual: tema premium/futurista, acentos próprios por agente,
cards, navegação hierárquica, responsivo e `prefers-reduced-motion`.
**Não exibir gráficos históricos inventados:** as telas usam os snapshots
financeiros já existentes, com valores ausentes como desconhecidos. Pricing,
Creative, Inventory e Marketplace aparecem apenas como **planejados**.

Nenhuma mudança no backend, na autorização Shopee, nos bancos D1, nos
cron triggers, nos schemas, no cálculo de lucro ou nas permissões Ads/PROMO.

Validação PR #29: **2.080 testes Node + 67 Python**, incluindo Chrome real
de navegação entre Central de Agentes, Finance e Returns. CI final da
`main` reexecutado com sucesso; builds Cloudflare App/Auth/Finance `SUCCESS`.
PR #30 corrige apenas teste financeiro intermitente sobre dígitos acidentais
em hashes; não modifica runtime. CI final `main` run `40585084151` sucesso. O primeiro disparo de builds do merge da PR #29 falhou; a PR #30 (somente teste, mesmo código App) publicou as três versões com SUCCESS, identificadas no checkpoint.

**M2 continua sendo a fase de negócio atual.** Este redesign é uma melhoria
de UX da M1, não uma antecipação de Pricing, Ads autônomo ou M3. Falta apenas
a conferência visual autenticada do novo layout e o gate financeiro M2.

### M1.2 — Refinamento visual Mission Control V2 — **PUBLICADO / APROVAÇÃO VISUAL PENDENTE**

## 27/10/2026 — Mission Control V2 corrigido para refletir a opção 3

O operador rejeitou a primeira implementação visual por ainda parecer o
layout anterior. A **PR #31** (merge `74e23ff5f8bd7888f54b98a61ff20e82fa10a583`)
refez o próprio cockpit da Visão Geral, não só o link dos agentes:
hero orbital azul-naval do Hermes, seis cartões com avatares robóticos
neon por especialidade, métricas coloridas, comparação dos três valores
monetários observados do dia e distribuição dos estados reais dos agentes.

A Central de Agentes e os sete workspaces individuais ganharam avatares
maiores, cabeçalhos de vidro escuro, gradientes coloridos, subtabs e
painéis mais legíveis, em desktop, mobile e tema claro/escuro. O modo
escuro foi **inspecionado em screenshot real do Chrome**, com a captura
gerada apenas de um cenário de teste sem dados de loja. A captura
temporária foi removida do código final de CI.

**Validação:** PR run `40589733166` e main `40589983415`,
**2.082 Node / 0 falhas + 67 Python**. Teste Chromium real confirma
seis agentes, nenhum placeholder restante, gradientes calculados, ícones,
dois painéis de observação, ausência de valores fictícios e zero erros JS.
Check-runs Cloudflare para App/Auth/Finance **SUCCESS** no merge V2.

Sem mudanças no backend, banco, custos, OAuth, contratos Shopee, cron ou
Ads/PROMO. Gráficos de barras do dia só usam vendas/lucro estimado/gasto
Ads do snapshot realmente validado; proporção de agentes saudáveis é
contagem do Agent Registry, **não** rentabilidade nem lucro comprovado.

**A aprovação visual final segue pendente** após login no dispositivo do
operador. Fase financeira continua **M2**, Pending atual e repasses
devem ser comparados ao Seller Centre antes de fechar; sem compromisso
de competência ou liquidação bancária.

### M2 — Finance/Returns confiáveis como agentes observadores — **EM ANDAMENTO / PONTO DE RETOMADA**
Continuar a fase financeira atual:

- fechar cruzamento de liberações por pedido;
- exibir valor de devolução/reembolso por situação;
- identificar diferenças, duplicidades e referências sem correspondência;
- manter lucro realizado desconhecido quando não houver liquidação comprovada;
- transformar pendências em tarefas do MLS Finance/Returns;
- adicionar vencimentos de despesas e contas no resumo do agente.

**Incremento publicado — PR102, 02/11/2026:** apresentação separada do saldo
mensal com despesas desconhecidas identificadas e Ads salvos mantendo data e
possível dia parcial. Mês compartilhado nos agentes reutiliza fontes salvas,
preserva rascunhos e explicita escopos de catálogo/DTF, recebimento e fabricação.
App `8e1056d2`, CI 41463788001 aprovada, bytes/configuração e Auth/Finance conferidos;
integração Git conferida separadamente pelo estado da PR102 vinculada. A declaração de ausência
de outras despesas de novembro foi uma confirmação operacional separada,
registrada e auditada; não é zero inferido nem vale para outro mês. Contratos
financeiros/Hermes e os gates continuam preservados. Não encerra M2.
[Registro do incremento](MLS_MONTHLY_NET_HISTORY_2026_11_02.md).

**Incremento publicado — PR #13:** conciliação de liberações por pedido com repasse-base, ajuste, repasse após ajuste, valor liberado verificável e cruzamento local com devoluções. Estados `NOT_LOCATED`, `AMBIGUOUS`, `LOCATED_UNVERIFIED` e `VERIFIED`. O sidecar v2 reutiliza a coleta/cache existentes; não cria endpoint Shopee, tabela D1 ou polling. [Detalhes](CONCILIACAO_POR_PEDIDO_MLS_FINANCE_RETURNS.md).

**Incremento publicado — PR #14:** acompanhamento temporal separa o mês de criação dos pedidos dos calendários de liberação posteriores. O contrato privado `release-coverage-v1` lê somente a coorte e os ledgers já salvos no Finance, sem capability de rede Shopee. O tracker acompanha uma coorte anterior por cron, preserva falhas, desacelera após identidade completa no corte e mostra a cobertura para meses passados. `identity_complete_at_cutoff` não comprova fim do ciclo, depósito bancário ou saldo ainda a liberar.

**Incremento publicado — PR #16:** o MLS Finance agora lê o `get_income_overview` em background e mostra **Pendente atual na Shopee** separado do mês. Para a loja local, o contrato atual diferencia `Released` e `Pending`; `pending_amount` é tratado como snapshot atual, não como competência, depósito bancário ou lucro. O round-robin financeiro passa a `RELEASES -> RETURNS -> INCOME` sem aumentar o orçamento de uma leitura privada por oportunidade. [Pesquisa](PESQUISA_INCOME_OVERVIEW_SHOPEE_2026_10_27.md).

**Incremento publicado — PR #18:** o MLS Finance agora resume **contas atrasadas, vencendo hoje, próximos 7 dias e próximo vencimento** a partir das datas declaradas no ledger. O `business-month-view-v4` reutiliza o mesmo `LEFT JOIN` mensal já existente, sem query D1 adicional, tabela nova, polling ou chamada Shopee. `NOT_ITEMIZED` continua desconhecido em vez de zero; marcar como pago permanece controle interno e não comprova liquidação bancária.

**Incremento publicado — PR #19:** o MLS Finance agora coleta `get_income_detail` para **Pending atual** somente quando o Income Overview confirma valor pendente maior que zero. A primeira página mantém até 100 registros, `has_more` sinaliza cobertura parcial e `order_sn` nunca sai do Finance Worker: a UI recebe apenas hashes internos, moeda, status, escrow estimado e previsão de liberação. O bloco **Pending atual por pedido** faz somente leitura local D1 ao ser aberto. O round-robin financeiro passa a `RELEASES -> RETURNS -> INCOME -> INCOME_DETAIL`, mantendo uma leitura privada por oportunidade. [Pesquisa](PESQUISA_INCOME_DETAIL_SHOPEE_2026_10_27.md).

**Incremento publicado — PR #21:** o MLS Finance agora audita localmente o Pending atual antes de qualquer paginação: compara de forma descritiva o `pending_amount` do Overview com o subtotal visível de `estimated_escrow_amount`, registra cobertura, `has_more`, quantidade de valores convertíveis e sincronia dos snapshots. `OBSERVED_MATCH` não prova saldo/competência; `OBSERVED_DIFFERENT` vira validação no Seller Centre, não erro contábil. A seção fechada continua sem leitura D1 extra e a auditoria não cria chamada Shopee. [Detalhes](AUDITORIA_PENDING_ATUAL_MLS_FINANCE.md).

**Estado atual desta fase — 01/11/2026:** a PR93 já validou paginação durável do Pending em duas páginas, com 182 registros/pedidos no corte observado; a PR94 confirmou os três relatórios de Returns da publicação de outubro. Essas evidências não são cobertura permanente, desfecho de reembolso, recebimento físico ou depósito bancário. Ainda faltam reconciliar as situações em revisão, conferir o calendário de liberações da publicação exata, declarar despesas do mês e confrontar Seller Centre/banco no mesmo recorte. Manter `remaining_receivable` separado do Pending atual; horizonte esgotado não prova ausência de liberação posterior.

**Critério de saída:** período completo conciliado com explicação de cada diferença material.

### M2.1 — Shopee API: auditoria de permissões e robustez financeira (pesquisa 28/10)

Esta é uma trilha técnica independente que **não substitui o gate de saída da M2**:

- [x] Levantar SDKs da API oficial, ERP/filas e Agent Toolkit, registrando links, licenças, limitações e riscos na pesquisa canônica.
- [x] Adicionar matriz offline de capacidades candidatas (PR #51). UNKNOWN/DENIED bloqueiam; uma evidência GRANTED isolada jamais autoriza executar chamadas.
- [x] Planejar recuperação de push perdida com deduplicação somente de metadados e confirmação bloqueada até persistência (PR #51).
- [ ] Operador verificar categoria do app, escopos, região BR, endpoints disponíveis, validade da autorização Finance e dados do Seller Centre, sem compartilhar tokens.
- [ ] Validar contrato/método GET ou POST e lote do escrow batch conforme a versão oficial, antes de tocar no Finance Worker. A comunidade documenta divergência histórica.
- [ ] Validar identidade/cursor, replay e assinatura de webhook em sandbox antes de criar fila real ou habilitar ACK.
- [ ] Confirmar M2 Pending, liberações e devoluções (issue #50). Não presumir depósito bancário.

### M2.2 — Produção incorrida e devolução reaproveitável — **PARCIAL / CONTROLES E ASSOCIAÇÃO DECLARADA PUBLICADOS**

**Incremento publicado — PR104, 02/11/2026 às 19:06:16 Brasília:** fila com dados salvos,
confirmação física correta/problema atômica, custo histórico por intervalo de
fabricação em Brasília e navegação operacional com Finance/Returns visíveis.
Sem registro não equivale a gasto zero; foto/custo atuais não provam a peça ou
custo histórico. QA sintética não confirma fatos reais. A integração Git da PR104 foi
comprovada no merge `41b95f6e93236fdfad42ff9b3deb9a85905d67ef`; o corte
anterior com integração pendente é histórico. M2/M2.2 seguem abertas.
[Uso, recibo e limites](MLS_SIMPLIFIED_OPERATIONS_2026_11_02.md).

**Incremento publicado — PR103, 02/11/2026:** evidência comercial separada do
pedido pago salvo e da solicitação Returns, com fonte/data/cobertura e o mesmo
caso/mês físico fixado. Finance `5e3b4686`, Auth `e13c43ad` e App
`0a2955bc` publicados em ordem, CI 41520727701 aprovada e configurações conferidas.
Legado sem captura permanece NOT_CAPTURED/UNKNOWN; não expande kit em peças,
altera `original_quantities`, vínculos, físico/fabricação, estoque ou lucro. Captura
natural futura usa consultas existentes, sem novos requests/backfill; observação
real pós-deploy ainda requer conferência. M2/M2.2 continuam abertas.
[Registro, proveniência e uso](MLS_ORIGINAL_RETURN_ITEMS_2026_11_02.md).

A [primeira etapa PR98](MLS_M22_PHYSICAL_RETURNS_2026_11_01.md) entrega o controle físico interno definido pela [auditoria de devoluções e roadmap](MLS_RETURNS_REUSE_ROADMAP_AUDIT_2026_11_01.md). A [etapa M2.2b PR99](MLS_M22_INCURRED_PRODUCTION_2026_11_01.md) acrescenta o registro histórico independente da fabricação declarada. A [primeira M2.2c PR100](MLS_M22_RETURN_MANUFACTURING_LINKS_2026_11_01.md) associa quantidades declaradas entre os dois controles, com confiança OWNER_CONFIRMED e limites globais. Os fatos são informados pelo operador; publicação técnica e testes simulados não comprovam peça individual, quantidades originais, recebimentos reais, toda a fabricação da loja ou pagamentos, nem encerram a fase.

- [x] Separar o controle interno de recebimento, quarentena e inspeção da situação/reembolso na Shopee. CLOSED/REFUND_PAID não criam peças recebidas.
- [x] Registrar identificação declarada de estampa, cor, tamanho, adulto/infantil e modelagem masculina/feminina/unissex; peças sem identificação confirmada não se tornam reaproveitáveis.
- [x] Registrar entregas parciais e partição exata da inspeção, com referência única por caso, eventos idempotentes, CAS, auditoria, reinspeção e anulação sem apagar o histórico.
- [ ] Conferir os itens e as quantidades físicas esperadas de cada solicitação e a composição efetiva dos kits. A PR103 separa observações comerciais preservadas; a comparação com o recebimento e a decomposição física continuam exigindo evidência. Kit parcial não vira kit completo.
- [x] Primeira etapa M2.2b: registrar fabricação declarada pelo operador por peça/lote em ledger independente, com data de produção, identidade, quantidade, revisão, origem opcional e fotografia imutável do custo declarado ou UNKNOWN. CANCELLED não apaga esses registros; não somar o ledger novamente à referência de produção do resultado atual.
- [x] Primeira etapa M2.2c: associar quantidades OWNER_CONFIRMED de um recebimento a um registro histórico de fabricação, com identidade confirmada, origem congelada, limites globais e par ativo único. Alterar/anular pais protegidos exige desvinculação; substituição não recebe vínculo automaticamente. Não comprova peça serializada nem a quantidade original do pedido.
- [ ] Validar a associação contra itens e quantidades originais/recebidas em fonte preservada e coberta, sem promover igualdade de SKU/lote a prova da mesma peça individual. A PR103 transporta itens comerciais preservados, sem promover seus números a quantidades físicas. TO_RETURN/não pagos sem itens e Returns legados não capturados continuam UNKNOWN.
- [ ] Confirmar a decomposição histórica de peça/estampa recuperáveis e embalagem/etiqueta já consumidas, além dos custos incrementais de reparo e nova embalagem. As referências all-inclusive não podem ser divididas automaticamente sem fatos do operador.
- [ ] Reservar e consumir a unidade correta na revenda, com embalagem/etiqueta incrementais declaradas. Não alterar o custo global do SKU nem registrar nova fabricação da mesma peça.
- [ ] Separar caixa de custo por competência: recuperação em estoque não é receita/dinheiro; recuperação e consumo do valor histórico precisam de lançamentos correspondentes.
- [ ] Validar o ciclo original → devolução → inspeção → revenda, inclusive mudança de mês, custos ausentes e reservas concorrentes, antes de integrá-lo ao resultado financeiro.

O controle físico, o ledger e a associação publicados oferecem contagens, custos e origem internos declarados, com quantidades originais UNAVAILABLE/null e avaliação de estoque UNKNOWN/null. Não alteram totais financeiros, reservas, revendas ou estoque externo. Custos registrados não comprovam pagamento nem a completude da produção real da loja. Valoração e lucro dependem de evidências adicionais e da futura integração contábil sem dupla contagem; uso físico real do proprietário e o ciclo completo permanecem sem validação. Triggers D1 persistem no rollback: código antigo pode retornar 503, exigindo recuperação compatível e desvinculação explícita antes de corrigir os pais. M2 e M2.2 continuam abertas.

### M3 — Products + Pricing Intelligence

**Trilha paralela autorizada pelo proprietário em 02/11/2026.** A fase financeira
M2 e o ciclo M2.2 permanecem abertos. Podemos preparar análises Observer e
cenários locais enquanto a conferência financeira e operacional continua;
isso não libera preço seguro, margem líquida por variação ou execução comercial.

Primeiro incremento publicado e integrado: [M3 · Produtos e cenários de preços](MLS_M3_PRODUCT_WORKBENCH_2026_11_02.md),
versão `2026-11-02.5`, PR106 merge `dea19f0ace932acccc917c63d8da46db417079c9`.
Mantém um único observador, ranking completo com busca/filtros/paginação locais,
ABC por unidades, custos/nomes atuais por variação e cenários matemáticos.

Incremento de contribuição publicado: [M3 · Margens e evidências por produto](MLS_M3_CONTRIBUTION_EVIDENCE_2026_11_03.md),
versão `2026-11-02.6`, `PUBLISHED_VERIFIED`, PR107 merge
`aebc3c7aec9ad9937cc43565ba401b0b4ba07cba` e CI final
[41570060190](https://github.com/MatheusLemosDS/MLS-Ecommerce-Ads/actions/runs/41570060190)
aprovada. Detalha contribuição
exclusiva conferida, composição financeira, valores conhecidos e pendências.
A nova evidência por variação exige um único modelo vendido e todos os gates
coerentes; campos legados v1 continuam desconhecidos. Pedidos mistos não recebem
rateio, custo misto não entra no saldo exclusivo e diferença vendas–repasse
não é taxa oficial. Ads, DAS mensal e despesas ficam no fechamento mensal.
Sem nova API/SQL/coleta/provedor ou escrita; preservar mês, rascunhos, cenários
e os seis agentes da inicial. Nenhuma entrega encerra M2/M2.2 ou toda M3.

Incremento por pedido publicado: [M3 · Contribuição por variação e pedido](MLS_M3_VARIANT_ORDER_EVIDENCE_2026_11_03.md),
versão `2026-11-03.1`, `PUBLISHED_VERIFIED`. Os pedidos com um único
par permitem ampliar a atribuição mesmo com vários modelos vendidos no mês.
Pedidos com vários modelos/produtos não recebem rateio; a captura usa as chamadas
já existentes, com opt-in nos três Workers e cache de evidência próprio no App.
Frames legados permanecem inalterados; dados antigos ficam `NOT_CAPTURED`.
Regressão, CI e publicação em ordem foram conferidas; captura natural e cobertura da conta exigem evidência própria.

- contribuição por SKU;
- curva ABC;
- custo e margem por produto/variação;
- preço mínimo;
- preço-alvo;
- preço promocional seguro;
- ROAS mínimo/ponto de equilíbrio somente quando a base de receita for compatível;
- bloqueio por custo/atribuição/estoque desconhecido.

#### M3.0 Observer e M3-L0 Listing Factory antecipada — base técnica integrada

Os fundamentos Observer/Listing Factory e a busca V3.6 foram reconciliados na Live pela PR86 e preservados nas releases seguintes. As PRs originais e seus planos de integração são registros históricos: não repetir a sequência #51 → #56 nem refazer merges apenas porque essas branches continuam abertas.

- [x] Base técnica local: catálogo/variações, rascunhos/importação/exportação, pesquisa e visual integrado; a prévia sintética continua preservada.
- [ ] Aceite visual do operador e grants por loja/categoria continuam evidências próprias; integração técnica não os comprova.
- [ ] M3.1: custo incorrido e histórico por unidade/lote, taxas/frete/impostos por SKU/período, sem rateio arbitrário de pedidos mistos.
- [ ] M3.2: preços mínimo/alvo/promocional e ROAS por SKU somente com M2 confiável, estoque verificado e atribuição apropriada.
- [ ] Reutilização de peças devolvidas exige o controle físico M2.2 e vínculo do lote à revenda; custo global do SKU não deve ser reduzido para uma única revenda.
- [ ] M8 externo: MediaSpace/publicação em lote exige permissões reais, M6, idempotência, direitos e tratamento de resultado incerto. Fundamentos locais de Creative/AI Sales publicados não liberam escrita comercial.

**Política de classificação:** READY_FOR_OPERATOR_REVIEW no preparador só significa que o rascunho passou regras internas locais; não significa READY_TO_PUBLISH nem confirmação de permissões, estoque, tarifa ou compatibilidade na Shopee.

### M4 — MLS Ads em Shadow Mode
- contrato oficial de campanha/atribuição;
- ranking Escalar / Manter / Otimizar / Pausar;
- recomendações sem escrita;
- simulação do impacto;
- comparação posterior entre recomendação e resultado real;
- MLS Auditor valida a evidência antes de liberar proposta.

### M5 — MLS Hermes Supervisor operacional
- fila única de tarefas;
- conflitos entre agentes;
- prioridade por impacto financeiro, urgência e confiança;
- comandos em linguagem natural;
- “Faça as seguras” somente para ações já classificadas como aprováveis;
- trilha de raciocínio operacional resumida em evidências, não cadeia de pensamento.

### M6 — Escrita assistida
Somente após contratos oficiais e permissões reais:
- ações comerciais específicas;
- aprovação humana por ação/lote;
- idempotência;
- resposta incerta tratada como estado desconhecido;
- rollback quando tecnicamente possível;
- auditoria.

### M7 — Autonomia limitada
- políticas persistidas;
- teto de Ads;
- perda máxima;
- margem mínima;
- estoque mínimo;
- frequência de alteração;
- kill switch;
- aprovação para elevação de limites;
- auditor acompanhando o executor.

### M8 — MLS Creative + Marketplace
- títulos, descrições, mockups, fotos e vídeos;
- avaliação de desempenho dos criativos;
- publicação somente com contrato oficial;
- TikTok Shop e Mercado Livre usando a mesma camada de agentes.

### M9 — MLS Commerce OS maduro
Ciclo:
**coletar → entender → priorizar → recomendar → aprovar/executar → verificar → aprender → auditar.**

## 8. Base técnica já disponível

A conversão não reinicia o projeto. O MLS Commerce OS herda integralmente o que já foi publicado:

- coleta automática em segundo plano;
- financeiro por pedido;
- resumo diário e mensal;
- custos por produto/variação e regras;
- reconhecimento infantil e histórico do tamanho removido;
- despesas, parcelas, aluguel, funcionários e boletos;
- devoluções e ajustes;
- liberações/escrow e reconciliação parcial;
- Ads e calendário;
- catálogo salvo;
- Produção/DTF;
- Hermes com contexto financeiro;
- auditorias, checkpoints e proteção contra dados incompatíveis;
- abertura do painel desacoplada das configurações;
- redução de gravações D1 redundantes.

Base anterior à conversão: **PR #10**, merge
`9c418fd3010f46957d1ce52345baacd76041c788`.

Conversão de identidade M0 publicada pela **PR #11**, merge
`3dab8f0be54d331bcded1fba4c09e9bfdf68256b`. CI de `main` passou e App/Auth/Finance foram publicados. A **M1** foi publicada pela PR #12; o próximo desenvolvimento começa em **M2**.

## 9. Regras permanentes de continuidade

1. **Nunca recomeçar o projeto do zero.**
2. Ler primeiro este roadmap e o checkpoint JSON.
3. Preservar integralmente sistemas já publicados, salvo correção comprovada.
4. Nova funcionalidade deve usar a mesma verdade financeira/catálogo sempre que possível.
5. Não duplicar coletores só para alimentar agentes.
6. Não chamar recomendação de lucro comprovado.
7. Não transformar aprovação de devolução em comprovante bancário.
8. Não atribuir Ads a SKU sem contrato/evidência válida.
9. Não executar Ads, promoção, preço ou estoque externamente enquanto a ação estiver LOCKED.
10. Toda autonomia precisa de limites persistidos, concorrência segura, idempotência e auditoria.
11. Toda entrega relevante atualiza este arquivo e `MLS_COMMERCE_OS_CHECKPOINT.json`.
12. O antigo `ROADMAP_BRAZACOMMERCE.md` é somente histórico.

## 10. Próximo passo ao retomar

A fase canônica continua **M2 — Finance/Returns confiáveis**, com **M3 Observer em paralelo**.
A última Live comprovada é `2026-11-09.2 — Edição simples dos custos de produção`, App `876fcc9e-1826-4e31-aee6-6be2b44c8dbc`; Auth/Finance e vetor dos três Workers conferidos em 2026-11-09T22:32:44-03:00. Fonte `2f11437b15ae656fecf38c9838c240fb3169ea28`, head `c61a9caf5316285d946ba3d1b35bc556623c1086`, CI [42734971744](https://github.com/MatheusLemosDS/MLS-Ecommerce-Ads/actions/runs/42734971744) aprovada. Consultar a [PR #114](https://github.com/MatheusLemosDS/MLS-Ecommerce-Ads/pull/114) para a integração atual; recibo de publicação não prova merge.

Retomar por:

1. Conferir o uso real da [edição simples dos custos](MLS_EDITABLE_COSTS_2026_11_09.md), preservando fórmula/DTO/fontes, condições, associações, concorrência e rascunhos.
2. A leitura prévia confirmou infantil R$ 13,50 na revisão 8, sem nova mutação necessária. Referências antigas de vendas seguem a regra atual. A tabela de fabricação realizada estava ausente; isso não comprova fabricação zero nem permite criar lotes antigos a partir de vendas.
3. Conferir uma semana real em [Conferência da fabricação](MLS_PRODUCTION_COVERAGE_2026_11_06.md), lançando somente fatos conhecidos. Os oito intervalos exigem declaração explícita, custos conhecidos e cortes de sexta resolvidos; ausência continua desconhecida. Preservar vínculos, auditoria, originais/revisões e a referência compartilhada de sexta.
4. Preservar seis agentes, equipe, navegação, mês/rascunhos, contratos v1–v5, Hermes, histórico físico e paginação Pending. Primeiro corte natural de sexta observado em 06/11 às 13:00:51 Brasília com fonte NO_RECORDS; não comprovou gasto zero. Acompanhar 13/11 às 13h sem presumir execução futura.
5. Continuar M2/M2.2: conferir recebimento/fabricação reais e composição/decomposição histórica antes de valorar, reservar ou contabilizar reaproveitamento/revenda sem dupla contagem. Pedidos/vendas e DTF não provam fabricação.
6. Comparar despesas, repasses e devoluções no mesmo recorte com Seller Centre/banco. Distinguir Pending/liberação de liquidação; manter Ads/PROMO, preço e estoque externo nos gates existentes. M2/M2.2 permanecem abertas.

## 11. Produção diária e fechamento semanal — retomada atual

Este resumo é a referência de retomada atual. A seção 10 permanece preservada como o corte da entrega anterior. A fase canônica continua **M2 — Finance/Returns confiáveis**, com **M3 Observer em paralelo**.

**Produção diária e fechamento semanal — `PUBLISHED_VERIFIED`:** versão `2026-11-09.3`, 09/11/2026. Produção separa Diário e mês, Fechamento semanal, Registrar produção, intervalo e Referência das vendas; DTF continua acessível. Gráficos usam os registros salvos e permitem selecionar por clique ou teclado. Registrar neste dia preenche somente por ação explícita e preserva rascunhos; campos opcionais ficam separados. Conferir este dia abre a declaração existente do intervalo; sexta exige escolher antes ou a partir de 13h. O diário é agregação dos lotes mais declaração de completude, sem novo artefato diário imutável. Ao cruzar o corte semanal, a tela relê o GET existente após tolerância de 65s; reentrada/foco e espera limitada por artefato evitam permanecer numa prévia antiga. App publicado e vetor dos três Workers conferido em 2026-11-09T23:53:15-03:00. Fonte `e1f74f6763a8ebb407402e2808fca2430d12b9a0`, head `85c59749c0f93a909bc5ab00a05013155fab6921`, CI [42744288094](https://github.com/MatheusLemosDS/MLS-Ecommerce-Ads/actions/runs/42744288094) aprovada: 3660 Node e 67 Python; Chromium sintético normal/minificado, 320/1365 e claro/escuro. Consultar a [PR #115](https://github.com/MatheusLemosDS/MLS-Ecommerce-Ads/pull/115) para a integração atual; recibo de publicação não prova merge. Semana preservada: sexta 13h inclusiva → sexta 13h exclusiva, Brasília, com fim de semana e oito intervalos de conferência. Relatório capturado e total declarado conferido são distintos; originais/revisões não são reescritos. Ausência de lotes/custos não vira zero nem fabricação derivada das vendas. Fórmulas, DTOs, Auth/Finance, Hermes, seis agentes, mês/rascunhos e custos cadastrados, incluindo infantil R$ 13,50 verificado na entrega anterior, preservados. Sem novo endpoint, cron ou fato real criado para QA. M2/M2.2 e comparação Seller Centre/banco continuam abertos. [Uso, evidências e limites](MLS_PRODUCTION_WORKSPACE_2026_11_09.md).

Retomar por:

1. Conferir o uso real de dia, mês, barras clicáveis/teclado, registro na data selecionada e rascunhos preservados.
2. Registrar somente fabricação conhecida e conferir os oito intervalos da semana sexta 13h → sexta 13h, com custos históricos e divisão das sextas. Ausência continua desconhecida; diário não é um novo artefato imutável.
3. Distinguir relatório capturado, prévia e total declarado conferido. Acompanhar a próxima execução natural sem pressupor o sucesso futuro do cron ou criar fatos para QA.
4. Preservar infantil R$ 13,50, editor de custos, seis agentes, mês/rascunhos, Finance/Auth, Hermes, fórmulas/DTOs e gates comerciais.
5. Continuar M2/M2.2, recebimento/fabricação reais, composição/decomposição histórica e comparação no mesmo recorte com Seller Centre/banco; não fechar lucro/caixa com base apenas em estimativa.

## Registros históricos abaixo

As entradas datadas a seguir preservam incidentes, planos e evidências de 27–30/10. Estados DRAFT/OFF/sem deploy e instruções de integração descrevem aquele corte; não substituem o estado atual acima nem autorizam rollback, reprovisionamento ou merge repetido.


**Incremento integrado — PR #22, evidência local de Pending:** acrescentar ação
manual de copiar um JSON sanitizado com estado, cobertura, valores agregados e
horários da auditoria Pending. É um apoio para a observação da conta real,
não substitui o Seller Centre, não acessa Shopee e não libera paginação,
recebível ou lucro realizado. Merge `2e35ac0267757f748912f36756c89584aa13efe6`;
CI PR `40559446787` e main `40559823142`, **2.064 Node + 67 Python**.
Deploy Cloudflare e conferência autenticada do Seller Centre continuam pendentes de evidência.

## Alerta operacional — recuperação de interface (27/10/2026)

O operador informou que o painel deixou de carregar e os agentes sumiram.
A PR #22, apesar de CI verde, é a alteração de runtime mais recente.
Prioridade imediata: **rollback isolado da PR #22 na aplicação**, branch
`hotfix/restore-agent-panels-after-pr22`, preservando M1 e os demais incrementos M2 já publicados.
Este hotfix não deve criar nenhum novo endpoint, rede, polling ou acesso à
Shopee. A causa definitiva requer logs/browser; não confundir ausência do
painel com exclusão de dados. Até confirmação da publicação Cloudflare e
teste autenticado, estado do incidente: **NÃO RESOLVIDO**.


## P1: diagnóstico público e hotfix de navegação dos agentes (27/10/2026)

A PR #24 foi usada **somente em branch** como teste anônimo e encerrada sem
merge. GitHub Actions run `40563757410` confirmou DNS de App/Auth/Gateway;
`/login` HTTP 200 com branding MLS, `/health` HTTP 200,
`/` e `/admin` redirecionam 303, e `/api/admin/bootstrap`
anônimo retorna 401 (esperado). Isso **não testa uma sessão autenticada**.

A inspeção do código encontrou que a entrada **Agentes** ficava em "Mais
opções" e usava `#commandAgents` sem reabrir o `overview` quando outra aba
estava ativa. Além disso, `commandCenterAgents` iniciava vazio antes do
JavaScript, fazendo todos os cartões sumirem se a hidratação falhasse.

A PR #25 (merge `7c62247058066e49b6f86544de359786b2bd60ac`) move Agentes para a navegação principal, tanto
no desktop quanto no celular; o clique muda primeiro para a Visão geral e
depois rola para a equipe. Seis cartões de placeholder "Aguardando dados" são
renderizados pelo Worker sem pressupor valor financeiro; a hidratação os
substitui pelos dados reais. Não há novos requests, coletores, D1 ou alterações
na Shopee. CI PR `40564669598` e main `40564933755` passaram com **2.064
Node + 67 Python**. Os três check-runs Cloudflare Workers Builds do merge
também reportaram **SUCCESS**.

**Incidente permanece aberto.** O usuário ainda não confirmou a tela pós-PR25.
Histórico real de cota D1 em 26/10 merece nova verificação em 27/10; não
inferir automaticamente que a cota esteja esgotada hoje. Recuperação de
navigation/placeholder não equivale à retomada das consultas financeiras.


## 27/10/2026 — PR #26: diagnóstico autenticado seguro, incidente P1 ainda aberto

A falha de carregamento **começou antes da PR #22**; logo a reversão isolada
não era diagnóstico suficiente. O CI de PRs #23 e #25 e os builds Cloudflare
foram aprovados, porém a tela financeira autenticada continuou indisponível
segundo o operador.

A **PR #26** foi integrada pelo merge `4310316be3ac3cf449fde975697a869e2529fb53`, testes
**2.070 Node + 67 Python** na branch (run `40570346863`) e no main
(run `40570582583`). Check-runs Cloudflare de App/Auth/Finance foram
**SUCCESS**. Isso comprova a validação e builds, não a execução de sessão
autenticada no dispositivo.

Nova página `https://app.brazacommerce.com.br/admin/diagnostics`:
funciona separadamente do painel principal, exige cookie de proprietário e
permite **Copiar diagnóstico**. `GET /api/admin/diagnostics` confirma a
sessão e faz somente `SELECT 1 AS ok` com prazo de 3,5s, sem esquema,
gravações nem provedores. A página verifica também a presença do HTML de
Agentes e a **rota financeira já existente**, `business-month-view-v4`,
que por sua vez pode executar manutenção normal de esquema/cache; nenhuma
nova ação comercial é criada. O relatório contém somente estados HTTP,
códigos seguros, booleanos de HTML, duração, mês e marcador do release.

**Próximo passo obrigatório:** receber JSON com esquema
`mls_owner_panel_report_v1` e comparar `owner_probe.d1` com
`finance_month.http/error`. Nada de supor bloqueio do D1 ou erro de frontend
sem observar esses campos. Não alterar credenciais Shopee, chaves, D1 ou custos.

Se o link direto redirecionar para login, autenticar como proprietário e usar
o link estático "Diagnosticar carregamento" do topo do Admin, no mesmo
navegador; abrir um link cross-site pode não enviar cookie SameSite=Strict na
primeira navegação. Caso o JavaScript do diagnóstico também falhe, enviar
somente a tela de diagnóstico, sem credenciais.


## Incidente P1 — causa JS reproduzida e corrigida pela PR #28 (27/10/2026)

A investigação em **Chromium real** encontrou dois erros que os testes anteriores
de HTML/VM não detectavam:

1. `Cannot read properties of null (reading 'expense_schedule')`:
   `buildMlsAgentRegistry` permitia `undefined === undefined` quando o
   snapshot mensal ainda não existia e tentava acessar `month.expense_schedule`.
2. `Invalid regular expression` durante a inicialização: bytes de controle
   incluídos no JavaScript inline eram processados pelo tokenizer HTML, que
   substitui U+0000 por U+FFFD, destruindo a ordem de um range de regex e
   impedindo outros scripts de iniciarem.

A **PR #28** (merge `6ea975e13694f094bba034103b7572d30b07e308`) adicionou o guard de `month` antes de
consultar despesas e codifica caracteres de controle não imprimíveis no HTML
do Admin como escapes JavaScript antes de enviá-los ao navegador.

Validação: CI PR `40576473744`, CI `main` `40576723167`,
**2.073 testes Node, 0 falhas + 67 Python**. Teste Chromium real com
consulta financeira simulada em HTTP 503: registry instalado, seis agentes
hidratados, zero placeholders remanescentes, valor diário indisponível
sem inventar lucro, **zero erros de JavaScript**. Build checks Cloudflare
App/Auth/Finance concluídos **SUCCESS**.

Limites: o teste simula sessão de proprietário e não lê a conta privada;
a conexão da rota mensal em produção continua sem evidência do operador.
**Não afirmar ainda que lucro diário, repasses ou D1 estejam funcionando**.
Se a página voltar a hidratar agentes mas os números permanecerem em branco,
usar `/admin/diagnostics` para obter `owner_probe` e `finance_month`.
Nenhuma autorização da Shopee, orçamento Ads, dado persistido ou Worker Auth/
Finance foi alterado pela correção.

## M2 — PR #32: gráficos financeiros observacionais + setas de lucro/prejuízo (27/10/2026)

O operador solicitou gráficos mais úteis e indicadores visuais de
lucro/prejuízo em verde/vermelho. A PR #32 (merge `78f1ed1514bcc72a4bfebc069e7c39ce3f466995`)
agrega uma série SVG diária de até **14 dias**, reutilizando **exclusivamente**
o projetor `business_daily_summary_v1` já validado pelo
`brazaDayDashboard`. Não há nova query D1, `fetch`, cron ou endpoint Shopee.

Agora a **Visão Geral**, **MLS Finance** e **MLS Ads** têm seletor
Resultado/Vendas/Ads. Os cartões da Central sinalizam resultados estimados
positivos (verde), negativos (vermelho) e diferenças monetárias com
setas ↑/↓ e percentual quando a base anterior não é zero.

**Comparação só entre datas consecutivas, completas, com cobertura validada**.
Hoje parcial não é comparado com ontem fechado; o chip identifica as datas
efetivamente comparadas. Dias sem dados interrompem linhas, não viram zero.
Saldo após custos conhecidos é exibido como parcial, e o aumento do gasto
em Ads é laranja (não prova prejuízo). Lucro realizado, saldo bancário e
atribuição Ads por SKU continuam não comprovados.

CI PR `40599192490` e main `40599428231`: **2.087 testes
Node / 0 falhas e 67 Python**, com Chrome real confirmando os três
gráficos SVG, setas, valores, abas horizontais e zero erros JS.
Cloudflare Builds App/Auth/Finance: **SUCCESS**.

Status do produto: M2 financeira permanece EM ANDAMENTO e ainda precisa
verificação autenticada dos dados reais da loja e da comparação Pending
x Seller Centre. A mudança é UI/consumo local do snapshot validado, sem
alterações comerciais e sem desbloqueio Ads/PROMO.

### M3-L1 — Reanexação de mockups em lote (PR #60 draft)

- [x] Seleção local de arquivos ou pasta: até **200 imagens e 64 MiB** por execução, decodificação JPG/PNG e SHA-256 em até três operações simultâneas.
- [x] Associação pelo nome exato a todos os anúncios importados que utilizam a mesma foto, evitando editar cada arte individualmente.
- [x] Falha atômica para nome duplicado, hash diferente, imagem inválida, limite excedido; arquivo extra é ignorado com contagem e aviso.
- [x] Testes puros até 500 anúncios e Chromium real em 19 anúncios, cobrindo parcial/completo/duplicado/trocado.
- [x] **CI GREEN** #40790629421: 2.132 Node + 67 Python, Chromium e três Workers; 14/14 arquivos de runtime e testes idênticos ao candidato #61, que foi fechado sem merge.
- [ ] QA autenticada desktop/celular com mockups reais, integração #51 → #56 → #60 e revisão da PR #48. Nenhum upload/publicação comercial.

Guia: [MLS_LISTING_FACTORY_BATCH_RELINK_2026_10_28.md](MLS_LISTING_FACTORY_BATCH_RELINK_2026_10_28.md). M2 issue #50 permanece aberta e nenhuma publicação Shopee é autorizada.

### M1/M3-L2 — Integração V3.6 + Fábrica de Anúncios (PR #63, DRAFT)

- [x] Combinar busca global da PR #48 com os módulos das PRs #51, #56 e #60 sobre a main canônica, sem modificar Finance/Auth/D1/OAuth, Ads ou cron.
- [x] Verificar integridade de arquivos: 13/13 blobs da PR #60 e 7/7 da PR #48 preservados. Allowlist dos Workers recebe somente o novo SHA App exato.
- [x] CI #40792253729 **GREEN: 2.136 Node + 67 Python**, Chrome real e três builds; App SHA 8ed059ddb6f0901a48d277d6b9b806a23d52a1e5e105ed0e2e456e2aea6701f5.
- [x] Adicionar teste de coexistência do catálogo, DTF, busca e editor local em HTML normal/minificado.
- [ ] QA visual autenticada do operador em desktop/celular e decisão de release: PR #63 única ou PRs #48/#51/#56/#60 sequenciais, não ambas.
- [ ] M2 Finance issue #50 e permissões Shopee ainda bloqueiam qualquer ação comercial automática. Ads/PROMO LOCKED.

[Evidência e plano de QA](MLS_V36_LISTING_FACTORY_INTEGRATION_2026_10_28.md).


## 29/10/2026 — integração visual de todos os painéis existentes · PR #74 (DRAFT)

**Design aprovado fixado** a partir do mockup fornecido pelo proprietário: escuro azul-marinho, componentes neon discretos, KPIs e cards por agente, navegação especializada, responsividade e cores Finance verde / Ads laranja / Products azul / Production roxo / Returns vermelho / Auditor ciano. Uma única camada CSS em `web/cloudflare/src/approved-design-system.mjs` é compartilhada pelo App administrativo e pelas rotas Ads.

- **PR #74** consolida os reworks individuais #69 (Plano de Evolução), #71 (Agentes), #72 (Produtos) e #73 (Produção DTF) em branch única baseada na `main`. Os testes e fontes dos quatro reworks foram incorporados sem merge da `main`.
- Shell, Visão Geral, sete especialistas, Finance/Returns/Auditor, Hermes, Dashboard Ads, Campanhas, Optimization/Automação, Conexões, Custos, Histórico e 15 seções do proprietário são cobertos por estilos e testes de integração. Relatórios/Notificações não recebem telas fictícias se não houver rota real.
- Mini navegação interna dos sete especialistas usa âncoras de ferramentas e indicadores existentes; evita duplicar fórmulas ou renderizar dados inventados.
- **Sem alterações comerciais:** nenhuma publicação, modificação de campanha, Ads/PROMO, preço ou estoque; `DTF_CLIENT` e `DTF_ENGINE_CLIENT` preservados. O projeto financeiro M2 (#50) continua aberto.
- V3.6 Listing Factory e busca (#63/#65/#68) ainda **não publicadas**; a integração com o design será reconciliada antes do primeiro release, com feature flag OFF, homologação autenticada do proprietário e rollback preparado.
- A CI testa Node completo, 67 Python, builds dos três Workers e Chrome sintético 1365×900/390×844, incluindo 15 seções; **CI verde por si só não equivale a aprovação visual do proprietário nem deploy**.
- Documentação: [MLS_APPROVED_DESIGN_SYSTEM_2026_10_29.md](MLS_APPROVED_DESIGN_SYSTEM_2026_10_29.md). Trilha visual: issue #70; release seguro: issue #67.

**Status ao registrar:** PR #74 em DRAFT, ainda não publicada, com CI integrado em validação. Não fazer merge/deploy até CI final e aprovação explícita.


## 29/10/2026 — candidato único de homologação visual + V3.6 · PR #75

- Trilha `#63 → #65 → #68 → #75` incorpora o design aprovado #74 **por integração manual dos arquivos compartilhados**, sem mesclar as PRs visuais anteriores separadamente.
- **Flag de release `MLS_V36_OWNER_PREVIEW`: ausente/inválida = OFF**; valor exatamente `ENABLED` e sessão owner habilitam apenas busca V3.6 e Listing Factory local. Não ativa publicação na Shopee ou Ads/PROMO.
- `admin-view.mjs`, `dtf-view.mjs`, `saved-catalog-view.mjs` e `build.py` tiveram código de duas trilhas reconciliado preservando contratos originais.
- Todos os painéis existentes mantêm o design aprovado, com QA desktop 1365×900/mobile 390×844 e testes integrados OFF/ON. **Não há merge/deploy nem homologação com conta real.**
- Manual: [MLS_INTEGRATED_OWNER_RELEASE_2026_10_29.md](MLS_INTEGRATED_OWNER_RELEASE_2026_10_29.md); PR [#75](https://github.com/MatheusLemosDS/MLS-Ecommerce-Ads/pull/75). M2 Finance #50 e Ads/PROMO continuam bloqueados para execução.
