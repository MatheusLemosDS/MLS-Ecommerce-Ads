# M2 — Pending, pendências do Hermes e preparação do fechamento

Pedido do proprietário de 31/10/2026: corrigir o detalhamento Pending e validar a lista antes de paginação; consolidar pendências financeiras para o Hermes; preparar o fechamento de um mês; simplificar a navegação no estilo navy/neon aprovado.

## Etapa 1 — diagnóstico da falha

Candidato sobre main PR91 `8b0edb28`. A leitura Live de 16:36:58 Brasília confirmou os três Workers e configurações atuais, Pending Overview de R$ 8.375,15 e ausência de lista válida. A causa não estava no registro: Finance, Auth e App substituíam a falha upstream por códigos genéricos.

Correção preparada: vocabulário fechado de estágio/HTTP/código do provedor/formato estrutural, projeção segura nos três Workers, tabela lateral aditiva associada à tentativa exata, preservação do DTO v1 e último resultado válido. A API owner aceita `income-detail?evidence=diagnostic-v1`; a leitura padrão permanece compatível. Nenhum corpo, mensagem arbitrária ou identidade de pedido entra no erro.

POST, assinatura e corpo foram conferidos com os contratos públicos pesquisados. Método/datas e cursor da requisição permanecem iguais. Não há paginação nova; uma lista sem metadados de completude continua exigindo validação antes da próxima etapa. O diagnóstico publicado deve ser observado em tentativa natural para corrigir a causa concreta, sem forçar jobs ou alterar cursores.

## Sequência autorizada

1. Publicar o diagnóstico validado nos três Workers e observar o motivo real; corrigir a causa e validar os pedidos retornados.
2. Reutilizar o painel de conciliação para uma lista consistente de motivos, quantidade, valor conhecido informativo, fonte e próxima ação; disponibilizar o mesmo contrato ao Hermes.
3. Preparar checklist de repasses, devoluções, produção, anúncios e despesas com a mesma publicação mensal. Seller Centre e banco permanecem NÃO COMPARADOS até existir evidência real.
4. Integrar a navegação revisada depois da validação financeira: uma navegação global estável, atalhos funcionais, detalhes acessíveis e testes Chromium desktop/mobile.

## Publicação e proteção

A autorização Live é persistente. A exceção de caminhos protegidos cobre apenas os arquivos literais desta correção Pending, sem liberar outros arquivos Finance/Auth, infraestrutura ou originais. Hashes exatos dos três Workers e configurações, flags, cron, backups e rollback devem ser conferidos antes/depois. Escritas comerciais continuam bloqueadas. A prévia visual permanece sintética.

Status: candidato de diagnóstico em validação; ainda sem publicação deste incremento. M2, validação de Pending e fechamento bancário continuam abertos.

## Publicação do diagnóstico e espera da fila

Código `a2427c2`, CI41235375476 verde, 2.791 Node/67 Python. Publicado às16:47Brasília: App `03808a63`, Auth `109da95f`, Finance `3b7dec8b`. Verificação pós-publicação às16:47:15 confirmou os três bytes brutos exatos (`dcbfd744…`, `1b660c4f…`, `6fba6e9d…`), versões únicas100%, domínios/config/flags/cron e backups. A falha original ainda não foi reexecutada pelo rodízio; isso não valida a lista.

A observação real mostrou fila financeira parada em Returns desde16:36, enquanto as outras auxiliares e coletas avançavam. Combinar cinco auxiliares com o rodízio de auditorias pode adiar o primeiro detalhe Pending por horas. O próximo candidato reserva uma oportunidade auxiliar já existente para primeiro detalhe ou falha vencida (inclusive último resultado válido preservado): cooldown global15min, retry original, orçamento4leituras/300s durante importação, lease/pausa/virada mensal e apenas uma chamada privada preservados. A reserva não avança nem reinicia os cursores normais.

30 testes focados aprovados, incluindo cron gerado/minificado. Suíte completa e CI deste segundo candidato ainda devem ser confirmados antes da publicação.

A reserva foi publicada no App `b1bc00f3`, código `e9cb6c6`, CI41236234686 verde:2.801 Node/67 Python. Pós-check16:58:29Brasília confirmou bytes `c6348452…`, Auth/Finance e demais configurações. A observação17:00:26 revelou uma borda adicional: retries Finance ainda não vencidos permitem auxiliares normais que renovavam o relógio300s, adiando a reserva. Correção preparada: usar esse relógio apenas no orçamento de importação ativa; no intervalo ocioso a reserva segue o próprio cooldown15min. O cenário real passou no cron gerado, mantendo uma chamada e cursores normais. Lista Pending ainda não validada.

## Pendências, fechamento e navegação — candidato integrado

Nova API owner `GET /api/admin/finance/closeout?month=AAAA-MM` compõe somente fontes salvas. O relatório fechado mostra motivo, quantidade, valor informativo e base, responsável, fonte/data e próxima ação. Revisão da publicação completa e versões dos custos impedem misturar coortes. Pending atual é separado do mês; reembolso informado não vira novo desconto. Os sete critérios cobrem calendário, repasses/ajustes, devoluções/situações, produção, anúncios, imposto e despesas. Seller Centre e banco permanecem NÃO COMPARADOS e lucro realizado desconhecido.

O painel existente de repasses/devoluções recebe o relatório, links e cópia JSON. Falha de um cliente opcional não impede inicialização, observação ou parada dos demais. Hermes usa o mesmo construtor para acrescentar evidências nas tarefas mensais existentes, respeitando o contrato v1/fingerprint/12KiB e preservando jobs antigos; nenhum grant ou ação comercial foi adicionado. Pending global não é forçado para dentro de uma ação mensal.

Validação offline com snapshot real atômico de16:52:01Brasília: publicação14927,3/3fontes da conciliação e todas as unidades com produção identificada; nove pedidos em revisão/nove devoluções ainda abertos. Bases mensais idênticas quando Pending atual é omitido e valores de outra publicação suprimidos. Essa leitura não é confirmação do banco.

Navegação global estável nos especialistas, barra contextual única, ações avançadas agrupadas e destinos deduplicados. Atalhos abrem workspace/detalhes corretos e preservam mês/histórico/foco. Menu fecha com Escape/clique externo, camada sticky fica abaixo do cabeçalho e ancoragem se estabiliza por até5s enquanto o layout salvo monta, cessando ao gesto do usuário. Movimento reduzido respeitado.

QA sintética autenticada desktop/mobile em320/390/768/1365, Worker normal/minificado: título/botão não encobertos, item do menu clicável, nenhum overflow, bootstrap sem banner de erro, relatório tipado e cópia JSON exata. Suíte integrada local:2.821Node/0falhas/0skips; regressão adicional da espera ociosa e integrações:17/17. CI e publicação do conjunto final ainda pendentes; lista real Pending continua primeiro gate.

A corrida pré-existente do teste Chromium da prévia (porta DevTools aberta antes de existir uma página) foi corrigida com espera limitada pela página real, sem remover nenhuma asserção nem alterar a prévia sintética.
