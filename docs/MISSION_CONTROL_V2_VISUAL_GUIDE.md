# MLS Commerce OS — Mission Control V2 (Opção 3 aprovada)

## Motivo do refinamento

O operador rejeitou o primeiro redesign por ainda parecer o layout legado: cabeçalho discreto, seis cards uniformes e pouco contraste.
A opção 3 aprovada exige atmosfera futurista **legível e organizada**, com cores/neon controlados, Hermes como supervisor, cockpit na Visão Geral, acesso a sete workspaces individuais e conteúdo real, sem dados inventados.

## Direção implementada

- **Cockpit:** fundo azul-naval, vidro escuro, rings orbitais e identidade MLS, destaque para o Hermes. A arte orbital é decorativa, não atividade calculada.
- **KPIs do dia:** seis cartões em cores discretas, com brilho periférico e valores da mesma fonte validada que a Central anterior.
- **Agentes:** seis cards com efeito de avatar robótico em CSS, uma cor por especialidade, estado e link direto de painel; fallback mantém nome/status sem JavaScript.
- **Operação real:** comparativo em barras de três valores monetários do **mesmo dia** (vendas, lucro estimado e gasto Ads); usa apenas `mls_agent_registry_v1.day`. A escala é relativa ao maior valor positivo conhecido; um valor desconhecido não recebe barra, e não há série histórica fabricada.
- **Saúde da equipe:** contagem real de `HEALTHY`, `WORKING`, `ATTENTION` e `BLOCKED` para seis especialistas. O anel de saúde é a proporção de agentes HEALTHY, não percentual de lucro nem confiabilidade financeira.
- **Central de Agentes:** sete perfis (inclui MLS Hermes) com cores próprias e ícones CSS, click-through para seu painel.
- **Páginas independentes:** breadcrumbs, hero colorido por agente, avatar, quatro métricas existentes, prioridades, ferramentas e navegação para a seção. MLS Finance preserva seu bloco original de DTF/Financeiro e conciliação sem duplicar IDs.
- **Tema claro, mobile e acessibilidade:** contraste adaptado, duas colunas nos KPIs do celular, uma nos agentes em telas estreitas, foco visível e respeita `prefers-reduced-motion`.

## Agentes por cor

| Agente | Cor | Foco |
|---|---|---|
| MLS Finance | Verde menta | Repasses, Pending, despesas, conciliação |
| MLS Ads | Laranja | Gasto de anúncios e leitura de campanhas |
| MLS Products | Azul elétrico | Catálogo, custos, cobertura e produtos |
| MLS Production | Roxo | Pedidos, montagem DTF e custos |
| MLS Returns | Rosa/coral | Devoluções e reembolsos |
| MLS Auditor | Turquesa | Qualidade de dados e divergências |
| MLS Hermes | Azul-lilás | Prioridades e supervisão |

## Rotas preservadas

`/admin?tab=overview`, `/admin?tab=agents`, `/admin?tab=agent-finance`,
`/admin?tab=agent-ads`, `/admin?tab=agent-products`,
`/admin?tab=agent-production`, `/admin?tab=agent-returns`,
`/admin?tab=agent-auditor`, `/admin?tab=agent-hermes`.
Os módulos legados continuam acessíveis por suas rotas existentes.

## Limites funcionais e segurança

- O redesign **não** modifica o cron nem cria endpoints, consultas D1, OAuth, requests Shopee, execução de Ads/PROMO, HTML com dados pessoais ou segredos.
- Todos os agentes seguem `OBSERVER`. Ações comerciais continuam bloqueadas até o roadmap M6/M7.
- Não calcular ROAS por SKU, recebido em banco, lucro realizado, séries de tempo nem quantidades de estoque sem fontes compatíveis.
- Valores ausentes permanecem como `—`, barras de 0% e avisos explícitos.

## Validação exigida

1. Full CI (Node+Python, build App/Auth/Finance e SHA exato).
2. Chromium de verdade: seis cards dinâmicos sem placeholders após hidratação, nenhum erro JS, CSS calculado de gradientes/neon, barras vazias quando Finance indisponível.
3. Cloudflare Workers Builds App/Auth/Finance passando no SHA do merge.
4. **Validação humana autenticada desktop e celular** comparando opção 3, com screenshot se necessário.
5. O gate financeiro da fase M2 segue separado: Pending do Seller Centre, cursor se `has_more`, evidência bancária antes de lucro realizado.

A entrega estética é uma melhoria da M1 e **não** antecipa a fase M3.
