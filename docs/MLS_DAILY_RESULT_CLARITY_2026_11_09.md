# Resultado diário e devoluções às claras — 09/11/2026

**Resultado diário e devoluções às claras — `PREPARED_NOT_PUBLISHED`:** versão `2026-11-09.1`, 09/11/2026. Na Visão geral, a explicação do cartão diário fica visível. No detalhamento do dia, aparecem os pedidos com devolução informada, a cobertura ainda desconhecida, a base do repasse e o aviso quando devoluções/reembolsos ainda podem alterar a estimativa, inclusive nos estados parciais. A produção descontada corresponde aos itens dos pedidos pagos criados na data selecionada; a fabricação real por data continua separada. Ads da data e parcelas diárias de DAS/despesas mantêm os cálculos existentes. Devolução informada não comprova reembolso já conciliado ou crédito automático de produção/reaproveitamento. Preparada; fonte/head/PR/CI, contagens e hashes/publicação deste candidato continuam sem evidência final. A última Live comprovada permanece `2026-11-06.2`, App `09621a33-2fd1-48e1-8155-f022bc18f66e`, PR112 integrada em `96e16057dc5190917622510ffc1b2130ced47841`; vetor/configuração novamente conferidos por GET em 09/11/2026. Fórmulas, DTOs, leituras, Hermes, seis agentes, meses/rascunhos, fabricação e fechamento semanal preservados; sem novos endpoints/provedores ou fatos reais criados. M2/M2.2 e comparação Seller Centre/banco continuam abertos. [Uso, evidências e limites](#como-conferir).

## Como conferir

1. Abra **Visão geral** (`/admin?tab=overview`). A explicação junto do cartão **Lucro estimado hoje** informa a base dos custos e suas limitações.
2. Abra **Financeiro → Consultar um dia específico** (`/admin?tab=agent-finance#businessDay`) e escolha Hoje, Ontem ou a data desejada em Brasília. A leitura usa os dados salvos existentes.
3. Leia o aviso visível de devoluções junto do resultado. Ele distingue pedidos com devolução informada e pedidos cuja leitura de devoluções está pendente. A quantidade de pedidos não é o valor de reembolso nem prova de recebimento físico.
4. Confira se a fonte do repasse é a base informada pela Shopee ou o valor após os ajustes informados. Quando devoluções/reembolsos não estão conciliados, o aviso continua visível mesmo com resultado parcial ou em apuração.
5. Em **Ver cálculo e pendências do dia**, confira os valores, pendências e horários das fontes antes de comparar o recorte com Seller Centre e banco.

## O que a estimativa desconta

A base são os pedidos pagos criados na data selecionada em Brasília. O custo de produção é a referência dos itens dessas vendas, conforme os custos já identificados; não é a soma de peças fisicamente fabricadas naquela data. O gasto de anúncios segue a data de calendário informada pela fonte. DAS e outras despesas mensais declaradas entram pela parcela diária existente; a conta mensal mantém o valor completo. Se algum custo ou fonte necessária estiver desconhecido, isso continua explícito e não vira zero.

O repasse já considera as deduções informadas pela Shopee. Ajustes e reposição de recarga confirmados seguem o cálculo existente, sem descontar ou somar duas vezes. A entrega apenas esclarece os parâmetros; não altera fórmula, arredondamento, DTO, coleta, fonte ou quantidade de consultas.

## Devoluções, fabricação e dinheiro recebido

Uma devolução informada não prova que seu reembolso já foi conciliado na leitura financeira. Ajustes presentes na fonte usada entram na estimativa existente; devoluções ainda pendentes podem alterar o resultado depois. O aviso de base do repasse não transforma uma contagem de devoluções em valor devolvido nem afirma que todos os casos já foram descontados. O resultado diário segue sendo uma estimativa operacional, não lucro final fechado ou dinheiro recebido no banco.

Receber uma peça devolvida, aprová-la para reutilização e enviá-la novamente exige registros físicos e custos incrementais confirmados. A tela não estorna automaticamente o custo completo de produção, não presume crédito de estoque e não decompõe custo all-inclusive em peça/estampa versus etiqueta/embalagem. Cancelar ou devolver uma venda também não apaga fabricação real já registrada.

A produção realizada por data e a conferência semanal de sexta 13h a sexta 13h, em Brasília, continuam separadas do resultado por vendas. Dias ausentes e custos históricos desconhecidos permanecem pendentes; não há segunda dedução de fabricação no lucro. As declarações dos oito intervalos, cortes de sexta, originais/revisões e auditoria da versão anterior permanecem preservados.

## Escopo e validação

Mudança de apresentação no App, usando os contratos existentes. Auth/Finance, Hermes, seis agentes da inicial, navegação, escolha de mês, rascunhos e gates comerciais permanecem preservados. Sem migração, novo endpoint, leitura adicional, chamada ao provedor, alteração de cron ou escrita em fatos físicos/financeiros. QA usa somente dados sintéticos, sem recebimentos/devoluções/fabricação reais criados para demonstração.

`PREPARED_NOT_PUBLISHED`: validação completa ainda pendente. Fonte/head/PR/CI, contagens, hashes e publicação deste candidato ficam null até os resultados reais. A última Live comprovada é `2026-11-06.2` (PR112 integrada em `96e16057dc5190917622510ffc1b2130ced47841`), com vetor dos três Workers novamente conferido por GET em 09/11/2026. Preparação de código/documentos não comprova publicação, integração ou uso real.

## Continuidade do roadmap

M2 — Finance/Returns confiáveis e M2.2 continuam abertos, com M3 Observer em paralelo. Próximo: conferir os parâmetros no uso real e comparar o mesmo recorte com Seller Centre/banco; continuar recebimento/fabricação reais e decomposição histórica antes de valorar, reservar ou integrar reaproveitamento/revenda ao resultado sem dupla contagem. Ads/PROMO, preço e estoque externo continuam nos gates existentes.

Preservar [conferência da fabricação](MLS_PRODUCTION_COVERAGE_2026_11_06.md), [fechamento semanal](MLS_PRODUCTION_WEEKLY_CLOSE_2026_11_03.md), [produção diária e Hermes](MLS_PRODUCTION_DAILY_HERMES_2026_11_03.md) e [auditoria de devoluções/reaproveitamento](MLS_RETURNS_REUSE_ROADMAP_AUDIT_2026_11_01.md). Seus recibos históricos não substituem esta entrega nem comprovam o fechamento financeiro.
