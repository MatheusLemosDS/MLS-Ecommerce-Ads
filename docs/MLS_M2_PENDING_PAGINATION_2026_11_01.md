> **Release M2 PR93 publicada — 01/11/2026:** paginação durável do Pending validada na conta: 2 páginas, 182 registros e 182 pedidos. Encerramento e publicação App/Finance conferidos. Navegação local de 50 registros por página, sem novas consultas ao navegar; última lista completa preservada. App `2280e3b1`, Auth `37bead27`, Finance `e0b258a2`. CI 41318567672 verde: 2.908 testes Node, 67 Python e Chromium. Bytes, configurações, domínios, flags e cron conferidos. A varredura concluída não confirma saldo atômico, lucro mensal ou recebimento bancário; M2 e fechamento continuam abertos.

# M2 — coleta completa das páginas do Pending

## Objetivo e base

Continuação autorizada do roadmap na Live, sobre main PR92 `9d0fd3c900f772ea15854c2c348854ad3102977c`. A primeira página foi validada na conta antes desta implementação. Nesta etapa, a travessia de todas as páginas fica salva no Finance, com publicação completa e navegação local no App. Seller Centre e banco continuam sem comparação externa.

Baseline somente leitura de01/11/2026 às14:17UTC: App`c8ab272d`, Auth`109da95f`, Finance`c1e31d3f`, bytes/configurações/domínios/flags/cron preservados. Pending saudável com100registros e continuação. Novembro iniciou naturalmente com4pagos e sem erro. Outubro tem o recorte completo01–31 com357pagos/82cancelados excluídos; ainda faltam3relatórios da mesma publicação,10devoluções e8situações em revisão. O calendário de liberações de outubro ainda tinha corte anterior ao fim do mês. Esses fatos não confirmam fechamento ou liquidação bancária.

## Implementação

- Negociação privada `X-Braza-Income-Contract: pending-scan-v1` no endpoint existente; ausência do header preserva o contrato v1. Operações estritas `read`/`step`, sem cursor ou identidade escolhidos pelo chamador.
- Uma página por execução, mesma assinatura GET validada, limite de duas chamadas incluindo eventual refresh. Cursor e histórico somente no Finance DB; datas congeladas durante a travessia.
- Lease/CAS e transação conjunta para página, cursor e publicação; última lista completa preservada durante atualização, falha e reinício. Retenção limitada à coleta ativa e à publicação vigente.
- O scan termina com cursor explicitamente vazio ou página curta (<100) sem a propriedade `next_page`, conforme a resposta real observada. Página curta com cursor preenchido continua. Página cheia sem metadados e blocos nulos/malformados continuam bloqueados; v1 permanece estrito e compatível.
- Repetição exata deduplicada por entry_hash; entradas divergentes do mesmo pedido geram conflito e impedem confirmar um total. Detecção de cursor cíclico, página repetida, continuação vazia, valores desconhecidos, soma insegura e relógio regressivo.
- Limites explícitos20páginas/1.000entradas/1MiB/uma hora por varredura. Excesso aparece como limite, sem truncar silenciosamente nem substituir a última publicação válida.
- Cache owner local por `income-detail?evidence=scan-v1`; GET não coleta páginas. Scheduler reserva até duas oportunidades antes de ceder às demais rotinas, mantém uma fonte privada e o orçamento existente durante importação, com retry de continuação próprio.
- Navegação local de50linhas por página, sem nova consulta ao mudar página. Progresso, intervalo de observação, última publicação, conflitos e falhas visíveis; o cursor não chega ao navegador.
- Corrigida uma falha preexistente dos validadores legados embutidos no navegador: dependiam de variáveis externas ausentes. Agora são autocontidos, e a data da fonte não é substituída pelo horário de leitura da tela.
- O quadro de fechamento usa o scan completo quando disponível, com motivos precisos para conflito, valor desconhecido ou lista vazia diante de Overview positivo. Totais mensais e contexto comercial do Hermes não recebem o Pending atual.

## Semântica e referências

A Shopee não documenta isolamento da lista enquanto suas páginas são lidas. “Varredura concluída” significa que um dos critérios terminais registrados foi satisfeito, com início/fim e datas das fontes; não é saldo atômico, competência mensal, lucro ou comprovante bancário. Diferenças contra Overview em horários distintos são descritivas. Nenhuma escala monetária foi presumida.

Contrato GET/query e caixa`list`/`next_page`: catálogo público `ttakanawa/shopee-seller-mcp`, commit`8d1a85b4798fa1260678b0524346f79e2d712d1d`. Semântica de cursor vazio e datas apenas para Released: tipos públicos `Naputt1/shopee-v2-go`, commit`7154d46c577ff4ddead62a9b7a904e391debaa0e`. Referências de contrato, sem incorporar bibliotecas ou retries comerciais de terceiros.

## Validação e publicação

Histórico da validação antes da publicação: os testes focados incluem Finance/App/handlers privados, cron normal/minificado, travessia117pedidos com sobreposição, falha após conclusão, privacidade, concorrência, pausa, limites e virada mensal. Chromium320/390/768/1365 verifica50linhas, navegação sem fetch, datas reais das fontes, falhas e respostas antigas. A suíte completa, CI e execução natural na conta ainda devem ser confirmadas antes de declarar a entrega publicada.

Publicar na ordem Finance→Auth→App após CI verde e conferência exata dos três Workers. Preservar configurações, bindings, segredos, domínios, cron, flags owner, backups e rollback. Não há escrita comercial, alteração de OAuth ou confirmação bancária.

A suíte local executou2.901verificações e encontrou duas falhas de QA: data real de novembro contra fixture fixa de outubro no teste ROAS, e medição de abas antes do scroll agendado da navegação principal no AI Sales. Os testes agora fixam a data da fixture e aguardam os dois frames da navegação externa, preservando todas as asserções e sem alterar o runtime. Os7testes focados passaram após a correção;67Python também passaram. CI completo no head final continua obrigatório.

O CI41316622656 passou2.900de2.901verificações e falhou somente na prévia desktop com erro vazio do Chrome. A publicação foi interrompida pelo gate; a Live permaneceu PR92. A reprodução com screenshots passou em desktop/celular. O teste agora preserva fase, comando e código CDP, com uma falha real controlada do Chrome para verificar esse diagnóstico; não remove asserções, aumenta timeouts ou adiciona retries. Os4testes focados passaram. A causa específica do erro anterior não é recuperável pelo registro vazio. O próximo CI terá2.902verificações e continua obrigatório.

## Resposta terminal observada na conta e adaptação do coletor

Após CI41317439222 verde (2.902Node/67Python), os três serviços foram publicados/conferidos. A primeira leitura natural salvou100registros às14:48:00UTC. A continuação às14:49:58 retornou82registros válidos em`response.list`, sem a propriedade`next_page`. O coletor conservador preservou o cursor e sinalizouINVALID_RESPONSE; a estrutura privada confirmou ausência completa do bloco, sem expor corpo, identidades ou cursor.

A adaptação seguinte é SOMENTE no Finance: o leitor interno do scan reconhece a ausência do bloco em página curta(<100) como término, mantendo página cheia sem metadados e blocos nulos/malformados bloqueados. Página curta com cursor preenchido continua. O v1 e o DTO público do scan permanecem iguais. A tabela privada`finance_pending_income_terminal_evidence` registraEMPTY_CURSOR ouSHORT_PAGE_WITHOUT_NEXT na mesma transação da página final/publicação, com retenção limitada. Falha na publicação desfaz também a evidência e os registros finais. A conclusão é declarada pelo critério observado, não falsamente como cursor vazio fornecido pelo provedor.

44testes Finance focados e o caminho gerado/minificado com100+82registros cobrem essa resposta, além de página vazia, página cheia sem bloco, metadados defeituosos, continuação explícita e rollback. Nova publicação Finance-only exige CI verde; nenhuma outra versão será recomposta sem necessidade.

## Publicação e validação final

Fonte final `61094eace3e75b3e979fd1a07bdfa6b4a8b2d70a`, CI 41318567672 verde: 2.908 testes Node e 67 Python, sem falhas ou skips. QA Chromium em 320/390/768/1365 px, normal e minificado. A primeira publicação seguiu Finance → Auth → App com backup e conferência exata após cada etapa; a adaptação terminal foi publicada depois, somente no Finance. Configurações, domínios, flags e cron preservados; uma versão por Worker, com 100% do tráfego.

Versões: {"app": "2280e3b1-a7fa-40fe-842a-4c94c74e5e78", "auth": "37bead27-c941-40e6-87e8-832f01d1785a", "finance": "e0b258a2-e73f-45d2-912a-1cb6fd666e18"}. Gerados/públicos: {"generated": {"app": "9fe5906fc04f231aaddfd2fe8106e338c6aa7a1bd1203500e3b565a8a3892b7e", "auth": "c63ee09b2d98b6321e3ae7feae1066a9eec9160b49868d72fb84cb0471a0018d", "finance": "dff201100ed319f3b7d4d8cabf6826237be3a140e679f562cb982cec5bdd89b4"}, "published": {"app": "5b491267eb1d768fe730c5a9e8ede4b53636d5f679af755579deeaccee182c6f", "auth": "46053d0b5f11ff4d738b4cf2cc1cc6afda7d21e233980b1e640f63728f32af2a", "finance": "b4195212972f5a9f0f8ff08c9504e983f8bd3ca3b3c42493cb7c88addb84de8b"}}.

Prova natural da conta, concluída em 01/11/2026 às 15:01:58 UTC:

- Duas páginas (100 + 82), 182 registros e 182 pedidos distintos, todos BRL e com valores conhecidos.
- Pending estimado: R$ 8.938,28. Sem duplicações ou conflitos; o total coincide com o Overview consultado em outro horário.
- Dos 177 pagamentos salvos comparáveis, os 177 valores coincidem, sem escala aplicada; cinco pedidos não tinham pagamento comparável no cache.
- A página final de 82 registros omitiu `next_page`; a evidência privada `SHORT_PAGE_WITHOUT_NEXT` foi salva na mesma transação da publicação.
- Publicações App/Finance e integridade dos registros conferidas. Nenhum cursor exposto ou job forçado.
- Fontes observadas entre 14:48:00 e 15:01:58 UTC. A Shopee não garante um snapshot atômico entre páginas.

A leitura owner usa somente cache. Navegar entre páginas de 50 registros não consulta a fonte; falhas preservam a última lista completa. A prova agregada fica no diretório privado ignorado `attachments/live-pending-pagination-baseline-20261101/`, arquivo `scan-observation-20261101T150213Z.json`; checkpoints versionados guardam somente os agregados.

Sessão de navegador do proprietário não foi executada: o WAF bloqueia o acesso público do executor, como nas releases anteriores, e nenhum bypass foi usado. QA autenticada local/sintética, testes dos Workers reais gerados e leituras somente agregadas da conta são provas distintas. Seller Centre/banco seguem NÃO COMPARADOS, lucro realizado desconhecido. Próximo foco: retomar Returns do mês anterior com guarda da publicação exata e recuperar fontes expiradas sem reconstruir agregados; completar o calendário antes da confirmação externa.

Rollback coordenado: Appc8ab272d-0b33-4a0e-9fed-aae9c1e38ad9 → Auth109da95f-ced9-41d2-9384-cef8edafc746 → Financec1e31d3f-3c30-4865-bef4-7c66c6923488; tabelas aditivas preservadas e contrato v1 continua legível.
