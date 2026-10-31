# M2 — acompanhamento automático de liberações posteriores

Base: main PR89 `23b329efcb311e141366b54c4b400061f38c9301`. Continuação autorizada na versão Live, preservando o estilo aprovado, a memória dos agentes e os Workers Auth/Finance.

## Problema verificado

O tracker de coortes anteriores existia, mas não era chamado pelo agendamento. A coleta financeira não podia explicar automaticamente uma venda criada num mês e uma liberação em calendários posteriores.

O corte real conferido em31/10 mostrou setembro com24pedidos pagos e duas fontes imutáveis no App. As duas referências por pedido já tinham expirado no Finance, sem cache de coorte, e não havia calendário de liberações de setembro salvo. Apenas outubro tinha calendário completo. Totais agregados não permitem reconstruir as associações por pedido.

A manutenção histórica também pulava setembro: a publicação cobria o último dia e não tinha situações abertas. SOURCE_MISSING não era considerado para recuperar as referências. Além disso, o projector da cobertura usado no navegador dependia de helpers de módulo e podia descartar silenciosamente uma resposta válida.

## Incremento em validação

- Ligar COVERAGE à fila de auditorias existente, com no máximo uma leitura privada por oportunidade HISTORY, preservando a prioridade Finance e as reservas limitadas Returns. O transporte dedicado já existente usa release-coverage-v1; a cobertura lê os calendários salvos no Finance, sem consultar a Shopee. O Finance pode inicializar seu cache local de coorte.
- Manter o cursor legado com apenas RELEASES/RETURNS/INCOME/INCOME_DETAIL e um sidecar de oportunidade COVERAGE. Um primeiro turno inicial é elegível automaticamente; depois o rodízio mantém todas as fontes. Ausência de fonte, backoff e pausa não monopolizam a fila.
- Guardar o payload Finance bruto, compatível com o rollback, e registrar o escopo da tentativa num sidecar aditivo. Lease, política enabled, revisão/intervalo/identidade da publicação e relógio são conferidos antes de gravar. Mudança de calendário ou publicação invalida somente a espera do escopo anterior.
- GET owner apenas lê, inclusive no banco ainda vazio. Não inicializa tabelas nem dispara coleta. O navegador valida coorte, fontes, horários e calendário, exibe última tentativa e elegibilidade da próxima leitura, e mantém ausência/parcial/histórico explícitos. A seção abre sob demanda, com cache e sem polling.
- Recuperar referências perdidas do mês imediatamente anterior somente com um sinal SOURCE_MISSING bem formado e vinculado à publicação atual. Reutilizar o maintenance existente quando o financeiro atual estiver em espera saudável: um passo de fonte por oportunidade, mesmos leases, pausa, backoff e orçamento. A publicação antiga fica preservada até a nova coleta completa. Nenhuma identidade é inferida de totais.

## Limites

O tracker distingue mês de criação, calendários de liberação e recebimento bancário. Identidade completa no corte não comprova banco, encerramento do ciclo, saldo a receber ou lucro realizado. SOURCE_MISSING e CALENDAR_MISSING continuam pendências reais até existirem suas evidências. A recuperação automática limitada ao mês imediatamente anterior não promete reconstruir todos os meses antigos.

A memória dos agentes não amplia permissões. Escritas comerciais, Ads/PROMO e provedores pagos mantêm seus controles existentes. Não se presume fechamento integral da fase M2.

## Validação e publicação

Em andamento. Registrar testes, CI, hashes, configuração, observação natural e rollback antes de declarar a entrega publicada.
