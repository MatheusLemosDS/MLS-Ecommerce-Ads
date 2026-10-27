# Codex handoff — MLS Commerce OS Mission Control V3 (27/10/2026)

## Prioridade e fonte da verdade
**Referência visual aprovada:** PRIMEIRA imagem da última mensagem do operador no ChatGPT (montagem com cockpit superior e seis painéis neon completos). As outras três imagens são capturas do estado real e demonstram lacunas, não são referência de desenho. Não presumir que os PNGs estão presentes no repositório: solicitar/anexar ao Codex ou trabalhar com a descrição abaixo e validar com o operador.

Antes de editar, ler nesta ordem:
1. `docs/ROADMAP_MLS_COMMERCE_OS.md` (canônico).
2. `docs/MLS_COMMERCE_OS_CHECKPOINT.json` (fase M2 em andamento).
3. `docs/MISSION_CONTROL_V2_VISUAL_GUIDE.md`.
4. `docs/M2_FINANCIAL_TRENDS_REAL_DATA.md`.
5. Código, testes e estilos atuais. Não reimplementar funcionalidade existente.

Base verificada: main commit `60c1aed4ef929f544a3d656bc94f7130b0a1a006` após PR #32. Na abertura, comparar HEAD para não sobrepor trabalho posterior. Branch de documentação: `codex/mission-control-v3-visual-parity-handoff`. Criar branch de implementação **a partir da main atual** depois de confirmar divergências e executar testes iniciais. Não publicar sem revisão.

## O que há / o que falta
- PR #31 entregou design orbital neon V2; PR #32 entregou séries **reais de até 14 dias** em Visão Geral, Finance e Ads, quando a memória validada possui dias elegíveis. Não declarar estes gráficos inexistentes só por um estado vazio no screenshot.
- O operador rejeitou o V2 como ainda distante da referência: hero alto demais, excesso de espaço vazio, densidade desigual, cartões genéricos, mais seções recolhíveis e links repetidos que painéis úteis, ausência de gráficos pertinentes para Products, Production, Returns, Auditor, navegação ruim/duplicada.
- Screenshots reais mostram mensagem “Histórico diário ainda indisponível” em Finance/Overview: rastrear contrato e cobertura de snapshots **sem fabricar pontos**; exibir empty state compacto explicando quais dias estão disponíveis, última atualização e alternativa de detalhamento, se já existirem esses metadados.

## Design system obrigatório — Opção 3 Neon Tech
- Dark navy profundo, superfícies glass discretas, bordas neon finas, brilho suave (sem ofuscar), fonte com hierarquia moderna, labels legíveis. Sidebar fixa ~200–230px; header fino com busca/contexto/status quando funcional; conteúdo responsivo sem rolagem horizontal.
- Desktop: Visão Geral em 1 viewport útil na dobra: título compacto + 4 a 6 KPI cards alinhados, sparklines reais apenas quando existentes, Hermes compacto à direita ou card de prioridades; abaixo grid de **seis cards de agentes** (Finance verde menta, Ads laranja, Products azul, Production roxo, Returns vermelho/coral, Auditor ciano). Cada card é um link **inteiro**, com status e minissinalizadores; não duplicar CTA 'abrir painel'.
- Clique em agente abre **workspace independente** via `/admin?tab=agent-*`, não modal nem todas as seções na mesma página.
- Cada workspace: header do agente compacto (avatar neon, nome, descrição, status), indicadores 3–4 colunas, 1–2 gráficos funcionais proporcionais, 1 tabela/atividade contextual, única área de prioridades e **um** caminho para ferramentas antigas. Informações profundas em tabs internas ou drill-down, não dezenas de blocos repetidos.
- Não repetir link `Visão geral`, `Ferramentas`, `Relatórios` e `Voltar` em cada bloco. Sidebar global resolve navegação geral; breadcrumb leve resolve volta; ações ficam somente na seção contextual.
- Metas visuais: a referência possui gráficos com eixos legíveis, barras/linhas, donut, positivos verdes e negativos vermelhos, ícones diferenciados, uso eficiente de espaço. **Paridade de linguagem e distribuição, não copiar números fictícios da referência.**

## Domínio e componentes
- Shared primitives a extrair somente quando reduzirem duplicação: `AgentWorkspaceLayout`, `AgentKpiCard`, `DeltaIndicator`, `EmptySeriesState`, `PanelChartShell`, `AgentStatusChip`, `ActionList`, `AgentNavigation` — adaptar aos padrões e framework reais identificados no repo; não assumir React.
- Central de Agentes = hub com 6 especialidades + Hermes. Hermes deve ser supervisor, não card de operação financeira adicional.
- Finance: série diária existente + resultados mensal/diário, pending e conciliação em área específica. Preservar distinção valor estimado ≠ banco, valores parciais e “—”.
- Ads: investimento e receita atribuída apenas com base compatível; ROAS/TACOS se comprovados, nunca estimar a partir de gasto. Gráfico existente por dia e tabela real de campanhas se contratos já permitem.
- Products: distribuição ABC e margens por produto **apenas se custo e vendas atribuíveis**; caso contrário, mostrar cobertura de custos e ações para dados ausentes, e não donuts fictícios.
- Production: pedidos em fila/status e throughput por dia/hora somente se timestamps/snapshots reais persistidos; nenhum gráfico artificial.
- Returns: estados dos pedidos, motivo, reembolso e tendência temporal somente se houver fonte compatível; zero versus desconhecido distintos.
- Auditor: alertas por severidade, verificações e trilha de auditoria somente das evidências existentes.
- Em todos: gráficos e tendências disponíveis só quando a fonte suportar; preservar todos os controles/rotas existentes, inclusive DTF, catálogo e financeiro.

## Regra de números e cores
- Resultado estimado positivo = verde, negativo = vermelho, zero = neutro; despesas maiores = âmbar, redução de gasto = azul/neutro, sem inferir performance.
- Delta exige dias consecutivos, completos e válidos, conforme contrato PR #32; mostrar datas; percentual indisponível se base zero; margem em **pontos percentuais**.
- `null`, zero, `PARTIAL_COSTS`, `KNOWN_COSTS`, `OPERATIONAL` e falha de fonte continuam distintos; não mascarar ausência de histórico.
- Nunca criar chamadas extras à Shopee, endpoints, D1 queries, polling, jobs ou custo monetário apenas para alimentar gráficos sem autorização específica.

## Auditoria de UI requerida antes de implementar
1. Inventariar tabs/rotas, navegação, botões, IDs e listeners. Mapear botão -> ação -> destino. Sinalizar botões duplicados, órfãos, sobrepostos e áreas com informação redundante.
2. Identificar módulos de chart/séries PR #32 e se os estados vazios advêm de falta de snapshots, filtro temporal, hidratação, timezone ou contrato de dados. Não alterar o provider sem evidência.
3. Capturar screenshot Chromium real **desktop 1440x900** e **mobile 390x844** de Visão Geral, Agents e 7 workspaces, com fixtures sintéticas isoladas para testar aparência e estados vazio/parcial/negativo. Testar autenticado de verdade apenas no contexto seguro do operador.
4. Planejar mudança de componentes/styling sem romper roteamento ou contratos já publicados.
5. Implementar incrementalmente e revisar a paridade com a imagem aprovada.

## Critérios de aceite verificáveis
- [ ] Primeira dobra do overview: KPIs + cards de agentes bem distribuídos; hero compacto; sem painel gigante vazio.
- [ ] Cada um dos sete workspaces abre por URL profunda e retorna corretamente; cards inteiros clicáveis; teclado/foco visível.
- [ ] Sem botões duplicados/inertes, IDs duplicados, controles sobrepostos, conteúdo cortado ou tabs que perdem estado indevidamente.
- [ ] Estados: dados completos, 0 real, ausência, parcial, erro, valores negativos, carregamento e responsivo — visualizados em Chromium.
- [ ] Finance/Ads exibem série PR #32 onde ela existe; ausência mostra aviso contextual compacto, **nunca** linhas inventadas.
- [ ] Gráficos adicionais apenas se dados existentes os sustentarem; documentar cada fonte ou motivo de bloqueio.
- [ ] Redução de altura excessiva, navegação mais curta, sem scroll horizontal desktop/mobile; `prefers-reduced-motion`, light/dark e acessibilidade preservados.
- [ ] Tests Node/Python, lint/build, browser E2E e integridade SHA existentes passando. Conferir App/Auth/Finance em CI **sem publicar**.
- [ ] Atualizar guia visual e checkpoint com arquivos alterados, resultados CI, limitações e PR de implementação.

## Limites inegociáveis
**Fase principal permanece M2 Finance/Returns.** Validar Pending no Seller Centre antes de declarar conciliação concluída. M3 Products/Pricing continua bloqueado pelo gate financeiro. Ads/PROMO LOCKED; agentes OBSERVER. Não mexer em OAuth, Worker Auth/Finance, D1, migração/schemas, secret, integração Shopee, regra de lucro, cron, rastreio de produtos de outros projetos, MC Print ou MLS DTF desktop. Nunca alterar `dist` manualmente nem fazer deploy ou merge automático.

## Entregáveis do Codex
1. Auditoria concreta de duplicação com caminhos/linhas e mapa de telas.
2. Branch/PR pequeno(s) de interface V3, com screenshots antes/depois e evidências de cada critério.
3. Matriz por agente: widgets disponíveis, origem dos dados, widgets bloqueados por falta de evidência.
4. CI verde e documentação de continuidade; ao terminar cada lote indicar próximo passo objetivo.
