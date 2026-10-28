# MLS Commerce OS — Mission Control V3.5: navegação e proveniência (28/10/2026)

## Base e limites
Branch de implementação baseada na `main` após PR #43, commit `3965552ba3f957d01a758b065adae320802b4feb`. A coleta financeira do dia 28/10 reapareceu no painel do operador (lucro diário, vendas, investimento Ads, margem e pedidos), mas essa imagem isolada não prova continuidade da coleta automática. Manter intactos Finance/Auth, OAuth Shopee, schedules, D1, cálculo de lucro, regras de M2/Pending e Ads/PROMO LOCKED.

## Entrega V3.5
- Busca global **de navegação**, no topo da página autenticada, com botão visível em desktop e ícone no celular. `Ctrl+K`, `Cmd+K` e `/` fora de campos de edição abrem; `Esc` fecha; setas e Enter selecionam destinos. Entrada de teclado não interfere em formulários.
- Busca usa somente lista fixa de **23 rotas já existentes** (Visão Geral, Central dos Agentes, sete especialidades, catálogo, produção, custos, Hermes, histórico, roadmap, Pending, conciliação, liberações, Ads, campanhas, automação, integrações e diagnóstico). Destinos de abas internas preservam `/admin?tab=...`; ligações externas continuam nas rotas aprovadas. Sem consulta por SKU ou pedido: a interface diz expressamente que a busca é de navegação.
- Painel acessível via diálogo com encerramento por Escape, botão e clique no fundo; restauração de foco; teclado; resultados montados com `textContent` e `createElement`, nunca `innerHTML`.
- Proveniência/atualização dos dados passa ao cabeçalho do workspace. Catálogo usa seu timestamp; fila DTF não finge ter timestamp individual; custo do período usa sua referência; demais áreas indicam a referência financeira mensal. Remove a cópia do timestamp no final de Prioridades.
- Redução de espaço das subtabs e estado vazio de prioridades mais claro. Todos os IDs, contratos e ferramentas antigas preservados.

## Testes e publicação
- `web/cloudflare/tests/workspace-navigation.test.mjs`: IDs únicos, rotas de busca, controles, fonte sem fetch/segredos.
- `web/cloudflare/tests/mission-control.test.mjs`: proveniência na posição correta e identificadores reais de catálogo, DTF e mensal.
- `web/cloudflare/tests/browser-owner-chrome.test.mjs`: busca `dtf` no Chromium junto às fixtures de catálogo e fila.
- Exigir Node, Python, Chromium, geração dos três Workers e registro do **SHA-256 exato** do App antes de merge. Aprovado no CI não comprova layout autenticado em produção, que deverá ser conferido em desktop e celular.
- Não publicar automaticamente sem CI verde. Não alterar Worker Auth/Finance.

## Próximas fases
- Reorganização específica dos workspaces restantes (Finance, Ads, Returns, Auditor), evitando duplicações entre atalhos e áreas legadas.
- Busca de registros reais por pedido/SKU/anúncio somente depois de contratos de consulta validados e guardrails de autorização/paginação/privacidade; não induzir usuário a crer que V3.5 já os indexa.
- Validação de teclado, legibilidade e responsive no navegador autenticado real; status de deploy Cloudflare separado do merge GitHub.
- Checkpoints M2 financeiros e Pending do Seller Centre continuam gate do M3 Pricing.
