# M2.2 — primeiro controle físico de devoluções

**Rascunho da primeira etapa, em implementação local.** Este registro não declara M2.2 concluída, não confirma recebimentos reais e não registra uma nova publicação na Live. A base é `9f1cf3b` (PR #97, auditoria documental), na branch `feature/m22-physical-return-control-20261101`. O PR deste incremento, o CI, os hashes dos Workers e a versão publicada permanecem **PENDENTES**.

## Problema e comportamento preparado

A conciliação financeira informa solicitações, situações e valores de devolução, mas não comprova que uma peça voltou à loja nem em que condição ela chegou. Um caso `CLOSED`, `REFUND_PAID` ou `ACCEPTED` não pode criar peças recebidas ou disponibilidade para revenda.

Esta primeira etapa prepara um controle interno, confirmado pelo operador, para vincular um caso salvo, registrar as peças efetivamente recebidas e conferir sua condição. A entrada começa em quarentena. Só uma inspeção explícita, com identificação suficiente da peça, pode classificá-la como reaproveitável. Recebimentos parciais, correções e anulações preservam a trilha de auditoria.

O valor contábil permanece desconhecido: `valuation.state = UNKNOWN`, `amount_cents = null` e valor de carregamento de cada linha nulo. Nenhum custo vira zero por ausência de informação. O controle não modifica cálculos financeiros, reservas, revendas, estoque externo ou pedidos da Shopee.

Esta entrega cobre apenas o começo do fluxo descrito na [auditoria de devoluções e reaproveitamento](MLS_RETURNS_REUSE_ROADMAP_AUDIT_2026_11_01.md) e no [roadmap canônico](ROADMAP_MLS_COMMERCE_OS.md). Produção incorrida, custeio histórico, custo incremental de reparo, reserva de peças e vínculo do lote à revenda continuam etapas posteriores.

## Fluxo interno

| Etapa | Informação confirmada | Regra |
| --- | --- | --- |
| Abrir controle | Caso da conciliação salva e pedido associado | Vínculo conferido pelo servidor; ainda não há peças recebidas |
| Registrar recebimento | Referência interna, identidade declarada da peça e quantidade recebida | Cada entrega parcial é uma linha própria; toda a quantidade começa em quarentena |
| Inspecionar | Partição das peças reaproveitáveis, para reparo, avariadas, divergentes ou ainda em quarentena | A soma das cinco categorias deve ser exatamente a quantidade da linha |
| Corrigir inspeção | Nova partição e motivo explícito | Revisão e auditoria preservam a classificação anterior |
| Anular lançamento | Linha e motivo da correção | O registro permanece no histórico e deixa o saldo ativo; a anulação não afirma um descarte ou uma movimentação física real |

As quantidades são **declarações do operador**, e não quantidades originais do pedido verificadas pela API. O adaptador de casos não comprova os itens ou a quantidade vendida originalmente. Uma entrega com parte de um kit não se transforma automaticamente em kit completo.

A identificação distingue arte, cor, tamanho, tipo de camiseta e modelagem. Masculino (`MALE`), feminino (`FEMALE`) e unissex (`UNISEX`) permanecem separados; identificação desconhecida não pode gerar peças reaproveitáveis. O cadastro pode manter identificadores de catálogo e SKU como referências, sem supor equivalência entre peças de modelagens diferentes.

## Identidade, concorrência e correções

O ledger físico é global, com identidade estável do caso e do pedido. Uma atualização da publicação financeira ou a seleção de outro mês não cria novamente o mesmo caso nem duplica seus recebimentos. A origem da primeira inscrição registra mês, revisão da publicação, situação e horário da fonte salva.

Cada recebimento usa uma `receipt_ref` interna. A comparação normaliza Unicode, maiúsculas/minúsculas e espaços para impedir que a mesma referência ativa seja lançada outra vez com outro UUID. Referências diferentes permitem entregas parciais distintas. Uma referência de lançamento anulado pode ser reutilizada apenas em uma substituição explícita, mantendo o histórico anterior.

As gravações usam revisão esperada (CAS), identidade da requisição, hash do conteúdo e auditoria na mesma transação. Se a resposta se perder, o cliente conserva a mesma requisição e os mesmos identificadores ao tentar novamente; isso não recebe as peças duas vezes. Reutilizar a identidade da requisição com conteúdo diferente é conflito. Uma revisão desatualizada exige recarregar o estado e conferir o rascunho; não sobrescreve silenciosamente uma mudança concorrente.

Falha na auditoria ou na gravação do caso deve reverter a mutação inteira. Reinspeção e anulação devem guardar os fatos anteriores completos, incluindo identidade, partição e horários, em vez de reconstituí-los a partir do registro já modificado.

## Fontes salvas e cobertura

O adaptador consulta somente evidências locais de Returns da publicação mensal selecionada. Não chama o provedor e não converte situações financeiras em fatos físicos. O vínculo para um novo controle exige um caso salvo compatível; fonte ausente ou conflitante não autoriza inventar esse vínculo. Os controles físicos já registrados permanecem separados da disponibilidade posterior da fonte.

A lista de origem é limitada a **40 casos por relatório e até três relatórios**, portanto no máximo 120 casos incluídos nessa leitura. O painel deve informar total conhecido, quantidade incluída, truncamento e indisponibilidade. Esses limites não demonstram que a loja tem somente os casos visíveis nem autorizam considerar a lista integral quando a fonte está parcial.

A observação real anterior de outubro encontrou **18 detalhes de devolução**. Esse número descreve os casos financeiros salvos naquele recorte; não comprova 18 pacotes, 18 peças recebidas, inspeções ou estoque reaproveitável. Nenhum desses fatos físicos foi confirmado por essa leitura.

| Limite do controle físico | Comportamento esperado |
| --- | --- |
| 100 casos registrados | Rejeitar nova inscrição acima do limite sem remover os casos existentes |
| 50 linhas por caso | Manter entregas parciais explícitas e rejeitar a próxima linha excedente |
| 1.000 linhas no total | Rejeitar a mutação antes de criar um saldo parcial |
| 512 KiB no contrato completo | Medir bytes UTF-8; contagens válidas não dispensam o limite de tamanho |

Limite atingido é uma pendência de capacidade, não motivo para truncar silenciosamente o ledger ou apagar o histórico.

## API e interface preparadas

O painel fica na área Returns já existente, em `physicalReturnsDetails`, com seletor de mês independente da seleção financeira. O mês escolhe a lista de casos de origem; o ledger físico continua global. A leitura é carregada ao abrir o controle, com indicação clara de registros locais, origem salva, quantidades declaradas e valor desconhecido.

A rota owner é `/api/admin/returns/physical?month=AAAA-MM`. Autenticação e validação de CSRF para mutações devem ocorrer antes da inicialização global. O GET usa somente SELECT: sem chamada de provedor, DDL, registro físico ou outra escrita. Quando as tabelas físicas ainda não existem, ele retorna um ledger vazio e honestamente não inicializado. Fonte indisponível não deve aparecer como quantidade zero de devoluções.

O schema físico é aditivo e inicializado apenas pelo caminho de mutação validado. Não entra no schema global nem acrescenta trabalho ao cron. O orçamento existente da primeira auditoria fria deve continuar em **48 de 50 chamadas**, com a mesma validação do caminho gerado. Finance, Auth, OAuth, contratos financeiros e permissões comerciais permanecem fora desta etapa.

O cliente precisa preservar rascunhos em conflito, impedir confirmação duplicada, ignorar respostas antigas após mudança de seleção ou logout e oferecer tentativa segura quando a confirmação se perde. As ações de recebimento e inspeção são confirmações locais explícitas do operador, sem autorização de escrita externa.

## Critérios e evidências de validação

Os arquivos locais de implementação e testes estão em preparação. A existência desses arquivos não equivale à aprovação dos critérios abaixo. Resultados, contagens e evidências finais serão registrados após execução e revisão do responsável pela integração.

| Critério | Evidência exigida | Estado deste rascunho |
| --- | --- | --- |
| Situação financeira não recebe peças | Registrar casos `CLOSED` e `REFUND_PAID` sem criar quantidades | PENDENTE |
| Recebimento parcial e inspeção conservam quantidade | Quarentena inicial, partição exata e correção auditada | PENDENTE |
| Identidade e modelagem impedem disponibilidade indevida | Modelagens distintas, identificação incompleta, avaria e divergência | PENDENTE |
| Repetição não duplica recebimento | Mesma requisição após timeout e nova requisição com referência normalizada repetida | PENDENTE |
| Concorrência e falhas são atômicas | CAS, auditoria rejeitada e escrita de caso rejeitada sem mutação parcial | PENDENTE |
| Fonte salva e ledger físico permanecem separados | Troca de publicação/mês, fonte ausente, conflito e cobertura truncada | PENDENTE |
| GET é passivo e os guards precedem a inicialização | Falta de sessão, método/query/CSRF inválidos e tabelas físicas ausentes | PENDENTE |
| Limites e corrupção falham explicitamente | Capacidade, arrays/campos inválidos, UTF-8, estado parcial e relógio regressivo | PENDENTE |
| Interface funciona no Worker gerado | Normal/minificado, desktop/mobile, rascunho, timeout, teclado e logout | PENDENTE |
| Isolamento financeiro e operacional | Valor sempre desconhecido, nenhuma chamada de provedor, nenhuma alteração em totais ou estoque externo | PENDENTE |
| Orçamento e release permanecem íntegros | Suíte completa, 67 testes Python, CI, três Workers/configuração e auditoria fria | PENDENTE |

Os testes propostos estão em [store físico](../web/cloudflare/tests/physical-returns.test.mjs), [casos adversariais](../web/cloudflare/tests/physical-returns-adversarial.test.mjs), [adaptador e API](../web/cloudflare/tests/physical-returns-workspace.test.mjs), [cliente](../web/cloudflare/tests/physical-returns-client.test.mjs) e [Chromium](../web/cloudflare/tests/physical-returns-chrome.test.mjs). O responsável pela integração deve registrar os resultados efetivamente executados, sem reduzir suites existentes.

Qualquer recebimento ou inspeção exercitado localmente deve ser identificado como **SIMULADO**. Um teste autenticado local não comprova que o proprietário percorreu o fluxo físico na conta real. O acesso público do executor continua sujeito ao WAF Cloudflare com resposta 403; nenhum bypass ou homologação física real está registrado neste rascunho.

## Gates de entrega e trabalho posterior

| Registro da entrega | Estado |
| --- | --- |
| PR do incremento físico | PENDENTE |
| Commit de implementação validado | PENDENTE |
| Suíte local e QA autenticado local | PENDENTE |
| CI GitHub | PENDENTE |
| Hash gerado e publicado de App/Auth/Finance | PENDENTE |
| Versão App na Live e comparação das configurações | PENDENTE |
| Uso real confirmado pelo proprietário, com evidência física | NÃO EXECUTADO |

Depois dos checks exigidos pelo repositório, uma eventual publicação deve preservar os três Workers, bindings, domínios, flags e cron; merge e deploy continuam evidências distintas. O rascunho não concede permissão para alterar estoque externo ou executar escritas comerciais.

M2 e M2.2 permanecem abertas. Esta primeira etapa não implementa o ledger de produção incorrida, a valoração de peças devolvidas, custos de reparo, reserva para novos pedidos, consumo do lote na revenda, conciliação bancária ou confirmação final do lucro. Essas integrações exigem suas próprias fontes, contratos, testes e conferências; não podem ser inferidas da situação do reembolso ou da inspeção local.
