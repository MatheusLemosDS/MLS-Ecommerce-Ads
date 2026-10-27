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
