# Conferência de anúncios e financeiro

Admin e dashboard consultam a mesma fonte de anúncios e aplicam a mesma projeção
de datas, gastos e atribuição. O dashboard inicia em **hoje, em Brasília**, com
seleção explícita de até 15 dias. No Admin, o link do bloco de anúncios abre o
dashboard com as mesmas datas do resumo.

- Investimento é a soma exata dos gastos diários, em centavos. Dias ausentes
  deixam o total pendente; não são tratados como zero.
- Vendas atribuídas e pedidos atribuídos usam atribuição ampla. Direta fica
  separada; nunca é somada nem usada para preencher uma ampla ausente.
- ROAS informado é o valor retornado pela fonte para o dia. ROAS calculado é
  vendas atribuídas divididas pelo investimento da mesma leitura. Para um
  período, divide-se a soma das vendas pela soma dos gastos; não se faz média
  dos ROAS diários.
- Saldo da conta de anúncios é crédito disponível, separado do investimento.
- Cada consulta identifica datas e horário da leitura. Esse horário não
  comprova o corte de atualização da Shopee, ainda não informado pela fonte.
  Consultas feitas em momentos diferentes podem divergir.

O Admin atualiza automaticamente anúncios de períodos que incluem hoje a cada
60 segundos, enquanto está visível, no modo automático e sem edição de
despesas. Períodos encerrados mantêm cache de até 15 minutos; o botão Atualizar
anúncios permite nova consulta. A atualização preserva valores salvos e rascunhos.

## Como conferir com a Shopee

Selecione as mesmas datas em ambos os painéis e confira **Shopee Ads**, com a
mesma atribuição. Vendas da loja e vendas atribuídas aos anúncios são métricas
diferentes. Registre também o horário de atualização exibido pela Shopee.

Por exemplo, vendas atribuídas de R$ 1.011,37 e gasto de R$ 52,61 dão ROAS
calculado de 19,223912. Se a fonte retorna ROAS 19,28, o painel preserva os dois
valores e sinaliza a diferença. Um gasto atualizado de R$ 52,77, com as mesmas
vendas, dá 19,165624. O código não altera os gastos para forçar um ROAS.

## Saldo de pedidos concluídos

A consulta financeira atual reúne somente pedidos concluídos criados no período.
Ela não cobre todas as vendas em andamento. O resumo mostra repasse previsto,
produção, imposto de 2% e saldo desses pedidos. Anúncios e outras despesas do
calendário aparecem separados.

Assim, R$ 173,37 de repasse menos R$ 117,30 de produção e R$ 4,91 de imposto
resultam em **R$ 51,16 de saldo dos concluídos**. Descontar R$ 489,24 de anúncios
de todo o período desse saldo não comprova prejuízo de R$ 438,08 da loja.

O líquido da loja permanece **Em conciliação** até que as vendas, anúncios,
devoluções, despesas e recebimentos tenham cobertura e critérios compatíveis.
Salvar despesas ou confirmar a unidade monetária não substitui essa conciliação.
