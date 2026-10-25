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

O valor `refund_amount` é exibido como **valor solicitado informado**. Pode
existir inclusive em uma solicitação cancelada; não comprova reembolso pago.
Não é descontado novamente do repasse. Status novos ou desconhecidos continuam
explícitos. Ausência de valor ou referência não se transforma em zero.

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

A próxima etapa para fechamento financeiro é validar uma fonte de liberações
de escrow e ajustes por pedido, preservando o mês de criação separado da data
de liberação. Liberação dentro da Shopee também não comprova depósito em banco.
O App não pode transformar esses três eventos em um único lucro realizado.

Pesquisa e fontes: [contratos consultados](PESQUISA_FINANCEIRA_SHOPEE.md).
