# Novidades visíveis e acesso aos controles da operação — 01/11/2026

**Publicado e conferido no App em 01/11/2026 às 19:25:21 Brasília.**
Versão visível **2026-11-01.1 — Navegação e novidades**, App Cloudflare
`358957d4-60ec-4e50-ab82-95bfd1702e35`, PR
[#101](https://github.com/MatheusLemosDS/MLS-Ecommerce-Ads/pull/101).
Fonte `c0e7ccf8ac90116e693bfad8dfe3fe748c4347c1`, head validado
`f5584fe381cda1ed66ea603f7e2f165b79cf83dd`, CI
[41356444549](https://github.com/MatheusLemosDS/MLS-Ecommerce-Ads/actions/runs/41356444549)
aprovada. Branch `fix/live-update-discovery-navigation-20261101`, base `e9c20d6`.
A versão humana não é um UUID Cloudflare. A publicação runtime está confirmada. A integração em main é conferida
separadamente pelo estado da PR vinculada; CI e recibo acima identificam a
publicação runtime.

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

## Mudanças publicadas e onde usar

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

| Ação do proprietário | Onde abrir | Uso |
| --- | --- | --- |
| Encontrar as novidades | `/admin?tab=overview` | Localizar o cartão **Novidades desta versão** e escolher o controle desejado. |
| Receber e inspecionar devoluções | `/admin?tab=agent-returns#physicalReturnsDetails` | Abrir **Recebimento e inspeção das devoluções**, selecionar o contexto salvo e declarar somente as peças efetivamente recebidas e inspecionadas. |
| Registrar produção realizada | `/admin?tab=margins#incurredProductionDetails` | Abrir **Produção realizada · registro histórico**, informar data de fabricação, identidade, peças físicas e custo histórico conhecido ou desconhecido. Consultar semana e mês sem somar os dois recortes. |
| Associar devolução à fabricação | `/admin?tab=agent-returns#returnManufacturingLinksDetails` | Abrir **Vínculo com a produção**, escolher recebimento e fabricação compatíveis, declarar a quantidade e confirmar a origem. |
| Conferir detalhes e próximos passos | `/admin?tab=roadmap#appReleaseNotes` | Ler as notas da versão e as limitações dos três controles. |

Os links diretos abrem a seção correspondente. Os resultados da busca agora
também expandem o formulário recolhido, em vez de apenas rolar até ele, usando
a mesma navegação por fragmento e preservando URL e foco. Os caminhos de menu
continuam **Agentes → MLS Returns** para recebimento/inspeção ou vínculo e
**Mais opções → Custos** para o registro histórico. O endereço de
Produção/DTF continua dedicado a pedidos, artes e montagem; sua quantidade de
anúncio ou kit não comprova quantidade fabricada.

Uma aba que já estava aberta pode manter o documento anterior até uma nova
navegação. Abra a Visão geral novamente e confira **2026-11-01.1** antes de
comparar as telas. Essa possibilidade não comprova que cache ou aba antiga
tenham causado o relato original. A correção confirmada da busca trata da
abertura de seções recolhidas.

## Conferência manual ainda necessária

O proprietário ainda deve conferir a versão na entrada e percorrer os três
acessos no computador e no celular. Para validar a
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
| Navegação, notas e identificação da versão | Publicadas e conferidas no App `358957d4`. |
| Build, testes integrais e CI do candidato final | CI 41356444549 aprovada no head `f5584fe3`; 3.155 Node e 67 Python aprovados, sem falhas ou skips Node. |
| QA autenticada local/simulada desktop/mobile, normal e minificada | Quatro combinações em 320/1365 px e 28 provas de rotas; sem erros, overflow ou mutações, com estado preservado. |
| Publicação do App e comparação exata dos bytes/configuração | Recibo concluído às 19:25:21 Brasília; três Workers conferidos, com Auth/Finance, domínios, configuração, flags e cron preservados. |
| Uso físico real pelo proprietário | Não executado. |

O recibo privado, fora do Git, é
`attachments/live-update-discovery-baseline-20261101/publication-receipt.json`
no workspace de publicação. Ele registra App gerado SHA-256
`c1b1909fd49353fd065298a3852d6a2ff684980d4da11a0cff832be1eb11fe1e`,
artefato publicado bruto SHA-256
`a96d8e6b06ddf598b0959f609f5e1ab1443b78c18bd4ba5c9a64918a0085cd24`
e correspondência exata dos três Workers. Auth permanece
`37bead27-c941-40e6-87e8-832f01d1785a`; Finance permanece
`e0b258a2-e73f-45d2-912a-1cb6fd666e18`. A publicação não chamou endpoints
owner, não fez consultas de provedor nem alterou valores financeiros remotos.

A prova local com as duas flags owner contém 16 scripts, sem adicionar novos;
o recorte com somente V3.6 contém 15. Nenhuma dessas contagens descreve uma
sessão Live real do proprietário. A QA local/simulada e a conferência de bytes
não executam o recebimento físico nem substituem o aceite operacional. Os
resultados anteriores da PR100 pertencem àquela entrega; os checks aqui
registrados são os da PR101, sem tratar as CIs substituídas como aprovadas.

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

Toda futura mudança visível ao proprietário deve atualizar o identificador
`APP_RELEASE` e as notas visíveis da versão no mesmo incremento. Data, rótulo,
atalho e explicação devem corresponder ao que foi entregue. A disponibilidade
técnica de um controle deve continuar separada da confirmação dos dados reais,
do aceite operacional e do encerramento das fases do roadmap.

Registros relacionados: [associação PR100](MLS_M22_RETURN_MANUFACTURING_LINKS_2026_11_01.md),
[produção PR99](MLS_M22_INCURRED_PRODUCTION_2026_11_01.md),
[controle físico PR98](MLS_M22_PHYSICAL_RETURNS_2026_11_01.md) e
[roadmap canônico](ROADMAP_MLS_COMMERCE_OS.md).
