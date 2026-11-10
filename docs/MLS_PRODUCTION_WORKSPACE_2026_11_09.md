# Produção diária e fechamento semanal — 09/11/2026

**Produção diária e fechamento semanal — `PUBLISHED_VERIFIED`:** versão `2026-11-09.3`, 09/11/2026. Produção separa Diário e mês, Fechamento semanal, Registrar produção, intervalo e Referência das vendas; DTF continua acessível. Gráficos usam os registros salvos e permitem selecionar por clique ou teclado. Registrar neste dia preenche somente por ação explícita e preserva rascunhos; campos opcionais ficam separados. Conferir este dia abre a declaração existente do intervalo; sexta exige escolher antes ou a partir de 13h. O diário é agregação dos lotes mais declaração de completude, sem novo artefato diário imutável. Ao cruzar o corte semanal, a tela relê o GET existente após tolerância de 65s; reentrada/foco e espera limitada por artefato evitam permanecer numa prévia antiga. App publicado e vetor dos três Workers conferido em 2026-11-09T23:53:15-03:00. Fonte `e1f74f6763a8ebb407402e2808fca2430d12b9a0`, head `85c59749c0f93a909bc5ab00a05013155fab6921`, CI [42744288094](https://github.com/MatheusLemosDS/MLS-Ecommerce-Ads/actions/runs/42744288094) aprovada: 3660 Node e 67 Python; Chromium sintético normal/minificado, 320/1365 e claro/escuro. Consultar a [PR #115](https://github.com/MatheusLemosDS/MLS-Ecommerce-Ads/pull/115) para a integração atual; recibo de publicação não prova merge. Semana preservada: sexta 13h inclusiva → sexta 13h exclusiva, Brasília, com fim de semana e oito intervalos de conferência. Relatório capturado e total declarado conferido são distintos; originais/revisões não são reescritos. Ausência de lotes/custos não vira zero nem fabricação derivada das vendas. Fórmulas, DTOs, Auth/Finance, Hermes, seis agentes, mês/rascunhos e custos cadastrados, incluindo infantil R$ 13,50 verificado na entrega anterior, preservados. Sem novo endpoint, cron ou fato real criado para QA. M2/M2.2 e comparação Seller Centre/banco continuam abertos. [Uso, evidências e limites](#como-usar).

## Como usar

1. Abra **Produção → Diário e mês** (`/admin?tab=agent-production#incurredProductionCalendarTitle`). Escolha mês e data de fabricação. O cartão do dia, o total mensal e o maior custo usam os lotes físicos registrados, com custos históricos conhecidos e pendências separados.
2. Clique em uma barra do gráfico ou use Tab e Enter/Espaço para selecionar o dia. A tabela do mês continua como alternativa acessível. Sem registros, o painel explica a ausência e oferece o próximo passo; não desenha custos inventados.
3. Use **Registrar neste dia** para abrir o registro na data escolhida. A ação não substitui um rascunho editado. Confirme quantidade física, data e custo histórico/fonte do lote; informações opcionais, identidade e contexto DTF ficam no detalhamento. Nenhuma venda, kit ou impressão vira fabricação automaticamente.
4. Use **Conferir este dia** para declarar que os lotes estão todos registrados ou, quando compatível com os fatos, que não houve fabricação. Essa ação abre o intervalo existente, sem salvar uma declaração por conta própria. O envio exige confirmação explícita e motivo. Um dia ainda aberto não pode ser considerado encerrado.
5. Nas sextas-feiras, escolha **Antes de 13h** ou **A partir de 13h**: são metades de semanas diferentes. Conferir uma metade não confirma o dia inteiro. Lotes de sexta sem divisão de quantidade confirmada deixam o custo de ambas as semanas pendente.
6. Abra **Fechamento semanal** (`/admin?tab=agent-production#productionWeeklyClosing`). O intervalo é sexta anterior às 13h até sexta às 13h, em Brasília: início incluído, fim excluído, com sábado e domingo. Consulte o gráfico e a tabela do histórico; compare relatório original, última revisão, prévia atual e total declarado conferido.
7. Para datas livres, use **Consultar intervalo**. As duas datas entram no recorte dos lotes salvos. **Desde segunda-feira** é o atalho de calendário e não a semana de fechamento. **Referência das vendas** aplica custos atuais aos pedidos por data de criação, com base explicitamente separada da fabricação.

## O que significa fechar o dia e a semana

O valor diário é uma agregação do ledger físico pela data declarada da fabricação. A conferência diária reutiliza as declarações auditadas dos intervalos semanais; este incremento não cria um novo relatório diário imutável. Total registrado não prova por si só que todos os lotes da loja foram lançados. Completude depende de declaração explícita, custos históricos conhecidos e cortes de sexta resolvidos.

O total declarado conferido da semana depende dos oito intervalos encerrados e atuais. Um zero só fica confirmado quando as declarações explícitas e as demais condições forem satisfeitas. Dias sem lançamento permanecem desconhecidos, não zero. A última auditoria de dados da entrega anterior encontrou o ledger ausente; isso não prova que a loja nunca fabricou. Sem registro real de datas, quantidades e custos, pedidos e vendas não bastam para reconstruir fabricação exata de semanas antigas.

Relatório semanal capturado e conferência atual têm propósitos distintos. O fechamento original mostra o que foi conhecido no instante da captura. Correções posteriores, lançamentos tardios e distribuição de sexta geram revisões; não reescrevem o original. Uma conferência atual pode estar completa enquanto o relatório original continua documentando NO_RECORDS naquele corte anterior.

## Atualização após sexta às 13h

Foi corrigido o caso em que o painel aberto antes do corte continuava mostrando OPEN até atualização manual. A tela agenda releitura do GET existente cerca de 65 segundos depois do corte, verifica leitura com dez minutos de idade ao reentrar e observa foco/visibilidade. Há intervalo mínimo de 60 segundos entre releituras automáticas. Quando falta o artefato recente ou há revisão pendente, a espera é limitada a aproximadamente dez minutos por tentativa e às primeiras 24 horas após o corte. Sessão, visibilidade, leitura/envio em andamento e tentativa pendente bloqueiam releituras inadequadas; sair da área suspende o timer.

A releitura é somente leitura: não cria o relatório nem executa o cron. O trigger Cloudflare de minuto e a manutenção semanal existentes continuam responsáveis pela captura. O horário real da leitura/captura fica visível; a existência da release não garante uma execução futura do agendador. O primeiro corte natural histórico de 06/11 às 13:00:51 Brasília já observado com NO_RECORDS mantém sua evidência original; esta entrega não fabrica uma nova observação de sexta.

## Compatibilidade e limites

Fórmulas, DTOs, Auth/Finance, fabricação, conferências, originais/revisões semanais, lucro e dados externos permanecem preservados. Não há nova API, migração ou consulta ao provedor para esse rework. Os valores de custo cadastrados não são alterados pela publicação; infantil R$ 13,50 foi verificado na entrega anterior, sem alegar nova leitura D1 neste incremento. Custo físico congelado não é reprecificado silenciosamente por mudar a regra de referência de vendas.

O layout reorganiza a Produção seguindo o estilo aprovado: superfícies, cor do agente, cartões e gráficos responsivos, com estado vazio e pendências legíveis. Os seis agentes da inicial permanecem. A compactação seletiva de whitespace no servidor preserva os scripts do navegador, APIs necessárias, limite de 4 MiB e allowlists exatas; não reduz os testes. QA usa somente exemplos sintéticos locais, sem lotes/declarações reais ou escrita comercial.

Publicação do App conferida em 2026-11-09T23:53:15-03:00. Fonte `e1f74f6763a8ebb407402e2808fca2430d12b9a0`, head `85c59749c0f93a909bc5ab00a05013155fab6921`; CI [42744288094](https://github.com/MatheusLemosDS/MLS-Ecommerce-Ads/actions/runs/42744288094) aprovada com 3660 Node e 67 Python, sem falhas/skips/cancelamentos. Oito resultados Chromium sintéticos normal/minificado ×320/1365 ×claro/escuro vinculados aos hashes dos três Workers. Auth/Finance, configuração, domínios, subdomínios, flags e cron conferidos. Consultar a PR para o estado atual da integração: https://github.com/MatheusLemosDS/MLS-Ecommerce-Ads/pull/115. Aceite operacional real não foi presumido.

```json
{
  "versions": {
    "app": "55d29a3f-f0a8-4481-86a6-bc4cf6715c6c",
    "auth": "ec385ca9-a986-49ec-abab-25a29daaf33b",
    "finance": "9ed0bd7d-269a-4e5f-81d0-63be8c6ac2c4"
  },
  "generated_sha256": {
    "app": "a9f878afc4d89c8d20edcf04b8a8a343bf83fcbd8a327ebc05a5983c8a38b8e0",
    "auth": "47c83f87f191fd0e5ff503d9c4bcf4671cd986b0965e66e84f1a6ed952dac925",
    "finance": "08ada5ecec92350f4f8301fdb7baa00f5f8083a0e8390296b2870e0ff3cdc1a5"
  },
  "published_sha256": {
    "app": "083ea76a0d659579512dc5022f09fdc435d503f1b5f8220e9115ea35f54ac6e7",
    "auth": "2a2c2433c6fba25d1c399991595c96e6b8a85045edb77879c8270c446cb45ad2",
    "finance": "e5bf80e14ff00e5b365bfbcfb25bf3a4dc1e42bf40bb0e4259909649eea1d5cd"
  }
}
```

## Diagnóstico real do agendamento e dos registros

Leitura restrita de metadados/SELECT em 2026-11-09T23:16:16.630618-03:00 confirmou o cron de minuto preservado, tabelas semanais presentes e 13 relatórios salvos. Último tick: 2026-11-09T23:10:51-03:00; último sucesso registrado: 2026-11-09T23:10:51-03:00. Próximo corte configurado: 2026-11-13T13:00:00-03:00. Esse próximo horário é agenda, não prova de execução futura.

O original de 06/11 foi capturado naturalmente pelo cron em 2026-11-06T13:00:51-03:00, como SCHEDULED v1, com status NO_RECORDS e total_cost_cents null; a última versão era a mesma. Isso confirma captura naquele corte, não fabricação zero ou gasto confirmado. As tabelas de estado/registros de fabricação continuavam ausentes nessa leitura: datas, quantidades e custos reais permanecem desconhecidos.

O armazenamento semanal atual não persiste last_error. A ausência desse campo não prova ausência de falhas. A auditoria não executou tick/setup manual, não chamou o proprietário/provedor e não escreveu dados. O relato conserva o corte real da observação, anterior à publicação deste incremento.

## Continuidade do roadmap

M2 — Finance/Returns confiáveis e M2.2 continuam abertos, com M3 Observer em paralelo. Conferir uma semana real com o proprietário e comparar as fontes do mesmo recorte no Seller Centre/banco. Produção dos pedidos vendidos não prova fabricação naquelas datas; estimativa não confirma pagamento nem lucro realizado. Recebimento/reaproveitamento e decomposição histórica de devoluções ainda precisam de evidência antes de valorar ou reservar peças, sem dupla contagem. Ads/PROMO, preço e estoque externo permanecem nos gates existentes.

Preservar [edição dos custos](MLS_EDITABLE_COSTS_2026_11_09.md), [clareza do resultado diário](MLS_DAILY_RESULT_CLARITY_2026_11_09.md), [conferência da fabricação](MLS_PRODUCTION_COVERAGE_2026_11_06.md), [fechamento semanal](MLS_PRODUCTION_WEEKLY_CLOSE_2026_11_03.md) e [auditoria de devoluções/reaproveitamento](MLS_RETURNS_REUSE_ROADMAP_AUDIT_2026_11_01.md). Os recibos históricos mantêm seus cortes originais.
