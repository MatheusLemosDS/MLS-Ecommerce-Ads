# Isolamento e recuperação do domínio — evidência local V4.1

Este procedimento pertence à trilha comercial. Não foi executado em produção por este agente. A publicação, o backup real, o mapeamento humano do proprietário e a conferência do site pertencem à integração da release.

## Contrato de armazenamento

`ACCOUNT_DB` armazena identidades e os namespaces comerciais. `ADMIN_DB` e `FINANCE_DB` legados permanecem intactos. O namespace é SHA-256 de versão + `organizationId` + `storeId`; não usa o ID externo de marketplace como fronteira. Criar uma empresa/loja autorizada permite persistência sem criar um banco por cliente ou fornecer token Cloudflare ao aplicativo.

`tenant-schema-manifest.mjs` inventaria 121 tabelas App, 38 Finance, 14 índices e 22 triggers. `tenant-storage.mjs` transforma identificadores SQL por lexer, mantém strings/JSON/bindings intactos e apresenta um `sqlite_master` virtual limitado ao namespace. Índices, unicidade, singleton `id=1`, mês, request_id, CAS, revisões, leases e triggers continuam físicos e independentes. As definições canônicas das proteções antigas continuam verificáveis. Consultas a tabelas de identidade, tabelas desconhecidas, outro namespace, outro schema ou controles SQLite são recusadas. A interface não fornece `dump` ou `exec` irrestritos.

O gateway deve resolver a sessão, pessoa, membership, organização, loja e capability antes do acesso. `bindCommercialEnvironment` exige a função `tenantAuthorizationGuard` para qualquer `run`/`batch`; a verificação ocorre na mesma transação dos writes. A ausência da função impede gravações. Leituras exigem nova resolução antes de liberar a resposta, por `finalizeCommercialResponse`, evitando entregar leitura preparada durante uma revogação. O segredo de serviço não substitui a autorização: o envelope v2 vincula identidade, escopo, ação, método, caminho/query e hash do corpo, e a fronteira receptora resolve o registro atual.

## Antes da cópia legada

1. Registrar versão anterior e destino real. Fazer backup privado verificável dos bancos afetados pelo procedimento autorizado de infraestrutura. Nunca commitar backups de clientes ou imprimir suas linhas.
2. Definir conscientemente pessoa proprietária, organização e loja legadas. Uma conta recém-cadastrada nunca recebe esse mapeamento por ordem de cadastro, domínio de e-mail ou papel `review`.
3. Confirmar a suspensão temporária de writes no escopo a copiar e impedir acesso comercial ao destino enquanto a migração estiver `COPYING`. O código de integração deve consultar `commercialMigrationState` durante essa transição. A cópia não impede writes em outros clientes.
4. Capturar `snapshotDomainDatabase(legacyDb,{domain:'app'})` e o equivalente Finance. Preservar o artefato integral de forma privada. Registrar seu `digest`, contagens e versão; ele inclui valores cifrados persistidos, não uma exportação pública.

## Cópia aditiva e retomada

`backfillLegacyTenant({legacyDb,accountDb,context,domain,confirmed:true,legacyMapping})` exige contexto autorizado e `legacyMapping:{kind:'explicit-legacy-owner',userId,organizationId,storeId}` correspondente. Nunca usar o primeiro cliente como destinatário implícito.

O método registra versão/digest e estado em `mls_tenant_migrations`, cria as tabelas no namespace e copia todos os campos sem alterar payload, ator histórico, hash, dinheiro, origem ou revisão. Cada tabela tem checkpoint com hash e contagem. Cópias interrompidas podem ser reexecutadas; uma alteração no banco de origem durante o processo é conflito, não motivo para sobrescrever o destino. Índices e triggers são instalados após as linhas e a conferência final compara o digest completo da origem e do destino. Apenas então o estado muda para `COMPLETE`.

A integração não deve iniciar writes normais antes dessa conferência. Reexecutar uma migração `COMPLETE` confirma o recibo e preserva writes comerciais posteriores; não repõe a cópia antiga sobre eles.

## Restauração e rollback

`validateDomainSnapshot` verifica estrutura, nomes de objetos, hashes por tabela e digest integral. `restoreDomainSnapshot` aceita somente destino vazio e reconstrói tabelas, valores, índices e triggers; depois exige o mesmo digest. Não trunca nem sobrescreve banco com fatos novos.

Reverter a apresentação não exige apagar schema. O código de recuperação deve conservar o gateway compatível com namespaces, a autorização e as proteções de vínculos. O banco legado original continua intacto; restaurar código anterior que conhece somente esse banco preserva os novos writes fisicamente, mas não os apresenta. Retomar o gateway compatível reabre esses writes. Isso não é uma sincronização reversa automática. Não remover triggers para fazer código incompatível funcionar: o contrato anterior de vínculos já prevê falha fechada quando suas proteções não estão completas.

Offboarding é uma política de acesso/retenção e não uma autorização para apagar namespaces ou auditorias. Restaurar backup antigo sobre dados posteriores requer uma estratégia de recuperação diferente e não é realizado por este helper.

## Repetição local

```sh
node --test web/cloudflare/tests/tenant-sql-isolation.test.mjs web/cloudflare/tests/commercial-tenant-context.test.mjs web/cloudflare/tests/tenant-migration.test.mjs
```

Resultado observado: 20 testes locais passam (10 SQL + 6 contexto/envelope/jobs/browser + 4 migração). A suíte instala os 195 objetos de schema em duas cópias SQLite reais e executa os mutadores atuais de produção, recebimento, vínculos e importação de caixa com IDs coincidentes. Confere triggers imutáveis, hashes/JSON literais, revisões independentes, request_id, revogação e declarações de jobs. Os testes de migração preservam original/revisão do fechamento semanal, custo físico de R$ 54,00 em fixture, dinheiro importado, idempotência e histórico; simulam interrupção/retomada, restauração em cópia vazia e rollback com writes novos retidos.

O diagnóstico do teste imprime somente digest e contagens sintéticos. Esses valores mudam quando os IDs internos de teste mudam. Exemplos observados nesta execução: App 12 tabelas/9 linhas e Finance 10 tabelas/8 linhas, com o digest integral conferido no destino. Isso é um ensaio local, não backup ou migração do proprietário.

## Browser e integrações ainda dependentes da montagem

`tenant-browser-storage.mjs` separa drafts e IndexedDB por usuário/empresa/loja; troca/logout abortam requests e invalidam gerações/URLs blob. A biblioteca antiga não é lida automaticamente. A cópia explícita depende de autorização de importação legada e do verificador real dos bytes PNG/hash/dimensões; preserva o banco antigo e recusa conflito/corrupção.

Esses módulos isolados não comprovam que os handlers gerados, todos os controladores ou as três fronteiras já foram montados. A integração deve conectar o namespace aos handlers ativos, trocar todos os usos operacionais de `FINANCE_PROFILE` pelo perfil resolvido, impedir fallback de conexão legada, fornecer os guards/finalização de resposta e garantir teardown dos controladores ao trocar identidade. A matriz final deve registrar a evidência do Worker compilado e do browser separadamente.

## Integração adicional executada no código fonte

Os caches de inicialização dos módulos de domínio App/Finance usam `TenantInitializationMap/Set`: identidade estável por banco físico + namespace + domínio, com autorização imutável e separada por requisição. A autorização também cobre `INSERT/UPDATE/DELETE ... RETURNING` executados por `first`, `all` ou `raw`. Batches compostos somente por SELECT não acrescentam uma consulta de escrita.

`bindCommercialEnvironment` conserva somente uma allowlist explícita de bindings, serviços e configurações do runtime. Senhas/cookies legados, credenciais Ads/gateway, variáveis de identidade, segredo OAuth e chave de parceiro financeira da implantação não são herdados. A chave AES de armazenamento permanece serviço privado e o AAD comercial inclui organização/loja. A chave de aplicativo de um conector só entra por `providerEnvironment` fornecido pelo registro confiável do servidor; ausência não usa a chave da loja antiga.

Todos os consumidores operacionais Finance usam `getFinanceProfile(env)`. Sem contexto comercial, o comportamento legado continua igual. Com contexto, falta de perfil gera `FINANCE_CONNECTION_REQUIRED`; status informa `NO_CONNECTION`. Assinaturas, identidade de respostas, OAuth e evidências usam o perfil real resolvido. Os quatro projectors com ID fixo receberam parâmetro opcional `expectedProfile`, mantendo o default exato legado; não traduzem a identidade de outro cliente para a antiga.

Importação/agregação de arquivos de caixa independe de OAuth. Seu tenant comercial usa o namespace próprio. A mutação acrescenta na mesma transação um evento imutável `ACTOR_CONTEXT_V1`, separado do recibo financeiro, com pessoa/empresa/loja/membership/capability reais; fatos, hashes e atores legados não são reescritos.

`costRuleSchemaForEnvironment` exclui o seed monetário infantil da loja antiga e inicializa uma coleção vazia de regras, sem inferir custo zero. Custo de produção comercial ausente informa `PRODUCTION_COSTS_CONFIGURATION_REQUIRED`; a primeira gravação explícita usa revisão zero e valores positivos validados do usuário, com auditoria da pessoa real. O setup global da montagem também deve aplicar esse filtro sobre o schema completo.

Evidência adicional: `node --test web/finance/tests/tenant-finance-profile.test.mjs`, **4/4**, usa registros reais de conta em SQLite, o resolver/guard reais, dois perfis e revogação de membership. A suíte completa de Finance teve **773/773**, sem falhas/skips, em `/tmp/mls-v41-finance-tests.log`; após acrescentar cache ao setup de conexão, os **29/29** testes de conexão/perfil passaram novamente. A montagem final dos Workers continua dependente do build integrado da release.

## Preparo técnico e montagem compilada verificados

`commercial-workspace-setup.mjs` recebe o `SCHEMA` real do App e cria somente objetos técnicos em etapas de até 12 DDL. O progresso versionado fica em registros `workspace_setup` de `ACCOUNT_DB`, por empresa/loja, com guard de autorização e CAS na mesma transação das criações. O cliente envia o cursor devolvido pela etapa anterior; repetir um cursor devolve o progresso já confirmado. Interrupção não avança o cursor e concorrência não duplica a etapa. Apenas as coleções vazias de bindings e regras recebem marcadores técnicos; custos, configurações monetárias, DAS, jobs e fatos permanecem ausentes.

O teste importa diretamente o `SCHEMA` atual de `admin.mjs`: 114 entradas, 98 criações únicas, nove requisições e máximo observado de 15 statements no batch, dos quais 12 DDL. Testa duas empresas, revogação, associação incorreta de wrappers, conflitos e retomada. Comando combinado observado: `node --test web/cloudflare/tests/commercial-workspace-setup.test.mjs web/cloudflare/tests/tenant-sql-isolation.test.mjs web/cloudflare/tests/commercial-tenant-context.test.mjs web/cloudflare/tests/tenant-migration.test.mjs`, **23/23**, em `/tmp/mls-v41-isolation-final.log`.

`tools/build_commercial_finance_worker.mjs` monta o Finance em um único grafo ESM com as mesmas marcas privadas de contexto/storage. O helper e o `main()` de `build_finance_live_delivery.py` mantêm a verificação histórica do Auth antes da montagem; o API `bundle()` histórico permanece disponível. O receiver Finance exige envelope Auth→Finance, capability correspondente à rota, perfil do servidor e nova resolução de autorização antes de entregar a resposta.

`node --test web/finance/tests/commercial-compiled-chain.test.mjs`, **3/3**, executa os adaptadores App de caixa e catálogo através de Auth e Finance compilados, contra SQLite real. Confere IDs/request IDs iguais em empresas diferentes, idempotência, ausência de uso do banco legado, perfil próprio e assinatura do conector, cabeçalhos hostis e revogação durante a resposta. O transporte marketplace desse teste é sintético, não uma chamada Live. Log: `/tmp/mls-v41-commercial-compiled-final.log`.

A suíte final completa `node --test --test-reporter=tap --test-concurrency=1 web/finance/tests/*.test.mjs` passou **777/777**, sem falhas/skips, em `/tmp/mls-v41-finance-tests-serial-final.log`, após a otimização do resolver e o teste de AAD com perfis externos iguais. O teste compilado posteriormente ampliado para as duas lojas externas passou novamente **3/3**, verificando também a assinatura HMAC de cada request. A execução paralela anterior sofreu SIGKILL de um processo de compilação; o mesmo vetor legado passou **3/3** isolado e na execução completa sequencial. `weekly-operating-store.test.mjs` passou **13/13**: a união das duas leituras exatas preserva o snapshot e reduz o caminho normal para 43 consultas D1; o teto comercial de 47 reserva duas consultas de autorização no Auth e uma chamada de caixa, sem remover o fence final.

A contagem compilada detectou inicialmente 60 statements na primeira importação de caixa, incluindo 31 DDL e duas resoluções de identidade. O resolver foi reduzido para um snapshot SQL por resolução, mantendo ambas as chamadas de autorização: o teste compilado agora mede **50 statements exatos** na importação fria de cada empresa, leitura fria 3, preview/replay 4 e leitura com dados 10. O teste exige que cada invocação completa permaneça em até 50. A migração de conta `0002` cria o registro vazio de recibos, sem mapear nenhum proprietário, e é obrigatória antes de ativar esse resolver; sua ausência falha fechada. Os demais setups Finance têm grupos menores de DDL, mas a contagem das operações completas depende das páginas, tokens e caminhos de evidência. Não foi adicionada rota nova de preparo Finance.

O teste adicional de AAD configura duas organizações com o mesmo partner/shop externo e transplanta ciphertext entre seus bancos sintéticos. A descriptografia no destino falha e somente sua conexão passa para `REAUTH_REQUIRED`; a conexão original permanece `CONNECTED`. A suíte de perfil passou **5/5**, em `/tmp/mls-v41-finance-profile-final.log`. Após a otimização do resolver, o conjunto perfil + montagem compilada + preparo técnico passou **11/11**, em `/tmp/mls-v41-account-optimized-chain.log`.

O mapeamento legado continua explícito. O alias de caixa somente é propagado de recibo Finance `COMPLETE`, versão 1, com o tenant antigo confirmado e correspondente. Copiar conexão cifrada legada exige decisão futura sobre identidade proprietária e AAD/contexto criptográfico, com recibo explícito; não é inferido deste alias de caixa. A loja atual continua usando a conexão legada, e novas contas ficam sem conector configurado até autorização própria. Nenhum ciphertext ou hash antigo foi reescrito para simular essa migração.

Jobs têm contratos e revalidação local testados; ativação real de cron/filas, conector bancário, exportações e todas as rotas App compiladas são verificações separadas da integração. Este agente não realizou publicação, backup de produção nem migração Live.
