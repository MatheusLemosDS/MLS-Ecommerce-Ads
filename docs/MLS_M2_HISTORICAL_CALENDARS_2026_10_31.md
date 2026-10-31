# M2 — coleta automática dos calendários históricos de liberações

PR [#91](https://github.com/MatheusLemosDS/MLS-Ecommerce-Ads/pull/91), base main PR90 `8cdad2a4179cf96c1c2c586f89e2ad0c37665e3e`. Incremento publicado na versão oficial conforme a orientação do proprietário. Auth, Finance, configurações e visual aprovado preservados. M2 permanece aberta.

## Problema e mudança

A recuperação das referências por pedido já funcionava, mas a oportunidade RELEASES consultava apenas o mês corrente. O calendário anterior podia continuar ausente mesmo depois de seus pedidos serem recuperados.

A fila agora seleciona calendários pendentes dos três meses anteriores quando existe um sinal CALENDAR_MISSING ou CALENDAR_PARTIAL recente, projetado e vinculado à publicação atual. Confere mês de acompanhamento, referências, intervalos, quantidades, repasse e horários das fontes. Fontes MISSING continuam desconhecidas e não impedem a coleta independente do calendário.

RELEASES alterna o calendário histórico com o atual dentro do orçamento existente: no máximo uma chamada privada em toda oportunidade HISTORY. Usa o serviço Finance, a paginação, os limites e o backoff já existentes. A primeira auditoria oferece uma oportunidade RELEASES limitada após um COVERAGE pendente, preservando o próximo trabalho do cursor legado. O marcador inicial é consumido uma vez; esperas locais e falhas antes ou depois da leitura permitem o avanço do outro calendário.

A alternância fica na tabela aditiva `financial_audit_release_calendar_turns`, com `next_target` CURRENT/HISTORICAL e `bootstrap_pending` 0/1. Seus três campos permanecem compatíveis com a versão anterior, sem ALTER. O rodízio dos alvos históricos fica na nova tabela aditiva `financial_audit_historical_calendar_targets`, com `month`, `last_selected_month` e `selected_at`. Um candidato em backoff local permite examinar o próximo candidato elegível do horizonte, sem gastar uma chamada privada adicional. O cursor legado mantém RELEASES/RETURNS/INCOME/INCOME_DETAIL; os relatórios Finance continuam em seu payload bruto, compatível com rollback. Callers legados não passam a depender das tabelas opcionais de publicação ou da fila global.

Uma coleta parcial continua elegível após a virada do mês dentro desse horizonte: setembro não deixa de ser acompanhado ao entrar novembro. O mês novo exige um sinal de cobertura do novo through_month e novos leases; não reaproveita a autorização do corte anterior. O Finance retoma o mesmo scan e suas páginas salvas. A gravação confere o `calendar_month` realmente selecionado, sem presumir que ele é sempre o mês imediatamente anterior.

Uma coleta concluída salva só evita nova leitura histórica quando cobre o mês fechado inteiro, tem frame válido e é posterior ao sinal pendente. Um resultado antigo que cobria apenas parte do mês não bloqueia a retomada. Pausa, publicação substituída, perda de lease, expiração e virada do mês cercam a chamada e a gravação, inclusive depois de awaits. Os commits conferem política, publicação e leases de forma atômica. GET e abertura da UI não iniciam coleta histórica.

## Evidência real antes da publicação

O corte de **31/10/2026 às 14:55 de Brasília** confirmou que a recuperação das fontes de setembro concluiu naturalmente às **14:13**, sem erros. A publicação de setembro estava na revisão15, com duas de duas referências Finance disponíveis e 24 pedidos pagos. O tracker correspondente localizava dois pedidos e mantinha 22 sem ocorrência nos calendários salvos, com um de dois calendários completo. Setembro continuava ausente; outubro tinha publicação COMPLETE com 189 linhas salvas. Ausência de ocorrência não comprova ausência de recebimento.

O App anterior era `17c1e9f1-b9ac-4b6f-bd33-885c9a5aab81`. Os bytes exatos, configuração, bindings, domínio, cron e flags owner foram conferidos e preservados em backup privado antes da mudança. Esse corte comprova a pendência que motivou a entrega; não comprova a coleta histórica desta versão.

## Publicação inicial e continuidade

A primeira publicação deste incremento foi o App `f690bb92-0b72-4785-8e27-5881349bb6b3`, em **31/10/2026 às 15:07:59 de Brasília**, código `27ac1e9132049c6d03b12317bdbc7d926675c05c`. A CI [41227497473](https://github.com/MatheusLemosDS/MLS-Ecommerce-Ads/actions/runs/41227497473) aprovou **2.716 testes Node e 67 Python**. A conferência às **15:08:52** validou bytes e configuração; às **15:09**, a leitura ainda registrava espera pela fila, sem uma chamada histórica natural comprovada nesse corte.

A entrega final também cobre a continuidade na virada do mês. Essa proteção mantém calendários ainda parciais no rodízio limitado, com evidências e leases renovados, preservando o trabalho já salvo no Finance.

## Versão e validação

App **7bd0dfa7-fd2b-442a-b1f5-9abf856f0fcd**, 100% ativo, publicado em **31/10/2026 às 15:38:43 de Brasília**, código `9826b28df628805e10fa5c8c026970663a9a0418`. CI [41229871797](https://github.com/MatheusLemosDS/MLS-Ecommerce-Ads/actions/runs/41229871797): **2.772 testes Node e 67 Python aprovados**, zero falhas e testes ignorados. Os checks do HEAD documental ficam na própria PR.

Os testes direcionados finais aprovaram **104 cenários source** e **58 cenários compilados normais/minificados**. O fluxo App → Auth → Finance usou os Workers gerados e transporte sintético, exercitando retomada parcial após a virada do mês, rodízio entre os três alvos anteriores, cache de mês completo, backoff de permissão, alternância após falhas e bloqueios por política, publicação, leases e relógio. No primeiro HISTORY da versão final, o orçamento observado foi **36 chamadas D1 e 1 leitura(s) privada(s)**; durante backoff, **28 chamadas D1 e 1 leitura(s) privada(s)**. Esses valores devem corresponder à medição da versão final, mantendo no máximo uma chamada privada por oportunidade.

| Artefato | SHA-256 |
| --- | --- |
| App final gerado | `da9c248a849ba7c0af70dbd81ee79aa6ce4c23cac2c82c55aed785cdfbc8a850` |
| App final publicado pelo Wrangler | `66544525b8c7a938f4ea928ab753e5e2f4fd78ca5b737662ded88682866ba5ba` |
| App inicial PR91 gerado | `21446508dd6ac2927359fd5574db61ef3ea574b365b75dae0b55950272eeb964` |
| App inicial PR91 publicado | `7a6032edc97d6f3614be1d2ef299595c2648fb9ba665f56ddcb3a4b0c85c4784` |
| App base PR90 gerado | `0dd75e25c8119c7f8d952a68b372b61387357de4092a525db8ee38a690ff8739` |
| App base PR90 publicado | `137a7d8114d238e5f2fbed057a09ba30de1f742da032c6b26fb9dc31924f2c26` |
| Auth gerado, preservado | `1fef431c8573e05563c7938d95be0976a160bc603340084aa747ee0b73e7ec64` |
| Finance gerado, preservado | `bfc27e1022e0c5b3d335498389fd64b6978b8f7f04501d3bc6eff38202bf5feb` |

A conferência pós-publicação às **15:39:42 de Brasília** verificou bytes, configuração, bindings, domínio, cron, flags owner ENABLED, tabelas aditivas, campos originais preservados e valores válidos dos cursores. Auth permaneceu na versão `863fab51-ab8b-43c0-9794-4ce4039f6663`; Finance na versão `a01e40a0-d760-4958-834e-f090c62b1ca8`.

A entrega não altera a UI. A bateria completa mantém os testes existentes de Chrome e do estilo aprovado; testes sintéticos não substituem sessão real ou aceite visual do proprietário. O acesso público pelo executor continua limitado pelo WAF Cloudflare 1010; nenhum bypass foi usado.

## Execução natural observada

Às **15:38:17 de Brasília**, a leitura posterior à publicação confirmou **a primeira etapa histórica de setembro, executada às 15:37:56 de Brasília na versão intermediária 64174a2e, com publicação revisão15, duas referências disponíveis e metadados exatos**. O estado observado foi **RUNNING, uma página, um registro de liberação e um de cinco intervalos concluído**. A tentativa foi SUCCESS, sem diagnóstico de erro. O Finance atual permaneceu RUNNING com failure_count=0 e last_error=null. A publicação de criação dos pedidos foi preservada. Esta prova pertence à versão intermediária; a versão final acrescenta a seleção de COMPLETE com corte curto, testada com os três Workers e conferida separadamente por bytes/configuração. A leitura não comprova depósito bancário nem associação daquele registro aos 24 pedidos do mês.

O verificador fez somente leituras. Nenhum job, cursor, lease ou coletor foi forçado para produzir essa prova. Uma tentativa registrada comprova a execução da rotina; um scan RUNNING comprova progresso, sem declarar o calendário COMPLETE. A conclusão do calendário exige publicação válida cobrindo o mês fechado inteiro. Nenhum desses estados confirma depósito bancário ou lucro realizado.

Provas e backups privados: `/workspace/mls-owner-preview/attachments/live-historical-calendar-baseline-20261031/`. Verificadores privados: `/tmp/mls-historical-calendar-verification/verify_calendar.py` e `observe_calendar.py`.

## Rollback e próximas etapas

Rollback imediato do App para `f690bb92-0b72-4785-8e27-5881349bb6b3`, ou para a base `17c1e9f1-b9ac-4b6f-bd33-885c9a5aab81`, seguido de conferência independente de bytes e configuração. As tabelas aditivas permanecem preservadas; o App inicial PR91 continua lendo a tabela de alternância com seus três campos e ignora a nova tabela de rodízio histórico. A base PR90 mantém o cursor e os relatórios legados legíveis. Auth e Finance não precisam de migração ou nova publicação. Não apagar calendários, relatórios ou publicações para produzir uma prova de retomada.

Próximo M2: acompanhar a conclusão do calendário, atualizar o cruzamento com os pedidos e conciliar Returns, Pending e liberações com Seller Centre e banco. Recuperar identidades, completar calendários e comprovar recebimento são evidências separadas. O horizonte limitado aos três meses anteriores não prova que não haverá liberações posteriores nem recupera automaticamente todos os meses antigos.

A memória dos agentes continua descritiva. Vincular recomendações a execuções autorizadas e resultados posteriores para avaliar eficácia vem depois da conciliação. Escritas comerciais, Ads/PROMO, mudanças OAuth e novas análises pagas mantêm seus controles existentes.

Uma coleta Finance marcada COMPLETE pode terminar antes do fechamento do mês. O seletor também reconhece esse intervalo descoberto pela data do corte, mesmo sem CALENDAR_PARTIAL, sem modificar o status Finance nem inventar pendências. COMPLETE até o encerramento real do mês não gera nova consulta. A simulação App/Auth/Finance verificou o recorte curto seguido de coleta completa e preservação da publicação anterior.

O pior cenário observado consumiu46chamadasD1 e uma leitura privada (47/50). A recuperação de referências por pedido segue um fluxo separado, limitado ao mês imediatamente anterior; ampliar calendários não reconstrói fontes indisponíveis mais antigas nem confirma banco.
