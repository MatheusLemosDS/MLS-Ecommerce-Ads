# MLS Commerce OS — rework do painel Agentes (29/10/2026)

**Status:** PR #71 **DRAFT** sobre `main`; trabalho visual isolado, **sem merge nem deploy**. Relacionado à issue #70 e independente da PR #69 (Plano de Evolução) e das PRs #63/#65/#68 (V3.6).

## Por que mudar

A lista de especialistas já oferecia sete acessos, mas não concentrava as prioridades do Agent Registry nem distinguia claramente o estado de um agente da rentabilidade da loja. O objetivo é tornar a tela **Agentes** um painel operacional mais legível, sem alterar a fonte financeira ou liberar ações.

## O que foi codificado

- Cabeçalho executivo com MLS Hermes, links internos, status geral e aviso explícito de `Modo Observador`.
- Quatro resumos: sete especialistas configurados, atenção/bloqueio, acompanhamento e prioridades. Exceto o número fixo de especialistas, todos são derivados do `mls_agent_registry_v1`; sem snapshot válido, o número é `—`, nunca um zero inventado.
- Fila visual das até quatro primeiras prioridades do mesmo registro validado, renderizada apenas com `textContent`, navegação fixa para `/admin?tab=agent-<id>`. Nunca abre URL arbitrária vinda do registro.
- Busca local por nome, função ou área e filtros `Todos`, `Atenção/bloqueio`, `Em acompanhamento`, `Saudáveis`. A filtragem não altera tarefas nem chamadas de rede; botões preservam `aria-pressed`.
- Indicadores de status por especialista e contagem de prioridades do recorte; rótulo de horário é o da **projeção do registro**, não prova da idade das fontes.
- Cards responsivos e temas claro/escuro com CSS escopado `.mission-hub`, sem mudança nos módulos especialistas existentes.

## Segurança e semântica

- `HEALTHY` é condição operacional **do agente**, não lucro líquido, margem comprovada, estoque vendável, saldo bancário ou permissão de escrita.
- `WORKING`, `ATTENTION` e `BLOCKED` são projeções existentes. Não são eventos de execução na Shopee.
- Prioridades ausentes/contratos inválidos ficam indisponíveis e não são tratadas como concluídas.
- O cliente do Hub não executa `fetch`, timers periódicos, localStorage ou acesso à conta. A única fonte é o mesmo `MLS Agent Registry` publicado anteriormente.
- Não modifica Financeiro/Auth, D1, OAuth, cron, rotas, Shopee, Ads/PROMO, preços, margens ou estoque.

## QA e aprovação

- Testes puros: identidade dos sete especialistas, proteção contra HTML e URL maliciosos, flags de estado e filtros, dados desconhecidos = `—`.
- Testes Chrome reais com **conta e respostas sintéticas**, viewport 1365×900 e 390×844, tema escuro; capturas do cabeçalho, resumos e cartões. Não há imagens nem dados da loja.
- CI GitHub no HEAD exato deve incluir `npm test`, 67 testes Python e builds dos três Workers. Só adicionar hash App exato após revisar a versão produzida; Auth e Finance devem manter hashes anteriores.
- Capturas e verificação automatizada **não substituem homologação autenticada** do proprietário.
- Antes de qualquer release, reconciliar #71 com a PR #69 e a V3.6 aprovada **sem duplicar merges**, validar integração e obter aprovação para deploy/rollback.

## Próximos módulos de rework

1. Produtos — catálogo existente, fontes de custo e Fábrica local (quando habilitada), distinguindo dados verificados e planejados.
2. Produção — fila DTF, montagem, arquivos locais e estados de reserva.
3. Ads e Automação — métricas observadas e ações ainda bloqueadas.

Fluxo rastreado em [issue #70](https://github.com/MatheusLemosDS/MLS-Ecommerce-Ads/issues/70). Plano canônico: [ROADMAP_MLS_COMMERCE_OS.md](ROADMAP_MLS_COMMERCE_OS.md).
