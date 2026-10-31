# Estado final verificado

**Release M2 PR92 publicada — 31/10/2026:** Pending recuperado e primeira página real validada (100 registros; continuação: sim), sem paginação nova. Pendências com evidências para Hermes, checklist de fechamento e navegação responsiva consolidados na Live. App`c8ab272d`, Finance`c1e31d3f`, CI41243934697 verde:2.842Node/67Python/Chromium. Bytes/config/flags/cron conferidos. Seller Centre/banco ainda NÃO COMPARADOS; M2 permanece aberta.

Os registros abaixo descrevem as etapas históricas. O estado final acima e a validação no fim deste documento prevalecem sobre candidatos anteriores.

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

## Causa real identificada e correção preparada

Quietfix publicado App `4c02a354`, fonte `9273f03`, CI41236962815 verde, todos os bytes/configs conferidos. Primeira reserva natural às17:09:57Brasília recuperou `TRANSPORT / FINANCE_INCOME_DETAIL_TIMEOUT`, sem resposta HTTP ou código de permissão. Tentativa e diagnóstico coincidem exatamente; cursores normais preservados, cooldown até17:24:57. O prazo do transporte Pending era5s. Não foi comprovada falha de método ou de autorização.

Correção candidata: prazo padrão e teto10s, compatíveis com o transporte e o coordenador existentes e abaixo dos45s do gateway. Sem retry escondido, sem aumentar o limite de duas chamadas (incluindo eventual refresh), mesmo POST/corpo/assinatura. Testes verificam resposta após6s, cancelamento no limite10s e rejeição de configurações maiores. Metadados de paginação ausentes/nulos ou cursor inválido agora falham explicitamente; cursor vazio explícito continua válido. Nenhuma paginação nova.

Dois achados da revisão final também corrigidos: reembolsos totalmente indisponíveis permanecem desconhecidos em vez de0; código real da causa (por exemplo TIMEOUT) chega ao painel junto do erro externo, por vocabulário fechado. Valores positivos e zeros comprovados preservados, sem mudar o cálculo do lucro. Dados reais com timeout revalidados offline na publicação14954/3fontes; banco continua NÃO COMPARADO.

A interpretação inicial dos metadados capturados como prova dePOST estava incorreta: os mesmos valores0/2 aparecem nos endpointsGET já funcionais. O SDKGo usaPOST, incluindo indevidamente get_escrow_list, enquanto SDKsTypeScript/PHP usamGET. O método precisa ser validado na conta. Resposta e lista ainda exigem validação na execução real após a publicação do ajuste do prazo.

O CI41237974807 encontrou somente duas falhas de tipografia na nova QA320px com fontes mais largas do runner; Finance e as demais validações Node passaram. Publicação Finance não ocorreu, pois o gate encerrou o script. Correção responsiva: até360px, somente o cartão de situação ocupa a linha inteira; cartões numéricos continuam em duas colunas. As asserções de encaixe foram preservadas, com medidas explícitas para diagnóstico.7 testes de layout/Chromium passaram localmente; novoCI completo exigido. A suíte local anterior passou2.831Node/67Python.

## Formato real de retorno

A versãoFinance `53c27861`, publicada e conferida às17:30:03 com CI41238683919 verde (2.831Node/67Python), alcançou JSON válido às17:42:00. A causa mudou para `PROVIDER_RESPONSE / INVALID_RESPONSE / INCOME_CONTAINER_MISSING`: o coletor aceitava somente contêiner na raiz.

Correção candidata reconhece somente variantes explícitas dos contratos públicos: uma origem na raiz ou em `response`; uma caixa objeto ou array com exatamente uma caixa; um único array `list` ou `income_detail_list_item`. Origens/aliases simultâneos, várias caixas, identidades conflitantes e paginação ausente continuam inválidos. Descrição/forma de pagamento opcionais nulas permanecem desconhecidas. MesmoPOST, prazo10s, limites monetários e de chamadas.29 testes focados e8 testes dos três Workers gerados/minificados passaram. Nenhuma escala monetária foi presumida: o schema público definefloat e não documenta divisor100000.

Nova lista real ainda deve ser validada antes de publicar o conjunto visual. A confirmação monetária usará comparações agregadas entre hashes de pedidos e pagamentos salvos, sem divulgar identidades.

## Comparação controlada do método e telemetria privada

A tentativa17:58:58 na Finance `bf014004` permaneceu `INCOME_CONTAINER_MISSING`, mesmo após os seletores explícitos. O CI41240722219 passou2.835Node/67Python, porém a lista real não foi declarada válida.

A checagem cruzada mostrou que `is_get_method:0,method:2` não determina o verbo: os mesmos valores existem em IncomeOverview/EscrowList/EscrowDetail que já funcionam comGET. O helperGo fazPOST real, mas tem erros demonstrados de método; os SDKsTS/PHP usamGET. O novo candidato envia uma única consultaGET com os cinco parâmetros na URL e a mesma assinatura, preservandoPOST nos transportes privados App/Auth/Finance, prazo10s e teto de duas chamadas incluindo refresh. Não há fallback, retryextra nem mudança monetária.

Durante a consulta existente, o Finance registra somente uma projeção de48caminhos fixos com tipos/contagens numa tabela privada singleton `finance_income_detail_structure_probe`, até16KiB. Não registra valores, mensagens, nomes arbitrários de chaves, pedidos, identificadores, tokens ou corpo bruto. Persistência ocorre depois que o transporte encerra o prazo; falha diagnóstica não muda o resultado original.32 testes focados e8gerados/minificados passaram, incluindo assinatura/query completa, limite, privacidade e ordem das atualizações. O GET permanece candidato até resposta real válida.


## Caixa canônica direta e correção do prazo de retomada

GET real às18:21:58Brasília na Finance `32af945d` alcançou JSON com quatro campos na raiz e dois em`response`, sem`income_detail_list`. O catálogo público de `ttakanawa/shopee-seller-mcp`, commit`8d1a85b4798fa1260678b0524346f79e2d712d1d`, declara o conteúdo canônico com`list` e`next_page`. O candidato reconhece essa caixa diretamente na raiz ou em`response`, reutilizando todas as validações e rejeitando formas simultâneas. Nenhum alias arbitrário foi adicionado. A telemetria privada v2 acrescenta caminhos fixos dos tipos dos campos, e somente presença de nomes de envelope de um vocabulário fechado; nomes desconhecidos viram contagem, nunca texto.

A reserva do App passa a respeitar o retry da fonte e o cooldown global15min sem exigir também que a última falha ordinária tenha15min de idade. Essa exigência redundante adiava as recuperações sem novas chamadas. Orçamento, leases e cursores são preservados. O candidato ainda exige CI verde e uma página real válida; paginação não foi implementada.


## Validação e publicação final

Fonte86c6caa e CI41243934697:2.842Node/67Python, zero falhas/skips e QA Chromium320/390/768/1365 normal/minificado. Finance`c1e31d3f-3c30-4865-bef4-7c66c6923488` e App`c8ab272d-0b33-4a0e-9fed-aae9c1e38ad9` publicados, Auth`109da95f-ced9-41d2-9384-cef8edafc746` preservada nesta última etapa; os três bytes/configs/domínios/flags/cron exatos e versões únicas100% conferidos. Backups privados preservados.

Primeira página natural: 100registros, 100pedidos distintos, 100entradas distintas, 100emBRL; 100valores conhecidos/0desconhecidos; has_more=True. Estrutura direta`response.list/next_page` comprovada. Comparação agregada com pagamentos salvos: `{"matched": 99, "exact_major_unit_match": 99, "unmatched": 1}`. Nenhuma escala foi aplicada. É uma fotografia atual do Pending, não total histórico mensal nem comprovante bancário.

O painel existente agora mostra motivo/quantidade/valor informativo/base/fonte/data/próxima ação, sete critérios para preparação do mês, o mesmo contexto para Hermes e links funcionais. A navegação remove duplicações e agrupa funções avançadas, respeitando teclado, toque e movimento reduzido. Paginação não foi adicionada; o restante da lista continua uma tarefa explícita. Preparação concluída não significa fechamento confirmado: Seller Centre e banco continuam NÃO COMPARADOS e lucro realizado desconhecido.

O acesso HTTP público do executor continua recebendo403 do WAF Cloudflare, como na release anterior; nenhum bypass foi usado. QA de navegador autenticada normal/minificada usa dados sintéticos e a verificação de fontes reais salvas ocorre offline. A conferência Cloudflare comprova o código/configuração publicados, sem simular sessão real do proprietário.
