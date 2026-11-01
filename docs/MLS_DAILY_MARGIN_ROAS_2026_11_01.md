# Margem parcial e ROAS — indicadores independentes dos gráficos

## Estado da entrega

Preparação do follow-up96, sobre a base `8acf6b9`, na branch `fix/daily-margin-roas-presentation-20261101`. O incremento se limita ao App. Este registro distingue os dados observados na conta, a reprodução local e a conferência ainda pendente da publicação.

| Evidência da entrega | Estado |
| --- | --- |
| PR | PENDING |
| Commit do código | PENDING |
| CI e contagem de testes | PENDING |
| Versão publicada do App | PENDING |
| SHA-256 do App gerado | PENDING |
| SHA-256 dos bytes publicados | PENDING |
| Conferência pós-publicação | PENDING |

## Diagnóstico comprovado e limite da atribuição da causa

O valor parcial do dia voltou a ser apresentado, mas Margem e ROAS ainda apareciam como traços na visão geral. São situações com bases diferentes:

- A margem financeira completa de novembro permanece desconhecida porque não existe declaração de despesas do mês. Um subtotal conhecido permite uma margem parcial claramente identificada; não permite preencher a margem líquida verdadeira.
- A fonte Ads já fornece um ROAS válido para o dia observado. Ausência de dois dias reais impede o gráfico e a comparação, mas não torna indisponível o índice já informado por uma observação válida.

Foi confirmado no fluxo de atualização que os gráficos eram atualizados antes dos KPIs. Uma exceção nessa etapa podia interromper a pintura dos indicadores; o tratamento externo do registro de agentes absorvia a exceção, permitindo que o traço inicial permanecesse na interface. A regressão preparada com falha de gráfico injetada foi definida para verificar esse acoplamento causal.

A exceção específica na sessão real do proprietário não foi capturada. Portanto, este diagnóstico não atribui a falha a um navegador, aparelho, extensão ou erro concreto ocorrido nessa sessão. A correção elimina a dependência demonstrada no código e na reprodução controlada.

## Fontes e exemplos, sem misturar os recortes

### Margem parcial — exemplo da leitura anterior

O exemplo financeiro de 01/11 às 17:30 UTC usa o subtotal conhecido de 9947 centavos e as vendas de 58939 centavos, ambos do mesmo recorte diário salvo. A margem de apresentação é calculada em pontos-base inteiros, com truncamento:

`9947 × 10000 ÷ 58939 = 1687 pontos-base → 16,87%`

Esse valor deve ser rotulado como margem parcial, antes das despesas ainda não declaradas. Ele é derivado exclusivamente da apresentação do subtotal conhecido. Os campos financeiros de estimativa líquida e margem verdadeira continuam nulos enquanto a despesa necessária for desconhecida; o ponto líquido correspondente no gráfico também continua nulo. A correção não cria uma despesa zero, não reutiliza a declaração de outubro e não altera o resultado financeiro persistido.

Esse é um exemplo do recorte anterior para regressão e reprodução, não uma afirmação sobre o valor atual da loja.

### ROAS — leitura Ads de 01/11 às 17:55 UTC

Na leitura agregada salva às 17:55:36 UTC, a fonte Ads estava AVAILABLE, sem diagnóstico de falha, com cobertura de um dia em um dia solicitado. O dia ainda era parcial.

| Campo Ads | Valor observado |
| --- | ---: |
| Gasto | 3129 centavos · R$ 31,29 |
| Vendas atribuídas amplas | 73471 centavos · R$ 734,71 |
| ROAS calculado bruto | `23.480665` |
| Apresentação do índice | 23,48× |
| Observações diárias reais disponíveis | 1 |
| Comparação com outro dia | Ausente |

A projeção local validou essa fonte e os critérios do cartão de ROAS. O gráfico continuou indisponível por exigir duas observações reais; a comparação também permaneceu nula. Não há contradição entre exibir o índice do período disponível e manter o gráfico sem série suficiente.

O fuso da fonte Ads permanece UNCONFIRMED e a atribuição é BROAD. O ROAS pertence ao calendário Ads; suas vendas atribuídas não devem ser tratadas como a mesma coorte dos pedidos da loja nem como prova de lucro ou recebimento bancário.

## Correção preparada

O helper de apresentação passa a fornecer a margem derivada do subtotal que ele próprio validou, conservando sua base parcial e as pendências existentes. O cartão pode mostrar a margem parcial sem alterar os campos financeiros de margem, estimativa líquida ou os dados do gráfico.

A atualização da visão geral deve pintar primeiro os KPIs. A pintura de cada gráfico é isolada para que uma falha acessória não bloqueie os indicadores nem os demais gráficos. O ROAS continua vindo da fonte Ads validada, com suas datas e cobertura; não depende da existência de uma série gráfica ou de um comparativo.

A regressão deve injetar uma exceção de gráfico, verificar que os KPIs já foram atualizados e confirmar que outros gráficos ainda recebem sua atualização. Uma única observação continua insuficiente para construir uma série que exige dois pontos ou inventar seta/comparação com um dia ausente.

O escopo permanece somente no App: apresentação e encadeamento da atualização da interface. Finance, Auth, credenciais, configurações, bindings e semântica dos dados financeiros existentes devem ser preservados. A observação do painel não inicia chamadas extras à Shopee ou ações comerciais.

## Validação a concluir

- Conferir o exemplo parcial 9947/58939 e o truncamento em 1687 pontos-base, com rótulo e base explícitos.
- Preservar margem financeira, estimativa líquida e ponto líquido nulos quando as despesas continuarem desconhecidas.
- Exibir o ROAS válido de uma fonte diária AVAILABLE sem exigir dois dias para o cartão.
- Manter o gráfico e a comparação indisponíveis quando existe somente uma observação; não inserir dados, pontos ou comparações artificiais.
- Injetar falha em um gráfico e conferir a ordem KPIs-primeiro e o isolamento de cada gráfico.
- Validar o Worker gerado normal/minificado e a interface autenticada com dados sintéticos e reprodução de snapshots salvos, em desktop/mobile.
- Executar os checks exigidos e conferir bytes, versões e configurações da Live antes de preencher os campos PENDING deste registro.

## Limites financeiros e de homologação

M2 permanece aberta. Seller Centre e banco continuam NÃO COMPARADOS. Margem parcial e ROAS não comprovam lucro líquido realizado.

Os exemplos numéricos acima vêm de snapshots salvos e da projeção local. O acesso público do executor permanece limitado pelo WAF Cloudflare 403; testes sintéticos autenticados e reprodução local não equivalem à captura de uma exceção ou ao aceite da interface na sessão real do proprietário. Nenhum bypass integra este incremento.
