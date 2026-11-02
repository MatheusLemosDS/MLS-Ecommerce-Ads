# Itens e quantidades das devoluções — 02/11/2026

**Estado: publicado e conferido nos três Workers (`ALL_THREE_LIVE_EXACT`).**
Conferência concluída em **02/11/2026 às 17:45:00 Brasília** (`2026-11-02T20:45:00+00:00`).
Versão visível **2026-11-02.2 — Itens e quantidades das devoluções**.
PR [#103](https://github.com/MatheusLemosDS/MLS-Ecommerce-Ads/pull/103), branch
`feature/returns-original-items-20261102`, base
`9fc4c69f004e5e709931fad4fdc3bdfa385aff93`.
Fonte `6ada0748d5af93e8f39330438e9a9a0766ee92c5`, head validado
`2e25591004eb658a30e8240506c29106312bbcf5`, CI
[41520727701](https://github.com/MatheusLemosDS/MLS-Ecommerce-Ads/actions/runs/41520727701)
aprovada. A sequência **Finance → Auth → App** e os bytes/configurações foram
conferidos após cada etapa. A integração Git é conferida separadamente pelo
estado da PR103 vinculada; a versão humana não substitui os UUIDs e recibos.

## O que foi entregue

O proprietário precisa comparar a origem de uma devolução com o que chegou
fisicamente. Os controles de recebimento, inspeção e associação com fabricação
já existem, mas não exibiam os itens comerciais preservados nas fontes do
pedido e da solicitação de devolução.

O novo bloco do MLS Returns separa duas observações:

- **Itens do pedido observado:** unidades comerciais do pedido pago já
  preservadas na fonte financeira salva.
- **Itens da solicitação de devolução observada:** unidades comerciais que a
  fonte da solicitação informou e que foram preservadas durante sua leitura.

Cada observação mantém sua própria fonte, data, estado e cobertura. Não são
duas confirmações independentes de peças recebidas e não devem ser somadas
como uma quantidade física. Uma unidade comercial de kit não comprova sua
composição nem quantas camisetas chegaram.

Fontes antigas sem detalhe continuam `NOT_CAPTURED`/desconhecidas. Uma lista
ausente, inválida, limitada ou vazia sem prova suficiente não equivale a zero;
isso também vale para pedidos `TO_RETURN` sem itens preservados. Cobertura
parcial ou limite atingido permanecem visíveis e não liberam um total por
inferência.

## Onde abrir e como usar

| Ação | Endereço | Uso |
| --- | --- | --- |
| Conferir a origem | `/admin?tab=agent-returns#physicalReturnsOriginalItems` | Escolher o mês e a solicitação salva; comparar separadamente os itens do pedido e da devolução, suas datas e cobertura. |
| Receber e inspecionar | `/admin?tab=agent-returns#physicalReturnsDetails` | Declarar somente o que foi efetivamente recebido e inspecionado. A consulta da origem não preenche esse registro. |
| Vincular à fabricação | `/admin?tab=agent-returns#returnManufacturingLinksDetails` | Conferir identidade e fabricação compatíveis antes de confirmar a origem e a quantidade física associada. |

O bloco **Itens e quantidades da origem** fica dentro do controle de
recebimento. Reutiliza o mês e o caso selecionados no MLS Returns. Um mês
físico fixado pelo operador conserva esse contexto; a consulta não o troca
silenciosamente pelo mês financeiro compartilhado. Trocar de caso deve remover
a evidência anterior enquanto o novo contexto é conferido.

O cartão **Novidades desta versão** aponta para esses três caminhos. As notas
em `/admin?tab=roadmap#appReleaseNotes` mantêm os controles físicos anteriores
e, em uma seção adicional, o líquido mensal, o seletor de mês e as despesas
da PR102. O registro de fabricação continua em
`/admin?tab=margins#incurredProductionDetails`.

## Fontes salvas e extensão opt-in

A extensão Finance/Auth usa o contrato opt-in `original-items-v1`, junto dos
contratos de revisão/reembolso já existentes. O envelope novo é
`finance_reconciliation_v4`; os itens usam `finance_original_items_v1`.
As formas legadas de conciliação continuam preservadas, sem acrescentar os
novos campos ao payload que um leitor antigo espera.

No App, a evidência fica separada do relatório legado e depende da identidade
Finance preservada: `run_id`, revisão, datas da fonte, bytes exatos do relatório,
`checked_at`, pertencimento dos casos e checksum próprio dos itens. A revisão
App registrada na captura é proveniência: deve ser positiva e menor ou igual à
publicação App atual. Republicar as mesmas fontes Finance preserva a evidência
compatível; o contexto apresentado ao proprietário identifica a publicação App
atual. Mudança na fonte Finance ou no relatório invalida a reutilização.

O contexto agregado usa `business_original_items_v1`. A leitura owner opt-in de
recebimento é `returns/physical?month=AAAA-MM&evidence=original-items-v1`, com
envelope `physical_returns_workspace_v2`; o relatório físico legado permanece
separado. Repreço de custos, Ads ou despesas não é uma nova observação de itens.

Pedido pago usa itens já preservados. Para Returns, o novo detalhe será
capturado quando as consultas programadas existentes ocorrerem; não há novo
backfill, reinício de coleta ou requisição adicional ao provedor para preencher
o histórico. Abrir o bloco lê as evidências salvas, sem forçar a Shopee.
Um sidecar ausente, incompatível ou não capturado permanece desconhecido e não
prova quantidade zero. A reutilização de uma captura anterior depende das
fontes exatas descritas acima, não da igualdade entre a revisão App capturada
e a atual. O recibo de publicação não comprova que a captura natural real da
conta já ocorreu depois do deploy; essa conferência permanece separada.

## Robustez e referência de schema

Falhas no armazenamento opcional da extensão ficam isoladas da conciliação
legada: não invalidam seu relatório nem alteram seus valores. Pares repetidos
de item/variação são `INVALID`, sem soma ou descarte para fabricar quantidade.
A gravação opcional exige lease ainda vigente na hora da escrita; uma resposta
após expiração ou substituição não publica uma captura antiga. O candidato
inclui dois testes de expiração para essa proteção.

Referência comunitária pinada, sob licença MIT:
[Shopee SDK — schema Returns, linhas 323–371](https://github.com/congminh1254/shopee-sdk/blob/abd55142a3b2ebcf2c71783fd613679be6188f9f/src/schemas/returns.ts#L323-L371).
O schema separa `amount` de `item_price` e `refund_amount`. O incremento usa
somente a quantidade comercial validada; preço e valor de reembolso não viram
quantidade. É referência de schema, não prova de grant, disponibilidade na
região ou permissão da loja. Nenhuma biblioteca SDK foi importada no runtime.

## O que permanece separado

A evidência comercial não altera `original_quantities`, recebimentos, inspeções,
fabricação declarada, vínculos, estoque, reservas ou revenda. Não preenche
automaticamente identidade ou quantidade física. Não muda custos históricos,
repasse, imposto, Ads, resultado estrito, lucro realizado ou contratos Hermes.

O operador continua responsável pela conferência física e pela origem
declarada da associação com fabricação. O detalhe da solicitação não prova
pagamento de reembolso, liquidação bancária ou valor recuperável da peça.
Valoração e ponte contábil sem dupla contagem permanecem etapas futuras.

Não incluir valores da conta, pedidos privados, dados de clientes ou exemplos
reais em documentos e fixtures. QA de telas deve ser sintética e identificada;
os registros reais da operação não devem ser alterados para demonstrar a UI.

## Validação e recibo da publicação

| Etapa | Estado neste corte |
| --- | --- |
| Versão, notas e caminhos | Publicados no App `0a2955bc`, versão visível `2026-11-02.2`. |
| Finance, Auth e App | Publicados em ordem Finance → Auth → App, com bytes e configuração conferidos após cada etapa; contratos legados preservados. |
| Testes integrais e CI | CI 41520727701 aprovada no head `2e255910`; 3248 Node e 67 Python aprovados, sem falhas, cancelamentos ou skips Node. |
| QA normal/minificada em desktop e celular | Quatro combinações sintéticas 320/1365 aprovadas para itens, caso/mês fixado, ausência legada e preservação dos registros/finanças. |
| Código, configuração, domínios, flags e cron | Conferidos nos três Workers ao concluir em 02/11/2026 às 17:45:00 Brasília. |
| Captura natural real da conta após deploy | Ainda depende de conferência separada; publicação técnica não comprova os itens efetivamente capturados. |
| Uso físico real e confronto Seller Centre/banco | Não executados nesta entrega; M2/M2.2 continuam abertas. |

| Worker | UUID da versão Cloudflare | SHA-256 gerado | SHA-256 publicado |
| --- | --- | --- | --- |
| Finance | `5e3b4686-1011-4e24-a890-fa33050b8490` | `dd1053972a38a5f05507ef371df328d9d384cf2201ee7b1ae1276c6cd194020c` | `02eed41452928046f4180eee4e0544ddbc041c72aa4970a2081d4a21eae17d49` |
| Auth | `e13c43ad-b096-411b-8ae7-92e24ff44991` | `9654c03c15313f816d34c14824023213178ba96105a2e351d56fa999d854384a` | `ac8e66ec61006289583f77baf356923c25cff7c91669559b30c11bab2320e3f8` |
| App | `0a2955bc-e420-42a1-8c53-97f6fef04358` | `09c261f230ec89489b124fa071cb3e1a99fcc1b955bc886401646c7605fbe96f` | `e7e85a3f82afbb18af111bce88c627bd3928ac4e88ea4d39c4a5b7a07953cd42` |

O recibo verifica os bytes e a transformação esperada dos artefatos gerados e
publicados, além da preservação de configurações a cada etapa. O publisher não
consultou endpoints owner nem o provedor, não gravou fatos físicos/financeiros
e não alterou os ledgers. A publicação não é captura de dados ou aprovação do
uso operacional. Integração em main deve ser conferida pelo estado da PR103.

A declaração anterior de ausência de outras despesas de novembro permanece um
fato separado, registrado antes da PR102. Esta publicação não a repete nem a
transfere para outro mês. Dados e montantes privados ficam fora dos documentos.

## Retomada e rollback

Conferir a captura natural e sua cobertura no caso escolhido antes de afirmar
que a conta já tem os detalhes pós-deploy. Não reautorizar OAuth, reiniciar
coleta ou criar consultas comerciais para preencher ausências. Leitores sem a
extensão continuam usando o relatório legado; itens não capturados permanecem
desconhecidos. A publicação não habilita automaticamente quantidades físicas.

Rollback deve preservar as evidências aditivas e os ledgers existentes, sem
apagar registros para fazer um código antigo aceitar dados novos. Os guards e
limites físicos/de fabricação já publicados continuam aplicáveis. O novo
detalhe não deve ser usado para promover associações ou quantidades físicas
automaticamente durante rollback ou avanço de versão.

Depois da entrega técnica, conferir a origem e um recebimento real no mesmo
caso. **M2/M2.2 permanecem abertas**: faltam a confirmação operacional das
quantidades físicas e origem, custos históricos/incrementais, valoração e
ponte contábil. Seller Centre e banco exigem comparação no mesmo recorte;
Ads/PROMO e escritas comerciais continuam bloqueados pelos gates existentes.
