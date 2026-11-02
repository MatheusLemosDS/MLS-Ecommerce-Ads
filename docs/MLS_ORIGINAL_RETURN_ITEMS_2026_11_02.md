# Itens e quantidades das devoluções — 02/11/2026

**Estado: preparado, ainda não publicado (`PREPARED_NOT_PUBLISHED`).**
Branch `feature/returns-original-items-20261102`, base
`9fc4c69f004e5e709931fad4fdc3bdfa385aff93`.
Versão prevista: **2026-11-02.2 — Itens e quantidades das devoluções**.
A última Live comprovada neste corte continua sendo a PR102, versão
`2026-11-02.1`, App `8e1056d2-4e2f-4ffe-9100-84ea2758a0c5`.
Validação integrada, CI, publicação e conferência deste incremento ainda
precisam de recibos próprios. Preparação Git não comprova publicação.

## O que este incremento prepara

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

## Onde abrir após a publicação

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

No App, a evidência fica separada do relatório legado e vinculada ao seu
conteúdo, revisão, datas e publicação exatos. O contexto agregado usa
`business_original_items_v1`. A leitura owner opt-in de recebimento é
`returns/physical?month=AAAA-MM&evidence=original-items-v1`, com envelope
`physical_returns_workspace_v2`; o relatório físico legado permanece separado.

Pedido pago usa itens já preservados. Para Returns, o novo detalhe será
capturado quando as consultas programadas existentes ocorrerem; não há novo
backfill, reinício de coleta ou requisição adicional ao provedor para preencher
o histórico. Abrir o bloco lê as evidências salvas, sem forçar a Shopee.
Um sidecar ausente, antigo ou incompatível não torna válido um contexto de
outra publicação e não transforma ausência em uma lista comprovadamente vazia.

## O que permanece separado

A evidência comercial não altera `orig_quantities`, recebimentos, inspeções,
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

## Validação e publicação planejadas

| Etapa | Estado neste corte |
| --- | --- |
| Versão, notas e novos caminhos | Preparados; aguardam validação integrada com o bloco e os contratos. |
| Finance, Auth e App | Incremento opt-in em preparação; contratos legados e implantação mista precisam de testes no candidato final. |
| Testes integrais e CI | Recibo final pendente. Resultados parciais não comprovam a suíte ou publicação. |
| QA normal/minificada em desktop e celular | Pendente no candidato integrado; preservar o harness nativo de coordenadas e todas as rotas físicas anteriores. |
| Publicação e conferência de bytes/configuração | Ainda não executadas. Ordem planejada: **Finance → Auth → App**, com recibos exatos dos três Workers. |
| Uso real pelo proprietário e confronto Seller Centre/banco | Não executados nesta entrega; M2/M2.2 continuam abertas. |

Antes de declarar publicação, registrar PR, head/CI aprovados, data/hora real,
UUIDs e hashes dos três Workers e a preservação de configuração, domínios,
bindings, flags e cron. Não confundir sucesso de CI ou merge com versão ativa.

## Retomada e rollback

Concluir a integração e seus testes antes da publicação planejada. Conferir o
comportamento dos leitores antigos e de cada etapa mista, sem reautorizar OAuth
ou criar chamadas comerciais. Um leitor sem a extensão deve continuar usando
o relatório legado; itens não capturados permanecem desconhecidos.

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
