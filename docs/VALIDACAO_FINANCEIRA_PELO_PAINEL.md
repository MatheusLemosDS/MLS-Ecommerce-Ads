# Validar a leitura financeira pelo painel

A conexão financeira `2049333` já foi confirmada pelo operador como `CONNECTED`.
Esta entrega acrescenta uma validação manual da API Payment, usando a conexão
armazenada no Financeiro. Em 19/10/2026, o operador forneceu o
[JSON seguro da amostra real](FINANCE_PAYMENT_SAMPLE_OBSERVADO.json): `VALIDATED`,
revisão 2, uma linha e identidade correspondente. Os oito campos financeiros
foram observados como números. A confirmação é do operador; os testes locais
continuam usando respostas simuladas.

No painel administrativo, abrir **Custos e margens → Validação financeira** e
clicar em **Validar leitura financeira**. Em **Resultado da validação**, o botão
**Copiar resultado** copia apenas metadados seguros para diagnóstico.

## Consulta e resultados

Uma ação pode renovar o token uma vez pelo coordenador existente e executar até
três GETs no host fixo `https://partner.shopeemobile.com`:

1. `order/get_order_list`: um pedido `COMPLETED`, criado nos últimos sete dias
   de calendário de São Paulo, página de tamanho 1 e cursor vazio.
2. `order/get_order_detail`: identidade exata do pedido, status `COMPLETED` e
   moeda `BRL` precisam ser confirmados.
3. `payment/get_escrow_detail`: a identidade retornada precisa corresponder ao
   mesmo pedido. Todas as identidades de pedido presentes são conferidas.

As chamadas Shop usam HMAC-SHA256 sobre
`partner_id + path + timestamp + access_token + shop_id`, sem separadores, com a
chave textual UTF-8 do aplicativo financeiro. Não há paginação, repetição de
requisições, troca automática de host nem renovação forçada após uma recusa.

| Status | Significado |
| --- | --- |
| `VALIDATED` | Uma amostra passou nas verificações; nomes e tipos dos campos permitidos foram observados. |
| `EMPTY` | Não havia pedido concluído na pequena seleção; Payment não foi chamado. |
| `UNAVAILABLE` | A etapa falhou; somente um código de diagnóstico permitido e eventual HTTP são expostos. |

O resultado da **validação de esquema** contém versão do esquema, horário, revisão do token, campos e tipos
permitidos, quantidade de linhas da amostra e confirmação de identidade. Não
contém números de pedidos, IDs de produtos, compradores, valores monetários,
chaves, tokens, mensagens ou identificadores de requisição da Shopee.

`COMPLETED` não comprova liquidação. `escrow_amount` é repasse previsto;
`original_cost_of_goods_sold` não é o custo de produção da camiseta. A amostra
não calcula lucro, não importa um extrato e não valida a unidade de valores ou
a atribuição dos anúncios. A revisão 2, isoladamente, não comprova como ocorreu
a renovação do par de tokens.

## Conferência privada dos valores

Em **Custos e margens → Conferência dos valores**, clicar em **Conferir valores
da amostra**. Essa ação consulta um pedido selecionado novamente, seguindo os
mesmos limites de três GETs e uma renovação coordenada quando necessária. O
pedido pode ser diferente do consultado anteriormente. Não há consulta
automática, importação por período ou persistência dos valores.

A prévia mostra a referência do pedido somente ao administrador autenticado,
para localizar o mesmo pedido na Shopee, e os oito valores financeiros
permitidos. Não mostra compradores, nomes de produtos, IDs de itens, credenciais
ou mensagens da API. A cópia de **Resultado da validação** continua contendo
somente o esquema, sem números de pedidos ou valores monetários. A prévia
privada não possui botão de cópia de valores.

A moeda `BRL` foi conferida no detalhe do pedido. A escala dos valores permanece
`UNCONFIRMED`: os números são apresentados sem símbolo `R$`, divisão por 100,
arredondamento, somas ou cálculo de lucro. Zero e negativos são preservados;
ausência e nulo aparecem como **Não informado**, sem virar zero. Tipos inválidos
ou números não finitos são recusados.

Os campos `original_price` e `selling_price` são rotulados como **subtotais da
linha**, conforme a documentação pública observada. Eles não são multiplicados
novamente pela quantidade. `is_kit` não confirma composição física ou tamanhos;
os vínculos de produtos permanecem independentes.

O pedido e os valores passam por uma projeção estrita compartilhada entre os
três Workers, com até 100 linhas, cada uma contendo somente quantidade,
subtotal original, subtotal de venda e o indicador de kit. Todos os demais
campos de uma resposta de prévia invalidam o contrato, em vez de serem enviados
ao navegador. Respostas de erro não carregam pedido ou valores.

## Caminho privado e armazenamento

O navegador usa `POST /api/admin/finance/payment-sample` para o esquema e
`POST /api/admin/finance/payment-preview` para a conferência privada, com sessão
administrativa, Origin exata, CSRF, JSON `{}` de até 128 bytes e nenhuma query.
Não há consulta automática no carregamento, nas abas ou no polling do painel.

O App usa sua credencial interna existente para o Auth. O Auth valida essa
credencial antes de ler o corpo e encaminha somente `{}` e o segredo próprio
do roteador pelo Service Binding. A rota interna
`/internal/shopee/finance/payment-sample` e a nova rota privada
`/internal/shopee/finance/payment-preview` são separadas das rotas públicas de OAuth.
Cookies e credenciais recebidas não são encaminhados ao Financeiro ou à Shopee.

O Financeiro exige o roteador confiável, a ativação existente e o transporte de
produção injetado. App, Auth e Financeiro validam a projeção de saída. Redirects
são recusados; respostas JSON têm limite de 64 KiB e prazos definidos. Até uma
renovação e três consultas podem ocupar 40 segundos; App e Auth limitam o
encaminhamento a 45 segundos. Falhas HTTP 403 reconhecidas mantêm categorias
fechadas de assinatura, autorização ou permissão, sem copiar a mensagem.

Só o coordenador existente pode renovar e substituir o par cifrado no D1
financeiro. Não são criadas tabelas para a amostra, nem guardados pedidos ou
valores financeiros. Uma falha de Payment não invalida a conexão. Falhas
incertas de renovação seguem a quarentena já existente para impedir reutilizar
um refresh token de uso único.

## Publicação e verificação

Publicar os três Workers pelo fluxo Git já configurado: `build:app/deploy:app`,
`build:auth/deploy:auth` e `build:finance/deploy:finance`, branch `main`, raiz `/`.
Não há nova variável, chave, binding ou banco para cadastrar. Aguardar o commit
ficar ativo nos três antes de clicar no botão.

Os testes verificam assinatura independente, rotação única, respostas vazias,
identidades, status/moeda, recusas de permissão, limites, cancelamento de streams,
ausência de repetição, guards administrativos e remoção de dados privados.
As validações compiladas usam workerd/D1 e provedores simulados. A confirmação
da prévia real dos valores continua dependendo da conferência no painel
publicado. A aceitação da consulta de esquema já foi confirmada pelo operador.

Depois da conferência dos números com o mesmo pedido na Shopee, registrar a
evidência de unidade e escala e confirmar as regras de conciliação antes de
preparar a importação financeira por período.
