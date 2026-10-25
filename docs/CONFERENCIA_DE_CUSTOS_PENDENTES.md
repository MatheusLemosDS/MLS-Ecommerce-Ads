# Conferência das pendências do mês

A cobertura de custo das unidades vendidas e a situação financeira dos pedidos
são conferências distintas. Uma variação sem custo não recebe zero; pedidos em
cancelamento, devolução ou estado desconhecido não são promovidos a vendas pagas
para liberar o resultado.

## Referências confirmadas nesta loja

Três ajustes específicos da loja `1178167501` são aplicados antes da leitura
dos custos, com registro de versão e auditoria:

- O produto adulto `22199878767` deixa de usar a associação geral à regra
  infantil. As variações adultas reconhecidas voltam ao custo adulto salvo:
  onze unidades regulares a R$ 15,90 correspondem a R$ 174,90.
- O tamanho infantil `2` passa a fazer parte da regra de camiseta infantil de
  R$ 12,50, preservando os tamanhos `4`, `6`, `8`, `10`, `12`, `14` e `16`.
  Duas unidades custam R$ 25,00.
- O produto `58271140523`, variação `149796059126`, recebe a composição
  confirmada de três camisetas adultas: P, M e G. Com a referência atual de
  R$ 15,90 por peça, uma unidade desse combo custa R$ 47,70. A composição
  acompanha os custos salvos; não grava esse total como preço fixo permanente.

Esses ajustes são registrados uma única vez. Leituras seguintes e reinícios do
Worker não repetem versões nem sobrescrevem uma configuração posterior do
proprietário. Uma configuração incompatível fica registrada como conflito para
conferência. O custo plus salvo, inclusive uma referência de R$ 21,40, é preservado.
O histórico dos três ajustes está no GET privado
`/api/admin/production-costs/confirmed-references` e na área de custos.

## Retomada automática de modelos vendidos

A importação mensal agora transmite os pares realmente sem preço à fila. Se um
modelo vendido não existe no catálogo salvo, o produto recebe uma conferência
pontual mesmo quando estava MATCHED e sua revisão diária havia sido adiada pelo
índice de produtos. Isso preserva o custo dos outros modelos do mesmo produto.

A tentativa é registrada pelo conjunto de modelos e pelas evidências do catálogo.
Repetir uma leitura ou mudar apenas a quantidade não dispara consultas contínuas.
Uma variação histórica que a Shopee já não retorna permanece identificada como
modelo ausente até existir evidência suficiente. Novo modelo ou mudança na
evidência pode permitir outra conferência. Leases, pausas, falhas anteriores e a
espera entre tentativas continuam vigentes.

Falha de rede, tempo esgotado, limite de chamadas ou recusa da API não são mais
tratados automaticamente como catálogo malformado. A leitura preserva códigos
finitos para a etapa de informações básicas e a etapa de modelos, separando
produto omitido, nome indisponível, estrutura inválida e falha da fonte. Mensagens
livres da Shopee e credenciais não entram nesse diagnóstico.

## Recuperação pelo histórico dos pedidos

Para produtos ou modelos removidos do catálogo atual, a recuperação pode ler
somente os produtos pendentes do mês no histórico oficial dos pedidos. Cada
chamada processa uma página de até 50 pedidos, em uma janela de até 15 dias no
horário de Brasília, e conserva o cursor para a próxima etapa. Essa leitura usa
`get_order_list` e `get_order_detail`; não reimporta os repasses do Payment.

As evidências conservam os IDs exatos de produto e modelo, o título do produto e
o nome da variação registrados no pedido. O retorno entre serviços não contém
números de pedidos, dados de clientes ou credenciais. Ausência de nome e nomes
contraditórios ficam explícitos. A página aceita nunca é truncada silenciosamente:
um excesso de tamanho conserva o checkpoint e produz uma falha limitada.

A captura histórica não cria preço. A aplicação de custo exige uma composição
determinística aprovada pelo fluxo: camiseta adulta avulsa com tamanho adulto,
camiseta infantil com tamanho infantil permitido, ou kit casal com os dois
tamanhos e seus gêneros explícitos. Título parecido, tema da estampa ou um número
isolado não selecionam uma família. Calças, moletons, conjuntos ambíguos e dados
conflitantes continuam pendentes. Vínculos manuais e modelos atuais reconhecidos
têm prioridade sobre a recuperação histórica. A quantidade para calcular o custo
continua vindo da apuração mensal, sem somar quantidades da captura histórica.

Os nomes capturados só são publicados como evidência aprovada depois da conclusão
da varredura necessária. O estado, a pausa, a espera entre tentativas e a exclusão
por lease permanecem registrados. Uma leitura parcial não comprova cobertura
completa do mês.

O cron executa uma tarefa por vez: mantém prioridade para o financeiro em
andamento e intercala a captura histórica, o catálogo, o índice de produtos,
a produção e os custos semanais. Cada etapa tem exclusão por lease. A primeira
execução que aplica as referências confirmadas faz apenas a manutenção local.
Lotes históricos em andamento conservam seus cinco produtos; lotes concluídos
recentemente cedem lugar aos produtos ainda não consultados. Uma nova tentativa
do mesmo lote concluído aguarda 15 minutos e não apaga a evidência válida.

## Uma conferência por mês

Na Visão geral, abra as pendências e use **Conferir pendências do cálculo**.
O relatório lê somente dados locais e mostra produto/variação, quantidade,
atributos, motivo real, próxima tentativa, revisões, horários das fontes e
bloqueadores financeiros. O custo calculado é a autoridade; o selo MATCHED do
catálogo, isoladamente, não comprova cobertura financeira.

**Conferir custos automaticamente** executa uma etapa limitada de conferência do
catálogo ou de recuperação histórica por chamada. A interface limita o trabalho a
oito chamadas ou 120 segundos e recalcula o mês localmente ao terminar. O escopo é
formado pelos produtos pendentes do próprio mês; tarefas globais não são consumidas
por essa ação. Falta de regra, regra desativada, associação inválida, conflito e
interpretação ambígua não são resolvidos por tentativas repetidas.

Os pedidos em revisão são separados em cancelamento em análise (IN_CANCEL),
devolução (TO_RETURN) e situação desconhecida. A categoria desconhecida não permite
recuperar o texto original do estado a partir dos agregados já salvos. Reconsultar
o catálogo de produtos não concilia essas situações nem valores de reembolso.

## Diagnóstico para suporte

**Copiar diagnóstico** guarda um JSON próprio do mês. O mesmo retorno está no
GET privado `/api/admin/finance/cost-diagnostics?month=YYYY-MM`. Não contém dados
de clientes, números/hashes de pedidos ou credenciais. Inclui valores financeiros
comerciais da loja; compartilhe somente com quem deve analisá-los.

A recuperação usa POST `/api/admin/finance/cost-recovery`, com sessão de proprietário,
mesma origem e CSRF. Nenhuma dessas ações muda a Shopee ou o modo de execução de
Ads. O diagnóstico tem limite de 64 KiB, com truncação explícita; uma mudança de
revisão durante a leitura é identificada, sem misturar valores de versões distintas.
O GET privado `/api/admin/finance/business-month-ads-state?month=YYYY-MM` permite
conferir o estado e os horários do cache de anúncios sem disparar uma nova consulta
à Shopee. Ambas as leituras exigem a sessão do proprietário; um token da ponte
Hermes ou um acesso de revisão não substitui essa sessão.

O lucro realizado continua desconhecido sem conciliação dos recebimentos. O
resultado previsto só é liberado pelo cálculo financeiro existente quando suas
pendências estiverem resolvidas, independentemente dos botões de conferência.
