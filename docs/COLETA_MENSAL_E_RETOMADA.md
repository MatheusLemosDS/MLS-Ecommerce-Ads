# Coleta mensal e retomada

O estado observado em produção mostrava 100 pedidos em 20 páginas, nenhuma janela concluída e uma leitura financeira com aproximadamente 38 minutos. O coletor confundia `FINANCIAL_SOURCE_STALE`, durante `RUNNING`, com falha da fonte. Isso elevou o contador de falhas a quatro e adiou a próxima tentativa por 30 minutos.

A antiguidade continua bloqueando o resultado financeiro, mas não aplica o intervalo de falha enquanto a coleta avança. Uma leitura em andamento volta no intervalo normal de cinco minutos. Falha real da fonte continua sujeita ao intervalo progressivo. O código também reconhece o estado antigo afetado e pode retomar antes do horário adiado: exige que o resumo seja da própria tentativa, esteja em andamento e não indique falha da fonte.

Cada página financeira passa de cinco para até 20 pedidos, com até quatro consultas de pagamento simultâneas. Os limites de 1.000 pedidos por janela e 200 páginas permanecem. A última página respeita o espaço restante, sem cortar pedidos de uma resposta nem avançar um cursor parcialmente processado. Páginas, cursores e valores já persistidos são preservados na retomada.

Os contratos aceitam as leituras antigas de cinco pedidos por página. As novas leituras informam a capacidade da página; o resumo mensal agrega essa capacidade para validar a cobertura sem confundir páginas maiores com dados inválidos. App, Auth e Finance precisam receber a mesma atualização do contrato.

A fila de identificação dos produtos continua sendo alimentada durante a coleta. Nesse caminho interno, o enfileiramento não carrega a lista de produtos e variações que será descartada pelo chamador. Isso reduz consultas ao banco por etapa, preservando as respostas completas das rotas de catálogo.

Uma falha na interface mantém os valores parciais conhecidos, encerra o indicador de consulta ativa e permite retomar. O diagnóstico usa apenas etapa, código seguro e status HTTP. Respostas da Shopee, códigos de autorização, dados dos pedidos, URLs privadas e tokens não são exibidos.

Concluir a coleta não equivale a conciliar o lucro. Cancelamentos e pedidos não pagos ficam excluídos das vendas consideradas. Devoluções, situações não reconhecidas, pagamentos ausentes e custos incompletos continuam impedindo um resultado final. O DAS-MEI mensal é descontado uma vez; a antiga estimativa de 2% por nota não representa a política tributária atual.

Os testes locais usam fontes simuladas e banco SQLite compatível com a interface D1. Verificam retomada, concorrência, contratos antigos, cobertura e cálculos; não comprovam o término da coleta na conta real. O endpoint autenticado `/api/admin/finance/sync-state` permite conferir esse progresso depois da publicação.

## Recuperação automática e identificação dos produtos

A revisão seguinte reproduziu uma falha mais específica: um Payment recusado descartava todos os pagamentos válidos daquela página. O Finance agora mantém um cache privado de até 20 pagamentos validados por execução, limitado a 1 MiB. Uma retomada confere novamente o status e os itens do pedido e reaproveita somente entradas compatíveis, preservando o horário da leitura original. Esse cache não participa dos totais antes de a página completa ser validada e gravada atomicamente.

As chamadas externas têm orçamento de 20 segundos por etapa, incluindo margem para persistir o checkpoint. Consultas D1 já iniciadas não são canceladas de maneira especulativa: sua latência pode ultrapassar esse orçamento. Auth usa prazo de 35 segundos nessa rota; App preserva 45 segundos e o navegador, 90. Checkpoint e disputa de lease indicam espera normal. Rate limit, timeout e indisponibilidade têm esperas persistidas, enquanto autorização necessária e dados inválidos permanecem bloqueados.

Depois de uma falha ambígua, a interface observa o estado salvo por GET antes de avançar. Ela retoma etapas de coleta com espera e limite de oito tentativas sem progresso; após esse limite, continua observando o avanço do coletor do servidor. Pausa, página oculta e edição de despesas impedem avanço automático. Uma conclusão financeira observada pode iniciar a primeira consulta de anúncios que ainda faltava; uma solicitação de anúncios ou despesas com resultado ambíguo não é repetida automaticamente.

Todos os produtos vendidos entram na fila automática mesmo durante uma coleta parcial e mesmo quando já têm custo. Uma falha dessa fila não invalida os valores financeiros. Camisetas adultas, plus e kits identificados mostram seu custo diretamente; o formulário de regra infantil deixa de aparecer como ação principal nesses produtos. Correções manuais continuam preservadas, e regras indisponíveis não são substituídas silenciosamente pela primeira opção.

A [pesquisa de arquitetura e referências públicas](PESQUISA_COLETA_AUTOMATICA.md) registra as fontes, licenças e limites observados. A validação inclui o caminho App → Auth → Finance compilado normal e minificado, falhas por pedido, retomada sem duplicação e disputa entre navegador, cron e catálogo.

## Pausa durante o encerramento da coleta

Uma pausa podia ser confirmada entre a última leitura do estado e a gravação
final da execução. A coleta seguinte permanecia desativada, mas a execução que
estava terminando podia substituir `PAUSED` por `COMPLETE` ou `ERROR`, inclusive
na auditoria. O encerramento agora resolve o estado de pausa na mesma transação
que libera a lease, preserva o último sucesso anterior e registra o estado
efetivamente salvo.

Uma retomada confirmada nesse intervalo mantém a agenda definida pelo
proprietário. A execução anterior não pode liberar uma lease que já pertence a
outra execução. As regressões reproduzem pausa em conclusão normal e falhas,
retomada concorrente e substituição do token, usando o banco de teste D1.

## Conferências da mesma publicação

As seções de devoluções e liberações usam a identidade da publicação que gerou
o resumo exibido. O cliente atual negocia `business-month-view-v2`; o formato
anterior permanece disponível para abas abertas antes da atualização. O novo
campo reúne revisão da publicação, período e IDs/revisões das fontes. Uma
resposta de outra publicação não substitui as evidências exibidas, mesmo que
seus totais sejam iguais. Consultas manuais parciais suspendem essas seções até
que exista novamente um resumo publicado com identidade correspondente. Abas
ocultas também invalidam respostas antigas, sem iniciar consultas novas.

## Abas abertas durante uma publicação

O campo novo `collection` revelou uma incompatibilidade com a validação estrita do cliente anterior. O teste com o código de `d487da7` reproduz a rejeição no início da atualização, sem erro HTTP, preservando o resumo já mostrado. A versão atual aceita o mesmo conteúdo.

A rota mensal agora negocia o formato por `X-Braza-Client-Contract`. Clientes atuais enviam `business-month-v2` e recebem a retomada automática; requisições sem esse cabeçalho recebem o formato `business-month-v1`, com os mesmos valores financeiros e sem o campo desconhecido. Uma espera normal interrompe o laço do cliente antigo, evitando consultas repetidas enquanto outro coletor trabalha. A resposta informa seu contrato, mantém `no-store` e usa `Vary` nesse cabeçalho. Os diagnósticos atuais também identificam a versão do cliente.
