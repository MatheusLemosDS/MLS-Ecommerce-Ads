# M2.2 — primeiro controle físico de devoluções

**Primeira etapa publicada no App; M2.2 permanece parcial.** A base é `9f1cf3b` (PR #97, auditoria documental), na branch `feature/m22-physical-return-control-20261101`, PR [#98](https://github.com/MatheusLemosDS/MLS-Ecommerce-Ads/pull/98). Fonte `e6d6a4cd59b79d1f93cfef3e58adcba6d8ba3520`, head testado `74a25eb04915e894c3d89962a35ae11c67dc7835`, CI [41344331375](https://github.com/MatheusLemosDS/MLS-Ecommerce-Ads/actions/runs/41344331375) aprovado. A publicação do App foi verificada separadamente da integração Git, que ainda aguardava o CI documental no momento deste recibo. Este registro não confirma recebimentos físicos reais nem a conclusão da fase.

## Problema e comportamento entregue nesta etapa

A conciliação financeira informa solicitações, situações e valores de devolução, mas não comprova que uma peça voltou à loja nem em que condição ela chegou. Um caso `CLOSED`, `REFUND_PAID` ou `ACCEPTED` não pode criar peças recebidas ou disponibilidade para revenda.

Esta primeira etapa oferece um controle interno, confirmado pelo operador, para vincular um caso salvo, registrar as peças efetivamente recebidas e conferir sua condição. A entrada começa em quarentena. Só uma inspeção explícita, com identificação suficiente da peça, pode classificá-la como reaproveitável. Recebimentos parciais, correções e anulações preservam a trilha de auditoria.

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

Cada recebimento usa uma `receipt_ref` interna. A comparação normaliza Unicode, maiúsculas/minúsculas e espaços para impedir que a mesma referência ativa seja lançada outra vez dentro do mesmo caso físico com outro UUID. Referências diferentes permitem entregas parciais distintas. Uma referência de lançamento anulado pode ser reutilizada apenas em uma substituição explícita, mantendo o histórico anterior.

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
| 64 KiB por caso | Rejeitar a gravação que exceder o limite UTF-8, preservando o estado anterior |
| 512 KiB no contrato completo | Medir bytes UTF-8; contagens válidas não dispensam o limite de tamanho |

Limite atingido é uma pendência de capacidade, não motivo para truncar silenciosamente o ledger ou apagar o histórico.

## API e interface publicadas

O painel fica na área Returns já existente, em `physicalReturnsDetails`, com seletor de mês independente da seleção financeira. O mês escolhe a lista de casos de origem; o ledger físico continua global. A leitura é carregada ao abrir o controle, com indicação clara de registros locais, origem salva, quantidades declaradas e valor desconhecido.

A rota owner é `/api/admin/returns/physical?month=AAAA-MM`. Autenticação e validação de CSRF para mutações ocorrem antes da inicialização global. O GET usa somente SELECT: sem chamada de provedor, DDL, registro físico ou outra escrita. Quando as tabelas físicas ainda não existem, ele retorna um ledger vazio e honestamente não inicializado. Fonte indisponível não deve aparecer como quantidade zero de devoluções.

O schema físico é aditivo e inicializado apenas pelo caminho de mutação validado. Não entra no schema global nem acrescenta trabalho ao cron. O orçamento da primeira auditoria financeira fria permaneceu em **48 de 50 chamadas** nos testes do caminho gerado. Finance, Auth, OAuth, contratos financeiros e permissões comerciais permanecem fora desta etapa.

O cliente precisa preservar rascunhos em conflito, impedir confirmação duplicada, ignorar respostas antigas após mudança de seleção ou logout e oferecer tentativa segura quando a confirmação se perde. As ações de recebimento e inspeção são confirmações locais explícitas do operador, sem autorização de escrita externa.

## Critérios e evidências de validação

A suíte local e o CI do head exato executaram **3.056 testes Node**, todos aprovados, sem falhas ou skips, e **67 testes Python**. As evidências da interface são autenticadas locais e simuladas, com Worker normal/minificado em **320 e 1365 px**. Elas comprovam o comportamento do código nesses cenários; não são prova de recebimento ou inspeção real pelo proprietário.

| Critério | Evidência exigida | Evidência desta etapa |
| --- | --- | --- |
| Situação financeira não recebe peças | Registrar casos `CLOSED` e `REFUND_PAID` sem criar quantidades | APROVADO em testes locais/simulados |
| Recebimento parcial e inspeção conservam quantidade | Quarentena inicial, partição exata e correção auditada | APROVADO em testes locais/simulados |
| Identidade e modelagem impedem disponibilidade indevida | Modelagens distintas, identificação incompleta, avaria e divergência | APROVADO em testes locais/simulados |
| Repetição não duplica recebimento | Mesma requisição após timeout e nova requisição com referência normalizada repetida | APROVADO em testes locais/simulados |
| Concorrência e falhas são atômicas | CAS, auditoria rejeitada e escrita de caso rejeitada sem mutação parcial | APROVADO em testes locais/simulados |
| Fonte salva e ledger físico permanecem separados | Troca de publicação/mês, fonte ausente, conflito e cobertura truncada | APROVADO em testes locais/simulados |
| GET é passivo e os guards precedem a inicialização | Falta de sessão, método/query/CSRF inválidos e tabelas físicas ausentes | APROVADO em testes locais/simulados |
| Limites e corrupção falham explicitamente | Capacidade, arrays/campos inválidos, UTF-8, estado parcial e relógio regressivo | APROVADO em testes locais/simulados |
| Interface funciona no Worker gerado | Chromium normal/minificado 320/1365, alvos de 44 px desobstruídos, formulários, rascunhos, retry e CAS; logout/respostas antigas nos testes do cliente | APROVADO em testes locais/simulados |
| Isolamento financeiro e operacional | Valor sempre desconhecido, nenhuma chamada de provedor, nenhuma alteração em totais ou estoque externo | APROVADO em testes locais/simulados |
| Orçamento e release permanecem íntegros | Suíte completa, 67 testes Python, CI, três Workers/configuração e auditoria fria | APROVADO em testes e no recibo real de publicação |

Os testes executados estão em [store físico](../web/cloudflare/tests/physical-returns.test.mjs), [casos adversariais](../web/cloudflare/tests/physical-returns-adversarial.test.mjs), [adaptador e API](../web/cloudflare/tests/physical-returns-workspace.test.mjs), [cliente](../web/cloudflare/tests/physical-returns-client.test.mjs) e [Chromium](../web/cloudflare/tests/physical-returns-chrome.test.mjs). As suites existentes foram preservadas. Navegação por teclado e leitor de tela não foram exercitados explicitamente nesta QA e não são declarados verificados.

Qualquer recebimento ou inspeção exercitado localmente deve ser identificado como **SIMULADO**. Um teste autenticado local não comprova que o proprietário percorreu o fluxo físico na conta real. O acesso público do executor continua bloqueado pelo WAF Cloudflare com resposta 403; nenhum bypass foi usado. O fluxo físico real do proprietário permanece **NÃO EXECUTADO** nesta verificação.

## Gates de entrega e trabalho posterior

| Registro da entrega | Estado |
| --- | --- |
| PR do incremento físico | #98; publicação App verificada, integração Git tratada separadamente |
| Commit de implementação validado | `e6d6a4cd59b79d1f93cfef3e58adcba6d8ba3520`; head testado `74a25eb04915e894c3d89962a35ae11c67dc7835` |
| Suíte local e QA autenticado local | 3.056 Node e 67 Python aprovados; cenários locais/simulados normais/minificados 320/1365 |
| CI GitHub do código | 41344331375, GREEN no head exato |
| Hash gerado e publicado de App/Auth/Finance | Os três bytes exatos conferidos; tabela abaixo |
| Versão App na Live e comparação das configurações | `2157c238-cc55-42ae-9521-7f52951ebd88`, publicação e configuração conferidas |
| Uso real confirmado pelo proprietário, com evidência física | NÃO EXECUTADO |

A publicação foi concluída em `2026-11-01T20:03:32+00:00`. O recibo privado `publication-receipt.json`, no diretório ignorado `attachments/live-m22-physical-returns-baseline-20261101/`, confirmou os três serviços em versões únicas de 100%, bytes exatos, configurações, bindings, domínios, flags e cron preservados. Somente o App mudou; Auth e Finance permaneceram nas versões abaixo. Nenhuma escrita comercial ou mudança de valores financeiros remotos foi realizada. Merge e deploy continuam evidências distintas.

| Worker | Versão | SHA-256 gerado | SHA-256 publicado |
| --- | --- | --- | --- |
| app | `2157c238-cc55-42ae-9521-7f52951ebd88` | `20d0ca1e46e6cef5d374b84cce2231994ced89a2aeb289f8c4b7223a3cf14ca6` | `00eb27283dc0860f4654768baadccf1f1c763fac13af307245235c4f9996422a` |
| auth | `37bead27-c941-40e6-87e8-832f01d1785a` | `c63ee09b2d98b6321e3ae7feae1066a9eec9160b49868d72fb84cb0471a0018d` | `46053d0b5f11ff4d738b4cf2cc1cc6afda7d21e233980b1e640f63728f32af2a` |
| finance | `e0b258a2-e73f-45d2-912a-1cb6fd666e18` | `dff201100ed319f3b7d4d8cabf6826237be3a140e679f562cb982cec5bdd89b4` | `b4195212972f5a9f0f8ff08c9504e983f8bd3ca3b3c42493cb7c88addb84de8b` |

### Próxima etapa: M2.2b

Registrar produção realmente incorrida por unidade/lote em ledger separado da referência de custo das vendas elegíveis. Cada registro precisa preservar data, identidade, quantidade, revisão/fonte e fotografia do custo histórico ou UNKNOWN, inclusive depois de CANCELLED. A implementação deve impedir que esse ledger seja somado novamente ao custo de produção já usado pelo resultado atual.

Depois, confirmar com fatos do operador o que pertence a peça/estampa recuperável e o que já foi consumido em embalagem/etiqueta, além do reparo e da nova embalagem. Os valores all-inclusive existentes não permitem deduzir automaticamente essas parcelas. Valoração e alocação na revenda continuam dependentes dessas evidências; ainda não existe reserva ou consumo de lote na revenda.

M2 e M2.2 permanecem abertas. Esta primeira etapa não implementa o ledger de produção incorrida, a valoração de peças devolvidas, custos de reparo, reserva para novos pedidos, consumo do lote na revenda, conciliação bancária ou confirmação final do lucro. Essas integrações exigem suas próprias fontes, contratos, testes e conferências; não podem ser inferidas da situação do reembolso ou da inspeção local.
