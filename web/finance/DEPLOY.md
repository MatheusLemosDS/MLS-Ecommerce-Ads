# Publicação da conexão financeira

Entrega para **BrazaCommerce Financeiro / Live Partner 2049333 / loja 1178167501**.
Conecta a loja e guarda o par de tokens cifrado. A importação de taxas/recebíveis
e o cálculo de lucro ainda não fazem parte desta entrega. Nada foi publicado
pelo assistente. Ads 2047569 e o App v11 não precisam de alteração.

## Arquivos

- `finance-worker.mjs`: Worker privado novo, nome sugerido `brazacommerce-finance`.
- `auth-worker.mjs`: Auth v9 existente com encaminhamento somente de
  `/shopee/finance/connect`, `/callback` e `/status` ao Worker financeiro.
- `manifest.json`: hashes e identidade da entrega.

O Auth foi gerado a partir do v9 SHA256
`45d0142709c5087e373cc4da146070ed39c472805f6f64c00f00b6555f0e1f56`.
Se o Auth publicado tiver recebido outras alterações, incorporar a pequena
interceptação financeira nessa versão antes de substituí-lo. Guardar uma cópia
da versão publicada para recuperação. Não substituir o App Worker por estes arquivos.

## Configurar o Worker financeiro novo no Cloudflare

1. Criar um **banco D1 novo e exclusivo**. Vinculá-lo somente ao Worker financeiro
   com o nome `FINANCE_DB`. Não usar `ADMIN_DB` ou bancos Ads.
2. Criar estes **Secrets**, diretamente no painel Cloudflare:
   - `SHOPEE_FINANCE_PARTNER_KEY`: **Live API Partner Key da app 2049333**.
   - `FINANCE_TOKEN_ENCRYPTION_KEY`: 32 bytes aleatórios codificados em base64.
   - `FINANCE_ROUTER_SECRET`: segredo aleatório exclusivo de pelo menos 32 caracteres.
3. Criar a variável de texto `FINANCE_CONNECTION_ENABLED` com valor `true`.
4. Publicar `finance-worker.mjs`. Desativar o domínio público workers.dev/preview
   deste Worker; a comunicação usa Service Binding. Não associar domínio público.

Para gerar os dois segredos aleatórios no próprio terminal, executar separadamente
`openssl rand -base64 32` duas vezes e inserir cada resultado diretamente nos
campos correspondentes. Não enviar resultados no chat. Guardar a chave de
cifragem: trocá-la torna os tokens existentes ilegíveis.

As tabelas privadas são criadas idempotentemente pelo Worker. Não há migração
do banco Ads, cópia de tokens antigos ou necessidade de configurar IDs variáveis.

## Configurar o Auth existente

1. Adicionar Service Binding com nome `SHOPEE_FINANCE_SERVICE`, apontando para
   `brazacommerce-finance` (ou o nome escolhido para o novo Worker).
2. Adicionar Secret `FINANCE_ROUTER_SECRET` com **o mesmo valor** usado no Worker
   financeiro. Preservar todos os bindings e secrets existentes do Auth.
3. Publicar o arquivo `auth-worker.mjs` desta entrega após conferir a versão base.

Na Shopee, o **Live Redirect URL Domain** da app financeira deve estar configurado
como `https://auth.brazacommerce.com.br`. O callback é
`https://auth.brazacommerce.com.br/shopee/finance/callback`.

## Autorizar e verificar

Abrir no navegador do titular da loja:
`https://auth.brazacommerce.com.br/shopee/finance/connect`.

O destino deve ser a autorização brasileira `https://open.shopee.com.br/auth`,
cuja tela foi aberta para a aplicação financeira pelo operador. O link contém
somente `partner_id=2049333`, `auth_type=seller`, `redirect_uri` com o callback
financeiro sem query, `response_type=code` e `state` com o nonce independente.
Esse link de navegador não recebe a Partner Key, `timestamp` ou `sign`.
Autorizar apenas a loja 1178167501 na aplicação financeira.

O retorno precisa trazer o mesmo `state`, além de `code` e `shop_id`. A conclusão
desse retorno ainda **não foi verificada na Shopee real**. Se faltar ou mudar o
nonce, o callback recusa a tentativa sem solicitar tokens; coletar
somente a forma dos nomes de parâmetros retornados, sem compartilhar a URL com
o código de autorização. Não remover a validação de nonce/cookie para contornar.

A troca e a renovação dos tokens usam a base Auth de produção documentada
`https://partner.shopeemobile.com`, com HMAC-SHA256 e a chave financeira.
A origem Auth é independente do frontend `open.shopee.com.br/auth` e da API
Payment brasileira. Não repetir um código real em outro servidor após falha.
A confirmação da tela brasileira não valida esses pedidos de API nem comprova
obtenção de tokens. Se o callback falhar, enviar somente o código de diagnóstico
escrito na página, sem compartilhar o endereço ou o código de autorização.

O callback bem-sucedido mostra “Conexão financeira concluída” e apaga o cookie
temporário. Consultar `/shopee/finance/status`: deve indicar `CONNECTED`,
Partner2049333 e shop1178167501, sem tokens. Após falha incerta/timeout no POST,
o estado passa a `REAUTH_REQUIRED`; iniciar nova autorização. Não repetir o mesmo
código ou refresh token manualmente. Erros da Shopee não são exibidos em texto
bruto e os pedidos de tokens não devem ser registrados em logs.

Depois de confirmar a conexão real, a próxima etapa é ligar a leitura Payment
ao armazenamento financeiro, conferir uma amostra e reconciliar taxas por pedido.
As primitivas privadas de renovação já são testadas, mas ainda não estão ligadas
a um importador nem a um agendamento.

## Recuperação

Para interromper novas autorizações, definir `FINANCE_CONNECTION_ENABLED=false`.
Se necessário, restaurar a cópia anterior do Auth e retirar seu Service Binding
financeiro. Preservar o D1 privado e os segredos para diagnóstico; não apagar os
dados nem alterar a autorização Ads como parte dessa recuperação.
