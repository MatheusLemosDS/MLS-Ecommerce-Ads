<!-- OWNER_OPERATION_CURRENT -->
**DTF 2026-11-16.3 publicado e verificado tecnicamente: seleção e prévia automáticas.** [Uso](owner-operation/README.md) · [checkpoint canônico](MLS_COMMERCE_OS_CHECKPOINT.json) · [recibo](owner-operation/validation/publication-dtf-auto-live-20261116.json).

Com PNGs salvos neste navegador/origem e kits confirmados, as linhas aptas são selecionadas e a prévia é montada sem clicar em Selecionar aptos ou Montar prévia. A mesma entrada preserva o canvas; alteração da fonte o invalida. Seleção manual desativa a automação; a opção explícita a retoma. Reserva, download e impressão continuam exigindo ação do operador. Não há fatos físicos nem lançamentos financeiros por conta da prévia.

Fonte 723bb3a, CI 43998220684: 4494 Node e 67 Python aprovados, mais 38 testes direcionados. App/Auth ativos com 100% do tráfego e hashes/configurações conferidos; Finance preservado. 8 verificações HTTP e 8 assets públicos exatos; backup privado/restore isolado conferidos. PR #126 rascunho sobre PR #125, sem merge/auto-merge; main 346f30f preservada.

Próximo passo: recarregue Produção → Montador e fila DTF e confira a prévia com os PNGs reais. Não infira fabricação, custos ausentes ou aceite financeiro de um arquivo. [Regras ativas e gates](../AGENTS.md#regras-de-domínio-ativas) preservam sexta às 13h/Brasília, confirmações/auditoria, seis agentes, gráficos e contratos. OP-014 segue como próximo desenvolvimento independente; venda ADIADO_VENDA. Históricos integrais seguem abaixo e nas evidências.
<!-- END_OWNER_OPERATION_CURRENT -->

# Retomada curta — MLS Commerce OS

- Base: main `346f30f200e5cbd3d9efd26663a483c625d9c6e7`, reconfirmada pelo conector GitHub; [PR #121](https://github.com/MatheusLemosDS/MLS-Ecommerce-Ads/pull/121) `merged=true` em `2026-11-14T00:47:06Z` (13/11 às 21:47:06 Brasília). O checkout anterior e seu `origin/main` estavam em `eab85a17d7a6c4f213e67ce0b7dea0cf63932bf2`/PR116; não representavam a main atual.
- Primeiro leia [regras de domínio ativas e gates](../AGENTS.md#regras-de-domínio-ativas): fabricação sexta13h→sexta13h Brasília; não inferir fatos/fontes ausentes, não duplicar custos/receitas e manter confirmações, revisões e auditoria.
- Último registro técnico: release `2026-11-13.3`, fonte `f68525ea1d136350ece9942433352accdf97d992`; coleta retomada, ainda parcial. Publicação técnica não é aceite financeiro real; M2/M2.2 abertas. Carteira/saques e banco automáticos ainda dependem de contratos, adaptadores e acessos comprovados. Matriz: 12 VALIDADO_LOCAL, 15 PARCIAL, 1 EXTERNAL_DEPENDENCY.
- Evidências ativas: [uso e limites financeiros](financial-automation/README.md), [validação e contratos](financial-automation/VALIDATION.md), [matriz](financial-automation/MATRIZ_EXECUCAO.json) e [recibo .3 com histórico .2](financial-automation/publication-live-20261113.json). Os testes e a Live descritos ali pertencem à entrega funcional anterior, não foram repetidos nesta organização.
- Históricos integrais: [instruções anteriores](../AGENTS_HISTORICO.md), [handoff anterior](../NEXT_CHAT_HANDOFF_HISTORICO.txt) e [anexo original](MLS_INICIO_ECONOMICO_ORIGINAL.md). Consultar conforme necessário; não transformar estados antigos em autorizações atuais.
- Esta entrega é somente documental: sem aplicação, cálculos, permissões, workflows ou Live; validação apenas documental. Isso não restringe futuras tarefas funcionais autorizadas nem altera seus gates. [Registro, base e validação](ENTREGA_ORGANIZACAO_DOCUMENTAL.md).

Retome uma entrega por vez, reconfirme HEAD/diferenças posteriores e aprofunde somente as fontes necessárias. A melhoria de pipeline citada no anexo fica para escopo separado, sem alteração dos gates existentes.
