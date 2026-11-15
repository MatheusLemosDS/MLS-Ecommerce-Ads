> Atualização mais recente: o log App recebido confirma falta do bloco `previews`, com build e hashes corretos. Ver o diagnóstico e o reparo proposto ao final. Os estados de acesso/PR na tabela inicial são históricos; checkpoint e matriz operacional registram o estado atual.

# Serviços, dependências e direitos — P00

Base de código `346f30f200e5cbd3d9efd26663a483c625d9c6e7`, sobre o commit documental local `0a5a22897d3cf56f97b7b995eb78a743fc0a246e`. Inventário não é auditoria de titularidade nem certificação da operação externa. Os 22 módulos estão em [capabilities.json](capabilities.json); fontes, armazenamento, handlers e consumidores financeiros em [financial-lineage.json](financial-lineage.json).

| Serviço | Ambiente/versão/finalidade e dados | Responsável/custo | Referências de credenciais, limites e recuperação |
| --- | --- | --- | --- |
| Cloudflare App | Produção, `9bfc21d6-dec9-4fa6-89d8-7ea1dec50993`; UI, autorização comercial, D1, jobs e dados operacionais/financeiros por empresa/loja | Proprietário/admin Cloudflare; custo contratado não consultado | Credencial de deploy externa; nomes/bindings em `workers/app/wrangler.json`. Preservar versões, manifesto de isolamento, backups e revisões; rollback conforme `docs/financial-automation/VALIDATION.md`, sem apagar alocações. |
| Cloudflare Auth | Produção, `dfd2fc99-728f-4f29-96ee-a4b256c5640a`; fronteira de autenticação, sessões e roteamento confiável | Proprietário/admin Cloudflare; custo não confirmado | `workers/auth/wrangler.json`, contratos de identidade e secrets referenciados pelo runtime; nunca copiar valores. Revogação/sessões e recuperação existentes, sem reconectar OAuth. |
| Cloudflare Finance | Produção, `50b31451-c6cf-4456-bd09-be5d1956e0da`; conectores Shopee, dados salvos, caixa importado e fontes financeiras | Proprietário/admin Cloudflare; custo não confirmado | `workers/finance/wrangler.json`; grants e tokens por loja são separados do acesso de deploy. Não reverter Finance para código que desconheça reservas já utilizadas. |
| Cloudflare D1 / assets / cron | Bancos existentes e ACCOUNT_DB isolado; revisões, eventos, estoque e ativos; triggers existentes | Proprietário/admin Cloudflare; limites do plano não presumidos | Sem consulta de fatos reais para QA. Manifesto `web/cloudflare/src/tenant-schema-manifest.mjs`; migrações aditivas, runbook V4.1 e backups existentes. Orçamento técnico não comprova capacidade contratada ilimitada. |
| Workers Builds / GitHub CI | Integração externa versus workflow `Validar Workers`; não confundir checks externos com branch autorizada a publicar | Admin Cloudflare/GitHub; custo/quotas não confirmado | Leitura de metadados dos Workers permitida, mas GET Builds/worker e triggers retorna 403/10000. Branch/filtros/comandos não comprovados. Sem push enquanto esse risco estiver aberto; sem bypass, cancelamento ou edição do workflow. |
| Gateway de integração Shopee/Ads | Referenciado em `web/cloudflare/original/auth-worker.mjs`; `GATEWAY_URL`, assinatura por `GATEWAY_SHARED_SECRET`; transporte de integração, não cobrança SaaS | Operador do gateway/proprietário; host, versão, contrato, custo, SLA, backup e runbook externos não comprovados | Não expor URL privada/segredo. Exigir versão/contrato, limites, logs sanitizados e evidência de restauração; preservar conectores existentes até migração explícita. Ausência deste inventário externo não torna Finance/Ads ausentes. |
| Ponte Hermes / CLI | Código Python versionado `web/bridge/hermes_bridge.py`; usuário `hermes-mls`, launcher fixo, observer diário; contexto financeiro minimizado | Operador Hermes/proprietário; runtime externo, CLI/modelo/versão e custo não reconfirmados | `HERMES_BRIDGE_SECRET` por referência; contexto 12.288 bytes, prompt 60 KiB e ações permitidas fechadas. Runbooks em `docs/HERMES_FINANCEIRO.md`; restaurar pelo processo existente, sem tarefas arbitrárias nem mensagens reais de QA. |
| PSP de assinatura SaaS | **Separado do gateway Shopee**. Adapter/contrato efetivo e ambiente sandbox/produção não comprovados | Proprietário e futuro PSP; preço, taxa, trial e plano não inventados | Registro `docs/v4/EXTERNAL_DEPENDENCIES.json`, EXT-BILLING; contrato, configuração e assinatura webhook faltantes. UI mantém NOT_CONFIGURED; não executar cobranças reais ou prometer assinatura operacional. |
| Email transacional | Interface/outbox local existente; entrega real/provedor/domínio não comprovados | Proprietário/operador email; custo não confirmado | EXT-EMAIL; configurar apenas quando autorizado, verificar tokens/entrega/retenção sem contactar terceiros nesta fase. |
| Carteira/saques Shopee e banco automático | Interfaces existentes; adaptadores nativos, grants e consentimento de conta física não comprovados | Proprietário, provedor/app e titular da conta; custo/contrato não confirmado | CSV/OFX é oferta assistida, não conclusão da coleta automática. Retomar requisitos específicos nas fases futuras; não tratar falha de proxy como negativa de grant nem movimentar dinheiro. |

## Software incorporado e direitos

O [SBOM CycloneDX](sbom.cdx.json) enumera as **94 entradas do lockfile**, incluindo plataformas opcionais não instaladas, versão, licença declarada, instalação observada, uso e decisão. Somente `otpauth@9.6.0` e `@noble/hashes@2.4.0` são as dependências npm de runtime incorporadas pelo builder de autenticação. As duas licenças MIT instaladas são idênticas aos textos versionados e aparecem em [THIRD_PARTY_NOTICES.txt](THIRD_PARTY_NOTICES.txt). `tools/build_commercial_auth.mjs` conserva esses notices no artefato.

Ferramentas de build/dev não são redistribuídas nos Workers. Algumas entradas de plataforma/dev têm somente declaração no lockfile; isso está explícito no SBOM, sem fingir texto de licença verificado. Distribuir uma imagem de toolchain exigirá verificar licenças e notices completos, incluindo libvips/LGPL, eSpeak NG/GPL, fontes e componentes opcionais. P00 não introduz biblioteca nem modifica licenças.

O [inventário de direitos](rights-inventory.json) registra código, avatares, marca, fontes, áudio e **78 ativos versionados** com hash e decisão de preservação. Ausência de LICENSE raiz não prova autoria ou titularidade. Acesso ao repositório, hash, inspeção de PNG e indicação de fixture sintética não transferem direitos comerciais. Faltam comprovações do proprietário sobre a cadeia de direitos de código/colaboradores, marca e referências visuais; essas pendências impedem declarar SAAS-004 integralmente aceita para venda. Não criar uma licença raiz ou uma autorização fictícia.

## Bloqueios concretos e retomada

| ID | Recurso/evidência faltante | Impacto e último estágio | Responsável / ação mínima para retomar |
| --- | --- | --- | --- |
| EXT-BUILDS-READ | GET `/accounts/{account_id}/builds/workers/{worker_tag}/triggers` e GET `/accounts/{account_id}/builds/workers/{worker_tag}`: 403, código10000; faltam branch de produção, filtros e comandos efetivos App/Auth/Finance | Publicação Git/PR e prova CI do novo candidato não executadas. Commit local preservado; nenhum ajuste de configuração | Admin Cloudflare: disponibilizar leitura suportada/autorizada ou exportação sanitizada dos gatilhos efetivos; então reavaliar segurança do push. Não ampliar permissões automaticamente. |
| EXT-OPERATIONS | Versão/configuração, responsável operacional, custo/limites, monitoramento, backup e restauração do gateway/CLI externos | Inventário independente pronto, aceite operacional externo não comprovado | Proprietário/operadores dos serviços: fornecer somente metadados/contratos/runbook sanitizados e evidência de recuperação. |
| EXT-RIGHTS | Cadeia de titularidade/autorizações de código, marca, avatares e referências visuais; licenças completas de toolchain se houver distribuição futura | Registro de direitos concluído; autorização comercial não presumida | Proprietário/responsável pelos direitos: registrar origem/licença/autorização de cada família e restrições; sem contato de terceiros pelo executor. |
| EXT-FINANCIAL-SOURCES | Grants Wallet/Payout, adaptador e consentimento bancário, fuso/cobertura Ads, fontes equivalentes reais | Não bloqueia catálogos de P00; bloqueia promessa de automação/aceite financeiro e fases correspondentes | Proprietário/provedores: contratos/grants e fontes autorizadas; concluir código independente no escopo futuro. CSV/OFX não encerra banco automático. |

Nenhum segredo, callback, cookie, identificador de comprador ou extrato real é necessário neste registro. Implementado, testado localmente, publicado tecnicamente e validado operacionalmente permanecem estados distintos.


## Diagnóstico posterior: preview App sem configuração

O log App enviado pelo proprietário em conversa mostra `npm run build` concluído e os mesmos três hashes compilados do recibo. A falha ocorre depois, em `npx wrangler preview`4.151.1: falta um bloco `previews`. Os três avisos de vulnerabilidade do npm são um achado separado; não explicam essa falha de configuração. O log não contém SHA completo/UUID; a proveniência por navegação da conversa está registrada em `blocker-review-20261114.json`. Não atribuir automaticamente o erro às execuções Auth/Finance ou a outra tentativa App.

O exemplo sugerido pelo Wrangler contém o mesmo ADMIN_DB de produção de `workers/app/wrangler.json`. Copiá-lo não comprova isolamento. Nenhum banco, serviço ou segredo de produção deve ser usado como atalho para fazer preview passar.

### Reparo proposto para revisão, ainda não aplicado

| Alvo | Configuração atual a preservar | Preparação de preview necessária |
| --- | --- | --- |
| App | `workers/app/wrangler.json`, ADMIN_DB, domínio e configuração comercial existentes | Perfil separado com ADMIN_DB e ACCOUNT_DB de preview, artefato App e assets correspondentes; dados exclusivamente sintéticos; sem domínio ou cron de produção. |
| Auth | `workers/auth/wrangler.json`, serviço Finance de produção e configuração comercial existentes | Perfil separado; binding Finance aponta somente para Finance de preview, conta e autenticação isoladas; sem OAuth real, envio de mensagem ou segredo de produção. |
| Finance | `workers/finance/wrangler.json`, FINANCE_DB e configuração comercial existentes | Perfil separado com FINANCE_DB/ACCOUNT_DB isolados, sem grants/provedor comercial real e sem operações bancárias/marketplace. |

A configuração comercial efetiva deve ser levantada pelos geradores existentes; esta tabela não substitui o inventário de bindings. Identificadores de novos recursos não serão inventados. Antes da ativação: definir recursos e limites/custos, gerar perfis completos por Worker, validar resolução do comando/configuração no CI, isolamento entre perfis e preservação dos três hashes/contratos existentes. Os comandos externos precisam selecionar explicitamente o perfil correto por Worker; não adicionar um arquivo raiz que faça os três projetos publicarem o mesmo alvo.

Aplicar isso exige autorização específica para configuração de preview e seus recursos. A instrução anterior do proprietário para a inspeção foi **“Não altere essa configuração”**. Por isso, a entrega registra a correção revisável sem criar recursos, mudar comandos, desativar checks ou adicionar um bloco ligado ao banco real. Não substituir preview por comando vazio/de sucesso, não ignorar checks e não executar `wrangler deploy` para corrigir este erro.

Auth/Finance ainda precisam de logs correspondentes antes de uma correção específica. A configuração de preview é um bloqueio externo distinto da CI GitHub já aprovada. Os metadados operacionais e direitos também continuam pendentes; a fase P00 não é declarada concluída.

### Achado separado de dependências

A leitura `npm audit --json` reproduziu 3 achados: `undici`alto, `miniflare`moderado e `wrangler`moderado, no toolchain. O advisory sugere Wrangler4.162.0 como atualização disponível; isso é candidato de upgrade, não uma versão já homologada nesta entrega. Não executar `npm audit fix --force`. A atualização controlada deve preservar lockfile revisável, licenças, compilação, hashes/release conforme aplicável e testes dos caminhos afetados. Exposição em produção precisa de avaliação própria; o audit não a comprova.
