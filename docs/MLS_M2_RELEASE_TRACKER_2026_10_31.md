# M2 — acompanhamento automático de liberações posteriores

PR [#90](https://github.com/MatheusLemosDS/MLS-Ecommerce-Ads/pull/90), base main PR89 `23b329efcb311e141366b54c4b400061f38c9301`. Incremento publicado na versão oficial conforme a orientação do proprietário, preservando o visual aprovado, a memória dos agentes e os Workers Auth/Finance. M2 permanece aberta.

## Problema e mudança

O acompanhamento de pedidos criados em meses anteriores existia, mas não era chamado pelo agendamento. A manutenção histórica também pulava publicações completas sem situações abertas, mesmo quando suas referências por pedido já haviam expirado no Finance. O navegador podia descartar uma resposta válida porque o projector dependia de helpers externos ao script compilado.

A fila agora inclui COVERAGE, com no máximo uma leitura privada por oportunidade HISTORY. Essa leitura usa os calendários já salvos no Finance, sem consultar a Shopee; o Finance pode inicializar seu cache local de coorte. O cursor legado continua aceitando somente RELEASES/RETURNS/INCOME/INCOME_DETAIL. O turno adicional e o escopo da tentativa ficam em tabelas aditivas, mantendo o payload Finance bruto compatível com rollback.

A primeira conferência recebe uma oportunidade limitada quando o Finance atual não está devido. Durante uma importação, permanecem a prioridade do Finance e os limites de uma oportunidade auxiliar após quatro invocações financeiras e intervalo de cinco minutos. A retentativa inicial tem cooldown próprio de 300 segundos por mês: atividade normal de Registry, Catálogo ou Produção não adia indefinidamente essa primeira conferência. Pausa, perda ou expiração de lease impedem gravações indevidas; a reserva não monopoliza as outras filas.

Um sinal SOURCE_MISSING validado, vinculado à publicação atual, pode recuperar as referências do mês imediatamente anterior pelo maintenance existente. Cada oportunidade executa um passo de fonte, somente quando o Finance atual está em espera saudável, com os mesmos controles de lease, pausa e backoff. A publicação antiga fica disponível até a recuperação completa. Totais agregados não são usados para inventar identidades de pedidos.

A seção de acompanhamento mostra última tentativa, próxima leitura elegível, fontes disponíveis e cobertura dos calendários. Abre sob demanda, usa cache e não faz polling. O GET owner apenas lê: não inicializa tabelas nem dispara coletas. Coorte, revisão, intervalos, referências e horários são conferidos no servidor e no navegador.

## Evidência real na Live

A primeira publicação deste incremento foi o App `2ea13da1-d5f7-4b73-8fed-975e797506e7`, às **12:52:26 de Brasília em 31/10/2026**, código `ef2d87f361feb3821cc611f780f01fbb0b15bc7f`, CI [41216569535](https://github.com/MatheusLemosDS/MLS-Ecommerce-Ads/actions/runs/41216569535) verde, com 2.603 testes Node e 67 Python aprovados.

Às **13:12:52 de Brasília**, o cron executou o acompanhamento naturalmente. A observação às 13:13:52 confirmou a publicação de setembro, revisão 10, com 24 pedidos pagos no agregado salvo. Duas referências foram solicitadas e nenhuma permanecia disponível; um dos dois calendários estava completo. A tentativa foi SUCCESS e o relatório permaneceu COLLECTING, com SOURCE_MISSING e CALENDAR_MISSING. Publicação, referências, metadados disponíveis e escopo da tentativa coincidiram exatamente. Ausência de fonte permaneceu desconhecida, sem ser convertida em zero.

O verificador fez somente leituras. Nenhum job, cursor ou coletor foi forçado para produzir essa prova. O Finance atual permaneceu com `failure_count=0` e `last_error=null`. A recuperação histórica ainda não havia começado nesse corte; sua execução não foi presumida a partir do código ou dos testes.

## Versão final e validação

App final **17c1e9f1-b9ac-4b6f-bd33-885c9a5aab81**, 100% ativo, publicado em **31/10/2026 às 13:22:29 de Brasília**, código `cf89fdd04651af2136a0080f615a53ddb0935b09`. CI [41218926278](https://github.com/MatheusLemosDS/MLS-Ecommerce-Ads/actions/runs/41218926278): **2.637 Node e 67 Python aprovados**, zero falhas e testes ignorados. Os checks do HEAD documental ficam na própria PR.

| Artefato | SHA-256 |
| --- | --- |
| App final gerado | `0dd75e25c8119c7f8d952a68b372b61387357de4092a525db8ee38a690ff8739` |
| App final publicado pelo Wrangler | `137a7d8114d238e5f2fbed057a09ba30de1f742da032c6b26fb9dc31924f2c26` |
| App inicial gerado | `96479753e47632a64616f4d2b8cee261641d7cb2c84ceef6dabb58dd001461a7` |
| App inicial publicado | `5c6e4bb227aaa57909b023ba8a6c9367983d97567ee282a7d32686817b3d5f28` |
| Auth gerado, preservado | `1fef431c8573e05563c7938d95be0976a160bc603340084aa747ee0b73e7ec64` |
| Finance gerado, preservado | `bfc27e1022e0c5b3d335498389fd64b6978b8f7f04501d3bc6eff38202bf5feb` |

A conferência pós-publicação às 13:24:08 de Brasília verificou a inicialização natural da nova tabela de espera e o progresso auxiliar depois do deploy, além de bytes exatos, configuração, bindings, domínio, cron, flags owner ENABLED, tabelas aditivas e cursor legado. Auth continua na versão `863fab51-ab8b-43c0-9794-4ce4039f6663`; Finance na versão `a01e40a0-d760-4958-834e-f090c62b1ca8`.

QA de navegador: cenários compilados e Chrome aprovados, oito capturas sintéticas identificadas, desktop 1365px e mobile 390px, temas claro/escuro, Worker normal/minificado. Esses testes não substituem a sessão real ou o aceite visual do proprietário. O acesso público pelo executor permanece limitado pelo WAF Cloudflare 1010; nenhum bypass foi usado.

Provas e backups privados: `/workspace/mls-owner-preview/attachments/live-release-tracker-baseline-20261031/`. QA: `/workspace/mls-owner-preview/attachments/live-release-tracker-qa-20261031/`. A prova natural corresponde à primeira publicação do incremento; a correção final de agendamento não exige apagar o marcador nem forçar nova execução.

## Rollback e próximas etapas

Rollback imediato do App para `2ea13da1-d5f7-4b73-8fed-975e797506e7`, ou para a base anterior `66e9c01f-3fe5-4688-8dd7-4fb14f56a609`, seguido de conferência independente de bytes e configuração. As tabelas aditivas são preservadas; o payload bruto e o cursor legado permanecem legíveis. Não há migração de Auth/Finance nem remoção de histórico.

Próximo M2: observar a recuperação das referências expiradas, preencher os calendários históricos ausentes e conferir devoluções, Pending e liberações com Seller Centre e banco. Identidade completa no corte não comprova depósito bancário, fim do ciclo de liberações, saldo a receber ou lucro realizado. O horizonte limitado não permite concluir que uma liberação posterior não existe.

A memória dos agentes continua descritiva: não treina pesos nem comprova eficácia de uma recomendação. Vincular recomendações a execuções autorizadas e resultados posteriores vem depois da conciliação. Escritas comerciais, Ads/PROMO, mudanças OAuth e novas análises pagas mantêm seus controles existentes.
