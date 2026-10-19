# Correção da entrada de autorização financeira

Registro de 18/10/2026, horário de Brasília. Aplicação **BrazaCommerce
Financeiro**, Live Partner ID **2049333**, loja **1178167501**.

## Conexão real confirmada pelo operador

Após o release `9bc332e` e a nova autorização pelo fluxo Global, o operador
enviou o [status da conexão](H3_FINANCE_CONNECTED_OBSERVADO.json):
`connected=true`, `status=CONNECTED`, revisão **1**, Partner **2049333** e loja
**1178167501**. O retorno inclui vencimento `1792392320`, sem códigos de
autorização ou tokens. É uma confirmação fornecida pelo operador, não uma
consulta independente realizada por este ambiente.

Esse resultado confirma a conexão financeira após o alinhamento Global e a
configuração da chave. Não isola retrospectivamente uma única causa para todas
as falhas anteriores nem comprova acesso Payment, valores financeiros ou lucro.
A importação financeira e o agendamento de renovação continuam como etapas
posteriores. Os registros de espera e falha abaixo descrevem a investigação
antes dessa confirmação.

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

O Financeiro passa a abrir `https://open.shopee.com/auth` com estes parâmetros:

| Parâmetro | Valor |
| --- | --- |
| `partner_id` | `2049333` |
| `auth_type` | `seller` |
| `redirect_uri` | `https://auth.brazacommerce.com.br/shopee/finance/callback` |
| `response_type` | `code` |
| `state` | Nonce aleatório de uso único, vinculado ao cookie do navegador |

O link de navegador usa o fluxo web; os POSTs de troca e renovação usam
HMAC-SHA256 e a chave privada no servidor Auth de produção documentado
`https://partner.shopeemobile.com`. O frontend e os POSTs usam o par Global de
autenticação; o roteamento da API Payment permanece independente. O callback
continua exigindo estado, cookie, validade, uso único e a loja
esperada antes de trocar o código. Não há relaxamento de validação nem importação
de tokens Ads.

Após a primeira correção, o operador chegou ao callback e observou
`REAUTH_REQUIRED`, revisão zero. A tentativa seguinte alinhou os POSTs ao
servidor brasileiro com base no SDK comunitário; essa escolha foi substituída
pelo servidor Auth Global após a comparação controlada descrita abaixo.
O estado observado não determina sozinho a causa exata da falha anterior.
A resposta de erro do callback mostra apenas um código de diagnóstico de uma lista
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

## Comparação controlada dos servidores Auth

O operador executou no terminal da DigitalOcean duas requisições por servidor,
usando a mesma chave Live informada, IDs financeiros fixos e um código público
deliberadamente inválido de 32 zeros. Cada par compara o HMAC calculado pela
regra documentada com o mesmo HMAC contendo um caractere hexadecimal alterado.
Não há código real de autorização, repetição automática ou redirecionamento.
A saída contém somente status HTTP, categorias fixas e indicadores de texto;
nenhuma chave, assinatura, mensagem ou token foi exportado.

| Servidor Auth | Assinatura calculada | Controle alterado |
| --- | --- | --- |
| `openplatform.shopee.com.br` | HTTP403 / `ASSINATURA_REJEITADA` | HTTP403 / `ASSINATURA_REJEITADA` |
| `partner.shopeemobile.com` | HTTP403 / `OUTRO_ERRO_JSON` | HTTP403 / `ASSINATURA_REJEITADA` |

O erro JSON diferente no servidor Global não teve seu código bruto divulgado.
Portanto, não foi identificado como um erro específico de código inválido nem
comprova obtenção de tokens. A diferença entre candidato e controle sustenta
usar a origem Auth Global explicitamente indicada nos exemplos oficiais
GetAccessToken e RefreshAccessToken recebidos. Os dois POSTs passam a ter essa
origem fixa, sem alternar servidores nem repetir um código real após falha.
Nessa etapa, o navegador ainda continuava no frontend brasileiro. A nova
autorização real e o estado `CONNECTED` continuavam pendentes.

Depois de confirmar o deploy ativo da correção Global, o operador recebeu
novamente rejeição de assinatura. Após a orientação para regravar somente a
chave Live financeira no Secret do Worker financeiro, o retorno real mudou
para `FINANCE_INITIAL_EXCHANGE_HTTP_403_JSON_UNRECOGNIZED`; o estado continuou
`REAUTH_REQUIRED`, revisão zero. Essa categoria também cobre um campo `error`
ausente ou não textual e não comprova sozinha que a assinatura foi aceita.

Uma consulta posterior no terminal, ainda com o código fictício de 32 zeros,
retornou o nome `invalid_code` no Auth Global. Essa rejeição é esperada para o
código fictício e não identifica automaticamente o erro do callback real.
O diagnóstico passa a reconhecer somente esse literal exato como
`FINANCE_INITIAL_EXCHANGE_HTTP_403_JSON_CODE_REJECTED` (ou
`FINANCE_INITIAL_EXCHANGE_API_CODE_REJECTED` para JSON HTTP200). Outros erros
desconhecidos continuam privados. A revisão do callback confirmou que o código
é decodificado uma vez e encaminhado diretamente ao JSON, com nonce e lease
impedindo nova troca da mesma tentativa. A nova categoria permite conferir a
próxima autorização real sem divulgar o código, mensagens ou tokens.

## Alinhamento do frontend Global

O operador confirmou posteriormente que o link público de verificação em
`https://open.shopee.com/auth`, com a aplicação 2049333 e seu callback financeiro,
abriu a tela de autorização ou login. Não foi solicitada a conclusão da
autorização nesse link, que não contém o nonce gerado pelo painel.

O SDK comunitário consultado associa o frontend `open.shopee.com/auth` à API
`partner.shopeemobile.com/api/v2` no perfil Global e associa os dois endereços
brasileiros no perfil Brasil. O Financeiro passa a usar o par Global observado:
frontend Global e POSTs Auth Global. Isso elimina a combinação anterior entre
frontend brasileiro e API Global; não comprova, por si, que essa combinação
causava o erro real nem que um código válido já tenha sido trocado.

O contrato continua com os mesmos cinco parâmetros, callback fixo, `state`
externo, cookie independente, validade e uso único. O guard do Financeiro fixa
o destino Global e recusa a origem brasileira para novas tentativas. O Auth
adiciona somente o hostname exato `open.shopee.com` à lista de destinos seguros,
mantendo as validações HTTPS, credenciais, porta, fragmento e cookie. É preciso
aguardar os deploys de Auth e Finance e iniciar uma nova tentativa por
`/shopee/finance/connect`. A tela pública de verificação não substitui essa rota.

## Comparação com a conexão Ads existente

O fluxo Ads do Auth existente já abre `https://open.shopee.com.br/auth` com os mesmos cinco
nomes de parâmetros. Seu callback valida cookie e `state` e envia código e
identidade ao gateway DigitalOcean em `/api/shopee/token`. O Financeiro usa o
mesmo formato de entrada e retorno, com callback, nonce e identidade próprios,
e faz o POST assinado no Worker privado.

Os registros sanitizados do gateway mostram um helper público assinado, mas
não registram o servidor da última troca Ads bem-sucedida nem o corpo completo
do assinador. Não se afirma igualdade byte a byte nem se copia a configuração
nativa como prova de uma chamada passada. A aplicação Ads 2047569, sua chave e
seus tokens permanecem separados da aplicação financeira 2049333.

## Fontes e limites

- O [registro histórico do guia genérico recebido](H3_FINANCE_AUTHORIZATION_OBSERVADA.json)
  descreve a referência usada antes da correção; ele não foi reescrito como se
  já documentasse o fluxo web.
- A implementação existente de Ads gera o mesmo formato de link web, com seu
  próprio ID e callback. A correção financeira preserva essa integração.
- A versão **2.10.0** do [SDK comunitário Shopee](https://www.npmjs.com/package/@congminh1254/shopee-sdk/v/2.10.0)
  também gera esses cinco parâmetros em `getAuthorizationUrl`. Associa
  `open.shopee.com/auth` a `partner.shopeemobile.com/api/v2` no perfil Global e
  os dois endereços brasileiros no perfil Brasil. O pacote foi consultado sem executar
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

1. Aguardar o deploy do commit da correção nos Workers `brazacommerce-auth` e
   `brazacommerce-finance`.
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
