# M2.2c — associação declarada entre devolução e produção

**DRAFT: implementação local em validação, sem publicação confirmada nesta etapa.** Branch `feature/m22-return-manufacturing-links-20261101`, base `59f4241` (PR #99). PR, commits de entrega, CI do head exato, hashes gerados/publicados e versões dos Workers estão **PENDENTES**. O uso real pelo proprietário não foi executado. Recebimentos, fabricação e associações usados nos testes são **SIMULADOS LOCALMENTE**; nenhum desses fatos foi lançado na Live para QA.

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

Na fonte atual de Returns, `response.item.amount` não é preservado pelo recorte salvo. Capturar e verificar esse campo exigirá uma etapa própria, opt-in, em Finance/Auth/App, com validação de itens, unidades e cobertura. Essa captura não faz parte desta entrega. Quantidade original ausente permanece UNAVAILABLE/nula, nunca zero.

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

A rota owner preparada é `/api/admin/returns/manufacturing-links`, sem parâmetros de consulta. O workspace `return_manufacturing_links_workspace_v1` reúne ledger, pais disponíveis, handles de origem e contexto derivado. A leitura não consulta provedor nem cria fatos físicos, fabricação ou associações.

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

| Evidência | Estado nesta versão DRAFT |
| --- | --- |
| Suíte adversarial independente | 8/8 testes locais aprovados; fatos exclusivamente SIMULADOS |
| Conservação global e duplicidade | Aprovadas na suíte adversarial entre diferentes casos e registros de fabricação |
| Origem obsoleta/ausente | Quantidade retida; nova criação bloqueada; desvinculação sem pais aprovada localmente |
| Cronologia Brasília e custo UNKNOWN | Aprovados localmente, inclusive gravação tardia e recebimento em dia UTC diferente do dia em Brasília |
| Anulação/substituição | Pai protegido não muda; após desvincular, substituição não recebe associação automaticamente |
| Ordem das chaves e inspeção | Origem semântica/fingerprint conservados no teste local; segundo lote admitido sem duplicar capacidade |
| D1 Miniflare genérico | Prova local genérica informada: 9 testes aprovados; não substitui o exercício do módulo real |
| D1 Miniflare do módulo real | PENDENTE |
| Suítes completas Node/Python, adaptador e cliente | PENDENTES de execução final e contagem do head exato |
| Worker gerado normal/minificado e Chromium 320/1365 | PENDENTES |
| QA com fonte salva real, sem fatos reais inventados | PENDENTE |
| PR, commit, CI GitHub, hashes e versões dos Workers | PENDENTES |
| Publicação Live e comparação de bytes/configurações | PENDENTES |
| Uso físico real confirmado pelo proprietário | NÃO EXECUTADO |

As suítes dedicadas são [núcleo](../web/cloudflare/tests/return-manufacturing-links.test.mjs), [adversarial](../web/cloudflare/tests/return-manufacturing-links-adversarial.test.mjs), [workspace](../web/cloudflare/tests/return-manufacturing-links-workspace.test.mjs), [cliente](../web/cloudflare/tests/return-manufacturing-links-client.test.mjs) e [Chromium](../web/cloudflare/tests/return-manufacturing-links-chrome.test.mjs). A existência dos arquivos não significa aprovação da bateria final. Navegação por teclado ou outras modalidades de acessibilidade não são declaradas verificadas sem exercício explícito.

## Próximos passos ainda abertos

Conferir itens e quantidades originais esperados em uma fonte preservada e coberta; confrontá-los com as declarações sem promover um vínculo de lote a prova de peça individual. Depois confirmar a decomposição histórica de peça/estampa versus embalagem/etiqueta consumidas e os custos incrementais. Valoração, alocação de valores, reservas, consumo na revenda e ponte financeira sem dupla contagem continuam etapas futuras separadas. A associação declarada desta primeira M2.2c não encerra essas obrigações.
