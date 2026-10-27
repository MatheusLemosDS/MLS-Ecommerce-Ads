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
