# Liberações da Shopee e pedidos do resumo

A Visão geral passa a ter uma seção recolhida **Liberações da Shopee**. O
calendário de liberações permanece separado do conjunto de pedidos pagos
criados no mês. O cruzamento usa o identificador exato do pedido; não usa valor,
proximidade de datas, nome ou produto para presumir um vínculo.

## Como interpretar

- **Liberação localizada** significa que o pedido apareceu na consulta da Shopee
  dentro do calendário e do corte indicados.
- **Sem liberação localizada neste período** não significa que o pedido não foi
  pago ou que o dinheiro não foi recebido. A liberação pode pertencer a outra data.
- Registros fora do conjunto de pedidos pagos do resumo não são automaticamente
  classificados como vendas de outro mês.
- Repasse previsto dos pedidos localizados continua sendo o valor da fonte
  financeira do pedido, com sua própria data de consulta.
- Um valor de liberação só entra na parcela monetária conferida quando é
  compatível, em centavos exatos, com o repasse-base ou com o valor após ajustes
  coerentes do próprio pedido, cuja moeda BRL foi identificada.

A lista de liberações não documenta moeda ou unidade por linha. O sistema
preserva o valor bruto no Financeiro e não presume multiplicador de 100. Valores
incompatíveis, ausentes ou com subcentavos permanecem sem confirmação monetária.
A igualdade encontrada num pedido não estabelece a unidade de outros registros.

Não há identificador de transação documentado nessa lista. Duas observações de
um mesmo pedido, mesmo idênticas, permanecem ambíguas. Elas não são somadas como
se fossem duas transações comprovadas. O total só é numérico quando a consulta
está completa, as identidades são unívocas e todos os valores foram conferidos.
Uma parcela conhecida é identificada como parcela. Zero só é total quando há
cobertura completa e explicitamente vazia.

## Coleta e datas

O servidor consulta `get_escrow_list` em páginas de até cem registros e janelas
locais de até sete dias de Brasília. Cada execução lê no máximo uma página, com
orçamento total de duas chamadas externas incluindo eventual renovação de
acesso. Há lease, limite de execução, repetição controlada após falhas e cursor
persistente. A página e seu avanço são gravados juntos.

O intervalo contábil é fechado no início e aberto no fim: `[início, fim)`.
A consulta usa uma margem de um segundo fora do início; os registros são
atribuídos localmente ao intervalo próprio. Isso evita perder uma borda pela
inclusão/exclusão não documentada da API. Horários de verão históricos usam o
primeiro instante da data local, inclusive quando não existia meia-noite.

A coleta tem um corte fixo. Uma atualização não une suas linhas com as de uma
coleta anterior. O último corte completo continua disponível enquanto o próximo
avança ou falha. Repetição de página, identidade inválida, resposta incompleta
ou limite atingido não liberam um total completo.

## Vínculo e persistência

O App escolhe os IDs e revisões das fontes da publicação mensal concluída.
No Financeiro, a cópia da coorte preserva hashes, classificação, valores e datas
validados, separadamente da retenção das consultas originais. Assim, remover
uma consulta antiga do cache operacional não apaga o vínculo já capturado.
Fontes legadas ausentes ou sobrepostas continuam explícitas e não geram zero.
Um conflito entre fontes conhecidas também é recusado quando outra fonte falta.

Caches de captura e relatórios conservam até oito assinaturas por mês, sempre
protegendo a assinatura atual. A limpeza ocorre na transação protegida por CAS;
não altera o histórico financeiro principal, custos ou configurações. O cache
operacional dos scans mantém o corte publicado e o ativo protegidos.

## Atualização autônoma e limites

Devoluções e liberações alternam oportunidades persistidas de trabalho, sem
alterar o contrato anterior do diagnóstico. Uma oportunidade faz no máximo uma
chamada privada ao Financeiro. Se uma fila aguarda localmente, a outra pode
avançar; depois de uma chamada iniciada, um erro não autoriza consultar a outra
fonte na mesma execução. Uma execução que perdeu a lease não inicia uma leitura.

Abrir o painel, mudar o mês e recalcular custos são leituras locais. A interface
preserva valores e horários após falhas e descarta respostas de uma publicação
anterior, mesmo dentro do mesmo mês. A coleta financeira e a recuperação de
custos mantêm prioridade; uma permissão ausente não revoga a conexão existente.

## Alcance financeiro

O relatório distingue consulta da API, data de liberação, data de criação dos
pedidos e horários das fontes usadas. Ele não altera o repasse do contrato v1,
não desconta novamente taxas ou reembolsos e não transforma liberação dentro da
Shopee em depósito bancário ou lucro realizado.

Os testes usam os três Workers gerados, normais e minificados, com coletores e
publicações reais e respostas de provedores simuladas. Cobrem duplicidade,
escala de 100 vezes, fontes ausentes, retenção, consultas interrompidas, limites,
concorrência e horários de verão. A leitura da conta real depende da resposta e
da permissão fornecidas pela Shopee e é acompanhada no próprio painel.

Fontes e limites documentais: [pesquisa das liberações](PESQUISA_LIBERACOES_SHOPEE.md).
