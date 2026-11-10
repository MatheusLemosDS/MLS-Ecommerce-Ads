# Conciliação com extrato Nubank — 10/11/2026

<!-- NUBANK_CASH_RECONCILIATION_CURRENT -->
**Conciliação com extrato Nubank — `CANDIDATE_VALIDATION_PENDING`:** versão `2026-11-10.1`, 10/11/2026. Candidato em preparação sobre a main da PR #115 (`f451c15ec1b96abaa6315457324ccaa31c8d361c`). Em MLS Finance, Banco e transferências reúne a prévia local de extrato Nubank CSV/OFX e transferências Shopee CSV, importação explícita das linhas conferidas, sugestões e confirmação/desfazer de vínculos. Datas do dinheiro ficam separadas das datas dos pedidos; o confronto não altera o lucro previsto nem comprova autenticidade bancária ou fechamento do mês. O novo armazenamento privado no Finance só é criado ao importar pela ação do proprietário. Validação completa, QA Chromium, CI, PR, hashes finais, publicação e merge deste candidato ainda não foram comprovados. A Live anterior permanece `2026-11-09.3`; captura GET-only em 10/11/2026 às 13:01:59 Brasília confirmou os três Workers, configurações, domínios, subdomínios, flags e cron. Nenhum extrato real foi importado nesta preparação; M2/M2.2 e o confronto operacional Seller Centre/banco continuam abertos.
<!-- END_NUBANK_CASH_RECONCILIATION_CURRENT -->

## Uso previsto

Após a publicação e a conferência técnica deste candidato:

1. Entre como proprietário e abra **MLS Finance → Banco e transferências**. A busca também oferece esse destino, no painel Finance.
2. Escolha o extrato CSV ou OFX do Nubank e use **Conferir este arquivo**. O arquivo original é lido no navegador. Confirme que pertence à única conta Nubank da loja usada no confronto.
3. Confira formato, separador, datas, sinais e colunas. No CSV de transferências Shopee, indique as colunas e a situação concluída exata, quando houver; confirme que as linhas selecionadas são transferências concluídas para a mesma conta. Exporte arquivos UTF-8 de até 5 MiB.
4. Use **Preparar prévia sem salvar**: apenas as linhas selecionadas e normalizadas são enviadas ao serviço privado para conferir duplicadas, sem gravação. Confira todas as páginas e revise a seleção e os avisos de duplicidade. Alterar a seleção invalida a prévia anterior. Somente depois de marcar a conferência, use **Importar linhas conferidas**; essa ação confirma a gravação das linhas normalizadas e seus identificadores de evidência.
5. Consulte os registros salvos pelo mês dos movimentos. Datas próximas, valor igual e referência compartilhada oferecem sugestões para revisão; o sistema não confirma um recebimento automaticamente.
6. Confira um crédito Nubank e uma transferência Shopee, informe o motivo e confirme o vínculo. A seleção manual permite conferir movimentos de páginas ou meses diferentes. Valores divergentes, agrupamentos e origens incertas permanecem em revisão.
7. Para corrigir uma confirmação, use **Desfazer**, informando o motivo. Os movimentos importados e a auditoria são preservados. Em conflito de revisão ou sessão encerrada, releia o estado antes de tentar outra alteração.

## Escopo e limites

O recurso confronta evidências declaradas pelo proprietário. Não conecta o banco, consulta a API da Shopee, comprova a autenticidade de um arquivo nem promove uma sugestão a recebimento confirmado. CSV de cartão não deve ser usado como extrato da conta. O confronto segue a data do dinheiro, que pode pertencer a um mês diferente da criação do pedido.

O arquivo original permanece no navegador; registros normalizados, identificadores e descrições das linhas importadas ficam no armazenamento privado do Finance. Abrir a tela ou ler um workspace sem estrutura não cria as tabelas. A criação ocorre somente após importação explícita do proprietário. Replay e revisão protegem as operações; colisões e linhas ambíguas precisam ser revistas, sem presumir que todo valor repetido seja o mesmo movimento.

Os vínculos não reescrevem repasses, devoluções, produção, custo, lucro previsto, estoque, originais semanais ou dados dos pedidos. Dados ausentes continuam desconhecidos. As seis cartas de agentes e os controles de mês, rascunhos e produção permanecem no escopo da regressão. Ads/PROMO e demais escritas comerciais seguem os gates existentes.

## Estado da preparação

A base confirmada é a main `f451c15ec1b96abaa6315457324ccaa31c8d361c`, merge da PR #115. A captura oficial GET-only dos três Workers terminou em `2026-11-10T16:01:59Z`, com os bytes e versões da Live anterior exatos: App `55d29a3f-f0a8-4481-86a6-bc4cf6715c6c`, Auth `ec385ca9-a986-49ec-abab-25a29daaf33b` e Finance `9ed0bd7d-269a-4e5f-81d0-63be8c6ac2c4`. Configuração, domínios, subdomínios, flags e cron coincidiram com a evidência anterior. Essa leitura não consultou D1, endpoints do proprietário, provedor ou extratos.

Os auxiliares privados propostos exigem os três hashes gerados, os três hashes de publicação, CI e head exatos, lista literal dos arquivos protegidos e QA sintética vinculada às três fontes. A ordem prevista é Finance → Auth → App, com conferência do vetor completo dos três Workers após cada etapa. O teto de 4 MiB das fontes geradas permanece. Não há repetição automática, rollback automático, migração manual ou importação real executada pelos auxiliares.

Validação e provas finais ainda estão pendentes. O contrato de QA prevê normal/minificado ×320/1365 ×claro/escuro, incluindo prévia local, importação explícita, duplicidade, confirmação/desfazer, replay, conflitos e os seis agentes. Só o recibo de publicação pode comprovar a nova Live; merge Git exige evidência própria. M2/M2.2 e o aceite do confronto real pelo proprietário permanecem abertos.
