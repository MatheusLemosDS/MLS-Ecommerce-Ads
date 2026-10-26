# Conferência automática de devoluções e ajustes

A Visão geral ganha uma seção recolhida de conferência. Ela usa as mesmas
fontes do resumo publicado e mostra quais referências e valores foram
consultados. Abrir a seção não inicia uma consulta à Shopee: a coleta é feita
pelo servidor e a interface lê os relatórios salvos.

## O que é guardado

O Financeiro preserva, em seu banco privado, o identificador exato do pedido,
seu status, as referências de devolução e os campos monetários disponíveis:

- `escrow_amount`: repasse usado na apuração existente;
- `escrow_amount_after_adjustment`: repasse após ajustes informado pela fonte;
- `total_adjustment_amount`: ajuste com sinal informado pela fonte.

A captura usa a mesma transação e lease da página ou checkpoint. Não acrescenta
chamadas à Shopee durante a importação financeira. O vínculo com o registro é
validado por hash, identidade e horário; o relatório destinado ao App contém
somente identificadores derivados, contagens, valores e códigos limitados.
Dados de compradores, tokens e números originais de pedidos não atravessam
esse novo contrato.

## Pedidos em revisão — 26/10/2026

O atalho **Conferir pedidos e devoluções**, junto às pendências da Visão geral,
abre a seção **Conferência de repasses e devoluções**. O atalho só abre, desloca
e dá foco à seção; não inicia coleta nem acrescenta consulta ao servidor.

A seção separa duas contagens: pedidos com situação em revisão, fora dos
valores dos pedidos pagos, e pedidos pagos com devolução identificada. No
diagnóstico enviado pelo operador, os dois pedidos `TO_RETURN` pertencem ao
primeiro grupo e os quatro pedidos pagos com devolução pertencem ao segundo.
São populações diferentes; não se deve somar as contagens para obter vendas
pagas nem presumir que cada pedido tenha exatamente uma solicitação.

Cada pedido em revisão pode mostrar:

- a situação e o horário original em que ela foi observada;
- se a busca de referências está pendente, aguarda nova tentativa, encontrou
  referências, confirmou uma lista vazia ou não se aplica àquela situação;
- quantas solicitações têm detalhes consultados e quantas ainda aguardam;
- a data própria da consulta das referências, um motivo controlado de falha
  e o horário a partir do qual uma nova consulta pode ser tentada;
- a próxima conferência necessária e um vínculo com as solicitações daquele
  pedido disponíveis na mesma página.

As referências exibidas são internas do BrazaCommerce, derivadas por hash.
Não são números de pedidos pesquisáveis na Shopee. A interface mostra até
quarenta pedidos em revisão e quarenta solicitações por intervalo financeiro,
com aviso quando a lista é parcial; as contagens continuam abrangendo o
intervalo inteiro. Uma consulta malsucedida não renova a data da evidência
anterior nem transforma referência desconhecida em uma lista vazia.

Cancelamento em andamento (`IN_CANCEL`) ou situação desconhecida, por si só,
não exige referências de devolução. O erro que atribuía essa falta a qualquer
pedido em revisão foi corrigido. A revisão da situação do pedido permanece
pendente no resumo mensal. Se uma referência de devolução for contraditoriamente
vinculada a dois pedidos, o sistema preserva o relatório parcial anterior,
sem atribuir a solicitação arbitrariamente a um deles.

O detalhamento usa as evidências já carregadas pelo Financeiro. O App grava o
relatório ampliado no mesmo registro existente e o navegador usa a mesma
leitura periódica do relatório salvo. Não foram acrescentadas tabelas, consultas
D1, chamadas à Shopee ou temporizadores. O volume de cada relatório aumenta
com os detalhes; isso não equivale a uma medição da fatura em produção.

O formato ampliado é negociado entre os três Workers. Chamadores antigos
continuam recebendo o relatório v1, e uma atualização gradual pode continuar
usando v1 sem repetir a consulta. Se a leitura salva ainda não tiver detalhes
individuais compatíveis, o painel conserva os totais e informa essa ausência.
Tanto os detalhes quanto o relatório seguem a mesma publicação, período,
identidade e revisão das fontes; trocar de mês ou de publicação invalida o
conjunto anterior.

Uma importação anterior sem essas evidências continua legível. Ao atualizar o
período, o coletor prepara uma substituição para capturá-las, sem reutilizar
indefinidamente uma versão antiga que não permite conferir devoluções.

## Devoluções e limites

Quando um pedido `TO_RETURN` veio sem referências, a auditoria usa a leitura
financeira existente para tentar recuperá-las, sem classificar o pedido como
venda paga nem alterar seu repasse. A ausência de referência continua explícita
se a fonte não a informar.

A consulta de detalhes usa as referências exatas recebidas da Shopee. Cada
execução tem orçamento de duas chamadas externas no total, incluindo eventual
renovação de acesso. Há cache, leases por execução e caso, espera após falhas e
prioridade para casos ainda não consultados. Uma permissão ausente para
Returns é indicada separadamente e não desconecta o financeiro.

O valor `refund_amount` é exibido como **valor de reembolso informado pela
Shopee**, acompanhado da situação da solicitação. Pode existir inclusive em
uma solicitação cancelada; esse campo sozinho não comprova crédito bancário
ou débito no repasse do vendedor. Não é descontado novamente do repasse.
Status novos ou desconhecidos continuam explícitos. Ausência de valor ou
referência não se transforma em zero.

A continuidade de [valores das devoluções e saldo após ajustes](VALORES_DE_DEVOLUCOES_E_SALDO_AJUSTADO.md)
totaliza as referências por situação e por base financeira, antes do limite
visual, e apresenta o repasse compatível de cada pedido afetado. Um quadro
provisório combina o repasse após ajustes com os custos da mesma publicação.
O saldo ainda a liberar permanece separado e indisponível até sua conciliação.

## Ajustes e resultado

Um ajuste só é apresentado como coerente quando os três campos monetários são
válidos, em BRL, e a relação em centavos confere:

```text
repasse-base + ajuste com sinal = repasse após ajustes informado
```

Zero é um valor explícito, não uma indicação de campo ausente. Os exemplos
consultados mostram um ajuste positivo aumentando o repasse. Portanto, não é
correto subtrair indiscriminadamente o campo de ajuste.

A conferência não altera o repasse-base, os descontos existentes ou o resultado
estrito do contrato financeiro v1. O painel distingue previsão operacional,
evidências de ajustes, valor solicitado em devoluções e recebimento conciliado.
Identificar todos os detalhes de devolução não comprova liquidação bancária.

## Operação

O trabalho usa a oportunidade do histórico quando não há recuperação de custos
pronta para executar, preservando a prioridade da coleta financeira e dos
custos. Uma continuação útil pode manter essa oportunidade na próxima rodada;
permissão negada e espera de provedor não geram consultas em sequência.

Os relatórios são vinculados ao `run_id`, à revisão, às datas, à cobertura, ao
repasse-base e aos horários originais da publicação. Uma coleta em andamento
não substitui a referência exibida. Uma falha conserva o último relatório
validado com sua data e registra uma tentativa separada.

A interface também compara a revisão da publicação e a identidade completa das
fontes com o resumo que está na tela. Uma resposta válida de outra atualização
do mesmo mês é recusada, inclusive quando datas, contagens e valores coincidem.
Ao trocar de mês ou iniciar uma consulta manual, a conferência anterior é
suspensa; ela retorna após a leitura de uma publicação correspondente.

## Evidência e próxima etapa

Foram testados os três Workers gerados, normais e minificados, a captura nas
transações reais do Financeiro, o cache, as permissões e as leituras passivas.
Os dados dos testes são simulados. A disponibilidade e as permissões da conta
real são verificadas pelo coletor após a implantação e apresentadas no painel.

O [cruzamento de liberações com pedidos](LIBERACOES_E_PEDIDOS.md) já acrescenta
uma consulta de liberações de escrow e compatibilidade monetária por pedido.
O fechamento ainda depende de conferir a cobertura e as diferenças na conta
real, preservando mês de criação, data de liberação e reembolso efetivo como
evidências distintas. Liberação dentro da Shopee não comprova depósito em banco.

A regressão desta continuidade usa os três Workers gerados, normais e
minificados, com dois pedidos `TO_RETURN`, quatro pedidos pagos com devolução
e seis referências. Confere a navegação, os contratos e os horários, mantém
os valores financeiros e as pendências mensais, e verifica que leituras locais
repetidas não fazem chamadas externas nem gravam novamente os relatórios.
Esse cenário controlado não é uma nova leitura autenticada da conta do operador.

Pesquisa e fontes: [contratos consultados](PESQUISA_FINANCEIRA_SHOPEE.md).
