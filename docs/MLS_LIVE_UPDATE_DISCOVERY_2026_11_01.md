# Novidades visíveis e acesso aos controles da operação — 01/11/2026

**Estado: preparado; esta atualização de navegação ainda não foi publicada.**
Branch `fix/live-update-discovery-navigation-20261101`, base `e9c20d6`.
A identificação humana preparada para o painel é **2026-11-01.1 — Navegação e novidades**;
ela não é um UUID de publicação Cloudflare. CI, QA e recibo desta entrega serão
registrados quando concluídos. Até lá, o último App Live conferido continua
sendo o da PR [#100](https://github.com/MatheusLemosDS/MLS-Ecommerce-Ads/pull/100),
versão `2b1d820a-fc1a-409a-9393-86e660458c42`.

## Problema observado

O proprietário relatou que não encontrava as melhorias na Live e que a
organização do painel estava confusa. A conferência de 01/11/2026 às **19:05
Brasília** encontrou a PR100 exata em `/admin?tab=overview`. Recebimento,
inspeção, produção realizada e associação com fabricação já existiam, mas
ficavam em seções recolhidas de MLS Returns e Custos, sem indicação clara na
entrada. O roadmap exibido no painel ainda descrevia a antiga preparação
PR68 como não publicada, embora entregas posteriores já estivessem na Live.

O recibo histórico da PR100 registra publicação às **18:40:06 Brasília**.
19:05 é o horário da conferência posterior, não uma segunda publicação.
O relato de dificuldade de descoberta não comprova falha de cache ou ausência
do código publicado. O uso operacional real do proprietário continua pendente.

## Mudanças preparadas e onde usar

A Visão geral passa a apresentar **Novidades desta versão**, com a versão
2026-11-01.1 e três acessos diretos. O Plano de evolução explica o que já está
disponível e a próxima conferência, preservando M2 em andamento. A navegação
e a busca destacam os controles físicos e o registro de fabricação.

No cabeçalho, **Novidades · 01/11** abre as notas da versão. Na busca, o grupo
**Operação física** contém **Receber e inspecionar devoluções**, **Produção
realizada** e **Vínculo da devolução com a produção**; **Ferramentas** inclui
**Novidades desta versão**. Em MLS Returns, os atalhos **Receber e
inspecionar**, **Vínculo com a produção** e **Conciliação financeira** separam
as tarefas, com os controles físicos antes dos gráficos. O fluxo indicado é
receber, inspecionar e depois associar; essa indicação não executa ações.

| Ação do proprietário | Destino preparado | Uso |
| --- | --- | --- |
| Encontrar as novidades | `/admin?tab=overview` | Localizar o cartão **Novidades desta versão** e escolher o controle desejado. |
| Receber e inspecionar devoluções | `/admin?tab=agent-returns#physicalReturnsDetails` | Abrir **Recebimento e inspeção das devoluções**, selecionar o contexto salvo e declarar somente as peças efetivamente recebidas e inspecionadas. |
| Registrar produção realizada | `/admin?tab=margins#incurredProductionDetails` | Abrir **Produção realizada · registro histórico**, informar data de fabricação, identidade, peças físicas e custo histórico conhecido ou desconhecido. Consultar semana e mês sem somar os dois recortes. |
| Associar devolução à fabricação | `/admin?tab=agent-returns#returnManufacturingLinksDetails` | Abrir **Vínculo com a produção**, escolher recebimento e fabricação compatíveis, declarar a quantidade e confirmar a origem. |
| Conferir detalhes e próximos passos | `/admin?tab=roadmap#appReleaseNotes` | Ler as notas da versão e as limitações dos três controles. |

Os links diretos preparados abrem a seção correspondente. Antes desta
publicação, o caminho já existente é **Agentes → MLS Returns**, expandindo
manualmente recebimento/inspeção ou vínculo; a fabricação fica em
**Mais opções → Custos**, expandindo o registro histórico. O endereço de
Produção/DTF continua dedicado a pedidos, artes e montagem; sua quantidade de
anúncio ou kit não comprova quantidade fabricada.

## Conferência manual ainda necessária

Depois do recibo da nova publicação, o proprietário deve conferir a versão na
entrada e percorrer os três acessos no computador e no celular. Para validar a
operação, deve usar um recebimento e uma fabricação reais: registrar a chegada,
inspecionar as peças e conferir a associação com a origem. Abrir uma seção ou
executar testes sintéticos não executa essa conferência física.

Os registros exigem declaração explícita. Kits não são convertidos em peças
por inferência. Custo histórico ausente permanece desconhecido. Corrigir a
identidade ou anular uma origem associada exige desvincular antes; reinspecionar
a condição continua permitido. Não lançar fatos reais apenas para demonstrar
uma tela nem presumir que todos os meses já estão cobertos.

## Validação, publicação e limites

| Etapa desta entrega | Estado neste corte |
| --- | --- |
| Navegação, notas e identificação da versão | Preparadas na branch; sem confirmação de publicação. |
| Build, testes integrais e CI do candidato final | Aguardando o registro do responsável pela release. |
| QA autenticada desktop/mobile, normal e minificada | Aguardando o registro do responsável pela release. |
| Publicação do App e comparação exata dos bytes/configuração | Pendente; requer recibo próprio depois dos gates. |
| Uso físico real pelo proprietário | Não executado. |

Os resultados anteriores da PR100 pertencem àquela entrega e não substituem
os checks deste candidato. Merge em Git, CI aprovada e versão escrita na UI
não comprovam que novos bytes foram publicados. O responsável pela release
deve registrar PR/commit, CI, versão Cloudflare, horário Brasília, conferência
dos bytes e configuração e resultado da QA antes de mudar o estado acima.

Este incremento trata da descoberta e organização dos controles existentes.
Não implementa transporte novo de itens Finance/Returns, ponte contábil,
valoração recuperável, reserva, revenda ou estoque automático. Quantidades
originais ainda indisponíveis não viram zero; o vínculo continua declarado
pelo operador e não prova uma peça serializada. Os controles não alteram o
lucro nem descontam a produção novamente. **M2/M2.2 continuam abertas**, com
conciliação de repasses, devoluções, anúncios, despesas, Seller Centre e banco
pendente. Auth/Finance e permissões comerciais estão fora desta alteração;
Ads/PROMO permanecem LOCKED.

## Padrão de comunicação pedido pelo proprietário

Cada entrega deve explicar o que mudou no comportamento, onde encontrar a
mudança e como usá-la. Separar o que está preparado em Git do que foi
publicado e conferido na Live, identificar os passos manuais e pendências do
operador e informar os testes relevantes com suas limitações. Contagens de
testes apoiam a evidência; não substituem o relato concreto da melhoria.

Registros relacionados: [associação PR100](MLS_M22_RETURN_MANUFACTURING_LINKS_2026_11_01.md),
[produção PR99](MLS_M22_INCURRED_PRODUCTION_2026_11_01.md),
[controle físico PR98](MLS_M22_PHYSICAL_RETURNS_2026_11_01.md) e
[roadmap canônico](ROADMAP_MLS_COMMERCE_OS.md).
