# Resumo publicado e coleta mensal

A Visão geral separa o último período financeiro completo da nova coleta. A
versão completa só é substituída depois que todas as janelas da nova consulta
terminam. Uma atualização parcial, uma falha ou outra aba aberta não apagam
os valores já conferidos do período anterior.

## Coleta e leitura

- O cron é o coletor do mês atual quando a política automática está habilitada.
  O navegador lê `GET /api/admin/finance/business-month-view?month=YYYY-MM`.
- Atualizar vendas envia `POST /api/admin/finance/business-month-request` com
  `{ "month": "YYYY-MM" }`: antecipa somente a agenda local elegível. Não
  consulta a Shopee, não toma a execução que já possui uma lease e não ignora
  uma pausa nem o prazo de repetição após uma falha real.
- Abas antigas que tentam iniciar ou avançar o mês atual recebem
  `409 BUSINESS_MONTH_BACKGROUND_OWNED`. Não disputam o coletor do servidor.
- Meses históricos e uma política pausada permitem consulta manual por ação
  explícita. Abrir o painel não inicia essa consulta.
- Checkpoints e leases de página são interrupções normais. A continuação ocorre
  no próximo minuto; erros reais conservam a espera crescente.

## Período completo e valores

`business_month_publications` guarda referências compactas para cópias próprias
em `business_month_publication_frames`. As cópias são gravadas na mesma transação
que conclui ou reinicia o coletor, sob a revisão e o payload exatos do registro
ativo. Até três fontes ficam em valores separados, com no máximo 1 MiB cada;
o registro principal não concentra os dados do mês inteiro. Uma revisão antiga
ou transação interrompida não substitui uma publicação válida.

A publicação armazena fontes financeiras, sem congelar preços calculados. A
leitura reaplica os custos e as despesas cadastrados atualmente. Assim, corrigir
um custo recalcula o período salvo sem buscar novamente seus pedidos. A data
original de cada fonte continua visível; o horário do recálculo não renova a
observação financeira.

O histórico de Ads é identificado por mês, data inicial e data final. Na virada
do dia, o resumo completo de ontem conserva o gasto das mesmas datas enquanto
o servidor coleta hoje. O gasto de hoje não é associado aos pedidos de ontem.
Cobertura ausente, parcial ou expirada não é convertida em zero.

## Previsão líquida e conciliação

Com período completo, pagamentos cobertos, produção identificada, DAS declarado,
Ads compatível e despesas conhecidas, a Visão geral calcula:

```text
repasse previsto + recarga retida identificada como Ads
− produção − DAS mensal − consumo de anúncios − despesas externas
= resultado líquido previsto
```

Pedidos em revisão permanecem fora do conjunto de pedidos pagos. Ocorrências de
devolução continuam sinalizadas e podem mudar o valor após conciliação. Quando
existem essas pendências, a previsão é **em conferência**. Não se inventa o valor
de um reembolso nem se desconta novamente uma taxa já incluída no repasse.

Os campos estritos `result.net_estimate_cents` e `net_profit_cents` mantêm suas
regras anteriores. Hermes v1 continua recebendo `WAITING` quando há revisão de
situação, com cobertura e ações preservadas. Uma previsão numérica apresentada
ao proprietário não libera investimento ou execução comercial.

## Validação

A integração usa os coletores reais do App e do Financeiro com provedores de
teste: 294 pedidos, 242 pagos, 257 unidades de catálogo e R$ 7.450,70 de produção,
incluindo kits e avulsas. Foram conferidos recálculo local, cancelamento posterior,
falha durante atualização, abas simultâneas, limite de 50 requisições por execução
e virada do dia com gastos distintos. Os dois pedidos em revisão e quatro pedidos
com ocorrência de devolução mantêm o resultado estrito bloqueado.

Essa validação reproduz a estrutura do caso informado; não substitui observação
da conta em produção nem confirma valores de reembolsos ainda não conciliados.
