# Hermes e o financeiro da loja

O Hermes recebe a mesma referência financeira validada que o painel mensal.
Cada nova análise guarda uma fotografia imutável dos valores, do período, dos
horários das fontes e das revisões de custos, vínculos, imposto e despesas.
Atualizar o painel ou editar custos depois não modifica uma análise anterior.
O registro tem um SHA-256 vinculado à tarefa; o servidor e a ponte conferem essa
referência antes da execução e da gravação da resposta.

## O que aparece na análise

No histórico do assistente, abra **Dados financeiros usados nesta análise**.
A seção mostra vendas da loja, investimento de Ads, saldo, cobertura dos custos,
deduções, pendências, fontes e até três próximas ações do diagnóstico da conta.
Carrega somente o registro aberto e preserva relatórios antigos, sem reconstruir
seus valores financeiros com dados atuais.

As tarefas usam o dia anterior em Brasília para os anúncios diários. O financeiro
usa o mês desse dia e informa separadamente suas datas de início e fim. Na virada
do mês, a análise de 31 de outubro continua usando outubro. O financeiro pode
incluir datas posteriores ao dia analisado; seus valores não são apresentados
como resultado daquele dia.

| Situação do financeiro | O que o assistente pode afirmar |
| --- | --- |
| Estimativa completa | Resultado previsto após os custos e despesas cadastrados. |
| Custos pendentes | Saldo após os custos identificados; ainda falta descontar produção. |
| Saldo provisório | Aritmética disponível, com devoluções ou atualizações por conferir. |
| Dados incompletos | Valores conhecidos e pendências; nenhum saldo presumido. |
| Registro antigo ou fonte indisponível | Ausência explícita da referência mensal, sem usar margens antigas de kits. |

As taxas já incluídas no repasse não são descontadas duas vezes. O DAS mensal é
considerado uma vez. Recarga retida só é reposta quando a classificação confirma
que é recarga. ROAS dos anúncios e TACOS da loja têm bases distintas.

## Atualização e aceitação

O App exige o protocolo `hermes-finance-v1` em cada retirada de tarefa. A ponte
anterior permanece visível como atualização pendente e não inicia análises novas
com as margens antigas. Execuções que já estavam em andamento podem concluir.
O relatório interpretado pelo modelo fica separado dos números e ações que o
sistema calcula de forma determinística.

Use a [entrega de atualização da ponte](hermes-finance-v1-upgrade-delivery/README.md)
no console root do Droplet. Ela confere a versão anterior, faz backup, substitui o
arquivo de forma atômica e reinicia somente quando não há análise em execução.
Não muda o secret existente. Este ambiente não tem acesso SSH ao Droplet, portanto
a ativação remota exige essa etapa no console.

A aceitação operacional exige: painel com assistente conectado e atualizado,
uma análise real concluída e sua referência financeira visível no histórico.
Testes locais não substituem essa observação. A atualização não altera o modo
manual/agendado nem o limite mensal de uso configurado pelo proprietário.

## Próxima fase

Validar recebimentos e reembolsos monetários, completar custos e depois conciliar
estoque e atribuição por campanha/produto. Só então preparar o piloto de execução
com limites próprios de mídia. O lucro realizado continua desconhecido sem a
conciliação dos recebimentos. Ads permanece `LOCKED`; nenhuma campanha ou verba
é alterada por esta integração.
