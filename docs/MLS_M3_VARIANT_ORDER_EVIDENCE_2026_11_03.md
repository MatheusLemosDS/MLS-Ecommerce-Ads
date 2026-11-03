# M3 · Contribuição por variação e pedido — 03/11/2026, Brasília

**Estado: `PREPARED_NOT_PUBLISHED`.** Versão proposta **2026-11-03.1 — M3 · Contribuição por variação e pedido**.
Branch `feature/m3-variant-order-evidence-20261103`, base
`aebc3c7aec9ad9937cc43565ba401b0b4ba07cba`. Este documento descreve o candidato
em preparação; não registra publicação, CI final ou aceite real do incremento.

A última Live comprovada continua **2026-11-02.6**, publicada em
**03/11/2026 às 00:04:01 Brasília**: App
`fef9da9e-bcfc-42e1-a8c4-e38b84a656bd`, Auth
`d6f4397f-ac4d-45cf-93da-175df8305a6d` e Finance
`7001376b-f065-4e37-84ea-ee9ac2ea890c`. A PR
[#107](https://github.com/MatheusLemosDS/MLS-Ecommerce-Ads/pull/107) foi integrada
em `aebc3c7aec9ad9937cc43565ba401b0b4ba07cba`, em **03/11/2026 às 00:12:21 Brasília**,
com CI documental [41570060190](https://github.com/MatheusLemosDS/MLS-Ecommerce-Ads/actions/runs/41570060190)
aprovada e árvore/vetor Live conferidos. O [guia anterior](MLS_M3_CONTRIBUTION_EVIDENCE_2026_11_03.md)
preserva o corte da primeira evidência de contribuição.

## Mudança preparada e caminho de uso

O proprietário autorizou continuar a M3 em paralelo. O candidato amplia a
evidência em **MLS Products → Análise e preços**,
`/admin?tab=agent-products#businessMonthPricingObserver`, no mesmo mês salvo.
O detalhamento da variação deverá informar a contribuição dos pedidos cujo
dinheiro pode ser atribuído integralmente àquele par produto/modelo, a
quantidade abrangida e o que continua sem atribuição.

| Situação preservada na fonte | Tratamento previsto |
| --- | --- |
| Dois modelos vendidos no mês, cada um em pedidos com um único par produto/modelo | Cada par pode receber os valores integrais dos seus próprios pedidos, sujeito aos gates financeiros. |
| Várias linhas do mesmo par, normalizadas pela fonte em um par | A quantidade comercial agrupada continua atribuível; não vira quantidade física de peças. |
| Um produto com vários modelos no mesmo pedido | O dinheiro permanece exclusivo do produto e sem atribuição entre modelos. |
| Vários produtos no mesmo pedido | O dinheiro continua no bucket misto global, sem rateio. |
| Captura antiga, incompleta, incoerente ou ausente | A atribuição permanece pendente; ausência não significa valor zero. |

A nova evidência deve substituir a evidência anterior no mesmo cartão quando
for aplicável; as duas não são somadas. A atribuição já comprovada para uma
única variação vendida no mês continua uma fonte distinta, preservada nos seus
limites. O ranking, ABC, filtros, custos e simulador existentes permanecem.

## Origem e conservação dos valores

O Finance já preserva pedidos comprometidos em `finance_business_period_orders`.
A agregação usa somente esses registros, depois das validações de identidade,
datas e hash do snapshot. O cache de pagamentos de checkpoint não pertence ao
relatório comprometido e fica fora da agregação.

Os pedidos pagos são particionados entre um par, um produto com vários modelos
e vários produtos. Quantidades por par, contagens e valores devem conservar
o relatório original: pares atribuídos mais o bucket multivariação reproduzem
os valores exclusivos do produto; o bucket misto reproduz o misto global.
Esses dois tipos de dinheiro sem atribuição não podem ser confundidos.

Pagamento ausente conserva quantidades conhecidas, mas não cria dinheiro.
Devolução conhecida ou desconhecida, status em revisão, fonte desatualizada,
custo desconhecido e aritmética insegura mantêm o resultado estrito bloqueado.
Componentes parciais conservam sua cobertura; não são subtraídos para inventar
um subtotal de conjuntos incompatíveis.

O custo é a **quantidade atribuída × referência unitária atual**. Unidades dos
outros pedidos ficam fora desse cálculo. Um kit conserva o custo da sua unidade
comercial, sem outra multiplicação por peças. Essa referência não comprova
fabricação incorrida, pagamento de produção ou consumo de peça reaproveitada.

O regime legado conserva a estimativa de 2% com arredondamento por pedido,
somando os impostos individuais. Não aplica 2% ao total agregado e não transforma
essa referência em tributo oficial. No App MEI, o DAS continua mensal, fora da
contribuição da variação. Ads e outras despesas também permanecem sem rateio.
Repasse e ajuste podem ser negativos; ajuste já contido no repasse não é somado
ou descontado novamente. Venda zero mantém percentual desconhecido. Centavos,
arredondamentos e limites usam aritmética inteira, sem preço ou taxa inferidos.

## Transporte, captura e compatibilidade

Esta preparação altera os **três Workers**, com ordem proposta de publicação
**Finance → Auth → App**. A fonte completa por pedido existe no Finance, não no
cache atual do App; as devoluções preservadas no App abrangem somente um
subconjunto e não permitem reconstruir todo o mês.

O mesmo POST de período financeiro e o mesmo corpo recebem um contrato opt-in
por header. Sem negociação, os frames v1 e o contrato diário permanecem
inalterados. O envelope novo contém o relatório legado exato e a evidência
separada de atribuição, vinculada ao seu hash. O limite legado de 1 MiB é
preservado; somente a negociação nova admite envelope de até 2 MiB, com sidecar
de até 512 KiB. Limites excedidos não autorizam truncamento de evidência.

O App mantém os bytes v1 fora do sidecar. A captura local fica em tabela própria,
vinculada a run, revisão, intervalo, horário, hash do relatório e hash do payload,
sob CAS do mês. Falha opcional deve preservar a escrita legada válida, sem
repetir a operação de origem. Fontes ativas e da publicação retida precisam ser
conferidas antes da leitura ou reutilização de qualquer evidência.

A negociação mensal v5 reutiliza o GET já existente e transporta a nova evidência
junto à mesma visualização. Os contratos v1 a v4 permanecem disponíveis; um
backend antigo que rejeite a negociação pode receber uma única tentativa v4.
Envelope novo inválido não pode virar fallback silencioso para dados legados.

Não há nova consulta à Shopee, coletor ou backfill pelo navegador. A captura usa
as chamadas normais já existentes. Fonte antiga sem sidecar fica `NOT_CAPTURED`;
retenção ou ausência no Finance não autoriza consultar tudo novamente. Filtros,
paginação e cenários continuam locais após a leitura do mês. SQL adicional e
escrita do cache de evidência são aditivos e devem ser revisados; não alteram
pedidos, custos, despesas ou eventos físicos da loja.

O rollback preserva os frames legados: código anterior ignora a tabela nova.
Essa compatibilidade exige conferir os formatos e não remove automaticamente
o sidecar ou outras tabelas. Não fazer rollback, limpeza ou migração destrutiva
sem diagnóstico específico.

## Validação e publicação

**Pendente:** testes de conservação e gates, compatibilidade dos três transportes,
CAS e falha opcional sem segunda chamada, limites e hashes; regressão integral,
QA normal/minificada em 320/1365 px nos dois temas com fonte ampliada; CI do head
exato, publicação dos três Workers na ordem aprovada e conferência após cada etapa.

Os testes devem preservar clique nativo, leitura de valores no celular, seis
agentes da inicial, mês, rascunhos, histórico e hipóteses explícitas do simulador.
QA local/sintética não confirma captura natural na conta, aceite do proprietário,
recebimento, fabricação ou fechamento financeiro. Fonte, PR, CI, UUID, hashes
e contagens só serão preenchidos após a prova real.

O proprietário já autorizou incrementos validados na Live. A marcação preparada
distingue código em construção de publicação comprovada; não repete aquela
aprovação. Um recibo de publicação também não comprova merge em main.

## Continuidade

Depois da publicação, conferir a captura natural e a cobertura do mês antes de
declarar que os dados da conta estão disponíveis. Não criar pedidos, devoluções,
custos ou fabricação para QA. Não incluir credenciais, hashes/seriais privados
de pedidos ou valores da conta em commits, logs, fixtures e relatórios públicos.

M2/M2.2 e o restante da M3 continuam abertos. Seller Centre/banco, fabricação e
recebimento reais, decomposição histórica, valoração/reserva/consumo na revenda
e a ponte contábil exigem evidência própria, sem dupla contagem. Os campos
legados de margem/lucro líquido por variação, preço seguro, ROAS real por SKU e
estoque verificado continuam desconhecidos. Hermes permanece Observador e
Ads/PROMO/escritas comerciais mantêm os gates oficiais.
