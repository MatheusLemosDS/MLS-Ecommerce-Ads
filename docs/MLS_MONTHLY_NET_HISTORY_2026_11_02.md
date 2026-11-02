# Líquido mensal e histórico dos agentes — 02/11/2026

**Estado: preparado, ainda não publicado (`PREPARED_NOT_PUBLISHED`).**
Branch `fix/monthly-net-visibility-20261102`, base
`a0900fb7148defa364ba82109ba57ac0ce6dc082`.
Identificação prevista: **2026-11-02.1 — Líquido mensal e histórico**.
A última publicação comprovada neste corte continua sendo a PR101, versão
visível `2026-11-01.1`, App `358957d4-60ec-4e50-ab82-95bfd1702e35`.
Preparação Git, aprovação de CI, publicação Cloudflare e conferência na Live
são etapas distintas. Este registro não declara as três últimas concluídas.

## Problema e comportamento preparado

O resumo mensal podia mostrar somente uma pendência quando despesas do mês
ainda não tinham sido declaradas. Também podia ocultar todo o saldo por
antiguidade da leitura de anúncios, embora mantivesse o investimento salvo
visível. A navegação dos agentes não oferecia um seletor compartilhado de mês,
o que dificultava consultar o histórico financeiro já disponível.

O incremento prepara uma apresentação separada dos cálculos estritos:

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

## Onde abrir e como usar após a publicação

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
mês. Não há alteração de schema ou dados D1, Workers Auth/Finance, OAuth,
cron, flags, domínios ou operações comerciais neste incremento.

As evidências reais de diagnóstico ficam na QA privada, fora do repositório.
Este registro não inclui valores financeiros da conta, identificadores de
pedidos ou dados de clientes. Fixtures e capturas de teste devem permanecer
claramente sintéticas; abrir controles não cria fatos operacionais reais.

## Validação e recibo de entrega

| Etapa | Estado neste corte |
| --- | --- |
| Implementação e identificação humana | Preparadas na branch indicada; ainda em validação. |
| Testes integrais, build final e CI | Recibo final pendente. Não inferir aprovação a partir de testes parciais. |
| QA normal/minificada em desktop e celular | Conferência integrada pendente; preservar os cenários de navegação física anteriores e os novos de período/saldo. |
| Publicação do App e comparação exata de bytes/configuração | Não executadas nesta entrega. Última Live comprovada: PR101. |
| Uso real pelo proprietário e confronto Seller Centre/banco | Não executados nesta entrega; M2 permanece aberta. |

Antes de registrar publicação, anexar PR, commit, CI do head revisado, versão
Cloudflare efetiva, hashes, preservação de configuração/Auth/Finance e recibo
da conferência. Uma versão humana na fonte ou CI verde não prova deploy.

## Retomada e rollback

Concluir a validação integrada e a CI; somente então publicar o App conforme
a autorização existente e conferir a entrega efetiva. Após a publicação,
orientar o proprietário a selecionar o mês, identificar os componentes ainda
pendentes e declarar somente despesas conhecidas. Não assumir zero para
demonstrar o líquido.

Como não há migração de dados nesta entrega, um rollback do App deve restaurar
os bytes e a configuração da versão anterior verificada, sem apagar fontes,
despesas, rascunhos ou ledgers. Os triggers e cuidados de rollback dos controles
físicos anteriores continuam aplicáveis; este incremento não os remove.

**M2 e M2.2 continuam abertas.** Permanecem pendentes as quantidades/itens
originais de devolução, confirmação da fabricação e custos históricos,
valoração, reservas, revenda e ponte contábil sem dupla contagem. Seller Centre
e banco precisam de comparação no mesmo recorte. Ads/PROMO e escritas
comerciais continuam bloqueados pelos gates existentes.
