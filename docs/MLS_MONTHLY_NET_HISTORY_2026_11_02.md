# Líquido mensal e histórico dos agentes — 02/11/2026

**Estado: publicado e conferido no App (`APP_LIVE_EXACT`).**
Publicação concluída em **02/11/2026 às 11:44:54 Brasília** (`2026-11-02T14:44:54+00:00`).
Versão visível **2026-11-02.1 — Líquido mensal e histórico**, App Cloudflare
`8e1056d2-4e2f-4ffe-9100-84ea2758a0c5`. PR
[#102](https://github.com/MatheusLemosDS/MLS-Ecommerce-Ads/pull/102), branch
`fix/monthly-net-visibility-20261102`, base
`a0900fb7148defa364ba82109ba57ac0ce6dc082`.
Fonte `2554518b81e270beba4bcf0c2e48d9583d7715ce`, head validado
`2f13eaa19f9785207c6b2be0b66909e9116eafc4`, CI
[41463788001](https://github.com/MatheusLemosDS/MLS-Ecommerce-Ads/actions/runs/41463788001)
aprovada. A publicação runtime está comprovada; a integração em main é
conferida separadamente pelo estado da PR102 vinculada. A versão humana não é UUID Cloudflare,
e CI verde ou merge isolado não substituem o recibo de publicação.

## Problema e comportamento publicado

O resumo mensal podia mostrar somente uma pendência quando despesas do mês
ainda não tinham sido declaradas. Também podia ocultar todo o saldo por
antiguidade da leitura de anúncios, embora mantivesse o investimento salvo
visível. A navegação dos agentes não oferecia um seletor compartilhado de mês,
o que dificultava consultar o histórico financeiro já disponível.

A versão publicada oferece uma apresentação separada dos cálculos estritos:

- **Despesas ainda não declaradas:** mostrar o saldo com os componentes
  conhecidos, indicando que essas despesas ainda não foram descontadas.
  DAS ausente também conserva uma indicação própria. Ausência continua
  desconhecida e não é convertida em zero.
- **Anúncios salvos, com atualização pendente:** aproveitar somente o
  calendário estruturalmente válido do mesmo recorte para mostrar um subtotal
  identificado. Conservar a data original, o aviso de leitura antiga ou dia
  parcial e todas as pendências financeiras.
- **Componentes insuficientes:** manter indisponível quando não há base segura,
  inclusive com falta de cobertura de Ads, pagamentos incompletos, coleta
  incompleta, ajuste de recarga não classificado ou aritmética insegura.
  Custos mensais desconhecidos junto de produção sem preço não ganham um
  subtotal combinado por inferência.
- **Histórico dos agentes:** permitir escolher um mês comum, consultar a
  leitura salva disponível e preservar o contexto ao alternar entre agentes.
  Um mês sem leitura permanece indisponível, sem assumir ausência de vendas,
  gastos ou pendências.

O subtotal é uma leitura dos componentes conhecidos. Não comprova lucro
final, recebimento bancário, encerramento de devoluções ou fechamento do mês.
Uma leitura com todas as datas pode ter o último dia ainda parcial. A passagem
para o mês seguinte não atualiza esse snapshot nem transforma sua cobertura
em confirmação definitiva da Shopee.

## Onde abrir e como usar

As três novidades do cartão da Visão geral apontam para MLS Finance:

| Ação | Endereço | Uso |
| --- | --- | --- |
| Ver o líquido e suas pendências | `/admin?tab=agent-finance#businessMonthNetCard` | Conferir o rótulo do saldo, os descontos incluídos e as pendências do mês escolhido. |
| Consultar outro mês | `/admin?tab=agent-finance#mlsAgentPeriod` | Escolher o mês na barra **Período dos agentes** e usar **Ver mês**, as setas ou **Mês atual**. |
| Conferir despesas | `/admin?tab=agent-finance#businessMonthExpensesForm` | Informar o total conhecido do mês ou confirmar explicitamente que não há outras despesas. Não repetir produção, Ads ou DAS-MEI. |

O parâmetro `month` na URL acompanha o mês aceito. Voltar e avançar no
navegador recuperam essa seleção sem substituir o painel ou o fragmento do
controle. Meses futuros e entradas inválidas são recusados.

Uma edição ainda não salva no formulário legado de despesas impede trocar de
mês e orienta salvar ou recarregar antes de continuar. Os rascunhos do ledger
de despesas permanecem associados aos seus próprios meses. Navegar não salva,
não confirma um total e não copia a declaração de outro período.

As notas em `/admin?tab=roadmap#appReleaseNotes` separam as novidades atuais
das **Entregas anteriores · controles físicos**. Continuam disponíveis:

- Recebimento e inspeção:
  `/admin?tab=agent-returns#physicalReturnsDetails`.
- Produção realizada:
  `/admin?tab=margins#incurredProductionDetails`.
- Associação de devolução à fabricação:
  `/admin?tab=agent-returns#returnManufacturingLinksDetails`.

## Escopos diferentes continuam explícitos

| Painel ou controle | O que acompanha o mês compartilhado | O que mantém outro escopo |
| --- | --- | --- |
| MLS Finance e MLS Ads | Resultado financeiro, despesas, investimento, vendas atribuídas e ROAS das fontes salvas do mês. | Pending atual continua um snapshot atual, separado de competência mensal e de banco. |
| MLS Products | Vendas e referência de custo do mês escolhido. | Catálogo, variações e regras de custo são fontes atuais; não reconstroem catálogo ou estoque histórico. |
| MLS Production | Referência de custo das vendas do mês escolhido. | Fila DTF atual; fabricação declarada tem seus próprios mês e semana, preservando os rascunhos. |
| MLS Returns | Devoluções e conciliação financeira no contexto selecionado. | Recebimento físico pode ter mês próprio fixado; associações com fabricação mostram seu histórico salvo. |
| MLS Auditor e MLS Hermes | Evidências financeiras e pendências do recorte disponível. | Conexão, tarefas, limites operacionais e relatórios anteriores preservam suas datas e contexto. |

Quantidade de anúncio ou kit não comprova peças fabricadas ou recebidas.
Produção realizada e custo de referência das vendas continuam separados,
sem somá-los novamente ao resultado.

## Contratos, fontes e limites preservados

A apresentação deriva de um frame mensal validado. Não reescreve
`business_month_v1`, `monthly_financial_summary_v1`, seus valores estritos,
pendências, cobertura ou horários. O objeto de apresentação é interno à
interface; não cria novo DTO de servidor. Os contratos Hermes existentes e
seus bloqueios não são afrouxados para aceitar lucro não comprovado.

O seletor reutiliza a leitura salva de negócio. Não adiciona chamadas ao
provedor, reinicia coleta ou força atualização de pedidos/Ads ao escolher um
mês. O código não altera schema nem migra dados D1, Workers Auth/Finance,
OAuth, cron, flags, domínios ou operações comerciais. A declaração operacional
de despesas descrita abaixo usou o fluxo existente, separadamente do código.

As evidências reais de diagnóstico ficam na QA privada, fora do repositório.
Este registro não inclui valores financeiros da conta, identificadores de
pedidos ou dados de clientes. Fixtures e capturas de teste devem permanecer
claramente sintéticas; abrir controles não cria fatos operacionais reais.

## Declaração do proprietário, separada da publicação

O proprietário confirmou explicitamente não haver outras despesas de novembro.
Essa informação foi persistida pelo fluxo existente e auditada uma única vez
antes da publicação, preservando os demais meses e o tratamento de recarga.
Não foi deduzida de ausência de dados, gravada como fixture de QA ou aplicada
automaticamente pelo deploy. Não deve ser copiada para outro período.

Essa declaração permite considerar o componente informado daquele mês. Não
valida por si só impostos, produção, Ads, devoluções, fechamento financeiro ou
recebimento bancário. Montantes da conta e identificadores privados permanecem
somente nas evidências privadas, fora deste documento e das fixtures.

## Validação e recibo de entrega

| Etapa | Estado neste corte |
| --- | --- |
| Implementação e identificação humana | Publicadas e conferidas no App `8e1056d2`, versão `2026-11-02.1`. |
| Testes integrais, build final e CI | CI 41463788001 aprovada no head `2f13eaa1`; 3205 testes Node e 67 Python aprovados. Node sem falhas, cancelamentos ou skips. |
| QA normal/minificada em desktop e celular | Quatro combinações sintéticas 320/1365 aprovadas para saldo, períodos e navegação; sem erros de página, overflow, novas consultas ao provedor ou mutações. Dados financeiros originais e resultado estrito preservados. |
| Publicação e conferência técnica | Concluídas em 02/11/2026 às 11:44:54 Brasília; bytes exatos dos três Workers, domínios, configuração e versões Auth/Finance conferidos. |
| Integração Git | Conferir o estado atual da PR102 vinculada; o recibo registra a publicação runtime separadamente. |
| Uso operacional real e confronto Seller Centre/banco | Não executados nesta entrega. A declaração de despesas acima é um fato separado; M2 continua aberta. |

| Worker | Versão Cloudflare | SHA-256 gerado | SHA-256 publicado |
| --- | --- | --- | --- |
| App | `8e1056d2-4e2f-4ffe-9100-84ea2758a0c5` | `53bddb0d49961150ac0f76785c07a628208c3f66201219bd4d7f6416effaccfa` | `a455b8c8b8ce37ac3b48c0c504bb66766bcebf6894bd7c23679c67b3668be32e` |
| Auth, preservado | `37bead27-c941-40e6-87e8-832f01d1785a` | `c63ee09b2d98b6321e3ae7feae1066a9eec9160b49868d72fb84cb0471a0018d` | `46053d0b5f11ff4d738b4cf2cc1cc6afda7d21e233980b1e640f63728f32af2a` |
| Finance, preservado | `e0b258a2-e73f-45d2-912a-1cb6fd666e18` | `dff201100ed319f3b7d4d8cabf6826237be3a140e679f562cb982cec5bdd89b4` | `b4195212972f5a9f0f8ff08c9504e983f8bd3ca3b3c42493cb7c88addb84de8b` |

Os hashes gerados e publicados identificam os respectivos artefatos; o recibo
confere a transformação esperada e os bytes dos três Workers. Publicação e
conferência não alteraram os valores financeiros remotos. Selecionar períodos
usou leituras salvas, sem chamada nova ao provedor. A confirmação de despesas
anterior à publicação é registrada separadamente acima.

A correção do harness de navegação mobile foi reproduzida com fontes de
fallback: coordenadas dos viewports de layout e visual divergiam mesmo com
escala unitária. O teste passou a usar scroll/quads nativos, origens medidas e
hover/contato confiáveis no link antes da ativação. Mantém rota, foco, tamanho
de toque, hit testing, uma leitura lazy por controle e a matriz completa;
um contato divergente é cancelado antes do clique. Não usa `DOM.click`,
compensação fixa ou mudança no runtime para acomodar o teste.

A QA de interface é local/simulada, não uma sessão operacional real do
proprietário. A conferência técnica Live confirma código/configuração e
preservação das fontes, sem atestar aceitação do fluxo físico ou banco.

## Retomada e rollback

Selecionar o mês no MLS Finance, conferir os rótulos/datas e tratar apenas
as pendências reais daquele recorte. Novembro já possui a declaração explícita
de despesas descrita acima; outros meses conservam suas próprias declarações
ou continuam desconhecidos. Não repetir a confirmação nem assumir ausência de
despesas para liberar um resultado. Conferir a integração Git separadamente e
retomar os critérios de conciliação M2.

Como não há migração de dados nesta entrega, um rollback do App deve restaurar
os bytes e a configuração da versão anterior verificada, sem apagar fontes,
despesas, rascunhos ou ledgers. Os triggers e cuidados de rollback dos controles
físicos anteriores continuam aplicáveis; este incremento não os remove.

**M2 e M2.2 continuam abertas.** Permanecem pendentes as quantidades/itens
originais de devolução, confirmação da fabricação e custos históricos,
valoração, reservas, revenda e ponte contábil sem dupla contagem. Seller Centre
e banco precisam de comparação no mesmo recorte. Ads/PROMO e escritas
comerciais continuam bloqueados pelos gates existentes.
