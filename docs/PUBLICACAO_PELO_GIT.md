# Publicar os Workers pelo Git

O fluxo preparado usa o repositório **MLS-Ecommerce-Ads** e três projetos no
Cloudflare: **App**, **Auth** e **Financeiro**. Cada projeto publica somente seu
Worker. Os arquivos são editados no Git; o Cloudflare recebe as alterações da
branch de produção. Não é necessário baixar ZIP nem colar o Worker inteiro no
editor a cada atualização.

Os três Workers já existem na conta: `brazacommerce-app`,
`brazacommerce-auth` e `brazacommerce-finance`. As configurações importadas
preservam os domínios e bancos existentes; não criar substitutos para App e Auth.

Em 18/10/2026, o operador confirmou o [Financeiro conectado](H3_FINANCE_CONNECTED_OBSERVADO.json)
após o release `9bc332e`: `CONNECTED`, revisão 1, Partner2049333 e shop1178167501.
Auth e Finance usam os comandos reais de deploy pelo Git. O operador também
confirmou salvos `build:app` e `deploy:app` no App; falta confirmar seu primeiro
deploy pelo Git, conforme o [registro de publicação](../workers/app/RELEASE.md).
O App preparado inclui o v11 de custos
de produção; sua publicação ainda não foi confirmada. Ele preserva a referência
de margens e não calcula lucro financeiro.

## Primeiro vínculo: capturar pelo próprio Cloudflare

Esta captura inicial já foi concluída para App e Auth nesta conta. As
instruções da seção ficam como referência; não substituir os comandos reais
de deploy por capturas em atualizações normais.

Para evitar instalar ferramentas no computador ou criar outra credencial,
o primeiro Build dos Workers existentes pode usar a autenticação que o próprio
Cloudflare fornece ao Wrangler. Essa etapa só lê o Worker publicado e imprime
um pacote de configuração sanitizado; não chama `deploy`, não troca código,
não cria banco e não modifica a autorização da loja.

Abrir cada Worker existente em **Settings → Builds → Connect repository** e
selecionar `MatheusLemosDS/MLS-Ecommerce-Ads`, branch `main`, raiz do repositório.
Usar Node `24.19.0` (variável de build `NODE_VERSION`, caso a interface peça).
Manter a instalação com `npm ci` e usar **temporariamente** estes comandos:

| Worker existente | Build command | Deploy command temporário |
| --- | --- | --- |
| `brazacommerce-app` | `npm run build:app` | `npm run capture:app` |
| `brazacommerce-auth` | `npm run build:auth` | `npm run capture:auth` |

Salvar os comandos pode não iniciar um build automaticamente. Depois de
salvar os dois projetos, um novo push na branch `main` dispara os builds
quando eles estão habilitados e os caminhos alterados correspondem aos
Build watch paths. Abrir a execução do novo commit em **Deployments** para
acompanhar a captura; as publicações manuais anteriores não têm esses logs.

Embora a interface chame o campo de Deploy command, esses dois comandos apenas
executam uma captura de leitura. O helper usa o Wrangler fixado no lockfile com
`init --from-dash ... --yes --no-delegate-c3`, em pasta temporária fora do clone;
descarta a saída privada, remove `vars`/`secrets` e apaga os arquivos temporários.
O caminho nativo evita instalar C3 ou criar outro repositório.

Nos logs do Build, copiar somente o trecho entre `BRAZA_GIT_CONFIG_BEGIN` e
`BRAZA_GIT_CONFIG_END`, incluindo as duas linhas. O conteúdo Base64 contém
metadados de recursos e hashes do código, sem valores de variáveis ou segredos.
Enviar esse trecho para incorporar a configuração ao Git. Não copiar o log
inteiro. Se aparecer um erro `WORKER_*`, informar somente esse código.

O pacote pode ser aplicado localmente com:

```bash
node tools/apply_worker_config_capture.mjs /tmp/captura-app.txt
```

Ele é validado antes de gerar `workers/app/wrangler.json` e `migration.json`.
Repetir com o pacote do Auth. A validação recusa campos privados, hash divergente,
fonte não reconhecida e configuração alterada sem substituição explícita.
Somente depois de importar os dois pacotes e cadastrar o D1 financeiro, trocar
os comandos temporários pelos comandos reais de publicação descritos abaixo.

Ao configurar outra conta, a captura precisa ser executada nela. Se a credencial de Build
não permitir a leitura, o helper retorna `WORKER_CAPTURE_REMOTE_UNAVAILABLE`
sem tentar publicar; conferir as permissões da integração no próprio Cloudflare.
Não é necessário enviar um token no chat.

## Configuração inicial

1. No Cloudflare, anotar para cada Worker existente o nome, a versão publicada,
   os domínios/rotas, as variáveis de texto, os bindings, os cron triggers e as
   opções de compatibilidade. Guardar uma cópia do código publicado para
   recuperação. A configuração de cada projeto no Git deve refletir esse
   inventário antes do primeiro deploy.
2. Conferir o nome e o ID de cada D1. O App usa seu banco administrativo
   existente como `ADMIN_DB`. O Financeiro exige um **D1 novo e exclusivo**,
   vinculado como `FINANCE_DB`. Não copiar dados ou tokens Ads para esse banco.
3. Preencher e validar o snapshot de configuração não secreta exigido pelo
   script de publicação. Os exemplos não substituem o inventário real do
   Cloudflare. O deploy recusa configuração incompleta ou sem snapshot.
4. Cadastrar os segredos diretamente em **Settings → Variables and Secrets**
   de cada Worker. Preservar os segredos atuais do App e do Auth.
5. Enviar o código e as configurações revisadas ao Git e executar os checks.
   Só depois ativar os comandos reais de publicação dos projetos do Cloudflare.

`keep_vars=true` conserva variáveis de texto existentes no painel. Ele não
preserva automaticamente bindings ausentes no arquivo de configuração. D1,
Service Bindings, rotas, cron e demais recursos usados precisam ser declarados
conforme a configuração publicada. Conferir também flags e data de
compatibilidade.

Os seguintes dados de configuração podem ser usados para preparar a migração:
nome dos Workers, nomes e IDs dos bancos, nomes e destinos dos bindings,
domínios, rotas, cron e nomes das variáveis/Secrets. Não enviar valores de
Secrets, senhas, chaves de API, tokens ou códigos de autorização no chat.

## Importar a configuração publicada

Com o repositório clonado no computador/terminal usado para a configuração,
executar `npm ci` na raiz. O Wrangler já está fixado no lockfile; usar essa
versão para a exportação. Autenticar a conta Cloudflare quando o Wrangler pedir.

Fazer as exportações em uma pasta **fora do repositório**. O comando abaixo é
um modelo: substituir `/CAMINHO/REPO` pelo caminho real do clone e usar os nomes
exatos dos Workers publicados. Executar um comando por Worker, em diretórios
separados:

```bash
node /CAMINHO/REPO/node_modules/wrangler/bin/wrangler.js init --from-dash brazacommerce-app --yes --no-delegate-c3
```

```bash
node /CAMINHO/REPO/node_modules/wrangler/bin/wrangler.js init --from-dash brazacommerce-auth --yes --no-delegate-c3
```

O export pode conter valores privados de variáveis de texto. Não copiar o
export bruto para o Git, não mostrar seu conteúdo no chat e não executar
`git add .` sobre a pasta de exportação. O importador grava apenas a configuração
permitida, removendo os campos `vars` e `secrets`. Ele também verifica o hash do
código baixado antes de reconhecer a versão publicada.

Depois, na raiz do repositório, apontar o importador para os arquivos reais
gerados. Ajustar os caminhos abaixo, inclusive o nome do arquivo de entrada
caso o export use um nome diferente de `src/index.js`:

```bash
node tools/import_worker_config.mjs app /tmp/export-app/wrangler.jsonc /tmp/export-app/src/index.js
node tools/import_worker_config.mjs auth /tmp/export-auth/wrangler.jsonc /tmp/export-auth/src/index.js
```

O resultado de cada importação fica em
`workers/<projeto>/wrangler.json` e `workers/<projeto>/migration.json`. Esses são
os metadados revisados que entram no Git; os exemplos `wrangler.example.json`
não são usados para publicar. O importador do Auth acrescenta o Service Binding
financeiro, preservando os demais recursos reconhecidos.

Se aparecer `WORKER_SOURCE_UNRECOGNIZED` ou `WORKER_CONFIG_UNSUPPORTED`, parar a
migração desse Worker e revisar a diferença. Isso pode indicar outra versão de
código ou um tipo de recurso que o importador ainda não suporta. Não remover o
recurso do export nem trocar o hash para contornar a proteção. Uma importação
igual pode ser repetida; substituir uma configuração já importada com dados
diferentes exige revisão e a opção explícita `--replace`.

Criar o D1 financeiro novo no Cloudflare e copiar somente seu UUID público.
Depois executar, substituindo `UUID_DO_NOVO_D1` pelo ID real:

```bash
node tools/import_worker_config.mjs finance --new-d1 UUID_DO_NOVO_D1 --database-name brazacommerce-finance-db
npm run validate:deploy -- all
```

O validador confere também que o banco financeiro é diferente dos bancos
declarados no App. Para verificar um projeto separadamente, usar
`npm run validate:deploy -- app`, `auth` ou `finance`. A validação é local e não
publica. Somente depois de validar todos os projetos, conferir o diff e enviar
os metadados revisados ao Git, ativar os comandos reais dos Builds e seguir a ordem de publicação.

## Conectar cada projeto ao repositório

Para **App e Auth existentes**, abrir o próprio Worker e acessar
**Settings → Builds → Connect repository**. Autorizar o repositório
`MatheusLemosDS/MLS-Ecommerce-Ads`. Não usar a criação de um novo App/Auth.

Para **Financeiro**, usar **Create an app → Connect GitHub**, selecionar o
mesmo repositório e criar o Worker `brazacommerce-finance`.

Na primeira criação, usar `npm run build:finance` no campo **Build command** e
`npm run deploy:finance` no campo **Deploy command**, branch `main`, raiz `/`
e Node `24.19.0`. O D1 `brazacommerce-finance-db` já está declarado no Git como
`FINANCE_DB`; não é necessário adicionar outro vínculo manualmente.
Esse primeiro deploy pode ocorrer antes do cadastro dos Secrets: o Worker
permanece privado e a conexão depende dos Secrets e da variável de ativação.
Concluir esse cadastro no próprio Financeiro antes de publicar o Auth.
Enquanto isso, manter App e Auth com os comandos temporários de captura.

Configurar os três projetos com a **raiz do repositório**, a branch de produção
**`main`** e estes comandos:

| Projeto | Comando de build | Comando de deploy | Configuração |
| --- | --- | --- | --- |
| App existente | `npm run build:app` | `npm run deploy:app` | `workers/app` |
| Auth existente | `npm run build:auth` | `npm run deploy:auth` | `workers/auth` |
| Financeiro novo | `npm run build:finance` | `npm run deploy:finance` | `workers/finance` |

O diretório raiz usado no build deve continuar sendo o repositório inteiro,
mesmo que as configurações estejam em `workers/`. O script de deploy escolhe a
configuração correta e valida o snapshot antes de chamar o Wrangler. Não trocar
o comando por `npx wrangler deploy` para contornar a validação.

O repositório fixa Node em `.node-version` e Wrangler no lockfile. Se a interface
pedir uma versão de Node, usar a indicada nesse arquivo. O build instala as
dependências com `npm ci`.

Desativar deploys automáticos de branches de teste enquanto não houver bancos,
bindings e credenciais de teste separados. Um preview não deve acessar o D1,
executar cron ou usar as credenciais financeiras de produção. Desativar também
o comando de deploy de branches não produtivas, se ele aparecer na interface.

Conectar o Git pode iniciar o primeiro build. Para os comandos reais de deploy,
fazer essa etapa somente quando as configurações e os snapshots estiverem
completos. Os comandos temporários de captura podem ser usados antes, conforme
a seção inicial. Os checks do GitHub
validam código e builds; eles não publicam e não precisam de Secrets de
Cloudflare no GitHub.

## Ordem da primeira publicação

1. **Financeiro:** criar o D1 privado, conferir os bindings/Secrets e publicar.
   Manter `workers.dev` e preview URLs desativados e não associar domínio
   público. A comunicação acontece por Service Binding.
2. **Auth:** adicionar o Service Binding `SHOPEE_FINANCE_SERVICE`, apontando
   para o Worker financeiro, e o Secret `FINANCE_ROUTER_SECRET`. Esse Secret
   precisa ter o mesmo valor nos dois Workers. Preservar as rotas e os demais
   bindings existentes antes de publicar. A configuração revisada do Auth
   também oculta a query das URLs nos logs de invocação; a captura original e
   essa alteração intencional estão documentadas em
   [REVIEWED_CHANGES.md](../workers/auth/REVIEWED_CHANGES.md).
3. **App:** conferir o `ADMIN_DB`, os cron triggers e a versão que será
   entregue, então publicar. Não recriar o banco administrativo.

O Financeiro usa estes campos no próprio Cloudflare:

| Nome | Tipo | Origem |
| --- | --- | --- |
| `SHOPEE_FINANCE_PARTNER_KEY` | Secret | Live API Partner Key da app financeira **2049333** |
| `FINANCE_TOKEN_ENCRYPTION_KEY` | Secret | 32 bytes aleatórios em base64, guardados para reutilização |
| `FINANCE_ROUTER_SECRET` | Secret | Segredo exclusivo compartilhado com Auth |
| `FINANCE_CONNECTION_ENABLED` | Texto | `true` ao habilitar a conexão |

Não gerar uma chave de cifragem nova a cada deploy. Alterá-la torna os tokens
já armazenados ilegíveis. O Partner ID financeiro é **2049333** e a loja é
**1178167501**. As credenciais Ads continuam separadas.

A entrada de autorização financeira usa o fluxo web Global
`https://open.shopee.com/auth`, com `state` próprio e callback financeiro.
O [registro da correção](FINANCE_AUTHORIZATION_FIX.md) distingue o link de
navegador das chamadas assinadas de troca e renovação de tokens.

Depois da publicação, conferir o painel, o login de revisão, a área
administrativa e as rotas Auth existentes. A conexão financeira já foi informada
como concluída; para uma autorização futura, seguir [DEPLOY.md](../web/finance/DEPLOY.md). O status esperado é
`CONNECTED` com os IDs financeiros corretos, sem exibir tokens. Essa conexão
não importa taxas nem calcula lucro por si só.

Antes de iniciar a autorização, abrir
`https://auth.brazacommerce.com.br/shopee/finance/status` para conferir a
comunicação entre Auth e Financeiro. Uma conexão ainda não autorizada não deve
aparecer como `CONNECTED`. Essa consulta não solicita tokens à Shopee nem
comprova que a Partner Key e a autorização da loja estão corretas.

## Corrigir o segredo compartilhado pelo Git

Se o Auth retornar `FINANCE_CONFIGURATION_PENDING`, conferir o Secret
`FINANCE_ROUTER_SECRET` e o Service Binding `SHOPEE_FINANCE_SERVICE` do Auth.
`FORBIDDEN` retornado pelo Financeiro indica que o segredo recebido não confere
com o esperado. Uma Variable de texto chega ao código como string; o tipo,
isoladamente, não explica uma divergência de valor.

Para sincronizar os dois valores sem copiar a chave entre telas, existe uma
operação explícita e temporária:

```text
npm run repair:finance-router
```

Usar esse comando no campo **Deploy command** do Build de
`brazacommerce-auth`, mantendo **Build command** como `npm run build:auth`.
Salvar e disparar um novo build na branch `main`.

Salvar o novo comando não garante uma execução automática. Depois de salvar,
um novo push em `main` dispara o reparo; abrir a execução desse commit em
**brazacommerce-auth → Deployments** para acompanhar o resultado.

O helper valida as configurações locais e lê a lista de nomes de Secrets dos
dois Workers antes da primeira alteração. Gera um único valor aleatório de
64 caracteres hexadecimais e envia somente `FINANCE_ROUTER_SECRET` para
Financeiro e Auth, por stdin privado do Wrangler fixado no lockfile.
Não envia chaves na linha de comando ou no Git, não imprime valores e remove
os logs temporários do Wrangler. Não altera Partner Key, chave de cifragem,
bancos, código dos Workers ou configurações Ads. As listas finais precisam
confirmar `FINANCE_ROUTER_SECRET` como `secret_text` nos dois Workers.

O sucesso imprime apenas `FINANCE_ROUTER_SYNCED`. A operação faz duas
gravações sequenciais; se a segunda falhar, pode haver uma atualização parcial.
Uma falha imprime um código fixo `FINANCE_ROUTER_SYNC_*`, sem detalhes privados.
Não executar novamente por rotina: cada execução gera um novo valor.

Depois do sucesso, restaurar o **Deploy command** do Auth para
`npm run deploy:auth` e consultar `/shopee/finance/status`. A criação e as
permissões reais do token de Build para gravar nos dois Workers precisam
funcionar na conta Cloudflare; os testes locais usam chamadas simuladas.

Se aparecer `FINANCE_ROUTER_SYNC_FINANCE_BINDING_CONFLICT`, o Cloudflare
recusou substituir a Variable pelo Secret. Nesse caso, remover somente a
Variable de texto `FINANCE_ROUTER_SECRET` no Financeiro, salvar/publicar e
reexecutar a operação. O helper não remove bindings automaticamente.
Se aparecer um código `*_VERSION_NOT_DEPLOYED`, publicar a configuração
pendente desse Worker antes de tentar novamente.
Se houver um build normal do Financeiro em andamento pelo mesmo push,
aguardar sua publicação terminar e repetir somente o build do Auth pelo
**Retry build** dessa execução, mantendo o comando de reparo. Assim não é
necessário outro push que inicie novamente os builds dos três projetos.

## Atualizações seguintes

Editar o código no repositório, abrir uma pull request e aguardar o workflow
**Validar Workers** passar. Antes de integrar, conferir no resultado de build
do Cloudflare quais projetos serão publicados. Para que os checks sejam
obrigatórios, configurar a proteção da branch `main` no GitHub exigindo esse
workflow; apenas existir um workflow não bloqueia um deploy do Cloudflare.

Usar os filtros de caminhos dos Builds para cada projeto. Incluir também
dependências compartilhadas; alterar só um helper pode mudar mais de um Worker.

| Projeto | Caminhos que precisam disparar o build |
| --- | --- |
| App | `web/cloudflare/**`, `workers/app/**` |
| Auth | `web/cloudflare/**`, `web/finance/src/auth-router.mjs`, `workers/auth/**` |
| Financeiro | `web/finance/src/**`, `workers/finance/**` |
| Todos | `package.json`, `package-lock.json`, `.node-version`, `tools/**` |

Conferir na interface a sintaxe aceita pelos filtros. Enquanto isso não estiver
configurado e verificado, manter o build dos três projetos para alterações na
branch de produção evita perder uma dependência.

Os comandos locais de verificação, executados na raiz do repositório, são:

```bash
npm ci
npm test
npm run build
```

As entradas geradas em `dist/` são artefatos de build e não precisam de edição
manual. Manter no Git as fontes, os testes, os scripts, as configurações e os
guias. Manter fora do Git os arquivos `.env`/`.dev.vars`, Secrets, bancos,
backups de dados, logs, screenshots privados e ZIPs de entregas antigas.

## Recuperação

Guardar os IDs das versões Cloudflare anteriores ao primeiro deploy. Se houver
falha, usar o rollback do próprio projeto para restaurar a versão anterior e
pausar os Builds automáticos enquanto corrige o Git. Rever também os bindings
e as configurações: voltar o código não desfaz necessariamente mudanças de
configuração ou de banco.

Não apagar D1, revogar a autorização Ads ou trocar a chave de cifragem como
parte de uma recuperação de código. Para interromper novas autorizações
financeiras, usar `FINANCE_CONNECTION_ENABLED=false`.
