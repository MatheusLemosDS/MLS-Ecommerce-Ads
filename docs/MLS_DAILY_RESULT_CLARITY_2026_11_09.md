# Resultado diário e devoluções às claras — 09/11/2026

**Resultado diário e devoluções às claras — `PUBLISHED_VERIFIED`:** versão `2026-11-09.1`, 09/11/2026. Na Visão geral, a explicação do cartão diário fica visível. No detalhamento do dia, aparecem os pedidos com devolução informada, a cobertura ainda desconhecida, a base do repasse e o aviso quando devoluções/reembolsos ainda podem alterar a estimativa, inclusive nos estados parciais. A produção descontada corresponde aos itens dos pedidos pagos criados na data selecionada; a fabricação real por data continua separada. Ads da data e parcelas diárias de DAS/despesas mantêm os cálculos existentes. Devolução informada não comprova reembolso já conciliado ou crédito automático de produção/reaproveitamento. App publicado e vetor dos três Workers conferido em 2026-11-09T19:56:08-03:00. Fonte `fb4b91901f4e1cf8cf67ace57533ddef013a7f5c`, head `cf6978bd70ede20dad4123874459ad7924d233e7`, CI [42714393350](https://github.com/MatheusLemosDS/MLS-Ecommerce-Ads/actions/runs/42714393350) aprovada: 3602 Node e 67 Python; Chromium sintético normal/minificado, 320/1365 e claro/escuro. O recibo registra a publicação; o estado atual da integração deve ser consultado na [PR #113](https://github.com/MatheusLemosDS/MLS-Ecommerce-Ads/pull/113). Fórmulas, DTOs, leituras, Hermes, seis agentes, meses/rascunhos, fabricação e fechamento semanal preservados; sem novos endpoints/provedores ou fatos reais criados. M2/M2.2 e comparação Seller Centre/banco continuam abertos. [Uso, evidências e limites](#como-conferir).

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

Publicação do App conferida em 2026-11-09T19:56:08-03:00. Fonte `fb4b91901f4e1cf8cf67ace57533ddef013a7f5c`, head `cf6978bd70ede20dad4123874459ad7924d233e7`; CI [42714393350](https://github.com/MatheusLemosDS/MLS-Ecommerce-Ads/actions/runs/42714393350) aprovada com 3602 Node e 67 Python, sem falhas/skips. Oito resultados Chromium sintéticos normal/minificado ×320/1365 ×claro/escuro vinculados aos hashes dos três Workers. Auth/Finance, configurações, domínios, subdomínios, flags e cron conferidos. O recibo prova a publicação naquele corte; consulte a PR para a integração atual: https://github.com/MatheusLemosDS/MLS-Ecommerce-Ads/pull/113. Aceite real do proprietário não foi presumido.

```json
{
  "versions": {
    "app": "36d5afa6-f53c-4b3a-96aa-69ac8c886fb6",
    "auth": "ec385ca9-a986-49ec-abab-25a29daaf33b",
    "finance": "9ed0bd7d-269a-4e5f-81d0-63be8c6ac2c4"
  },
  "generated_sha256": {
    "app": "3ee87e09330e259bef0fdd8cb6e4a7ef2466c9aaee01140a88beb67e5ca8af65",
    "auth": "47c83f87f191fd0e5ff503d9c4bcf4671cd986b0965e66e84f1a6ed952dac925",
    "finance": "08ada5ecec92350f4f8301fdb7baa00f5f8083a0e8390296b2870e0ff3cdc1a5"
  },
  "published_sha256": {
    "app": "15285b59c368a514ef1a65c6b49a22294541e3670df38276ee13337725566194",
    "auth": "2a2c2433c6fba25d1c399991595c96e6b8a85045edb77879c8270c446cb45ad2",
    "finance": "e5bf80e14ff00e5b365bfbcfb25bf3a4dc1e42bf40bb0e4259909649eea1d5cd"
  }
}
```

## Continuidade do roadmap

M2 — Finance/Returns confiáveis e M2.2 continuam abertos, com M3 Observer em paralelo. Próximo: conferir os parâmetros no uso real e comparar o mesmo recorte com Seller Centre/banco; continuar recebimento/fabricação reais e decomposição histórica antes de valorar, reservar ou integrar reaproveitamento/revenda ao resultado sem dupla contagem. Ads/PROMO, preço e estoque externo continuam nos gates existentes.

Preservar [conferência da fabricação](MLS_PRODUCTION_COVERAGE_2026_11_06.md), [fechamento semanal](MLS_PRODUCTION_WEEKLY_CLOSE_2026_11_03.md), [produção diária e Hermes](MLS_PRODUCTION_DAILY_HERMES_2026_11_03.md) e [auditoria de devoluções/reaproveitamento](MLS_RETURNS_REUSE_ROADMAP_AUDIT_2026_11_01.md). Seus recibos históricos não substituem esta entrega nem comprovam o fechamento financeiro.
