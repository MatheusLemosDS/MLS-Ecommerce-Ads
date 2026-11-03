# M3 · Margens e evidências por produto — 02/11/2026, Brasília

**Estado: `PUBLISHED_VERIFIED`.** Versão **2026-11-02.6 — M3 · Margens e evidências por produto**.
App publicado e conferido em **03/11/2026 às 00:04:01 Brasília**; Auth e Finance preservados.
PR [#107](https://github.com/MatheusLemosDS/MLS-Ecommerce-Ads/pull/107), branch `feature/m3-contribution-evidence-20261103`, base
`dea19f0ace932acccc917c63d8da46db417079c9`. Fonte `c70b0304ec4502edabe44a7ae90e144d6a7e4b7b`, head aprovado `53580d2612b3661c8d76016a35fb5a14f41e69c9`, CI
[41568940647](https://github.com/MatheusLemosDS/MLS-Ecommerce-Ads/actions/runs/41568940647) aprovada: 3400 Node e 67 Python.
Publicação e CI não comprovam merge: consultar a PR vinculada para a integração Git.

A Live anterior comprovada era **2026-11-02.5**, publicada em
**02/11/2026 às 23:15:11 Brasília**: App
`124b7071-6152-44fa-bf44-5edf98eca2dc`, Auth
`d6f4397f-ac4d-45cf-93da-175df8305a6d` e Finance
`7001376b-f065-4e37-84ea-ee9ac2ea890c`. A PR
[#106](https://github.com/MatheusLemosDS/MLS-Ecommerce-Ads/pull/106) foi integrada
em `dea19f0ace932acccc917c63d8da46db417079c9`, em **02/11/2026 às 23:22:06 Brasília**,
com CI documental [41565003839](https://github.com/MatheusLemosDS/MLS-Ecommerce-Ads/actions/runs/41565003839)
aprovada e árvore/vetor Live conferidos. O [guia anterior](MLS_M3_PRODUCT_WORKBENCH_2026_11_02.md)
preserva o corte de publicação da primeira entrega.

## Mudança entregue e caminho de uso

O proprietário autorizou avançar a M3 em paralelo. Este incremento apresenta
evidências de contribuição no painel **MLS Products → Análise e preços**,
`/admin?tab=agent-products#businessMonthPricingObserver`, usando o mesmo mês
salvo. Selecionar um produto mostra a composição dos valores em uma área
própria, os motivos de pendência e a cobertura do recorte exclusivo. O ranking,
ABC por unidades, filtros locais, variações e simulador existentes continuam.
O alias antigo `/admin?tab=agent-finance#businessMonthPricingObserver` permanece.

| Informação | Base e limite |
| --- | --- |
| Saldo e margem de contribuição conferidos | Pedidos exclusivos com fonte/quantidade/valores coerentes; antes de Ads, DAS mensal e despesas não atribuídas. Sinal positivo/negativo só com valor válido. |
| Composição financeira do produto | Vendas, diferença líquida até o repasse, repasse e custo de referência do mesmo recorte exclusivo; resultado estrito separado dos valores registrados/conhecidos. |
| Pendências | Motivo e quantidades afetadas, com valores conhecidos e fonte; ausência continua desconhecida. |
| Uma única variação vendida | Evidência exclusiva apenas se todos os gates de quantidade, origem, completude e dinheiro forem satisfeitos. |
| Mais de uma variação vendida | Valores monetários por variação desconhecidos; nenhum rateio por quantidade ou preço médio. |

## Como interpretar os valores

No regime MEI, a contribuição é o repasse dos pedidos exclusivos menos o custo
de referência das unidades desse mesmo recorte; o DAS mensal não é distribuído
por produto. No regime legado, a referência de imposto por pedido já usada
no resumo canônico é preservada e identificada como referência, não tributo
oficial. O gráfico mostra essa base sem recomputar ou atribuir taxas.

O custo de pedidos mistos pode constar na cobertura geral do produto, mas nunca
é descontado do saldo exclusivo. Pedidos mistos não recebem receita, repasse,
Ads ou despesas por rateio.

O gráfico de composição separa o resultado conferido dos valores conhecidos
de uma leitura incompleta. Um subtotal registrado não confirma lucro líquido,
recebimento bancário ou conclusão de uma devolução. Fonte ausente ou incoerente
mantém o resultado estrito desconhecido; não é substituída por zero.

A diferença entre vendas e repasse pode conter frete, descontos, cupons e
ajustes. Não é apresentada como taxa oficial. Um ajuste já considerado no
repasse não é descontado nem adicionado novamente. Ads, DAS-MEI mensal e outras
despesas continuam no fechamento mensal, fora da contribuição por produto.

O custo usado aqui é a referência atual aplicada às vendas, por unidade
comercial do anúncio. Kit mantém o custo do kit. Não comprova custo histórico,
fabricação por data ou valor de estoque reaproveitável, nem cria outro gasto
de produção no resultado. O ledger de fabricação e o ciclo físico de devolução
mantêm suas fontes e datas próprias.

## Evidência exclusiva de uma variação vendida

A contagem considera modelos com quantidade vendida no recorte, e não quantas
variações existem no catálogo atual. Só uma variação vendida, por si só, não
autoriza atribuição. Quantidades do produto, do recorte exclusivo e da variação,
cobertura de custos, fonte, consistência e valores monetários precisam passar
pelas validações estritas. O recorte e sua fonte devem permanecer explícitos.

Quando as condições forem satisfeitas, a nova evidência representa contribuição
de referência de pedidos exclusivos atribuíveis à única variação vendida.
Não representa margem líquida por SKU ou margem de todas as vendas do modelo.
Os campos legados v1 de margem/lucro por variação continuam `null`.
Com múltiplas variações vendidas, dados incompletos, desatualizados ou incoerentes,
os valores da nova atribuição continuam desconhecidos e os motivos são exibidos.

## Fontes e preservação

A entrega usa `buildMlsProductFinancialEvidence(frame, projectMonth)` para
projetar o resumo financeiro canônico do mês salvo, em um contrato separado
e imutável `mls_product_financial_evidence_v1`. A leitura exige projeção mensal
canônica `COMPLETE`, identifica período, datas das fontes e revisões, e mantém
valores estritos separados dos conhecidos. Pendências de fonte, desatualização,
pagamento, situação ou aritmética bloqueiam o resultado estrito correspondente.

Não cria API, consulta SQL, coletor, polling ou chamada ao provedor. Não modifica
os contratos legados v1 de inteligência, Finance ou Hermes e não grava fatos
físicos ou financeiros.

Preservar os seis cartões de agentes na inicial, equipe completa, mês e
rascunhos, seleção e hipóteses explícitas do simulador, navegação e filtros.
As simulações continuam matemáticas, sem preço seguro, ROAS real por SKU,
estoque verificado ou permissão para alterar anúncios. Ads/PROMO e escritas
comerciais continuam nos gates oficiais.

## Validação e publicação

Suíte completa aprovada: **3400 Node e 67 Python**, sem falhas ou skips;
CI do head exato e QA local/sintética normal/minificada em 320/1365 px.
As provas cobrem contribuição positiva/negativa/zero, custo exclusivo versus
misto, valores estritos versus conhecidos, fontes/quantidades incoerentes,
uma versus múltiplas variações vendidas, ajuste já no repasse e preservação
do mês, dos rascunhos e das hipóteses do simulador. QA não comprova aceite real,
recebimento físico, fabricação incorrida ou fechamento financeiro.

O detalhamento financeiro cabe na área visível em 320 px, inclusive com fonte
ampliada. Os links das novidades respeitam a navegação fixa; o clique nativo
foi validado em telas de 900 e 960 px de altura e com Arial de 13 px, mantendo
os testes de toque, alvo descoberto e integridade dos dados.

Publicação App-only concluída, com bytes/configuração/domínios/flags/cron dos
três Workers conferidos e Auth/Finance preservados. O publisher executou zero
consultas D1 e zero chamadas owner/provedor; não criou fatos físicos ou financeiros.

| Worker | UUID publicado/preservado | SHA-256 gerado | SHA-256 publicado |
| --- | --- | --- | --- |
| App | `fef9da9e-bcfc-42e1-a8c4-e38b84a656bd` | `1e7170f8ba3770359d5cdde96f66b0dfcb4d3aebdd0e2c7898bc1ef3a38448d0` | `f42606660a0debd8173c2915706bc4c888e0fba76a85bd2272142c93f1ec87fe` |
| Auth | `d6f4397f-ac4d-45cf-93da-175df8305a6d` | `851e27c703fda4143b87a8a85a79c06326b9a2f25ce16f5625d8871a589f43ec` | `5e18583606c453bd4e5ecfbc983db13826e4ad7f1c336fde5b7bbe9d628b2bd6` |
| Finance | `7001376b-f065-4e37-84ea-ee9ac2ea890c` | `d7e64105b88602fa20f8e733f5e16548cfa3ceefbbd7733a87dfb5e5bd8fcd49` | `ea8a5abf0c818539ee02e0e14260b973d0d2ed243f2c0eb26162ae3bbb3fcb59` |

Integração Git: consultar o estado atual da PR vinculada. O recibo identifica
código e horário publicados; merge exige evidência própria.

## Continuidade

M2/M2.2 continuam abertas: conferir fatos reais de fabricação/recebimento,
decompor custos históricos de peça versus embalagem/etiqueta/reparo antes de
valorar/reservar/consumir na revenda e comparar o mesmo recorte com Seller Centre
e banco. Novembro já possui declaração explícita de despesas; não copiá-la para
outros meses ou pedir novamente sem uma mudança real.

Esta é outra entrega Observer da M3, não a conclusão de toda a fase.
Não registrar credenciais, IDs privados de pedidos, dados pessoais, SQL bruto
ou valores reais da conta nas provas versionadas. O [roadmap canônico](ROADMAP_MLS_COMMERCE_OS.md)
e os checkpoints mantêm as pendências financeiras e os gates de execução.
