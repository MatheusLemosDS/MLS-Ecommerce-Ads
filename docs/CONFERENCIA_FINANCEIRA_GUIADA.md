# Conferência financeira guiada e confirmação de despesas

Incremento de **26/10/2026**, após o operador confirmar que a Visão geral e o
lucro diário da PR #9 estavam funcionando. Continua a fase de confiabilidade
financeira do roadmap, com os dados já salvos e as coletas existentes.

## Pendências com destino definido

A seção recolhida **O que falta para concluir o resultado** mostra ações para
abrir a conferência correspondente: despesas, produtos com pendências,
pedidos e devoluções, regra do imposto ou andamento da coleta. Problemas com
o mesmo destino compartilham um botão. Os atalhos não iniciam uma atualização
de vendas nem acionam a recuperação automática dos custos.

Quando a fonte financeira está pendente e uma nova coleta automática está
realmente em andamento, a seção informa esse estado. Os dados publicados
mantêm seus horários. A opção de acompanhar a coleta apenas abre sua
explicação; o botão já existente de atualizar vendas conserva seu fluxo.

O quadro de conferência respeita as pendências do cálculo. Um valor anterior
de despesas preservado durante a transição para o cadastro detalhado não
significa que a nova composição foi confirmada. Pedidos `TO_RETURN` em revisão
também impedem marcar devoluções e ajustes como conferidos, mesmo quando a
contagem de devoluções da base paga é zero.

## Prévia das despesas antes de confirmar

A confirmação da competência apresenta uma prévia local:

```text
lançamentos ativos salvos + restante sem detalhamento = novo total do mês
```

Também mostra o total anterior informado e a diferença para o novo total.
A ausência de declaração anterior permanece desconhecida. Um valor inválido
ou uma soma acima do limite seguro impede confirmar a prévia. A aritmética
usa centavos inteiros com BigInt.

Por exemplo, se o total anterior era R$ 100 e foram detalhados R$ 50 que já
faziam parte dele, o restante deve ser R$ 50 para conservar o total de R$ 100.
Se os R$ 50 forem uma despesa adicional e os R$ 100 anteriores continuarem
válidos, o restante será R$ 100 e a prévia mostrará R$ 150. A interface não
decide qual interpretação representa as despesas do operador.

A prévia considera somente lançamentos salvos. Ela não salva a edição aberta
nem confirma automaticamente a competência. Pago e em aberto continuam
participando uma única vez do custo por competência; informar pagamento não
executa transferência e não cria uma segunda dedução.

## Rascunhos e seleção da competência

Se houver uma edição não salva, **Editar** e **Informar pagamento** preservam
seus campos e orientam salvar ou descartar essa edição antes de abrir outra.
Isso vale também para um segundo clique na mesma despesa. Os controles de
descartar, carregar valores salvos e cancelar lançamentos mantêm seus fluxos.

O atalho **Despesas** do resumo seleciona explicitamente a competência exibida.
Assim, consultar novembro no cadastro e depois conferir outubro pelo resumo
abre outubro. O rascunho de novembro permanece guardado nessa aba para o
retorno. Atualizações normais do resumo não desfazem a seleção independente
de um mês futuro.

A abertura explícita reutiliza uma leitura que já estiver em andamento e
impede que o evento de abrir a seção dispare outra consulta. O controle de
revisão e a chave de idempotência permanecem: uma resposta de gravação perdida
não autoriza substituir o rascunho nem criar outra série ao repetir o envio.

## Diagnóstico ligado à atualização financeira exibida

O contrato opt-in `business_cost_diagnostics_evidence_v3`, solicitado por
`evidence=history-v3`, acrescenta ao diagnóstico existente:

- origem da exibição, `PUBLISHED` ou `ACTIVE`;
- identidade exata da publicação e de suas fontes em `audit_scope`;
- revisões de vínculos, custos, regras, classificações, despesas e política
  tributária usadas pelo resumo.

Display e identidade são capturados na mesma chamada a
`readBusinessMonthDisplay`. O acompanhamento em segundo plano pode observar
uma coleta posterior; ele não é usado para reconstruir a identidade da
publicação que gerou o diagnóstico. Uma coleta ainda sem publicação mantém
`audit_scope: null` e sua condição parcial explícita.

O navegador compara publicação, fontes, seis revisões, cobertura, valores,
pendências e pares produto/variação/quantidade. Totais iguais não substituem
identificadores iguais. A mudança de despesas para rascunho invalida a
conferência anterior mesmo que o valor preservado e sua revisão sejam os
mesmos. Somente a pendência de idade do Financeiro pode mudar sem trocar os
horários originais da fonte; nenhum horário é renovado para aparentar frescor.

Quando a referência da tela muda, a evidência incompatível deixa de aparecer
e de poder ser copiada. Respostas atrasadas não substituem o diagnóstico da
atualização corrente. Durante a recuperação de custos, a nova evidência pode
orientar a continuação do trabalho, mas só é exibida ou copiada depois da
releitura de um resumo compatível. Uma falha nessa releitura não promove a
evidência nova como se ela já correspondesse aos valores da tela.

Os contratos v1/v2 permanecem disponíveis. Uma view antiga sem identidade
verificável pode apresentar o diagnóstico legado, identificado como tal.
Uma resposta v3 inválida não é aceita por descarte de sua extensão.

## Consumo e validação

O novo reader executa as mesmas consultas SQL e operações D1 do reader v2.
Não há tabela, cron, polling ou chamada adicional à Shopee. A resposta contém
metadados adicionais e a validação realiza comparações locais; isso não
equivale a consumo faturável zero nem a uma projeção de economia em produção.
Os cadastros de despesas mantêm a API e as gravações anteriores.

Os testes cobrem a troca real de publicação A por B durante a consulta,
mudança concorrente de custos, valores iguais com revisões diferentes,
rascunho de despesas, cobertura, versões antigas, respostas fora de ordem,
adulteração monetária e os scripts normais e minificados. Conferem ainda
prévia exata, preservação de rascunhos, repetição após resposta perdida e
ausência de novas consultas aos provedores nas ações locais.

Essas verificações não conciliam recebimentos bancários nem os valores reais
da conta. O resultado permanece estimado. A próxima entrega da conferência
de liberações poderá expor quais referências internas e motivos explicam os
agregados já salvos, preservando o corte e a publicação, sem presumir unidade
monetária para valores ainda não conferidos.
