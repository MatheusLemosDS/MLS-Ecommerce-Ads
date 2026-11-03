# M3 · Contribuição por variação e pedido — 03/11/2026, Brasília

**Estado: `PUBLISHED_VERIFIED`.** Versão **2026-11-03.1 — M3 · Contribuição por variação e pedido**.
Finance → Auth → App publicados e conferidos em **03/11/2026 às 12:07:27 Brasília**.
PR [#108](https://github.com/MatheusLemosDS/MLS-Ecommerce-Ads/pull/108), branch `feature/m3-variant-order-evidence-20261103`, base
`aebc3c7aec9ad9937cc43565ba401b0b4ba07cba`. Fonte `4dbeeb3804493d9894536eb3a201aa58573adb2d`, head aprovado `ed9e86ce72b7d37486e51fc45f95ef7d232180cb`, CI
[41658488625](https://github.com/MatheusLemosDS/MLS-Ecommerce-Ads/actions/runs/41658488625) aprovada: 3457 Node e 67 Python.
Publicação e CI não comprovam merge; consultar a PR vinculada para a integração Git.

A Live anterior comprovada era **2026-11-02.6**, publicada em
**03/11/2026 às 00:04:01 Brasília**: App
`fef9da9e-bcfc-42e1-a8c4-e38b84a656bd`, Auth
`d6f4397f-ac4d-45cf-93da-175df8305a6d` e Finance
`7001376b-f065-4e37-84ea-ee9ac2ea890c`. A PR
[#107](https://github.com/MatheusLemosDS/MLS-Ecommerce-Ads/pull/107) foi integrada
em `aebc3c7aec9ad9937cc43565ba401b0b4ba07cba`, em **03/11/2026 às 00:12:21 Brasília**,
com CI documental [41570060190](https://github.com/MatheusLemosDS/MLS-Ecommerce-Ads/actions/runs/41570060190)
aprovada e árvore/vetor Live conferidos. O [guia anterior](MLS_M3_CONTRIBUTION_EVIDENCE_2026_11_03.md)
preserva o corte da primeira evidência de contribuição.

## Mudança entregue e caminho de uso

O proprietário autorizou continuar a M3 em paralelo. A entrega amplia a
evidência em **MLS Products → Análise e preços**,
`/admin?tab=agent-products#businessMonthPricingObserver`, no mesmo mês salvo.
O detalhamento da variação informa a contribuição dos pedidos cujo
dinheiro pode ser atribuído integralmente àquele par produto/modelo, a
quantidade abrangida e o que continua sem atribuição.

| Situação preservada na fonte | Tratamento entregue |
| --- | --- |
| Dois modelos vendidos no mês, cada um em pedidos com um único par produto/modelo | Cada par pode receber os valores integrais dos seus próprios pedidos, sujeito aos gates financeiros. |
| Várias linhas do mesmo par, normalizadas pela fonte em um par | A quantidade comercial agrupada continua atribuível; não vira quantidade física de peças. |
| Um produto com vários modelos no mesmo pedido | O dinheiro permanece exclusivo do produto e sem atribuição entre modelos. |
| Vários produtos no mesmo pedido | O dinheiro continua no bucket misto global, sem rateio. |
| Captura antiga, incompleta, incoerente ou ausente | A atribuição permanece pendente; ausência não significa valor zero. |

A nova evidência substitui a evidência anterior no mesmo cartão quando
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

Esta entrega altera os **três Workers**, com ordem de publicação
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

Suíte completa aprovada: **3457 Node e 67 Python**, sem falhas ou skips;
CI do head exato e QA local/sintética normal/minificada em 320/1365 px.
As provas cobrem conservação/gates, um versus múltiplos pares por pedido,
pagamento/devolução/custo/fonte desconhecidos, compatibilidade dos transportes,
hashes/CAS, falha opcional sem repetir a origem e os limites. Preservam clique
nativo, leitura no celular, seis agentes, mês/rascunhos e hipóteses dos cenários.
QA não comprova captura natural, aceite do proprietário ou fechamento financeiro.

Publicação Finance → Auth → App concluída; bytes/configuração/domínios/flags/cron
dos três Workers conferidos após cada etapa. O publisher executou zero consultas
D1 e zero chamadas owner/provedor; não criou lançamentos ou fatos físicos para QA.
A captura local de evidência usa as chamadas normais, com SQL/sidecar aditivos;
ausência histórica permanece `NOT_CAPTURED` e exige observação natural separada.

| Worker | UUID publicado | SHA-256 gerado | SHA-256 publicado |
| --- | --- | --- | --- |
| Finance | `9ed0bd7d-269a-4e5f-81d0-63be8c6ac2c4` | `08ada5ecec92350f4f8301fdb7baa00f5f8083a0e8390296b2870e0ff3cdc1a5` | `e5bf80e14ff00e5b365bfbcfb25bf3a4dc1e42bf40bb0e4259909649eea1d5cd` |
| Auth | `ec385ca9-a986-49ec-abab-25a29daaf33b` | `47c83f87f191fd0e5ff503d9c4bcf4671cd986b0965e66e84f1a6ed952dac925` | `2a2c2433c6fba25d1c399991595c96e6b8a85045edb77879c8270c446cb45ad2` |
| App | `caa919a6-096f-4427-93a6-5fb50c0ac41d` | `34299a748b1fbea76f2916521143accddf531f2a75f6f3e29655f7df581e3ef3` | `0410b98910618ea2aece6c356bcea8920624c0488443ad5563c047bb3a07a94f` |

Integração Git: consultar o estado atual da PR vinculada. O recibo identifica
código e horário publicados; merge exige evidência própria.

## Continuidade

Conferir a captura natural e a cobertura do mês antes de
declarar que os dados da conta estão disponíveis. Não criar pedidos, devoluções,
custos ou fabricação para QA. Não incluir credenciais, hashes/seriais privados
de pedidos ou valores da conta em commits, logs, fixtures e relatórios públicos.

M2/M2.2 e o restante da M3 continuam abertos. Seller Centre/banco, fabricação e
recebimento reais, decomposição histórica, valoração/reserva/consumo na revenda
e a ponte contábil exigem evidência própria, sem dupla contagem. Os campos
legados de margem/lucro líquido por variação, preço seguro, ROAS real por SKU e
estoque verificado continuam desconhecidos. Hermes permanece Observador e
Ads/PROMO/escritas comerciais mantêm os gates oficiais.
