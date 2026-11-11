# Pedidos e operação — 11/11/2026

Estado: **VALIDATION_PENDING**. Versão preparada `2026-11-11.1`. Este documento não comprova publicação ou aceite da operação real.

## Problema e entrega

A fila DTF reunia linhas de impressão, com limite de leitura, mas não oferecia um fluxo completo por pedido. Pedidos antigos com todas as impressões concluídas podiam sair da seleção de atualização mesmo com a situação Shopee ainda aberta.

**Pedidos**, no menu principal, abre `/admin?tab=order-operations`. O painel reúne os pedidos salvos no período, com filtros, paginação de cinquenta pedidos, distribuição por etapas e totais calculados sobre o período inteiro. Cada cartão mostra a situação Shopee, a etapa interna, os itens e a idade da fonte. Prévias limitadas de itens ficam identificadas; quantidade desconhecida permanece em conferência.

O operador pode confirmar separação, produção, acabamento e pronto para envio, informando motivo. O histórico preserva as confirmações e correções. Enviado, concluído, cancelado e demais situações da plataforma continuam sendo projetados da fonte Shopee. Se itens ou quantidades mudarem, a confirmação anterior fica para revisão; uma mudança apenas no horário/status da fonte conserva a identidade dos itens.

O painel abre os dados salvos imediatamente e sincroniza periodicamente enquanto estiver visível. Retorno à aba, falhas, respostas atrasadas e tentativas com resposta incerta têm tratamento próprio. A atualização é periódica; o transporte por eventos push continua sendo uma etapa posterior.

## Como usar

1. Abra **Pedidos** e escolha as datas e a etapa.
2. Confira a data da fonte; use a sincronização quando precisar atualizar a situação da Shopee.
3. Abra o pedido, escolha a etapa, informe como a conferiu e confirme.
4. Se outra sessão alterou a operação, revise o rascunho preservado. Se a resposta da gravação ficou incerta, retome a mesma tentativa.
5. Use **Relatórios e produção** para abrir a fabricação por data, o fechamento de sexta às 13h, o Financeiro ou a montagem DTF.

As etapas organizam o trabalho interno. As peças efetivamente fabricadas e seus custos históricos continuam no ledger de fabricação, com confirmação própria. A evolução de um cartão não altera o cálculo financeiro, o estoque externo ou a situação do pedido na Shopee.

## Origem, cobertura e contratos

- Fonte: cache durável `production_dtf_orders`/`production_dtf_lines`, reaproveitando o transporte privado e a sincronização existentes.
- Nova leitura owner `GET /api/admin/order-operations?start_date=AAAA-MM-DD&end_date=AAAA-MM-DD&status=ALL&page=1`; até 31 datas inclusivas em Brasília. Abertura, filtros e paginação fazem somente leitura local.
- Mutação owner `POST /api/admin/order-operations`, com Origin e CSRF conferidos antes do corpo, revisão, identificador idempotente e confirmação explícita.
- Schema operacional criado somente na primeira mutação válida. Eventos imutáveis, revisão global e conferência atômica da fonte protegem concorrência e repetição.
- O resumo descreve os pedidos preservados no recorte. A cobertura completa de todos os pedidos do marketplace continua desconhecida quando não há prova da varredura.
- Mercado Livre e TikTok Shop aparecem como não conectados. O contrato reserva a identidade plataforma/loja/pedido; esses estados não simulam OAuth, pedidos ou permissões.
- Pedidos Shopee ainda abertos voltam a ser revistos mesmo quando todas as linhas DTF já estiverem produzidas.

## Fundação para as próximas entregas

O App anterior ocupava 4.189.227 dos 4.194.304 bytes permitidos pelo projeto. A distribuição dos clientes de navegador passa a usar arquivos públicos com endereço SHA-256 no mesmo domínio, inventário fechado e integridade conferida. As funções financeiras conservam seus bytes e sua ordem de inicialização. O teto do Worker permanece igual.

É uma migração específica para o binding `ASSETS`; os bindings existentes, bancos, domínio, sessão e flags são preservados. A configuração capturada permanece como referência imutável, com autorização adicional vinculada ao hash. O histórico público de assets deve ser registrado somente depois da publicação verificada, conservando os arquivos necessários à página da versão anterior. Assets ausentes ou divergentes falham com diagnóstico próprio.

## Caminho até a 1.0 operacional

| Entrega | Critério para concluir |
| --- | --- |
| Pedidos e operação Shopee | Fluxo interno persistente, atualização, histórico, cancelamento e revisão de mudanças validados na Live. |
| Relatório semanal unificado | Fabricação de sexta 13h a sexta 13h, resultado estimado das vendas e caixa com seus períodos/fontes explícitos; diferença entre bases explicada. |
| Importação Shopee XLSX | Ler o relatório realmente exportado, preservar valores/identificadores e confirmar a prévia. O relatório de renda por pedido deve ser distinguido da transferência bancária agrupada. |
| Próximo marketplace | Autorização oficial da conta, captura inicial, atualização incremental e cancelamento testados num piloto; então repetir para a próxima plataforma. |
| Fechamento financeiro | Comparar um período real com Seller Centre e banco e explicar as diferenças. Os vínculos de arquivos isolados não encerram esse trabalho. |

M2/M2.2 permanecem abertas; operação e conectores podem evoluir em paralelo com as evidências financeiras. Hermes mantém o modo Observador; Ads/PROMO conservam os gates de escrita.

## Validação e publicação

Evidências finais, commit, CI, inventário dos assets, conferência App/Auth/Finance e recibo de publicação serão registrados aqui após os respectivos passos. Nenhum fato real de fabricação, estágio de pedido, banco ou custo é criado para testes.
