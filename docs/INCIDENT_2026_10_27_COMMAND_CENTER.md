# INCIDENTE P1 — Painel MLS Commerce OS sem carregar e agentes ausentes
Data: 27/10/2026. Relato do operador após merge da PR #22.

## Evidência disponível
- Última alteração de runtime: PR #22 (copiar diagnóstico Pending), merge `2e35ac0267757f748912f36756c89584aa13efe6`.
- CI da PR e da main passou com 2.064 testes Node e 67 Python.
- Não é prova de acesso em produção: estado do deploy Cloudflare e erro do navegador não observados por conector.
- No repositório, o último incremento anterior era PR #21, merge `2433cd9c55de271034def246fbca8dc98a1d4dae`.
- O estado anterior ao trabalho da PR22 é o commit `729db2716b13d2869f7ee3033ebb3569c82cdf70`.

## Mitigação imediata, reversível
Restaurar APENAS os 5 blobs alterados pela PR22 que podem afetar
código/compilação/testes: agent-registry, agent-registry-view, build.py,
worker_project.mjs e agent-registry.test.mjs. Preservar todos os outros
arquivos, scripts, integrações e dados. Não manipular D1, Auth, Finance,
OAuth nem Secrets. Não reverter a PR #21 ou a Central de Comando M1.
O botão de copiar Pending fica removido temporariamente. Retomar M2 somente
depois de confirmar tela e reconciliação financeira.

## Critério de recuperação
1. CI do hotfix passando no head exato e main.
2. Deployment do App no Cloudflare identificado por SHA/build de hotfix.
3. Acesso autenticado à Central de Comando em desktop e celular.
4. Cartões Finance, Ads, Products, Production, Returns, Auditor e Hermes
   na hierarquia publicada em M1; lucro diário e resumo mensal apresentados
   ou indisponibilidades descritas sem travar a página.
5. Nenhuma regressão de login, pedidos, histórico, D1 ou Shopee.
6. Se persistir: obter a primeira linha do erro de console sem segredos,
   request path/HTTP status e build_id; investigar sem novos writes.

## Causa raiz
INDETERMINADA. PR #22 suspeita por correlação temporal, não confirmação.


## P1: diagnóstico público e hotfix de navegação dos agentes (27/10/2026)

A PR #24 foi usada **somente em branch** como teste anônimo e encerrada sem
merge. GitHub Actions run `40563757410` confirmou DNS de App/Auth/Gateway;
`/login` HTTP 200 com branding MLS, `/health` HTTP 200,
`/` e `/admin` redirecionam 303, e `/api/admin/bootstrap`
anônimo retorna 401 (esperado). Isso **não testa uma sessão autenticada**.

A inspeção do código encontrou que a entrada **Agentes** ficava em "Mais
opções" e usava `#commandAgents` sem reabrir o `overview` quando outra aba
estava ativa. Além disso, `commandCenterAgents` iniciava vazio antes do
JavaScript, fazendo todos os cartões sumirem se a hidratação falhasse.

A PR #25 (merge `7c62247058066e49b6f86544de359786b2bd60ac`) move Agentes para a navegação principal, tanto
no desktop quanto no celular; o clique muda primeiro para a Visão geral e
depois rola para a equipe. Seis cartões de placeholder "Aguardando dados" são
renderizados pelo Worker sem pressupor valor financeiro; a hidratação os
substitui pelos dados reais. Não há novos requests, coletores, D1 ou alterações
na Shopee. CI PR `40564669598` e main `40564933755` passaram com **2.064
Node + 67 Python**. Os três check-runs Cloudflare Workers Builds do merge
também reportaram **SUCCESS**.

**Incidente permanece aberto.** O usuário ainda não confirmou a tela pós-PR25.
Histórico real de cota D1 em 26/10 merece nova verificação em 27/10; não
inferir automaticamente que a cota esteja esgotada hoje. Recuperação de
navigation/placeholder não equivale à retomada das consultas financeiras.


### Evidência adicional sobre D1 (27/10/2026)

Notificações da própria Cloudflare disponíveis na conta mostram atualização para
**Workers Paid em 26/10/2026**, posterior aos alertas de limite diário do
Workers Free daquele dia. A pesquisa de notificações de 27/10 não encontrou
novo alerta de cota diária. Portanto, a explicação "aguardar 21h por limite
Free" **não está fundamentada para o incidente atual**. Isso não comprova que
o D1 esteja saudável: ainda faltam o código HTTP autenticado e métricas atuais
do banco. Não alterar plano, cron nem custos sem essa evidência.


## 27/10/2026 — PR #26: diagnóstico autenticado seguro, incidente P1 ainda aberto

A falha de carregamento **começou antes da PR #22**; logo a reversão isolada
não era diagnóstico suficiente. O CI de PRs #23 e #25 e os builds Cloudflare
foram aprovados, porém a tela financeira autenticada continuou indisponível
segundo o operador.

A **PR #26** foi integrada pelo merge `4310316be3ac3cf449fde975697a869e2529fb53`, testes
**2.070 Node + 67 Python** na branch (run `40570346863`) e no main
(run `40570582583`). Check-runs Cloudflare de App/Auth/Finance foram
**SUCCESS**. Isso comprova a validação e builds, não a execução de sessão
autenticada no dispositivo.

Nova página `https://app.brazacommerce.com.br/admin/diagnostics`:
funciona separadamente do painel principal, exige cookie de proprietário e
permite **Copiar diagnóstico**. `GET /api/admin/diagnostics` confirma a
sessão e faz somente `SELECT 1 AS ok` com prazo de 3,5s, sem esquema,
gravações nem provedores. A página verifica também a presença do HTML de
Agentes e a **rota financeira já existente**, `business-month-view-v4`,
que por sua vez pode executar manutenção normal de esquema/cache; nenhuma
nova ação comercial é criada. O relatório contém somente estados HTTP,
códigos seguros, booleanos de HTML, duração, mês e marcador do release.

**Próximo passo obrigatório:** receber JSON com esquema
`mls_owner_panel_report_v1` e comparar `owner_probe.d1` com
`finance_month.http/error`. Nada de supor bloqueio do D1 ou erro de frontend
sem observar esses campos. Não alterar credenciais Shopee, chaves, D1 ou custos.

Se o link direto redirecionar para login, autenticar como proprietário e usar
o link estático "Diagnosticar carregamento" do topo do Admin, no mesmo
navegador; abrir um link cross-site pode não enviar cookie SameSite=Strict na
primeira navegação. Caso o JavaScript do diagnóstico também falhe, enviar
somente a tela de diagnóstico, sem credenciais.


## Incidente P1 — causa JS reproduzida e corrigida pela PR #28 (27/10/2026)

A investigação em **Chromium real** encontrou dois erros que os testes anteriores
de HTML/VM não detectavam:

1. `Cannot read properties of null (reading 'expense_schedule')`:
   `buildMlsAgentRegistry` permitia `undefined === undefined` quando o
   snapshot mensal ainda não existia e tentava acessar `month.expense_schedule`.
2. `Invalid regular expression` durante a inicialização: bytes de controle
   incluídos no JavaScript inline eram processados pelo tokenizer HTML, que
   substitui U+0000 por U+FFFD, destruindo a ordem de um range de regex e
   impedindo outros scripts de iniciarem.

A **PR #28** (merge `6ea975e13694f094bba034103b7572d30b07e308`) adicionou o guard de `month` antes de
consultar despesas e codifica caracteres de controle não imprimíveis no HTML
do Admin como escapes JavaScript antes de enviá-los ao navegador.

Validação: CI PR `40576473744`, CI `main` `40576723167`,
**2.073 testes Node, 0 falhas + 67 Python**. Teste Chromium real com
consulta financeira simulada em HTTP 503: registry instalado, seis agentes
hidratados, zero placeholders remanescentes, valor diário indisponível
sem inventar lucro, **zero erros de JavaScript**. Build checks Cloudflare
App/Auth/Finance concluídos **SUCCESS**.

Limites: o teste simula sessão de proprietário e não lê a conta privada;
a conexão da rota mensal em produção continua sem evidência do operador.
**Não afirmar ainda que lucro diário, repasses ou D1 estejam funcionando**.
Se a página voltar a hidratar agentes mas os números permanecerem em branco,
usar `/admin/diagnostics` para obter `owner_probe` e `finance_month`.
Nenhuma autorização da Shopee, orçamento Ads, dado persistido ou Worker Auth/
Finance foi alterado pela correção.
