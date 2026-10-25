# Identificação automática e custos pendentes

A Visão geral e Produtos usam a mesma fila persistente de identificação. Uma
consulta do catálogo fornece a composição de camisetas adultas e kits e as
informações necessárias às regras infantis e personalizadas. A fila conserva
tentativas, próxima consulta e diagnósticos por produto; uma falha não interrompe
os outros produtos.

## Funcionamento automático

- A apuração mensal coloca os produtos encontrados na fila, inclusive durante
  a coleta parcial. Produtos descobertos na tela também entram na mesma fila.
- O cron processa até três produtos por rodada, sem exigir navegador aberto.
  Com o painel visível, o cliente avança uma consulta por requisição, com
  exclusão de concorrência e sem a interrupção anterior após sessenta produtos.
- A pausa da coleta vale também para a identificação. Uma consulta que já
  começou pode terminar; as seguintes aguardam a retomada.
- Falhas individuais aguardam cinco, dez, vinte e, depois, até trinta minutos.
  Produtos seguintes continuam disponíveis para consulta.
- O catálogo aceito é conferido diariamente. A idade da consulta, sozinha, não
  apaga a composição cadastrada nem transforma novamente seu custo em pendente.

As classificações automáticas ficam em tabelas próprias por produto e variação,
sem o teto de mil vínculos do documento legado. O cálculo mensal continua
limitado à cobertura admitida pela apuração e lê custos, regras e classificações
em uma mesma transação de leitura. O navegador recebe uma prévia limitada; a
indicação de limite não significa que as demais classificações foram apagadas.

## Como o custo é escolhido

O preço vem das referências cadastradas pelo proprietário, nunca do preço de
venda ou do repasse da Shopee. A regra infantil existente usa R$ 12,50 para os
tamanhos 4, 6, 8, 10, 12, 14 e 16; alterações posteriores na regra são aplicadas
sem congelar esse preço dentro da classificação. Adultos e kits seguem os custos
e componentes atuais cadastrados, com a composição correspondente.

Custos personalizados e regras explícitas continuam com suas prioridades
existentes. Uma nova composição automática não substitui uma composição manual
confirmada. Um catálogo de calça com opções P/M/G, por exemplo, não recebe o
custo de camiseta apenas por compartilhar esses tamanhos.

Cada resposta aceita conserva identidade, atributos e origem. Uma mudança
confirmada substitui as classificações automáticas daquele produto; variações
removidas não ressuscitam por resposta antiga ou vínculo automático legado.
Uma falha temporária de consulta preserva a evidência já cadastrada. Casos
ambíguos continuam pendentes e mostram o motivo, em vez de receber um custo
inventado.

## Valores conhecidos e pendências do mês

O relatório distingue a falta de custo do próprio produto dos avisos gerais do
período. Quando todos os pagamentos exclusivos do produto estão cobertos, seus
custos estão completos e não há devolução presente ou desconhecida nesses
pedidos, aparece **Subtotal dos pedidos já conferidos**.

Exemplo: repasse R$ 21,98 menos produção R$ 15,90 resulta em **R$ 6,08**. Esse
subtotal é anterior a anúncios e outras despesas. O DAS-MEI continua descontado
uma única vez no resultado mensal, sem rateio por produto. Pedidos mistos não
recebem um rateio inventado de repasse.

Um pagamento exclusivo faltante impede o subtotal: o sistema não subtrai o custo
de todos os pedidos de um repasse conhecido apenas parcialmente. Se a leitura
financeira estiver antiga, o valor aparece como **Subtotal da última leitura**,
com a data. As proteções do saldo final e do líquido mensal continuam vigentes.

**Catálogo antigo e financeiro antigo são situações diferentes:** a composição
é uma referência cadastrada; valores financeiros precisam continuar respeitando
o controle de frescor, cancelamentos e devoluções.

## Interfaces e histórico

As novas rotas `/api/admin/catalog-classification`, `/enqueue` e `/sync`
exigem sessão do proprietário. As duas ações POST exigem Origin e CSRF. A
consulta mostra progresso, nomes, opções e motivos, sem números de pedidos,
compradores, tokens ou respostas brutas da Shopee.

O mês inclui `classification_revision`. O histórico financeiro conserva essa
revisão quando disponível, aceitando os registros antigos sem reescrever suas
assinaturas. O subtotal opcional `known_exclusive_after_costs_cents` não libera
`net_profit_cents` nem autoriza ações comerciais automáticas.
