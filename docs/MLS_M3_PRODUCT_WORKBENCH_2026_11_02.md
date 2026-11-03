# M3 · Produtos e cenários de preços — 02/11/2026

**Estado: `PUBLISHED_VERIFIED`.** Versão **2026-11-02.5 — M3 · Produtos e cenários de preços**.
App publicado e conferido em **02/11/2026 às 23:15:11 Brasília**; Auth e Finance preservados.
PR [#106](https://github.com/MatheusLemosDS/MLS-Ecommerce-Ads/pull/106), branch `feature/m3-products-intelligence-20261103`, base
`b840da57b9f2074e4ad120314f4871e1947aa1a5`. Fonte `a62fc2d3d01b1584cdeacc901bb948d8c0062dfc`, head aprovado `9e5dc518f6501fd94d5133aab46e6a25e8f2a768`, CI
[41563950925](https://github.com/MatheusLemosDS/MLS-Ecommerce-Ads/actions/runs/41563950925) aprovada: 3370 Node e 67 Python.
A publicação técnica e a CI não comprovam merge: consultar a PR vinculada
para o estado atual da integração Git. O recibo abaixo identifica a runtime entregue.

A Live anterior comprovada era a versão `2026-11-02.4`, publicada em
**02/11/2026 às 19:50:54 Brasília**: App
`16ee9374-f16a-45b3-99a9-92669d296c9b`, Auth
`d6f4397f-ac4d-45cf-93da-175df8305a6d` e Finance
`7001376b-f065-4e37-84ea-ee9ac2ea890c`. A PR105 foi integrada em
`b840da57b9f2074e4ad120314f4871e1947aa1a5`, com CI documental
[41540981824](https://github.com/MatheusLemosDS/MLS-Ecommerce-Ads/actions/runs/41540981824)
aprovada e árvore/vetor Live conferidos. [Registro anterior](MLS_OVERVIEW_AGENTS_RESTORE_2026_11_02.md).

## Pedido e resultado entregue

O proprietário autorizou construir a M3 em paralelo. A fase financeira M2 e o
ciclo de produção/devolução M2.2 permanecem abertos. O primeiro incremento
reaproveita o engine Observer e o simulador já integrados, antes apresentados
dentro do detalhamento financeiro, e concentra a análise em **MLS Products**.

| Fluxo | Caminho publicado | Comportamento entregue |
| --- | --- | --- |
| Análise mensal | `/admin?tab=agent-products#businessMonthPricingObserver` | Ranking completo, busca, classe ABC, ordenação e paginação locais. |
| Variações e referência de custo | Mesmo painel, no produto selecionado | Nomes atuais, quantidades comerciais, custo da unidade vendida/kit e cobertura conhecida/pendente. |
| Cenário de preço | Mesmo painel, na variação com custo conhecido | Equilíbrio matemático e preço para a margem informada, sempre como simulação. |
| Catálogo salvo | `/admin?tab=products` | Cadastro e variações existentes; acesso interno à análise substitui a indicação antiga de PR47 separada. |
| Endereço antigo | `/admin?tab=agent-finance#businessMonthPricingObserver` | Alias para o mesmo painel, preservando mês e controles. |

O observador mantém uma única instância e seus IDs `businessMonthPricing*`.
O detalhamento financeiro por produto permanece no Financeiro. A navegação,
os seis agentes da inicial e a equipe completa com sete continuam preservados.
As mensagens antigas de Pricing/Listing Factory em PR separada foram corrigidas
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

A entrega usa o snapshot mensal, os metadados de catálogo e os controladores
já existentes. Buscar, filtrar, ordenar, paginar, expandir variações e calcular
cenários reutiliza os dados carregados. A renderização respeita limites locais
e trabalha apenas a página ativa. Não acrescenta endpoint, consulta SQL,
coleta, polling ou chamada ao provedor; não grava fatos físicos/financeiros.

Mudanças de mês, custo ou seleção exigem cenário atualizado; rascunhos do
operador e fontes distintas continuam separados. A regressão cobre
mudanças de metadados, entradas incompletas e proteção contra resultados antigos.

## Validação e publicação

Suíte completa aprovada: **3370 Node e 67 Python**, sem falhas ou skips;
CI do head exato e QA local/sintética normal/minificada em 320/1365 px.
As provas cobrem o observador único/alias, agentes da inicial, mês/histórico,
rascunhos, filtros locais, cenários explícitos, nenhuma margem por variação
inventada e os valores financeiros preservados. QA não confirma aceite real
do proprietário nem fechamento financeiro.

Publicação App-only concluída e vetor completo de código/configuração/domínios/
flags/cron conferido. O publisher executou zero consultas D1 e zero chamadas
owner/provedor; não criou fatos físicos ou financeiros. A autorização existente
para incrementos validados na Live foi preservada.

| Worker | UUID publicado/preservado | SHA-256 gerado | SHA-256 publicado |
| --- | --- | --- | --- |
| App | `124b7071-6152-44fa-bf44-5edf98eca2dc` | `e20691b12dd668fa342bf6ff79e3b3de50a360378ddf0c41956f7a1b9b5b0830` | `200a569624f38e98a13a250ff5db2914a5e082136842b33bbe7f49bbdf0554e9` |
| Auth | `d6f4397f-ac4d-45cf-93da-175df8305a6d` | `851e27c703fda4143b87a8a85a79c06326b9a2f25ce16f5625d8871a589f43ec` | `5e18583606c453bd4e5ecfbc983db13826e4ad7f1c336fde5b7bbe9d628b2bd6` |
| Finance | `7001376b-f065-4e37-84ea-ee9ac2ea890c` | `d7e64105b88602fa20f8e733f5e16548cfa3ceefbbd7733a87dfb5e5bd8fcd49` | `ea8a5abf0c818539ee02e0e14260b973d0d2ed243f2c0eb26162ae3bbb3fcb59` |

Integração Git: **consultar o estado atual da PR vinculada**. O recibo da
publicação identifica código e horário; a integração possui evidência própria.

## Continuidade e limites

Conferir o painel entregue com as fontes reais e continuar M2/M2.2:
fabricação e recebimento reais, quantidades/composição, decomposição histórica
da peça versus embalagem/etiqueta/reparo, valoração/reserva/consumo na revenda,
ponte contábil e comparação Seller Centre/banco. Ausência não é zero e publicação
não comprova aceite operacional ou fechamento financeiro.

Hermes permanece Observador e Ads/PROMO/escritas comerciais seguem seus gates.
Esta é a primeira entrega paralela da M3, não a conclusão de toda a fase.
Não incluir tokens, IDs privados de pedidos, SQL bruto ou montantes da conta
em documentação ou fixtures. Preservar rollback compatível, configuração,
domínios, flags, cron, histórico e a referência visual aprovada.
