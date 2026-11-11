# Pedidos e operação — 11/11/2026

Estado: **PUBLISHED_VERIFIED**. Versão oficial `2026-11-11.1`, conferida em **11/11/2026 às 16:54:57 Brasília**. A publicação foi comprovada; o uso e aceite da operação real pelo proprietário continuam separados. A [PR #117](https://github.com/MatheusLemosDS/MLS-Ecommerce-Ads/pull/117) registra a integração Git atual.

## Problema e entrega

A fila DTF reunia linhas de impressão, com limite de leitura, mas não oferecia um fluxo completo por pedido. Pedidos antigos com todas as impressões concluídas podiam sair da seleção de atualização mesmo com a situação Shopee ainda aberta.

**Pedidos**, no menu principal, abre `/admin?tab=order-operations`. O painel reúne os pedidos salvos no período, com filtros, paginação de cinquenta pedidos, distribuição por etapas e totais calculados sobre o período inteiro. Cada cartão mostra a situação Shopee, a etapa interna, os itens e a idade da fonte. Prévias limitadas de itens ficam identificadas; quantidade desconhecida permanece em conferência.

O operador pode confirmar separação, produção, acabamento e pronto para envio, informando motivo. O histórico preserva as confirmações e correções. Enviado, concluído, cancelado e demais situações da plataforma continuam sendo projetados da fonte Shopee. Se itens ou quantidades mudarem, a confirmação anterior fica para revisão; uma mudança apenas no horário/status da fonte conserva a identidade dos itens.

O painel abre os dados salvos imediatamente e sincroniza a cada 60 segundos enquanto estiver visível, respeitando a espera informada pela fonte. Retorno à aba, falhas, respostas atrasadas e tentativas com resposta incerta têm tratamento próprio. A atualização é periódica; o transporte por eventos push continua sendo uma etapa posterior.

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

Fonte publicada: `0e086c13e8058c6aa96b2465f0782879c8bdbbeb`, preparada em `e3a29e5ef122235f5ad67848fe63d96cc3dbbe22`, base main PR116 `eab85a17d7a6c4f213e67ce0b7dea0cf63932bf2`. [Validar Workers 43087471264](https://github.com/MatheusLemosDS/MLS-Ecommerce-Ads/actions/runs/43087471264), job `130755723340`, aprovada: **3.833/3.833 Node**, sem falhas, skips ou cancelamentos; **67 Python**, três builds e preflight. O registro completo da CI foi preservado com proveniência SHA `e6641528b2a21bff394a87499f62cdf01c81eb785c3110f63ef8137f4ffb9f21`.

QA local no App compilado normal/minificado, 320/1365 e claro/escuro: oito perfis, três falhas reais de ASSETS 503 e 35 capturas. Paginação, totais do período, quatro etapas, mudanças dos itens, cancelamento, revisão concorrente, repetição após resposta 502, visibilidade/logout e seis agentes aprovados. Fonte exclusivamente sintética, SQLite real e binding local dos arquivos gerados; relatório SHA `009fc8668b50154f646e80f373088dc5516cde977a163733520632b05e436e12`. A QA bruta é do head `cb7da99`; diferenças até o head publicado limitam-se ao pin do candidato e três contratos de teste, com bytes de runtime idênticos e prova SHA `1284571cfb1eb0c7f67fd1e3021fba61fa992c8f268fc143b031b98c30678814`. Os 117 arquivos de núcleo financeiro/fabricação/custos/devoluções/Ads e Auth/Finance conferidos permanecem byte a byte iguais à base.

A primeira suíte local foi diagnóstica: 3.815/3.825, com dez falhas em expectativas antigas dos harnesses. Os três contratos foram corrigidos sem remover as verificações de negócio; a suíte completa da CI no head publicado é a aprovação final. Nenhum fato real de fabricação, etapa de pedido, banco ou custo foi criado para testes. Não houve sessão autenticada real do proprietário nesta entrega.

| Worker | Versão ativa | SHA-256 da fonte publicada |
| --- | --- | --- |
| App | `c55d7ef5-625e-4d7b-be8e-ab3ff71b5b85` | `15ae0c95b740df09708a8c364098d43ecd7585a49a6f64431434cd870105ca90` |
| Auth, preservado | `3b085dec-c506-472c-afae-6863c67cd545` | `9259b304bf139201b93044ad83843ebc8b6c75d4817fefb86609d642ae655357` |
| Finance, preservado | `4b285d05-9326-4885-b02d-c56a4ad99596` | `bf2740e7e6c1879866a20e299e9aefedb5b453ce3ac1ca8c6021537ead10f966` |

O App gerado tem **3.794.482 bytes**, SHA `dc129e8762ba4e7850038676ece041eb614da1b7ae123bc9da8a5462cbc7c740`; o bundle Wrangler efetivamente enviado tem **4.162.434 bytes**, com **31.870 bytes** de margem no teto de 4 MiB. A folga do arquivo gerado não deve ser confundida com a do bundle enviado.

Os três assets públicos foram conferidos por tamanho, SHA, Content-Type, cache imutável, ETag e nosniff. Inventário SHA `48b8cbc8fc1dc32e3c9b611edd3ed13d09873deec37d03e6f0d1701a7daa480b`:

| Cliente | Bytes | SHA-256 |
| --- | --- | --- |
| Banco | 38.035 | `0d6250f5888258fa29664eac45b2cd821d3872b1c96ac47dda46bd7fd10e6a0c` |
| Mês | 687.069 | `b2ec847af07b46e9a4c54295a782ccf7d1a67315edcbeb16053e034a021be4e5` |
| Pedidos | 20.935 | `99c6086144a7e099920670eecaf485aba9e4f8c49d91b07f626809c7eb81208d` |

Recibo de publicação SHA `c9271491d0ff84b7c5fd09a77ebc96e112cdcc1775c3b32d69974a9c73f8bf37`. Após a ativação, os três vetores de fonte, versões, configuração, domínios/subdomínios, flags e cron foram conferidos duas vezes, com a alteração ASSETS restrita ao App. O ledger e as cópias públicas foram registrados depois dessa prova; reconstrução manteve os três Workers e o inventário idênticos. `/login` respondeu 200 com header e HTML da versão 11.1, e o novo endpoint owner recusou a leitura anônima com 401. Prova pública SHA `ff3654e83c0565e55e48401c0aee1208c4604585f7a2a7f189b616d93448dc45`.

Durante o envio inativo, a conferência inicial parou porque a API Cloudflare exporta a última versão enviada, mesmo quando outra versão atende o tráfego. O verificador passou a distinguir candidato enviado e versão ativa: exigiu o candidato exato, metadados imutáveis e os três deployments anteriores antes da ativação. O mesmo candidato foi inspecionado e ativado; não houve novo upload, rollback ou mudança de fonte. O histórico da parada foi preservado.

Os checks externos “Workers Builds” continuaram falhando sem motivo técnico no retorno do GitHub, padrão também observado na PR116 anterior. A causa permanece em investigação; não são apresentados como aprovados. A CI citada acima é a suíte “Validar Workers”.

A leitura restrita anterior à publicação encontrou 557 pedidos salvos entre 1 e 11 de novembro, usando três SELECTs. Isso confirma presença da fonte, não quantidade paga ou cobertura completa do marketplace. O publicador não consultou D1 nem rotas owner/provedor e não criou fatos reais.
