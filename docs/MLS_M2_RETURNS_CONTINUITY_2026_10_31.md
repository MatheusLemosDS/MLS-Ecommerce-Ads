# M2 — continuidade das auditorias e evidências de devolução

Base: main PR87 `51b2dfea4ef87f114d21ecde3d6f0cb66e98bdda`.
O proprietário autorizou continuar o roadmap na Live. M2 permanece aberta;
nenhuma escrita comercial ou confirmação bancária é habilitada.

## Problema verificado

SELECTs da conta em31/10/2026,02:39–02:45UTC confirmaram publicação com421
pedidos,334pagos,9pagos com devolução e9em revisão. Nenhum dos dois intervalos
atuais tinha relatório de devoluções compatível com run/revisão; havia relatórios
antigos e detalhes de11solicitações já salvos, sem erro de permissão registrado.
Na última hora houve28execuções financeiras e nenhuma tentativa Returns nova.
O histórico de custos permanecia READY e ocupava HISTORY, com o turno financeiro
parado em RETURNS. Não se tratava de refazer o cadastro de toda a loja.

Além dessa espera, o Registry comparava valores apenas pelo mês. Durante troca
de publicação, caches de liberações e devoluções podiam pertencer a versões
diferentes e produzir um bloqueio falso de divergência monetária.

## Incremento

- Garantir oportunidades limitadas às auditorias sobre a publicação completa,
  respeitando pausas, leases, CAS e backoffs. Continua no máximo uma leitura
  privada por oportunidade; não acumular Finance, histórico e auditoria.
- Alternar histórico de nomes e auditoria, preservando o progresso financeiro
  e evitando que um candidato persistente ocupe indefinidamente HISTORY.
- Comparar repasses somente com publicação, intervalos, run/revisão e horários
  compatíveis. Dados antigos geram espera; conflitos reais continuam bloqueando.
- Mostrar no MLS Returns situações das solicitações identificadas, contagens
  por coorte, valores informados e cobertura. Usar apenas snapshots validados
  existentes; não criar consulta de rede decorativa nem gráfico de motivos sem
  esse dado. Fonte ausente ou parcial permanece explícita.

## Limites e próximas ações

Reembolso solicitado/informado é evidência descritiva, sem nova dedução no
repasse após ajustes. Solicitação aceita, encerrada ou com status REFUND_PAID
não comprova banco. Pedidos em revisão continuam fora da coorte paga. Nenhuma
regra de resultado mensal ou critério de lucro realizado foi removido.

A auditoria também encontrou o tracker de calendários posteriores de liberação
sem chamada no agendamento atual. Integrá-lo será outro incremento M2, com o
mesmo orçamento de leitura e validação de competência/identidade; sua presença
no código não comprova execução. M2 requer explicação das diferenças materiais
com Seller Centre e banco antes do fechamento estrito.

A publicação automática Cloudflare de feature branches continua sem causa exata
comprovada. A API de Builds retorna403; a documentação oficial exige token de
usuário com Workers Builds Configuration: Edit, além de Workers Scripts: Read
para descobrir o script_tag. Isso é diferente do token usado pelo build para
publicar. A entrega oficial continua via Wrangler e conferência independente.

## Virada diária observada durante a publicação

A execução das02:59:52–03:00:01UTC cruzou a meia-noite de Brasília antes do
deploy. O coletor mantinha apenas o mês, mas o intervalo mudou de30para31;
`BUSINESS_MONTH_START_REQUIRED` local acabou registrado como falha genérica.
Não houve erro de provider registrado. O retry normal das03:05 recuperou o
progresso, sem execução forçada. A nova correção fixa a identidade do dia para
esta execução, preservando o relógio real: guarda a página já recebida, interrompe
as próximas chamadas e retoma por start com o intervalo novo. Erros genuínos
continuam com backoff, e uma pausa/retomada durante a chamada não perde a sua
agenda explícita. A correção está validada em74casos direcionados de fonte e
Worker normal/minificado, aguardando a suíte integral e a segunda publicação.

O primeiro deployM2 já foi confirmado na versão `ced13c23`, hash publicado
`9321379d41775bee07f820b2bc97dbdf2df9829e416cd9c3ec9226f5400d739c`:
2/2intervalos atuais receberam relatórios, um CHECKED e outro PARTIAL, às
03:01:57 e03:02:58UTC. A quota2 foi respeitada e outras tarefas retomaram.
A coleta às03:06 voltou aRUNNING, zero falhas e sem erro atual. Isso comprova
retomada da auditoria, sem declarar todos os reembolsos ou o banco conciliados.

## Validação e publicação

Em preparação. Registrar resultado real de testes, CI, hashes, versão Live,
backup e continuidade de Returns após o deploy. Evidências reais permanecem
privadas; fixtures e capturas do repositório são sintéticas identificadas.
