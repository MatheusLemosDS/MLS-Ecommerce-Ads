# Despesas operacionais e atualização das variações

Incremento de **26/10/2026**, a partir de `5322d70` (PR #3). Atende ao pedido
do operador para cadastrar aluguel do barracão, funcionários, boletos e parcelas
e à investigação da camiseta infantil após a remoção do tamanho 16.

## Despesas por competência

O cadastro fica no financeiro mensal e discrimina despesas nas categorias
**Aluguel do barracão**, **Funcionários**, **Boleto / conta a pagar** e
**Outras despesas**. Cada lançamento contém descrição, valor em centavos,
competência, vencimento e situação de pagamento. A data de pagamento é uma
informação declarada pelo operador.

O campo de parcelas usa o **valor de cada parcela**, com uma quantidade finita
de meses. Uma despesa única usa uma parcela. Aluguel e salários podem ser
cadastrados para uma sequência explícita de meses; não há renovação infinita
nem criação de lançamentos pelo cron ou pela abertura da tela. A consulta dos
meses futuros fica no próprio cadastro, sem iniciar coleta financeira futura.
O limite por série é de 120 parcelas. O cadastro aceita até 200 lançamentos por
competência e 2.000 no total, contando os cancelados que continuam no histórico.
Uma série que exceda o limite é recusada inteira, sem salvar parte das parcelas.
Vencimentos no último dia disponível de um mês curto retomam o dia original
quando possível: por exemplo, 31 de janeiro, 28 de fevereiro e 31 de março.

O valor entra no resultado previsto pela **competência**. A situação pago/em
aberto serve ao controle das contas e não determina uma segunda dedução.
Produção, DAS e consumo de anúncios continuam nos cálculos próprios; esses
valores não devem ser repetidos no cadastro de despesas externas.

O cadastro não executa pagamento de boletos, transferência bancária, folha de
pagamento ou cálculo automático de encargos. O operador informa os custos que
quer considerar. Marcar como pago não comprova liquidação financeira.

## Transição de um total já declarado

O total mensal anterior e suas revisões são preservados. Começar a detalhar
uma competência coloca sua conferência em rascunho; o resultado fica pendente
até o operador confirmar a composição. A confirmação informa separadamente o
valor que ainda não foi detalhado:

```text
total das despesas do mês
= lançamentos ativos da competência
+ outras despesas ainda sem detalhamento
```

O total calculado **substitui** o total agregado anterior. Não se somam
automaticamente os dois cadastros. Exemplos ilustrativos:

| Situação | Lançamentos | Restante informado | Novo total |
| --- | --- | --- | --- |
| Os R$ 100 anteriores foram inteiramente detalhados | R$ 30 + R$ 70 | R$ 0 | R$ 100 |
| Os R$ 100 anteriores continuam válidos e há um novo aluguel de R$ 50 | R$ 50 | R$ 100 | R$ 150 |

Depois da confirmação, alterações de valores e cancelamentos dos lançamentos
atualizam o total da competência na mesma transação. O histórico permanece
disponível no armazenamento; cancelar um lançamento não apaga o registro.
Competências novas de uma série permanecem pendentes até a própria conferência:
uma parcela conhecida não declara que todas as despesas daquele mês são
conhecidas.

As gravações usam controle de revisão para impedir sobrescrita por uma tela
desatualizada. O formulário antigo de total agregado não pode substituir
silenciosamente uma competência que já está sendo gerida pelo detalhamento.
Repetições de uma mesma solicitação não devem criar uma segunda série.

## Camiseta infantil após remover um tamanho

A investigação encontrou dois defeitos reproduzíveis no código:

1. Quando a única correção manual de tipo/tamanho pertencia ao modelo removido,
   essa referência ausente podia impedir o reconhecimento independente dos
   modelos atuais. A identificação agora pode usar o tipo do produto e os
   tamanhos atuais comprovados, mantendo as restrições contra eixos ambíguos,
   kits e outros tipos de produto. A correção antiga continua ligada ao seu
   identificador histórico.
2. A conferência manual não transportava a revisão da mudança do catálogo.
   Assim, uma leitura válida podia atualizar as variações e deixar ativo o
   aviso de catálogo alterado. A gravação agora encerra somente a mudança que
   aquela leitura observou; uma alteração mais recente continua pendente.

Em **Produtos → Catálogo salvo → Ver variações e custos**, o botão
**Conferir variações na Shopee** consulta somente o produto aberto e recarrega
os custos a partir das regras salvas. Não exige recriar o anúncio, recolocar o
tamanho 16 ou apagar os custos existentes.

Variações são vinculadas pelo identificador do modelo e pelas opções do eixo
de tamanho. A posição da opção na lista não é usada como identidade de custo.
A remoção de um tamanho não autoriza transferir seu custo para outro SKU.
Referências históricas de pedidos e correções manuais não são apagadas.

A reprodução com dados controlados demonstra os defeitos e a correção. A
conferência do anúncio real na conta é uma verificação separada: o navegador
disponível abriu a página de login, sem acesso à lista autenticada de produtos.

## Consumo e validação

O cadastro de despesas é consultado sob demanda. Não introduz um novo ciclo
de consultas periódicas, um coletor externo ou gravações de parcelas ao abrir
a tela. As séries são criadas em uma ação explícita; o estado pago não altera
o custo por competência.

As regressões cobrem composição de despesas sem duplicidade, preservação da
declaração anterior, conflitos de revisão, repetições de solicitação,
parcelamento, atualização do total e bloqueio do resultado enquanto a
conferência está pendente. Resumo financeiro, saldo registrado, diagnóstico,
histórico e contexto do Hermes respeitam a pendência, mesmo que o valor da
declaração anterior continue preservado.

As regressões de catálogo cobrem remoção da variação corrigida, manutenção de
custos dos tamanhos atuais, alterações concorrentes, falha da fonte e respostas
atrasadas após a troca do produto aberto. Essas verificações não equivalem a
uma observação autenticada do anúncio do operador em produção.

O resultado continua previsto. As etapas de conciliação de recebimentos,
reembolsos e cobertura financeira do roadmap permanecem necessárias.

Referências de implementação do D1, consultadas em 26/10/2026:
[transações com `batch()`](https://developers.cloudflare.com/d1/worker-api/d1-database/#batch)
e [limites por consulta e por lote](https://developers.cloudflare.com/d1/platform/limits/).
