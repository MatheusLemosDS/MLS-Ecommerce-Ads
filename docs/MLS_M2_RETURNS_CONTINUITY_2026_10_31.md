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
  respeitando pausas, leases, CAS e backoffs. HISTORY mantém no máximo uma leitura privada por oportunidade; Finance
  conserva suas etapas limitadas já existentes e não divide a invocação com
  histórico/auditoria.
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
agenda explícita. A correção passou em 74 casos direcionados de fonte/Worker normal e minificado
e depois na suíte integral; a segunda publicação está conferida abaixo.

O primeiro deployM2 já foi confirmado na versão `ced13c23`, hash publicado
`9321379d41775bee07f820b2bc97dbdf2df9829e416cd9c3ec9226f5400d739c`:
2/2intervalos atuais receberam relatórios, um CHECKED e outro PARTIAL, às
03:01:57 e03:02:58UTC. A quota2 foi respeitada e outras tarefas retomaram.
A coleta às03:06 voltou aRUNNING, zero falhas e sem erro atual. Isso comprova
retomada da auditoria, sem declarar todos os reembolsos ou o banco conciliados.

## Validação e publicação

PR [#88](https://github.com/MatheusLemosDS/MLS-Ecommerce-Ads/pull/88), código
`f1322ffb7ca7fe9595be4414d3148e87e60bae6d`. [CI41163101852](https://github.com/MatheusLemosDS/MLS-Ecommerce-Ads/actions/runs/41163101852)
verde: **2.459 Node, zero falhas/skip e 67 Python**. Mesmos resultados locais.
A suíte ampla inicial revelou quatro cenários que pressupunham a fila antiga;
foram atualizados para observar as reservas naturais, preservando as verificações
de manutenção do mês anterior, cancelamentos, custo infantil e limite de fontes.

Chromium: Worker normal/minificado,1365×900/390×844,claro/escuro,16capturas
específicas Returns identificadas como sintéticas. Cobriu escopo publicado e
limpeza em ACTIVE/manual, gráfico,zero/ausente,parcial/truncado,conflito real,
invalidação de publicação, link real ao Finance e ausência de fetch decorativo.
A revisão independente também cobriu justiça da fila, erros de custo e fonte
ausente, leases/pause/CAS, erros reais após yield e horário de retomada.

Versão final oficial: `c00861cf-68ad-4719-b213-008d7f902069`,100% ativa,
publicada31/10/2026 às03:12UTC. Download via API conferiu o código exato;
configuração integral, flags ownerENABLED,bindings,domínios,cron e compatibilidade
permanecem iguais. Auth/Finance continuam nas mesmas versões/códigos.

| Worker | SHA-256 gerado |
| --- | --- |
| App | `6535b56d5a4548468a4af454c31e72642dd4353f56d8cb918ce902fff0f45bb9` |
| Auth | `1fef431c8573e05563c7938d95be0976a160bc603340084aa747ee0b73e7ec64` |
| Finance | `bfc27e1022e0c5b3d335498389fd64b6978b8f7f04501d3bc6eff38202bf5feb` |

App publicado SHA-256:
`255aa14bb24f460c711ebedf6d554a1a629254737f4ed4c7e458df4a4848329c`.
Manifesto limitado a35paths literais; Auth/Finance/config protegidos.

Tick natural iniciado após a versão final,03:12:52→03:13:15UTC, avançou páginas
19→22, com observações Finance03:13:11/Ads03:13:15, zero falhas e sem erro atual.
A coleta ativa acompanha31/10 em3slots; a publicação segura até30/10 mantém
2/2relatórios. Não foi forçada conclusão, removida pendência real ou disparado job.
CHECKED aqui é conferência de evidência; PARTIAL conserva referências/detalhes
pendentes. Não equivale a retorno ou depósito bancário concluído.

Backups privados preservam versões17bb4a0c(préM2),ced13c23(M2semhotfixdiário)
e c00861cf. Rollback não apaga a tabela aditiva de fairness nem históricos.
Evidências ficam nas pastas ignoradas `live-m2-returns-qa-20261031`,
`live-audit-m2-reconciliation-20261030`, `live-audit-m2-baseline-20261030` e
`live-audit-m2-rollover-baseline-20261030` sob attachments do worktree da prévia.
Nenhum dado de comprador foi versionado; não houve sessão privada real owner
nem bypass do bloqueio Cloudflare1010 deste cliente. Verificação remota foi API/D1.
