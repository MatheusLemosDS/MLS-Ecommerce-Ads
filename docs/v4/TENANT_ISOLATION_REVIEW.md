# Revisão local do isolamento comercial V4.1

Revisão restrita ao candidato em `/workspace/mls-commerce-os-v4`. Todos os dados usados são sintéticos. Nenhuma consulta à Cloudflare, banco de produção, provedor, sessão real ou envio de mensagem foi executado por esta revisão. Este registro não comprova publicação nem validação live.

O inventário fechado está em [TENANT_STORAGE_INVENTORY.json](TENANT_STORAGE_INVENTORY.json), com os caminhos de origem de cada objeto. O módulo de runtime `web/cloudflare/src/tenant-schema-manifest.mjs` contém 121 tabelas App, 38 tabelas Finance e 195 objetos ao todo: 159 tabelas, 14 índices e 22 triggers. Os 16 triggers imutáveis de caixa externo, gerados dinamicamente pelo módulo original, estão enumerados. Tabelas de conta/identidade permanecem fora desse inventário. O manifesto ocupa 6.711 bytes RAW.

O armazenamento comercial usa tabelas físicas por empresa e loja no binding comercial `ACCOUNT_DB`. `ADMIN_DB` e a identidade estática `FINANCE_PROFILE` pertencem ao acesso legado. A resolução de empresa/loja/membro/capacidade deve ocorrer no servidor antes da entrega do adapter; nomes ou headers enviados pelo navegador não constituem autorização. O adapter SQL não torna válida a identidade estática de um conector de outra loja.

## Evidência executada

`node --test --test-reporter=tap web/cloudflare/tests/tenant-sql-isolation.test.mjs`: **9/9 aprovados**, sem skips. A suíte usa SQLite real por meio de `node:sqlite` e o adapter D1 existente; não simula os resultados SQL.

- Todos os 195 objetos são criados em duas empresas no mesmo banco físico. O catálogo lógico retorna apenas os objetos da empresa, com nomes e SQL canônico iguais às definições originais. Isso inclui tabelas, índices, triggers, `LIKE`, parâmetros e consultas sem filtro explícito de nome em `sqlite_master`.
- Empresas A/B usam os mesmos identificadores de loja, mês, singleton, revisão e requisição, mantendo valores distintos. Joins, referências qualificadas a colunas, nomes de tabelas entre aspas e CTEs locais continuam válidos.
- Strings de domínio e parâmetros permanecem iguais mesmo em uma consulta que combina fatos e guardas de existência do schema.
- Os mutadores originais de fabricação e recebimento persistem dados separados. Um vínculo usando pais de outra empresa é recusado; triggers de origem protegem a empresa que contém o vínculo sem bloquear o registro de mesmo ID da outra empresa.
- O mutador original de caixa importa o mesmo documento, identificador externo e request ID em A/B, preservando valores e recibos idempotentes independentes. Os 16 triggers imutáveis continuam ativos.
- Batches com statements de outra empresa ou preparados no binding bruto são recusados antes de qualquer gravação. A revogação verificada pelo guarda de escrita impede alterações posteriores.
- SQL hostil com tabelas de identidade, nomes físicos, tabelas desconhecidas, nomes com aspas simples, joins por vírgula, qualificação de schema, CTE de outro escopo, `PRAGMA`, `ATTACH`, `ANALYZE`, `REINDEX` ou alvos de índice/trigger fora do domínio é recusado.

`node --test --test-reporter=tap web/cloudflare/tests/incurred-production.test.mjs web/cloudflare/tests/physical-returns.test.mjs web/cloudflare/tests/return-manufacturing-links.test.mjs web/finance/tests/external-cash-store.test.mjs`: **68/68 aprovados**, sem skips. São regressões dos serviços originais, executadas separadamente da suíte A/B.

Uma inspeção adicional extraiu **412 statements literais completos** de `.prepare(...)` dos módulos legados App/Finance e os submeteu ao parser do adapter: nenhum foi recusado. Esta inspeção verifica compatibilidade do parser; não afirma executar os 412 statements ou cobrir toda combinação dinâmica de SQL.

## Achados da revisão e limites

Foram encontrados e corrigidos durante a revisão: acesso por nome de tabela entre aspas simples; relação por vírgula; alvo de índice/trigger sem validação; colisão entre `ON` de trigger e `ON` de join; reescrita indevida de valores em consultas com catálogo; CTE aninhada autorizando tabela fora de seu escopo; e verbos de controle fora da lista aceita. Os testes mantêm esses casos como regressões.

Achado adicional corrigido no adapter: `json_each` e `json_tree` são aceitos apenas como funções de tabela seguidas de `(`. Um nome sem parênteses podia resolver uma tabela bruta homônima em SQLite. A reprodução em cópia sintética foi repetida depois da correção: ambos os nomes sem parênteses foram recusados, **2/2**; a suíte A/B permaneceu **9/9** aprovada.

No navegador, o armazenamento persistente de domínio encontrado é IndexedDB `brazacommerce-dtf-artworks-v1`, store `artworks`, chave `art_key`. A linha real contém `art_key`, `sha256`, `pixel_width`, `pixel_height` e `blob`; a propriedade de hash é **`sha256`**. `braza-theme` em localStorage é somente preferência visual. A cópia explícita para o namespace comercial deve verificar SHA-256 dos bytes, cabeçalho PNG, dimensões e decodificação; autenticar uma conta nova nunca deve importar a biblioteca legada automaticamente. O callback de verificação precisa ser ligado à integração real. Uma linha já existente no destino com o mesmo hash declarado também merece verificação de bytes para detectar corrupção local.

Caches e rascunhos em memória aparecem detalhados no inventário. Trocar empresa/loja/usuário exige abortar requisições pendentes, invalidar gerações, fechar IndexedDB, revogar Blob URLs e destruir snapshots, gráficos, seleções e rascunhos antes da próxima montagem. A integração de frontend e os testes de conta/contexto/envelope/jobs/migração pertencem às outras partes do candidato; os resultados acima não substituem essas validações.

O rollback de código precisa conservar os triggers protetores dos vínculos entre devolução e fabricação. O procedimento canônico exige código compatível e desvinculação explícita quando necessária; remover trigger ou fato para liberar a mutação não constitui recuperação segura. Backup, restauração, contagens, hashes e migração de acesso legado devem ser ensaiados e evidenciados em cópia pelo fluxo de migração.
