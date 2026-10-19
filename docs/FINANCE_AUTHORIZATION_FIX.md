# Correção da entrada de autorização financeira

Registro de 18/10/2026, horário de Brasília. Aplicação **BrazaCommerce
Financeiro**, Live Partner ID **2049333**, loja **1178167501**.

## Problema observado

A implementação anterior enviava o navegador para
`https://partner.shopeemobile.com/api/v2/shop/auth_partner`, seguindo o exemplo
genérico V2 de Authorization and Authentication recebido do operador. O endpoint
retornou `error_sign` / `Wrong sign`. Uma comparação local, sem exportar a chave
ou o link, confirmou ID 2049333, idade de 9 segundos, HMAC-SHA256 completo de
64 caracteres e assinatura igual à calculada com a chave informada. Alterar
somente o host para `openplatform.shopee.com.br` também retornou `Wrong sign`.

Em outro teste, o operador confirmou que o endereço web
`https://open.shopee.com.br/auth`, com a mesma aplicação financeira, abriu a tela
de autorização. Esse é o mesmo formato usado pela integração Ads existente.
O teste parou antes de confirmar a autorização; não validou a troca de tokens.

## Correção

O Financeiro passa a abrir `https://open.shopee.com.br/auth` com estes parâmetros:

| Parâmetro | Valor |
| --- | --- |
| `partner_id` | `2049333` |
| `auth_type` | `seller` |
| `redirect_uri` | `https://auth.brazacommerce.com.br/shopee/finance/callback` |
| `response_type` | `code` |
| `state` | Nonce aleatório de uso único, vinculado ao cookie do navegador |

O link de navegador usa o fluxo web; os POSTs de troca e renovação usam
HMAC-SHA256 e a chave privada no servidor regional
`https://openplatform.shopee.com.br`, correspondente ao perfil Brasil. O callback
continua exigindo estado, cookie, validade, uso único e a loja
esperada antes de trocar o código. Não há relaxamento de validação nem importação
de tokens Ads.

Após a primeira correção, o operador chegou ao callback e observou
`REAUTH_REQUIRED`, revisão zero. O código de troca e renovação ainda apontava
para o servidor Global. Essa inconsistência regional foi corrigida; o estado
observado não determina sozinho a causa exata da falha anterior. A resposta de
erro do callback agora mostra apenas um código de diagnóstico de uma lista
fechada, para distinguir assinatura, permissão, parâmetros, HTTP, resposta e
persistência sem expor o conteúdo recebido da Shopee.

O operador confirmou depois `FINANCE_INITIAL_EXCHANGE_HTTP_403` na troca
regional. O transporte descartava o corpo de todas as respostas não-200 e,
assim, ocultava se o erro era JSON da API ou uma resposta HTML. Agora somente
o HTTP403 sem redirecionamento pode ter o JSON lido com os mesmos limites de
64 KiB, UTF-8 e prazo do transporte. A leitura produz apenas categorias de uma
lista fechada. Uma resposta 403 nunca é normalizada como sucesso ou salva como
tokens, mesmo que contenha campos de sucesso. HTML e outros formatos são
descartados sem leitura. Mensagens, identificadores de requisição, chaves e
tokens não são exibidos. O número HTTP403 sozinho não comprova restrição de IP;
o operador não encontrou campo de whitelist no cadastro financeiro.

## Fontes e limites

- O [registro histórico do guia genérico recebido](H3_FINANCE_AUTHORIZATION_OBSERVADA.json)
  descreve a referência usada antes da correção; ele não foi reescrito como se
  já documentasse o fluxo web.
- A implementação existente de Ads gera o mesmo formato de link web, com seu
  próprio ID e callback. A correção financeira preserva essa integração.
- A versão **2.10.0** do [SDK comunitário Shopee](https://www.npmjs.com/package/@congminh1254/shopee-sdk/v/2.10.0)
  também gera esses cinco parâmetros em `getAuthorizationUrl`, usa
  `open.shopee.com.br/auth` para Brasil e constrói a troca inicial/renovação
  sobre a base regional `openplatform.shopee.com.br/api/v2`. O pacote foi consultado sem executar
  código e sua integridade SHA512 foi verificada. É uma fonte independente,
  não documentação oficial da Shopee.
- O operador forneceu o guia oficial **BR SPI App Creation User Guide**,
  atualizado em 26/08/2026. Ele trata de aplicações SPI de logística, Swarm ERP,
  Brand Membership e instalação de autopeças; não estabelece o contrato de
  autorização da categoria Seller In House System.
- A consulta direta a páginas oficiais por este ambiente recebeu HTTP403 do
  proxy. Portanto, esta correção se apoia na observação do operador e nas
  implementações verificadas, sem alegar consulta independente bem-sucedida ao
  portal oficial.

## Verificação após a publicação pelo Git

1. Aguardar o deploy do commit da correção no Worker `brazacommerce-finance`.
2. Abrir novamente `https://auth.brazacommerce.com.br/shopee/finance/connect`.
3. Confirmar a aplicação financeira e autorizar somente a loja 1178167501.
4. Verificar a mensagem de conclusão e consultar `/shopee/finance/status`.
   O resultado esperado é `CONNECTED` com os IDs financeiros corretos.
5. Se falhar, copiar somente o código de diagnóstico escrito na página.
   Iniciar outra tentativa por `/connect`; não repetir o callback antigo.

Abrir a tela de autorização comprova apenas a entrada do fluxo. O retorno
real de `state`, a troca do código e o armazenamento dos tokens precisam ser
confirmados nessa execução. Nenhuma chave, token, assinatura ou URL privada
deve ser enviada no chat ou adicionada ao Git.
