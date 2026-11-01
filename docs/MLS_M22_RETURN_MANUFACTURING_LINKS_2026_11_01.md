# M2.2c — associação declarada entre devolução e produção

**Primeira etapa interna M2.2c publicada no App; a fase permanece parcial.** Branch `feature/m22-return-manufacturing-links-20261101`, base `59f4241` (PR #99), PR [#100](https://github.com/MatheusLemosDS/MLS-Ecommerce-Ads/pull/100). Fonte `e288c3e6e8601696c0d117a4737b0d74dedcc1b2`, head testado `05e8890757816cc3df546904451468e5f27d968d`, CI [41352590915](https://github.com/MatheusLemosDS/MLS-Ecommerce-Ads/actions/runs/41352590915) aprovado. Publicação concluída em **01/11/2026 às 18:40:06 Brasília**. A PR continuava aberta/DRAFT e aguardava CI documental/integração Git no momento do recibo; publicação runtime não comprova merge. O uso real pelo proprietário não foi executado. Recebimentos, fabricação e associações usados nos testes são **SIMULADOS LOCALMENTE**; nenhum desses fatos foi lançado na Live para QA.

## Problema e limite desta primeira etapa

O [controle físico](MLS_M22_PHYSICAL_RETURNS_2026_11_01.md) registra recebimentos e inspeções declarados pelo operador. O [ledger de produção incorrida](MLS_M22_INCURRED_PRODUCTION_2026_11_01.md) registra fabricação declarada com data e custo histórico ou UNKNOWN. Esta etapa permite associar uma quantidade de um recebimento a um registro de fabricação, com confirmação e evidência do operador.

A associação tem confiança **OWNER_CONFIRMED**. A mesma estampa, SKU, cor, tamanho ou referência de lote não comprova que seja a mesma peça física originalmente fabricada. Não há identificação serial individual nem conferência automática da quantidade original do pedido. Os limites globais impedem a dupla alocação lógica da quantidade declarada; não transformam a declaração em prova física ou bancária.

O trabalho é restrito ao App e não encerra M2, M2.2, conciliação financeira, valoração, reserva ou revenda. Não atribui valor de estoque à camiseta devolvida, mesmo quando o registro de fabricação contém custo completo declarado.

## Quantidades e identidade

Cada vínculo usa UUID próprio, caso de devolução salvo, linha física, registro de fabricação e quantidade inteira positiva. O operador seleciona os dois registros, informa a quantidade, descreve a evidência e confirma expressamente a associação. Não há vínculo automático por nome, custo, kit, situação do pedido ou semelhança de catálogo.

| Conferência | Regra |
| --- | --- |
| Identidade confirmada | Estampa, cor, tamanho, adulto/infantil e modelagem masculina/feminina/unissex precisam estar confirmados e concordar após normalização Unicode, caixa e espaços |
| Catálogo opcional | Item, modelo e SKU conhecidos dos dois lados não podem se contradizer; ausência de um campo não é confirmação de igualdade |
| Situação | Fabricação ACTIVE e recebimento não anulado |
| Data | Data declarada de fabricação anterior ou igual ao dia do recebimento em Brasília; a data de gravação posterior de um fato histórico não altera sua fabricação |
| Pedido conhecido | Hash de pedido da fabricação, quando presente, precisa coincidir com o caso físico salvo |
| Pedido desconhecido | Lote manual sem pedido admite associação declarada, com origem explicitamente desconhecida |
| Custo | UNKNOWN não bloqueia uma associação de quantidade; o valor não é copiado para os snapshots do vínculo |

A quantidade vendida de um kit/contexto DTF continua distinta da quantidade física declarada de fabricação e recebimento. Não se divide um kit em peças nem se transforma uma unidade vendida em quantidade original conferida.

O contrato mantém em todas as leituras:

```json
{
  "original_quantities": {
    "state": "UNAVAILABLE",
    "expected_quantity": null,
    "verified_quantity": null
  },
  "allocated_inventory_value_cents": null,
  "financial_integration_allowed": false,
  "external_stock_write_allowed": false
}
```

Finance já preserva os `items` dos pedidos pagos, mas esse conteúdo não é transportado ao App pelo contrato atual. Itens vazios em TO_RETURN/pedidos não pagos são UNKNOWN, não prova de quantidade zero. Separadamente, `response.item[].amount` de Returns não é capturado pelo payload legado salvo. Expor os itens existentes e preservar a evidência Returns exigirá uma etapa própria opt-in em Finance/Auth/App, usando as chamadas já realizadas, sem novos requests de provedor, e validando itens, unidades e cobertura. Essa captura/transmissão não faz parte desta entrega. Quantidade original ausente permanece UNAVAILABLE/nula, nunca zero.

## Conservação global das quantidades

A soma de **todos os vínculos ACTIVE**, entre casos e meses, não pode ultrapassar a quantidade declarada da linha de recebimento nem a quantidade declarada do registro de fabricação. O par ativo recebimento/fabricação é único, mesmo com outro UUID ou outra requisição.

Vínculos com origem ausente, alterada ou em conflito continuam retendo sua quantidade até a desvinculação explícita. Não passam a representar peças disponíveis e não liberam capacidade silenciosamente. A interface distingue quantidade válida da quantidade retida por vínculos ativos, inclusive quando a origem não pode ser lida.

Os estados derivados são VALID, HISTORICAL, CONFLICT e UNAVAILABLE. Um vínculo anulado é histórico mesmo sem os pais disponíveis. Pais indisponíveis, proteção incompleta ou conflito ativo bloqueiam novas associações; a leitura do histórico e a desvinculação com motivo permanecem disponíveis.

## Fotografias de origem e correções

O snapshot físico contém fingerprint canônico, hash do pedido, horário do recebimento, quantidade e identidade declaradas. O snapshot da fabricação contém fingerprint, hash opcional do pedido, data produzida, quantidade e identidade. **Não há campos monetários nesses snapshots.**

O fingerprint físico considera a origem da linha, sem condição, partição da inspeção, motivo, horário de atualização ou situação não anulada. Reinspecionar qualidade ou modificar uma linha não relacionada permanece permitido e não invalida a origem vinculada. Alterar identidade, quantidade, data, IDs, pedido do caso, anular ou remover o pai vinculado é bloqueado atomicamente. O fingerprint da fabricação conserva o registro histórico inteiro, sem depender da revisão global do ledger.

Uma correção de origem exige primeiro desvincular com motivo. Alterações protegidas retornam conflito 409 com os códigos `PHYSICAL_RETURNS_MANUFACTURING_LINK_ACTIVE` ou `INCURRED_PRODUCTION_RETURN_LINK_ACTIVE`; não deixam revisão, fato ou auditoria parcial nos pais.

Não se edita nem transfere um vínculo em silêncio. A desvinculação preserva UUID, snapshots, quantidade, evidência, autor, datas e motivo. Se uma fabricação for anulada e substituída depois disso, a associação histórica continua apontando ao registro anterior; o novo registro exige outra associação explícita, com novo UUID e fotografias atuais.

## Persistência, concorrência e API

A rota owner publicada é `/api/admin/returns/manufacturing-links`, sem parâmetros de consulta. O workspace `return_manufacturing_links_workspace_v1` reúne ledger, pais disponíveis, handles de origem e contexto derivado. A leitura não consulta provedor nem cria fatos físicos, fabricação ou associações.

Autenticação owner, método, consulta, origem e CSRF de mutações são conferidos antes da inicialização global. GET usa somente SELECT; banco frio devolve ledger vazio com proteção NOT_INITIALIZED, sem DDL. A inicialização não entra no schema global nem acrescenta consultas ou mutações ao cron.

A primeira associação válida grava, no mesmo batch D1, as quatro tabelas próprias, três índices, quatro triggers de proteção dos pais, vínculo, auditoria, CAS e guards. Falha de auditoria, capacidade, origem ou concorrência reverte o batch completo, inclusive o DDL inicial. Uma tentativa inválida não inicializa o módulo.

Cada mutação exige revisão esperada, UUID estável de requisição e hash canônico do conteúdo. Um reenvio idêntico após resposta perdida é recuperado antes de exigir novamente os pais atuais. Reutilizar a requisição com outro conteúdo falha por conflito. O commit confere os payloads salvos atuais dos dois pais, capacidades globais e unicidade do par, além da revisão e auditoria próprias.

Proteção ausente ou com definição divergente após a inicialização gera INCOMPLETE. O sistema conserva o histórico e permite desvincular, mas bloqueia novos vínculos. GET não recompõe triggers ou índices; schema próprio parcial/corrompido falha explicitamente.

| Limite | Comportamento |
| --- | --- |
| 1.000 vínculos globais | Inclui ativos e anulados; sem apagar histórico para criar espaço |
| 16 KiB por vínculo | Medição UTF-8 e rejeição antes da gravação excedente |
| 1 MiB por ledger completo | Sem truncamento silencioso |
| 4 MiB por workspace | Contexto e pais excedentes falham explicitamente |

## Compatibilidade e rollback

As tabelas e os triggers D1 sobrevivem ao rollback do Worker. Depois de existir vínculo ACTIVE, voltar somente ao código dos pais das PRs #98/#99 não remove a proteção: esse código anterior não traduz o marker novo e pode responder 503 quando se tenta alterar um pai protegido.

Portanto, o rollback de código **não é transparente para essas mutações**. A recuperação precisa manter ou repor código compatível com leitura e desvinculação, conferir o histórico e desvincular explicitamente antes de corrigir os pais. Não remover triggers, apagar fatos ou liberar capacidade como atalho de rollback. Os triggers são persistência deliberada de uma restrição entre ledgers, não uma alteração descartável junto com o App.

## Isolamento contábil

A fabricação histórica all-inclusive não é o valor recuperável da peça. Embalagem/etiqueta consumidas, estampa/tecido recuperáveis, reparo e nova embalagem ainda não estão decompostos e confirmados. O vínculo não distribui custo, não cria crédito, não reduz produção incorrida e não adiciona outra soma à referência de custo das vendas ou ao resultado líquido.

Não há escrita financeira, em Finance/Auth, DTF, regras de custo, reserva, revenda ou estoque externo. A avaliação alocada permanece nula e as flags financeiras/de estoque continuam falsas. Uma associação válida não confirma recebimento bancário, lucro, pagamento da fabricação ou cobertura de toda a produção/devolução da loja.

## Validação e publicação

A suíte completa local e o CI do head exato passaram com **3.143 testes Node e 67 Python**, sem falhas ou skips. Há **44 testes Node novos**, incluindo a regressão pública workerd/Miniflare D1 com **13 cenários**. O App gerado final, normal/minificado, foi exercitado em **320 e 1365 px** com fonte operacional salva e fatos internos exclusivamente simulados.

| Evidência | Estado desta primeira etapa |
| --- | --- |
| Suíte adversarial independente | 8/8 testes locais aprovados; fatos exclusivamente SIMULADOS |
| Conservação global e duplicidade | Aprovadas na suíte adversarial entre diferentes casos e registros de fabricação |
| Origem obsoleta/ausente | Quantidade retida; nova criação bloqueada; desvinculação sem pais aprovada localmente |
| Cronologia Brasília e custo UNKNOWN | Aprovados localmente, inclusive gravação tardia e recebimento em dia UTC diferente do dia em Brasília |
| Anulação/substituição | Pai protegido não muda; após desvincular, substituição não recebe associação automaticamente |
| Ordem das chaves e inspeção | Origem semântica/fingerprint conservados no teste local; segundo lote admitido sem duplicar capacidade |
| D1 Miniflare genérico | Prova inicial local: nove casos aprovados; evidência histórica complementada pelo exercício específico abaixo |
| D1 workerd/Miniflare do módulo real | Regressão pública com 13 cenários aprovada, incluindo instalação atômica, guards dos pais e rollback do primeiro schema após corrida |
| Suítes completas Node/Python, adaptador e cliente | 3.143 Node e 67 Python aprovados, zero skips; CI do head exato GREEN |
| Worker gerado normal/minificado e Chromium 320/1365 | APROVADOS localmente com fatos SIMULADOS |
| QA com fonte salva real, sem fatos reais inventados | APROVADA na cópia local; fontes financeiras e fatos remotos preservados |
| PR, commit, CI GitHub, hashes e versões dos Workers | #100, fonte/head e CI acima; versões/hashes na tabela do recibo abaixo |
| Publicação Live e comparação de bytes/configurações | App `2b1d820a`; os três Workers e configurações exatas conferidos |
| Uso físico real confirmado pelo proprietário | NÃO EXECUTADO |

As suítes [núcleo](../web/cloudflare/tests/return-manufacturing-links.test.mjs), [adversarial](../web/cloudflare/tests/return-manufacturing-links-adversarial.test.mjs), [D1 real local](../web/cloudflare/tests/return-manufacturing-links-d1.test.mjs), [workspace](../web/cloudflare/tests/return-manufacturing-links-workspace.test.mjs), [cliente](../web/cloudflare/tests/return-manufacturing-links-client.test.mjs) e [Chromium](../web/cloudflare/tests/return-manufacturing-links-chrome.test.mjs) foram executadas. Navegação por teclado ou outras modalidades de acessibilidade não foram exercitadas explicitamente e não são declaradas verificadas.

## QA com fonte salva real e fatos simulados

A cópia local da fonte operacional selecionada continha Returns PROCESSING e contexto DTF TO_RETURN com o mesmo hash de pedido. Essa correspondência contextual não comprova quantidade original, fabricação ou recebimento físico. O exercício usou o App final gerado `926e750890a31a00d1c25acd7bca1451f9faaa10fc882e0b667745fcba656106`, normal/minificado, em 320/1365 px.

Nos fatos **SIMULADOS LOCALMENTE**, foram declaradas três peças no recebimento, três no registro de fabricação e uma associação de duas peças. A reinspeção de qualidade permaneceu permitida; alterações protegidas dos pais retornaram 409 com estado/auditoria preservados. Desvincular liberou a quantidade, e substituições não receberam vínculo automaticamente. As quatro tabelas financeiras observadas, DTF/custos salvos e DTO financeiro v4/JSON renderizado ficaram idênticos antes/depois.

Não houve escrita de fatos na Live nem chamadas de provedor pela QA. O acesso público do executor recebeu WAF 403, sem bypass. O fluxo real do proprietário permanece **NÃO EXECUTADO**; replay local autenticado e publicação técnica não substituem esse aceite.

## Publicação verificada

O recibo privado `publication-receipt.json`, no diretório ignorado `attachments/live-m22-return-manufacturing-links-baseline-20261101/`, confirma conclusão em `2026-11-01T21:40:06+00:00`, equivalente a **01/11/2026 às 18:40:06 Brasília (America/Sao_Paulo, UTC−03:00)**. Bytes, configurações, bindings, domínios, flags e cron dos três Workers foram conferidos. Somente o App mudou; Auth/Finance e seus contratos existentes foram preservados. Não houve escrita comercial ou alteração remota de valores financeiros.

| Worker | Versão | SHA-256 gerado | SHA-256 publicado |
| --- | --- | --- | --- |
| app | `2b1d820a-fc1a-409a-9393-86e660458c42` | `926e750890a31a00d1c25acd7bca1451f9faaa10fc882e0b667745fcba656106` | `72b8359b438bcaa744d592c67b6d163e99a1c712b4cf97e7ee7a1de07c2dbf8b` |
| auth | `37bead27-c941-40e6-87e8-832f01d1785a` | `c63ee09b2d98b6321e3ae7feae1066a9eec9160b49868d72fb84cb0471a0018d` | `46053d0b5f11ff4d738b4cf2cc1cc6afda7d21e233980b1e640f63728f32af2a` |
| finance | `e0b258a2-e73f-45d2-912a-1cb6fd666e18` | `dff201100ed319f3b7d4d8cabf6826237be3a140e679f562cb982cec5bdd89b4` | `b4195212972f5a9f0f8ff08c9504e983f8bd3ca3b3c42493cb7c88addb84de8b` |

A PR #100 continuava aberta/DRAFT no recibo runtime. CI documental final e merge em `main` têm confirmação própria posterior; este recibo não afirma que a integração Git já terminou.

## Próximos passos ainda abertos

Expor os itens pagos já preservados em Finance e capturar a evidência Returns nas chamadas existentes por contrato opt-in Finance/Auth/App, sem nova coleta de provedor. Conferir itens e quantidades originais esperados em fonte preservada e coberta; confrontá-los com as declarações sem promover um vínculo de lote a prova de peça individual. Depois confirmar a decomposição histórica de peça/estampa versus embalagem/etiqueta consumidas e os custos incrementais. Valoração, alocação de valores, reservas, consumo na revenda e ponte financeira sem dupla contagem continuam etapas futuras separadas. A associação declarada desta primeira M2.2c não encerra essas obrigações.
