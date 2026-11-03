# M3 · Produtos e cenários de preços — 02/11/2026

**Estado: `PREPARED_NOT_PUBLISHED`.** Versão proposta
**2026-11-02.5 — M3 · Produtos e cenários de preços**.
Branch `feature/m3-products-intelligence-20261103`, base oficial
`b840da57b9f2074e4ad120314f4871e1947aa1a5` após a PR105 integrada.
Este documento descreve o candidato em preparação, não um recibo de publicação.
PR, fonte, head, CI, UUID e hashes novos só serão registrados após a evidência real.

A última Live comprovada continua a versão `2026-11-02.4`, publicada em
**02/11/2026 às 19:50:54 Brasília**: App
`16ee9374-f16a-45b3-99a9-92669d296c9b`, Auth
`d6f4397f-ac4d-45cf-93da-175df8305a6d` e Finance
`7001376b-f065-4e37-84ea-ee9ac2ea890c`. A PR105 foi integrada em
`b840da57b9f2074e4ad120314f4871e1947aa1a5`, com CI documental
[41540981824](https://github.com/MatheusLemosDS/MLS-Ecommerce-Ads/actions/runs/41540981824)
aprovada e árvore/vetor Live conferidos. [Registro anterior](MLS_OVERVIEW_AGENTS_RESTORE_2026_11_02.md).

## Pedido e resultado preparado

O proprietário autorizou construir a M3 em paralelo. A fase financeira M2 e o
ciclo de produção/devolução M2.2 permanecem abertos. O primeiro incremento
reaproveita o engine Observer e o simulador já integrados, antes apresentados
dentro do detalhamento financeiro, e concentra a análise em **MLS Products**.

| Fluxo | Caminho previsto | Resultado do candidato |
| --- | --- | --- |
| Análise mensal | `/admin?tab=agent-products#businessMonthPricingObserver` | Ranking completo, busca, classe ABC, ordenação e paginação locais. |
| Variações e referência de custo | Mesmo painel, no produto selecionado | Nomes atuais, quantidades comerciais, custo da unidade vendida/kit e cobertura conhecida/pendente. |
| Cenário de preço | Mesmo painel, na variação com custo conhecido | Equilíbrio matemático e preço para a margem informada, sempre como simulação. |
| Catálogo salvo | `/admin?tab=products` | Cadastro e variações existentes; acesso interno à análise substitui a indicação antiga de PR47 separada. |
| Endereço antigo | `/admin?tab=agent-finance#businessMonthPricingObserver` | Alias para o mesmo painel, preservando mês e controles. |

O observador mantém uma única instância e seus IDs `businessMonthPricing*`.
O detalhamento financeiro por produto permanece no Financeiro. A navegação,
os seis agentes da inicial e a equipe completa com sete continuam preservados.
As mensagens antigas de Pricing/Listing Factory em PR separada serão corrigidas
para refletir as capacidades locais integradas, sem conceder permissão de publicação.

## O que os números representam

- **ABC por unidades:** participação na quantidade comercial vendida no mês,
  com gráfico e tabela equivalentes. Não representa inventário, peça física ou lucro.
- **Custo por variação:** referência atual salva, por unidade vendida do anúncio.
  Um kit conserva seu custo do kit; não é multiplicado novamente como peça.
  Custo ausente continua pendente, com a cobertura conhecida separada.
- **Saldo exclusivo:** somente o subconjunto de pedidos exclusivos com fonte
  conferida, antes de Ads, DAS mensal e despesas não atribuídas. Pedido misto
  permanece sem rateio. Nenhum subtotal é promovido a lucro líquido por SKU.
- **Nomes e atributos:** rótulos atuais do catálogo salvo, sem alterar as fontes
  financeiras ou comprovar a identidade histórica de uma peça.
- **Margem por variação:** desconhecida, pois a base atual não contém receita
  ou repasse atribuídos à variação. Dividir a receita do produto entre modelos
  ou usar uma média não fornece essa evidência.

A referência de custo das vendas não é o ledger de fabricação incorrida.
Este painel não soma novamente a fabricação ao resultado, muda a data real
de produção ou atribui estoque a partir das unidades vendidas.

## Cenários matemáticos, com hipóteses explícitas

O cenário usa cinco valores explícitos: custo da unidade vendida selecionada,
outros custos por unidade, taxas percentuais, Ads percentual e margem desejada.
O custo selecionado precisa ser conhecido e positivo. Os quatro campos de
hipóteses informados pelo operador exigem preenchimento, inclusive quando zero;
não há taxa oficial, estoque ou atribuição Ads presumidos.

O equilíbrio matemático usa margem zero; o alvo usa a margem declarada.
Ambos reutilizam o modelo inteiro/arredondamento do simulador existente.
Não são preço mínimo seguro, preço recomendado, preço atual anunciado ou
autorização para alterar anúncios. Preço seguro, ROAS real por SKU e execução
comercial permanecem desconhecidos/bloqueados até os dados e gates apropriados.

Não inferir taxa pela diferença entre vendas e repasse: ela pode incluir frete,
cupons e ajustes. Não ratear Ads, DAS mensal ou pedidos mistos entre produtos.
As hipóteses do cenário não reescrevem custos, despesas ou tarifas da loja.

## Fontes e desempenho

O candidato usa o snapshot mensal, os metadados de catálogo e os controladores
já existentes. Buscar, filtrar, ordenar, paginar, expandir variações e calcular
cenários reutiliza os dados carregados. A renderização respeita limites locais
e trabalha apenas a página ativa. Não acrescenta endpoint, consulta SQL,
coleta, polling ou chamada ao provedor; não grava fatos físicos/financeiros.

Mudanças de mês, custo ou seleção exigem cenário atualizado; rascunhos do
operador e fontes distintas continuam separados. A validação deve cobrir
mudanças de metadados, entradas incompletas e proteção contra resultados antigos.

## Validação e publicação

**Pendente:** regressão integral, QA normal/minificada em 320/1365 px e temas
claro/escuro, CI do head exato, publicação App-only e conferência dos três Workers.
Os testes devem validar cabeçalhos com fonte ampliada, os seis agentes da inicial,
um único observador/alias, mês/histórico/rascunhos, filtros locais, nenhuma
margem por variação inventada e nenhum valor financeiro modificado pela análise.

O proprietário já autorizou incrementos validados na Live. A marcação de
preparação não repete aquela aprovação: distingue código em preparação de
publicação efetivamente comprovada. Registro de CI não prova deploy ou merge.

## Continuidade e limites

Após o recibo, conferir o painel com as fontes reais e continuar M2/M2.2:
fabricação e recebimento reais, quantidades/composição, decomposição histórica
da peça versus embalagem/etiqueta/reparo, valoração/reserva/consumo na revenda,
ponte contábil e comparação Seller Centre/banco. Ausência não é zero e publicação
não comprova aceite operacional ou fechamento financeiro.

Hermes permanece Observador e Ads/PROMO/escritas comerciais seguem seus gates.
Esta é a primeira entrega paralela da M3, não a conclusão de toda a fase.
Não incluir tokens, IDs privados de pedidos, SQL bruto ou montantes da conta
em documentação ou fixtures. Preservar rollback compatível, configuração,
domínios, flags, cron, histórico e a referência visual aprovada.
