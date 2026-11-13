# Decisão de arquitetura — V4.1

Estado: decisão candidata implementada por módulos; integração e validação da aplicação inteira ainda pendentes. Esta nota deve ser atualizada com os resultados finais, sem transformar teste de módulo em prontidão comercial.

## Estrutura preservada

O projeto continua usando os módulos `.mjs`, a composição existente de HTML/CSS/JS e os três Workers App/Auth/Finance. O redesign não cria outro frontend/framework nem outro domínio. A entrada legada owner/review conserva cookies, duração de oito horas e privilégios anteriores até uma transição explicitamente verificada. O orçamento de uso do Hermes, o roadmap e os entitlements da empresa são contratos distintos.

## Identidade e autorização

A identidade comercial usa `ACCOUNT_DB` separado de `ADMIN_DB` e `FINANCE_DB`. `account-store.mjs` define armazenamento aditivo/versionado, registros com revisão e transações com guardas CAS. `account-service.mjs` resolve sessão opaca persistida, pessoa, empresa, membership, loja e capacidade no servidor. O cookie proposto é `__Host-mls_account`; a existência de um seletor no navegador não concede acesso. Clientes comerciais não herdam o subject global `admin` nem as credenciais da loja legada.

`commercial-context.mjs` produz um contexto imutável somente a partir de um resolver confiável. Objetos enviados por body, headers, URL, arquivo ou cursor não substituem esse contexto. A autorização deve ser novamente conferida antes de gravar e antes de liberar uma resposta sensível. A integração dos endpoints e dos blocos compostos precisa respeitar capacidades próprias, sem devolver campos bancários escondidos apenas por CSS.

A política central em `account-policy.mjs` fixa sessão absoluta de oito horas/inatividade de trinta minutos, verificação de 24 horas, reset de trinta minutos, convite de sete dias e reauth de cinco minutos. Senhas usam WebCrypto PBKDF2-HMAC-SHA256 com 600.000 iterações, salt aleatório de 32 bytes e resultado de 32 bytes, registro versionado estrito e 15–128 pontos de código Unicode. A derivação preserva os bytes exatos; a normalização é usada somente para a blocklist. Há denylist curta embarcada, `options.blockedPasswords` para adaptador de teste e `ACCOUNT_PASSWORD_BLOCKLIST_SHA256` para corpus privado configurado; isso não é uma alegação de triagem universal de vazamentos. TOTP usa segredo aleatório de 160 bits, SHA1/HMAC conforme RFC6238, seis dígitos e passo de trinta segundos, com contador antirreplay. Segredos do fator são AES-256-GCM com AAD e chave própria; recovery codes têm hash e uso único. Defaults e tetos de capacidades estão em [ROLES.md](ROLES.md). A dependência selecionada para TOTP é OTPAuth 9.6.0, com `@noble/hashes` 2.4.0; ambas MIT, fixadas no lockfile. Os textos completos e a revisão de runtime estão em [DEPENDENCIES.json](DEPENDENCIES.json) e [licenses](licenses/). O teste observado no workerd executou hash e verificação com 600.000 iterações, AES-GCM e vetor RFC6238 em 179 ms de relógio local, aprovado, em [account-runtime-workerd.log](evidence/account-runtime-workerd.log). A medição não confirma o orçamento de CPU/concorrência da conta em produção. Disponibilidade de ESM para browser e teste de módulo no workerd não dispensam o Worker completo gerado normal/minificado.

## Persistência dos domínios

O [inventário de armazenamento](TENANT_STORAGE_INVENTORY.json) identifica 121 tabelas App, 38 tabelas Finance e 195 objetos de schema. A decisão candidata mantém os contratos lógicos do domínio e usa nomes físicos por empresa/loja em `ACCOUNT_DB`, mediados por `tenant-storage.mjs`. O namespace deriva de IDs autorizados; os chamadores não escolhem nomes físicos.

O adaptador analisa SQL, mantém o escopo léxico de CTEs e fornece metadados de schema isolados. Índices, triggers, singleton, revisões, unicidade e request IDs ficam no mesmo namespace; não se limita a acrescentar um filtro ao SELECT. Valores, JSONs, hashes e atores históricos não são reescritos para produzir esse isolamento. Comandos SQL fora do contrato, objetos de identidade, outro namespace e superfícies SQLite de controle são recusados. Um batch com declaração de outro banco/namespace falha antes da escrita.

Essa escolha reduz alterações nos motores financeiros/físicos existentes, mas aumenta a importância do gateway obrigatório: nenhum caminho comercial pode receber o D1 bruto, um binding legado por fallback ou um SQL não analisado. A suíte de módulos instala os 195 objetos em dois namespaces e exercita os repositórios reais de fabricação/vínculos/caixa. A aplicação gerada e todos os seus entrypoints ainda exigem evidência própria.

## App → Auth → Finance

`tenant-envelope.mjs` define envelope HMAC v2 ligado a issuer/audience, pessoa, sessão, membership, empresa, loja, revisão de autorização, capacidade, método, caminho/query exatos e hash do body. A validade padrão é 30 segundos, limitada a 60. A assinatura prova origem do serviço; cada Worker consulta novamente o registro autorizado antes de operar. Headers externos não podem trocar o escopo. Uma empresa sem conexão recebe sua pendência; nunca as credenciais de `FINANCE_PROFILE` por padrão.

O gateway deve manter rotas permitidas, limites de body/timeout, sanitização, schema e proteção de segredos. O contrato privado de caixa por período continua versionado: `/internal/finance/external-cash-period-v1`, POST de transporte somente leitura. Acrescentar um tenant arbitrário aos DTOs legados exatos não é a estratégia de migração.

## Jobs, navegador e mídia

`tenant-jobs.mjs` liga job, dedupe e resultado ao contexto autorizado e revalida o ator antes de executar/concluir. Coletores/cron/leases concretos precisam entrar por esse caminho; um teste da função utilitária não prova a integração de todos os agendamentos.

`tenant-browser-storage.mjs` oferece namespace por pessoa/empresa/loja para rascunhos e IndexedDB v2, invalidação de requests e limpeza de URLs blob. `commercial-workspace-client.mjs` executa antes dos controladores, fixa os seletores autorizados da aba, protege resultados e streams por geração e coordena limpeza de memória/DOM/timers/mídia. A API do servidor revalida esses seletores; o navegador não cria autoridade. Troca explícita de empresa/loja em links operacionais exige uma página nova; outras abas conservam seus próprios seletores. Login/logout/bloqueio invalida dados privados pelo canal de ciclo de vida.

DTF e o loader de arte de devoluções abrem somente a biblioteca v2 do contexto ativo. A biblioteca DTF legada permanece preservada; a cópia ao namespace novo exige autorização/confirmação e validação de bytes, sem associação automática por nome. Foram observados 67 testes focados aprovados, incluindo Chromium com IndexedDB nativo, fontes normal/minificada, duas pessoas/empresas/lojas de mesma origem, arte de chave igual e bytes diferentes, resultado atrasado bloqueado, logout e URLs liberadas. [BROWSER_CONTEXT_EVIDENCE.md](BROWSER_CONTEXT_EVIDENCE.md) registra o contrato e o alcance: montagem no App gerado e autorização do serviço inteiro continuam sendo gates independentes.

## Migração e recuperação

`tenant-migration.mjs` captura schema, valores originais, contagens e SHA-256; restaura somente em destino vazio verificado e recusa backups corrompidos ou sobrescrita de dados mais novos. O backfill aditivo exige mapeamento explícito da loja legada, mantém o banco anterior e pode ser retomado. Reexecutar a migração não apaga novas escritas já feitas no namespace.

Rollback de código antigo mantém os dados comerciais novos persistidos, mas pode deixar de expô-los até recuperar um gateway compatível. Isso exige procedimento de recuperação explícito e preservação das proteções/triggers. Os testes sintéticos de cópia, interrupção, replay e restauração não são um backup Live nem evidência de migração de produção. A release deve registrar backup verificável, versão anterior, ordem compatível App/Auth/Finance/schema/assets e verificação posterior antes de ativar novas empresas.

## Fronteiras externas

E-mail real, cobrança, conexões por cliente e política jurídica/retenção têm dependências individuais em [EXTERNAL_DEPENDENCIES.json](EXTERNAL_DEPENDENCIES.json). Adaptadores determinísticos e outbox pertencem ao teste; não são publicados como entrega real. Falta de RBAC, persistência, isolamento ou integração local continua sendo trabalho de implementação, não uma dependência externa.

Ads/PROMO e demais escritas comerciais continuam bloqueadas para todos os papéis. Hermes permanece observador. Ausência não vira zero, fabricação não vira venda/caixa, contribuição exclusiva não vira lucro líquido universal e publicação não encerra M2/M2.2.
