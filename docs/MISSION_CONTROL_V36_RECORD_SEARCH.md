# Mission Control V3.6 — Busca de registros reais (28/10/2026)

## Base e garantias
Iniciada da `main` no merge V3.5, commit `5877b185a074bc7357f80e98dc2ca965d398c6fd`. Preservar contratos Finance/Auth, OAuth Shopee, cron, D1, resultado financeiro, Hermes em OBSERVER e Ads/PROMO LOCKED.

## Implementado
- Busca no topo com três escopos explícitos: **Painéis**, **Produtos salvos** e **Pedidos na fila DTF**. `Ctrl/Cmd+K` e atalhos do V3.5 continuam válidos.
- **Produtos**: somente após Enter/clique em Pesquisar (mínimo 2 caracteres), GET autenticado do endpoint existente `/api/admin/product-registry?limit=8&offset=N&search=...&item_status=ACTIVE`, por `createAdminApiClient`. Resposta validada por `projectProductRegistryFrame`; página seguinte só por clique. Um produto selecionado abre `/admin?tab=products` e filtra o catálogo salvo por ID, mantendo variações e custos existentes.
- **DTF**: busca local na fila já salva em memória por pedido, SKU, ID do produto ou modelo, sem novas chamadas ao provedor. Mostra estado, SKU e quantidade, limitada a 8 resultados por página. Selecionar abre `/admin?tab=production` e filtra a fila pelo pedido.
- A busca de DTF **não é o histórico completo da Shopee**. Não declarar ausência de pedido quando a fila ainda não foi carregada. Catálogo em indexação também pode ser parcial.
- Recursos dos workspaces permanecem intactos; a busca não realiza escrita, não salva consultas, não recria conexão e não indexa dados sensíveis fora do painel administrativo.
- `missionSearchExecute` e `missionSearchMore` só disparam após ação explícita. Alterar escopo/consulta invalida resultados de requisições antigas.

## Critérios de aceitação
1. Testes Node, Python e Chromium completos, incluindo navegação, autenticação, página 1 (oito produtos), página 2 e um pedido da fila DTF.
2. Hash de origem `brazacommerce-app` exato em `tools/worker_project.mjs`, sem desativar validação dos três Workers.
3. Inspeção autenticada em desktop/mobile após Cloudflare publicar, separada do CI GitHub.
4. Comparar os horários/valores Finance com a fonte e monitorar a coleta que voltou a preencher os indicadores; **nenhuma alteração financeira no V3.6**.

## Futuro
Busca integral de pedidos fora da fila DTF requer contrato de leitura, autorização e paginação específicos, não uma consulta improvisada no front-end. Não substituir por dados simulados.
