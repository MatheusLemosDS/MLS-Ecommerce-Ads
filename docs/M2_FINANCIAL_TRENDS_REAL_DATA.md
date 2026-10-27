# MLS Commerce OS — Evolução financeira com dados reais (M2)

**Entrega:** PR #32, merge `78f1ed1514bcc72a4bfebc069e7c39ce3f466995`.

## Proveniência
O gráfico recebe `brazaDayDashboard.getTrend()`, uma projeção restrita
da memória mensal já validada por `projectDailyBusinessSummary`.
Cada ponto é um dia salvo, no máximo 14 dias do mesmo mês e até a data
selecionada. O calendário de Ads é o que a Shopee informou; o fuso dessa
fonte permanece não confirmado. Não consultar o provedor só para desenhar.

## Elementos
- Visão Geral: Resultado diário estimado, Vendas dos pedidos pagos e Gasto
  Ads, alteráveis por seleção de série no gráfico.
- MLS Finance e MLS Ads: mesmo gráfico por data, mas cada qual dentro
  de seu painel separado.
- Cartões: resultado positivo em verde, estimativa negativa em vermelho.
  Indicadores de diferença em reais com ↑/↓. O chip sempre identifica
  as datas efetivamente comparadas.
- Margem: delta em pontos percentuais; não multiplicar a diferença por
  uma segunda porcentagem relativa enganosa.
- Gastos Ads: alta laranja, redução azul. Não afirmar desempenho ROAS
  somente porque houve variação de gasto.

## Regras de integridade
1. Projetor preserva `null`, zero e `PARTIAL_COSTS` como estados distintos.
2. Dias ausentes nunca são interpolados. Eixo zero permite lucro positivo
   e saldo negativo no mesmo gráfico. Leitura parcial marcada em âmbar.
3. Comparação exige dias consecutivos, completos, `OPERATIONAL`, fonte
   sem código impeditivo e valores inteiros seguros em centavos.
4. Quando o dia anterior é zero, mostrar delta absoluto, sem percentual.
5. `KNOWN_COSTS` é um saldo parcial, não lucro definitivo.
6. Estimativa diária ≠ dinheiro recebido, lucro realizado, competência do
   depósito, ou saldo ainda a receber no banco.
7. Nenhum novo endpoint, tabela, D1, fetch, polling, cron ou escrita na
   Shopee/Ads/PROMO foi adicionado.

## Validação
CI `40599192490` / `40599428231`: Node 2.087/2.087, Python 67.
O teste de Chromium real com cenário sintético verificou gráficos nos
três painéis, dados negativos em vermelho, vendas em alta em verde,
maior gasto Ads em âmbar e ausência de erros de JavaScript. A imagem
de teste nunca correspondeu aos valores reais da loja.

Cloudflare Builds App, Auth e Finance: success no merge da PR #32.
Conferência visual na conta autenticada e gate do Seller Centre: pendentes.

## Continuidade
Após aprovação visual, retomar a auditoria de Pending atual e conciliação
de liberações por pedido na M2. M3 Pricing/Products só após critério de
saída financeiro; Ads/PROMO segue LOCKED.
