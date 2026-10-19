# Validar a leitura financeira pelo painel

A conexão financeira `2049333` já foi confirmada pelo operador como `CONNECTED`.
Esta entrega acrescenta uma validação manual da API Payment, usando a conexão
armazenada no Financeiro. A aceitação real de Payment ainda precisa ser observada
depois da publicação; os testes locais usam respostas simuladas.

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

O resultado contém versão do esquema, horário, revisão do token, campos e tipos
permitidos, quantidade de linhas da amostra e confirmação de identidade. Não
contém números de pedidos, IDs de produtos, compradores, valores monetários,
chaves, tokens, mensagens ou identificadores de requisição da Shopee.

`COMPLETED` não comprova liquidação. `escrow_amount` é repasse previsto;
`original_cost_of_goods_sold` não é o custo de produção da camiseta. A amostra
não calcula lucro, não importa um extrato e não valida a unidade de valores ou
a atribuição dos anúncios.

## Caminho privado e armazenamento

O navegador usa `POST /api/admin/finance/payment-sample`, com sessão
administrativa, Origin exata, CSRF, JSON `{}` de até 128 bytes e nenhuma query.
Não há consulta automática no carregamento, nas abas ou no polling do painel.

O App usa sua credencial interna existente para o Auth. O Auth valida essa
credencial antes de ler o corpo e encaminha somente `{}` e o segredo próprio
do roteador pelo Service Binding. A rota interna
`/internal/shopee/finance/payment-sample` é separada das rotas públicas de OAuth.
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
da API real continua sendo o resultado produzido pelo painel publicado.

Depois de `VALIDATED`, a próxima etapa é confirmar os valores, unidades e regras
de conciliação antes de preparar a importação financeira por período.
