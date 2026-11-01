# Margem parcial e ROAS — indicadores independentes dos gráficos

## Estado da entrega

Correção publicada somente no App oficial, sobre a base PR95 `8acf6b9`, na branch `fix/daily-margin-roas-presentation-20261101`. Fontes, reprodução, testes e publicação estão separados abaixo; despesas de novembro continuam uma entrada do proprietário ainda não declarada.

| Evidência da entrega | Estado |
| --- | --- |
| PR | [#96](https://github.com/MatheusLemosDS/MLS-Ecommerce-Ads/pull/96) |
| Commit do código | `b1a0883f9b41b230217f1b2b0f0ad70b43c6335e` |
| CI e contagem de testes | [41334582368](https://github.com/MatheusLemosDS/MLS-Ecommerce-Ads/actions/runs/41334582368); 3015 Node / 67 Python, sem falhas ou skips |
| Versão publicada do App | `27356953-886a-4b1f-95b9-abf3c7c724f7` |
| SHA-256 do App gerado | `8cbbf7c123c4ac2a3dd128198d90cc3ad9d04e1a53a66719419ac1d60c27e7a6` |
| SHA-256 dos bytes publicados | `a38b5bd2988149118fbb0059f645093483d75244aee20804103f26f72c8413df` |
| Conferência pós-publicação | Três Workers exatos; configurações, domínios, flags e cron preservados |

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

## Correção publicada

O helper de apresentação passa a fornecer a margem derivada do subtotal que ele próprio validou, conservando sua base parcial e as pendências existentes. O cartão mostra a margem parcial sem alterar os campos financeiros de margem, estimativa líquida ou os dados do gráfico.

A atualização da visão geral pinta primeiro os KPIs. A pintura de cada gráfico é isolada para que uma falha acessória não bloqueie os indicadores nem os demais gráficos. O ROAS continua vindo da fonte Ads validada, com suas datas e cobertura; não depende da existência de uma série gráfica ou de um comparativo.

A regressão injeta uma exceção de gráfico e confirma que os KPIs já foram atualizados e os outros painéis continuam recebendo sua atualização. Uma única observação continua insuficiente para construir uma série que exige dois pontos ou inventar seta/comparação com um dia ausente.

O escopo permanece somente no App: apresentação e encadeamento da atualização da interface. Finance, Auth, credenciais, configurações, bindings e semântica dos dados financeiros existentes devem ser preservados. A observação do painel não inicia chamadas extras à Shopee ou ações comerciais.

## Validação concluída

- Margem de apresentação conferida em 1687 pontos-base, rótulo parcial e base explícita; finanças e ponto líquido permanecem nulos.
- Vendas ausentes, zero, negativas/inválidas, divergência de cálculo e overflow cobertos sem fabricar percentual.
- ROAS válido de um dia exibido; curva e comparação continuam sem dados suficientes, sem pontos inventados.
- Fonte Ads rejeitada após válida limpa a razão anterior. Falha em um gráfico preserva indicadores e outros painéis, com ERROR visível, tabela e escopo antigos removidos.
- Worker normal/minificado e Chromium320/1365 passaram; fluxo de confirmação explícita atualiza a margem completa pelo GET salvo, sem consultas aos provedores.
- Suíte completa local e CI passaram, sem skips; bytes, versões e configuração dos três Workers conferidos após publicação.

## Limites financeiros e de homologação

M2 permanece aberta. Seller Centre e banco continuam NÃO COMPARADOS. Margem parcial e ROAS não comprovam lucro líquido realizado.

Os exemplos numéricos acima vêm de snapshots salvos e da projeção local. O acesso público do executor permanece limitado pelo WAF Cloudflare 403; testes sintéticos autenticados e reprodução local não equivalem à captura de uma exceção ou ao aceite da interface na sessão real do proprietário. Nenhum bypass integra este incremento.

## Evidências e limites do replay

O replay autenticado local da leitura real435 exibiu R$99,47, margem parcial16,87% e ROAS20,72x em320/1365. Após falha injetada no primeiro gráfico, os indicadores permaneceram corretos, o painel marcou ERROR e não houve erro global, GETextra ou POST. O snapshot ficou inalterado. As 42 leituras locais de outros painéis sem fixture responderam503; esse resultado pertence ao harness, não à Live. A evidência cobre os indicadores e o caminho até despesas, não a homologação global de todos os painéis.

Checks externos Workers Builds continuam em falha, com causa não confirmada; o histórico de acesso aos logs é403/12004. A publicação controlada foi validada separadamente por bytes, versões e configuração.
