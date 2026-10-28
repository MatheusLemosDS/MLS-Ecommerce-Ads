# MLS Commerce OS — recuperação da autorização Financeira (28/10/2026)

## Diagnóstico recebido do operador

O painel autenticado confirmou **BUSINESS_PERIOD_AUTH_REQUIRED**, coleta financeira de 28/10 com **0 de 2 janelas**, **0 páginas**, execução automática **ERROR**, publicação preservada até **27/10**. A cadeia visual não é a causa do bloqueio.

## Fonte do erro

`web/finance/src/business-period.mjs` converte para `BUSINESS_PERIOD_AUTH_REQUIRED` somente:
- `FINANCE_BUSINESS_AUTH_REQUIRED`: erro de token estrito `error_token` informado pelo provedor;
- `FINANCE_AUTHORIZATION_REQUIRED`: sem token financeiro armazenado/utilizável;
- `FINANCE_BUSINESS_AUTHORIZATION_EXPIRED`: token expirado durante a leitura.

Não agrupar automaticamente com `API_REJECTED`, `PERMISSION_DENIED`, `INVALID_SOURCE`, `RATE_LIMIT` ou configuração. O status exato dos tokens em produção não pôde ser verificado pelo GitHub.

## Fluxo seguro (ação do titular)

1. Abrir **https://auth.brazacommerce.com.br/shopee/finance/status** na sua sessão usual. Registrar somente `connected`, `status`, `expires_at`; **não enviar cookies, tokens, URLs de callback, partner keys ou códigos**.
2. Se `REAUTH_REQUIRED` ou `DISCONNECTED`, abrir **https://auth.brazacommerce.com.br/shopee/finance/connect**. O Auth gera um nonce/cookie de curta duração e redireciona para a autorização Shopee. Confirmar apenas a loja esperada.
3. Se `CONNECTED`, mas a coleta continuar com `BUSINESS_PERIOD_AUTH_REQUIRED`, examinar a expiração do token e a resposta categorizada nos logs privados do Finance (sem copiar payloads). Reautorização explícita pode ser necessária, mas jamais presumir que a permissão da API foi confirmada por status CONNECTED.
4. Após callback bem-sucedido, conferir status e revisão no endpoint autorizado. No Commerce OS, acompanhar nova execução automática ou usar as ações já previstas no Finance. **Reler resumo salvo não inicia uma nova coleta**. Não contornar a janela de backoff, leasing ou a autorização.
5. Aceite somente após o coletor avançar para ao menos uma página validada, concluir os períodos esperados, publicar um recorte que inclua a data correta e os indicadores aparecerem sem dados inventados.

## Guardrails de desenvolvimento

- Não trocar `FINANCE_TOKEN_ENCRYPTION_KEY`: perderia acesso aos tokens cifrados.
- Não redefinir os bancos `FINANCE_DB`/`ADMIN_DB`, apagar registros, reconfigurar Partner ID, mexer em OAuth state/cookie/callback ou criar scraping.
- Não enviar links de conexão por mensagens externas; apresentar apenas em área owner autenticada quando houver o erro exato.
- Não coletar Finance e Ads por atalhos não autorizados; Ads/PROMO permanece LOCKED.
- Se o endpoint status retornar `CONFIGURATION_PENDING`, verificar no painel Cloudflare os bindings e variáveis do Auth/Finance sem divulgar seus valores. O GitHub não dá acesso a eles.
- Permanecem separados: status da conexão, coleta financeira, publicação mensal validada e lucro realizado.

## Implementação

PR #41 adiciona bloco contextual com as duas rotas existentes, somente sob `BUSINESS_PERIOD_AUTH_REQUIRED`; sem novo endpoint, fetch, cron, migração ou mutação. Exige CI, real Chromium e inspeção autenticada posterior. O objetivo é dar ao operador um caminho de recuperação claro, não simular que o Finance já está conectado.
