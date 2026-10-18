# Configuração revisada do Auth

A captura original do Worker publicado está preservada no commit
`65dc7fd04a3d50627486598daccb9e4f9625bf49`, nos arquivos
`workers/auth/wrangler.json` e `workers/auth/migration.json`.

Antes da ativação do OAuth financeiro, a configuração esperada para a próxima
publicação altera intencionalmente apenas
`observability.redact_query_string` de `false` para `true`. Assim, os logs de
invocação não devem persistir os parâmetros da URL, que podem incluir o código
de autorização e o nonce do retorno. Os demais controles de observabilidade
e os vínculos do Worker são mantidos.

O campo `captured_config` de `migration.json` e seu `config_sha256` representam
essa configuração final revisada para a verificação existente de publicação.
O estado original permanece auditável no commit acima; os campos
`source_sha256` e `recognized_source_sha256` mantêm a evidência original do
código publicado sem alterações. Esta revisão de arquivos não publica o Worker.
