# M2 — coleta completa das páginas do Pending

## Objetivo e base

Continuação autorizada do roadmap na Live, sobre main PR92 `9d0fd3c900f772ea15854c2c348854ad3102977c`. A primeira página foi validada na conta antes desta implementação. Nesta etapa, a travessia de todas as páginas fica salva no Finance, com publicação completa e navegação local no App. Seller Centre e banco continuam sem comparação externa.

Baseline somente leitura de01/11/2026 às14:17UTC: App`c8ab272d`, Auth`109da95f`, Finance`c1e31d3f`, bytes/configurações/domínios/flags/cron preservados. Pending saudável com100registros e continuação. Novembro iniciou naturalmente com4pagos e sem erro. Outubro tem o recorte completo01–31 com357pagos/82cancelados excluídos; ainda faltam3relatórios da mesma publicação,10devoluções e8situações em revisão. O calendário de liberações de outubro ainda tinha corte anterior ao fim do mês. Esses fatos não confirmam fechamento ou liquidação bancária.

## Implementação

- Negociação privada `X-Braza-Income-Contract: pending-scan-v1` no endpoint existente; ausência do header preserva o contrato v1. Operações estritas `read`/`step`, sem cursor ou identidade escolhidos pelo chamador.
- Uma página por execução, mesma assinatura GET validada, limite de duas chamadas incluindo eventual refresh. Cursor e histórico somente no Finance DB; datas congeladas durante a travessia.
- Lease/CAS e transação conjunta para página, cursor e publicação; última lista completa preservada durante atualização, falha e reinício. Retenção limitada à coleta ativa e à publicação vigente.
- Cursor final explicitamente vazio comprova a conclusão da travessia. Página curta não encerra se há cursor. Parser novo aceita tamanho de retorno coerente até100, incluindo página final menor; v1 permanece compatível.
- Repetição exata deduplicada por entry_hash; entradas divergentes do mesmo pedido geram conflito e impedem confirmar um total. Detecção de cursor cíclico, página repetida, continuação vazia, valores desconhecidos, soma insegura e relógio regressivo.
- Limites explícitos20páginas/1.000entradas/1MiB/uma hora por varredura. Excesso aparece como limite, sem truncar silenciosamente nem substituir a última publicação válida.
- Cache owner local por `income-detail?evidence=scan-v1`; GET não coleta páginas. Scheduler reserva até duas oportunidades antes de ceder às demais rotinas, mantém uma fonte privada e o orçamento existente durante importação, com retry de continuação próprio.
- Navegação local de50linhas por página, sem nova consulta ao mudar página. Progresso, intervalo de observação, última publicação, conflitos e falhas visíveis; o cursor não chega ao navegador.
- Corrigida uma falha preexistente dos validadores legados embutidos no navegador: dependiam de variáveis externas ausentes. Agora são autocontidos, e a data da fonte não é substituída pelo horário de leitura da tela.
- O quadro de fechamento usa o scan completo quando disponível, com motivos precisos para conflito, valor desconhecido ou lista vazia diante de Overview positivo. Totais mensais e contexto comercial do Hermes não recebem o Pending atual.

## Semântica e referências

A Shopee não documenta isolamento da lista enquanto suas páginas são lidas. “Varredura concluída” significa que o cursor terminou, com início/fim e datas das fontes; não é saldo atômico, competência mensal, lucro ou comprovante bancário. Diferenças contra Overview em horários distintos são descritivas. Nenhuma escala monetária foi presumida.

Contrato GET/query e caixa`list`/`next_page`: catálogo público `ttakanawa/shopee-seller-mcp`, commit`8d1a85b4798fa1260678b0524346f79e2d712d1d`. Semântica de cursor vazio e datas apenas para Released: tipos públicos `Naputt1/shopee-v2-go`, commit`7154d46c577ff4ddead62a9b7a904e391debaa0e`. Referências de contrato, sem incorporar bibliotecas ou retries comerciais de terceiros.

## Validação e publicação

Candidato em validação. Testes focados incluem Finance/App/handlers privados, cron normal/minificado, travessia117pedidos com sobreposição, falha após conclusão, privacidade, concorrência, pausa, limites e virada mensal. Chromium320/390/768/1365 verifica50linhas, navegação sem fetch, datas reais das fontes, falhas e respostas antigas. A suíte completa, CI e execução natural na conta ainda devem ser confirmadas antes de declarar a entrega publicada.

Publicar na ordem Finance→Auth→App após CI verde e conferência exata dos três Workers. Preservar configurações, bindings, segredos, domínios, cron, flags owner, backups e rollback. Não há escrita comercial, alteração de OAuth ou confirmação bancária.
