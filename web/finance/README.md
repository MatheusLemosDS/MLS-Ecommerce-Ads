# Conexão financeira Shopee

A publicação atual será pelo Git, incluindo App e Auth existentes. Seguir primeiro [Publicação pelo Git](../../docs/PUBLICACAO_PELO_GIT.md); a entrega manual abaixo permanece como referência.

BrazaCommerce Financeiro foi informada aprovada e ativa em 18/10/2026: Live Partner **2049333**, Seller In House System, loja **1178167501**. Após o release Git `9bc332e`, o operador confirmou [status `CONNECTED`, revisão 1](../../docs/H3_FINANCE_CONNECTED_OBSERVADO.json). Não houve consulta independente por este ambiente. A importação Payment e o lucro ainda não foram verificados.

## Entrega e configuração

Usar [DEPLOY.md](DEPLOY.md) e os arquivos em `docs/finance-connection-delivery`, reunidos em `docs/brazacommerce-conexao-financeira.zip`. O Auth existente recebe somente o roteamento financeiro por Service Binding; o App Worker v11 permanece separado. O Worker financeiro exige `FINANCE_CONNECTION_ENABLED=true`, `SHOPEE_FINANCE_PARTNER_KEY` exclusiva da app financeira, `FINANCE_TOKEN_ENCRYPTION_KEY`, `FINANCE_ROUTER_SECRET` e um D1 novo como `FINANCE_DB`.

Nunca usar ADMIN_DB, credenciais Ads ou Partner de teste. Nenhum segredo real é necessário nos testes locais; valores de produção são inseridos diretamente no Cloudflare.

## Contratos e implementação

A referência pública genérica recebida descreve a assinatura, a troca inicial e a renovação. O [registro de autorização](../../docs/H3_FINANCE_AUTHORIZATION_OBSERVADA.json) complementa a [resposta de refresh e o exemplo inicial](../../docs/H3_FINANCE_REFRESH_RESPONSE_OBSERVADA.json). Os três anexos são idênticos, de 19.505 bytes cada; seus exemplos não são executados nem têm valores de credenciais copiados. O fluxo usa o frontend Global junto da API Auth Global. O operador confirmou depois a conexão real em revisão 1; a renovação automática e a leitura Payment permanecem sem confirmação real.

- `provider-adapter.mjs`: entrada Global `https://open.shopee.com/auth`, com `partner_id`, `auth_type=seller`, `redirect_uri`, `response_type=code` e nonce em `state` externo. O callback permanece fixo e sem query. O link não recebe a Partner Key nem assinatura; a chave continua necessária para a troca de tokens. O retorno precisa preservar o nonce, vinculado ao cookie financeiro independente; o callback recusa sua ausência ou alteração.
- `initial-exchange.mjs`: POST Auth de produção `https://partner.shopeemobile.com/api/v2/auth/token/get`, JSON `shop_id`, `code`, `partner_id`. A origem segue o guia GetAccessToken recebido e acompanha o frontend Global, separadamente do roteamento Payment. Aceita o exemplo inicial sem ecos de identidade; ecos escalares opcionais precisam coincidir. Listas extras não selecionam escopos. O literal `invalid_code`, observado com código fictício, recebe categoria fixa; as causas das falhas anteriores não foram isoladas individualmente.
- `refresh-signature/request/response/transport/coordinator.mjs`: POST Auth de produção `https://partner.shopeemobile.com/api/v2/auth/access_token/get`, somente o shop fixo; valida os ecos numéricos, usa `expire_in` inteiro em segundos e grava atomicamente o par rotacionado. O coordenador interno devolve apenas access token, vencimento e revisão. Ainda não existe importador/agendamento que o invoque em produção.
- `auth-json-transport.mjs`: uma requisição por chamada, transporte injetado, sem retry/redirecionamento, prazo até dez segundos incluindo stream, JSON UTF-8 limitado a 64 KiB e erros fixos sem conteúdo privado.
- `connection-store.mjs`: D1 financeiro privado, AES-256-GCM com identidade/revisão/vencimento autenticados; nonce/cookie independentes com hashes no D1 e validade de dez minutos. Autorização e refresh compartilham lease de sessenta segundos antes do POST, com CAS. Falha incerta/timeout exige nova autorização.
- `auth-router.mjs` e `connection-worker.mjs`: somente connect/callback/status financeiros, perfil fixo e cookie próprio. O roteador não encaminha cookies Ads/admin ou Authorization do cliente; respostas públicas não contêm tokens.

O frontend, a troca inicial e a renovação usam o par Global de autenticação,
separadamente do roteamento Payment brasileiro. A troca inicial foi informada
como concluída pelo operador; a renovação real ainda não foi confirmada. A página de falha
mostra somente códigos de diagnóstico de uma lista fechada; erros ou mensagens
arbitrários da Shopee não são enviados ao navegador.

`connection-worker.mjs` isolado continua sem adaptador por padrão. `production-worker.mjs` é a entrada com adaptador oficial e ativação explícita. `candidate/` permanece uma base de teste sem adaptador; a entrega publicável é gerada separadamente por `build_finance_live_delivery.py`.

## Validação reproduzível

```bash
cd /workspace/MLS-Ecommerce-Ads
node --test web/finance/tests/*.test.mjs
python3 -B tools/build_finance_live_delivery.py
node /workspace/.braza-worker-validation/finance-connection-probe.mjs
node /workspace/.braza-worker-validation/finance-refresh-probe.mjs
node /workspace/.braza-worker-validation/finance-live-probe.mjs
```

**126 testes Node passaram**: isolamento, nonce, replay, concorrência, cifragem, assinatura com vetores independentes, requests, respostas, streams, prazos e adaptador oficial. **43 cenários reais Miniflare/workerd passaram** em três harnesses: 15 da base, 19 de refresh/troca inicial e 9 dos Workers finais gerados com Auth → Service Binding → Finance → D1. Todas as chamadas foram interceptadas por fixtures; zero rede de produção. Houve 7, 15 e 3 chamadas de provedor locais, respectivamente.

Miniflare4.20260730.0/workerd1.20261014.1 e dependências já fixadas em `/workspace/.braza-worker-validation`. Os processos encerram no final. Resultados seguros e hashes estão nos arquivos `finance-connection-results.json`, `finance-refresh-results.json` e `finance-live-results.json`, fora do checkout. Essa validação não comprova autorização real nem acesso Payment. H1/H2/MCP/Hermes, custos v11 e Ads/PROMO LOCKED continuam preservados.
