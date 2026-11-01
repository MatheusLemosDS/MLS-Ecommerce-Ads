# M2 — conciliação automática do mês anterior

## Escopo e causa

Continuação autorizada na versão oficial, sobre main PR93 `41417aff5b702007a9db4066d05d7902f15ee778`, branch `feature/m2-previous-month-returns-20261101`.

Após a virada para novembro, tanto as oportunidades reservadas quanto o turno normal de Returns consultavam apenas o mês atual de Brasília. O coletor histórico podia atualizar os pedidos de outubro, mas não agendava a conciliação de suas devoluções. Abrir o mês no painel só lê os dados salvos. A publicação integral de outubro ficava sem os relatórios correspondentes.

Baseline somente leitura de 01/11/2026, 16:09:36 UTC: publicação integral de outubro com três intervalos, 451 pedidos, 357 pagos, 82 cancelados excluídos, dez pedidos com devolução e oito situações em revisão. As três fontes originais do Finance estavam COMPLETE, com revisões, datas, horários e evidências por pedido compatíveis. Havia zero relatórios e zero tentativas desses três intervalos. Novembro estava COMPLETE, com oito pagos e sem falha. Isso permite reaproveitar as fontes salvas; não comprova fechamento, lucro realizado ou recebimento bancário.

## Implementação em validação

- Seleção explícita do mês atual e do imediatamente anterior; o anterior precisa cobrir todo o calendário, incluindo o corte final de cada intervalo em Brasília.
- Rodízio aditivo, com lease e CAS próprios, compartilhado entre as oportunidades reservadas e o turno normal. Uma oportunidade continua limitada a uma chamada privada; cursores e orçamento legados permanecem legíveis.
- A seleção congela revisão, token e payload da publicação exibida. Uma importação parcial mais nova não substitui essa referência.
- O runner confere a publicação, as leases, a política ativa, o relógio e o mês do scheduler antes da consulta e no salvamento atômico dos relatórios e tentativas. Troca de publicação ou de lease durante a consulta impede salvar um relatório no recorte errado.
- Se um alvo deixa de estar disponível antes de qualquer consulta, o rodízio pode usar o outro alvo validado na mesma oportunidade. Uma chamada já realizada consome todo o orçamento: não há segunda consulta nem salvamento no recorte anterior se a publicação mudar durante a resposta.
- GET owner permanece local. Contratos financeiros v1/v2/v3, totais mensais, referências de produção e semântica dos valores de devolução permanecem compatíveis.
- Fonte ausente, falha de permissão e valores desconhecidos continuam explícitos, com espera própria. As fontes históricas não são reconstruídas a partir de agregados.
- A atualização histórica também recupera uma publicação cujo `end_date` já era o último dia, mas o cutoff da fonte ainda não cobria suas últimas horas. O cálculo usa a virada real de Brasília, incluindo horários de verão históricos, e mantém as prioridades e limites existentes.

A seleção histórica não impede novas publicações financeiras. A validação na conta deve medir se os três intervalos conseguem avançar antes da troca do recorte. Se houver perda recorrente de progresso, a próxima correção será uma janela de captura histórica limitada, com liberação em falha, prazo ou conclusão, preservando a prioridade do mês atual.

## Critérios de validação e publicação

Testar rodízio atual/anterior, fonte ausente, backoff, permissão, concorrência, pausa, relógio regressivo, virada de mês/ano e troca de publicação antes ou durante a consulta. Executar o caminho App → Auth → Finance normal e minificado, comprovar o limite de uma chamada privada e leituras owner sem coleta.

Após a suíte completa e o CI, publicar somente o App e conferir os três Workers por bytes, configurações, domínios, flags e cron. Aguardar o cron natural e comparar os relatórios salvos com as fontes exatas da publicação. Sem reset de cursores ou disparo manual de jobs na conta.

Seller Centre e banco continuam sem comparação externa. Returns CHECKED descreve a conferência dos relatórios; não confirma liquidação bancária nem encerra M2. Os checks externos de Workers Builds da Cloudflare seguem separados: na entrega anterior reportavam falha e sua API de logs retornava 403/12004 com o token disponível. Nenhuma configuração ou permissão de Builds será alterada por este incremento.

## Evidência técnica antes da publicação

O caminho gerado App → Auth → Finance passou em 16 testes normais/minificados, incluindo os três intervalos de outubro e o atual, observação autenticada sem consulta da fonte, troca de publicação antes/durante a resposta e viradas UTC/Brasília. Orçamentos observados de D1 + chamada privada: 38/37/46/37 na sequência, 48 na primeira auditoria de um processo novo e 45 no fallback para a fonte atual válida. O limite de 50 permaneceu inalterado.

A primeira medição encontrou 52 chamadas; eliminamos leituras redundantes, agrupamos a aquisição em uma transação e evitamos uma liberação repetida de lease já encerrada, preservando as verificações antes/depois da fonte e no commit. As fixtures antigas focadas em Coverage passaram a declarar explicitamente Returns já auditado, com tentativa futura coerente. A fixture terminal de recuperação de fonte agora coleta até o fim real do mês; suas asserções originais foram preservadas, e oito testes separados comprovam a recuperação do cutoff curto. Os testes nativos de guard, seleção e orquestração também passaram; a suíte completa e o CI final permanecem gates de publicação.

Fonte da implementação: `e6b8dc9ed5d5168bd4e20b0025ef013b9e488106`. Auth e Finance gerados permanecem byte a byte iguais à PR93; somente o App muda.
