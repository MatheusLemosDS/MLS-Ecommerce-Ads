# Conferência das pendências do mês

A cobertura de custo das unidades vendidas e a situação financeira dos pedidos
são conferências distintas. Uma variação sem custo não recebe zero; pedidos em
cancelamento, devolução ou estado desconhecido não são promovidos a vendas pagas
para liberar o resultado.

## Retomada automática de modelos vendidos

A importação mensal agora transmite os pares realmente sem preço à fila. Se um
modelo vendido não existe no catálogo salvo, o produto recebe uma conferência
pontual mesmo quando estava MATCHED e sua revisão diária havia sido adiada pelo
índice de produtos. Isso preserva o custo dos outros modelos do mesmo produto.

A tentativa é registrada pelo conjunto de modelos e pelas evidências do catálogo.
Repetir uma leitura ou mudar apenas a quantidade não dispara consultas contínuas.
Uma variação histórica que a Shopee já não retorna permanece identificada como
modelo ausente, sem preço presumido. Novo modelo ou mudança na evidência pode
permitir outra conferência. Leases, pausas, falhas anteriores e a espera entre
tentativas continuam vigentes.

## Uma conferência por mês

Na Visão geral, abra as pendências e use **Conferir pendências do cálculo**.
O relatório lê somente dados locais e mostra produto/variação, quantidade,
atributos, motivo real, próxima tentativa, revisões, horários das fontes e
bloqueadores financeiros. O custo calculado é a autoridade; o selo MATCHED do
catálogo, isoladamente, não comprova cobertura financeira.

**Conferir custos automaticamente** consulta no máximo um produto recuperável
por chamada. A interface limita o trabalho a oito chamadas ou 120 segundos e
recalcula o mês localmente ao terminar. O escopo é formado pelos produtos do
próprio mês; tarefas globais não são consumidas por essa ação. Falta de regra,
regra desativada, associação inválida, conflito e interpretação ambígua não são
resolvidos por tentativas repetidas.

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

O lucro realizado continua desconhecido sem conciliação dos recebimentos. O
resultado previsto só é liberado pelo cálculo financeiro existente quando suas
pendências estiverem resolvidas, independentemente dos botões de conferência.
