# MLS Commerce OS — Design visual aprovado · Integração dos painéis (29/10/2026)

**Candidato visual completo das seções existentes. Sem merge e sem deploy.**

## Referência aprovada

Mockup fornecido pelo proprietário em 29/10/2026: shell azul-marinho quase preto, navegação lateral e topbar fixa, cards de KPI com brilho sutil e cores próprias por agente, gráficos baseados em dados, mini-navegação interna, hierarquia resumida e responsividade.

**Design system oficial em código:** `web/cloudflare/src/approved-design-system.mjs` (`MLS_APPROVED_DESIGN_CSS`). Não criar novos temas por painel; reutilizar a mesma paleta e a mesma hierarquia.

| Área | Cor de identidade | Dados permitidos |
| --- | --- | --- |
| MLS Finance | Verde | Pending, repasses e resultado apenas nas bases financeiras verificadas |
| MLS Ads | Laranja | Gasto, atribuição e ROAS quando a origem e o período são compatíveis |
| MLS Products | Azul | Cadastro salvo, custos e cobertura; sem inferir estoque ou lucro |
| MLS Production | Roxo | Pedidos/linhas DTF e lotes reais; biblioteca PNG continua no navegador |
| MLS Returns | Vermelho-rosa | Devoluções, ajustes e status realmente conhecidos; não prova reembolso bancário |
| MLS Auditor | Ciano | Conflitos, cobertura, alertas e evidências observadas |
| MLS Hermes | Azul-violeta | Supervisor em modo Observador; sem alterações comerciais automáticas |

## O que esta integração contém

- Plano de Evolução atualizado visualmente (candidato da PR #69).
- Hub dos Agentes com busca, filtros, prioridades e estado do Agent Registry (PR #71).
- Hub Produtos com catálogo/custos existentes e diferenciação de V3.6 Listing Factory ainda não publicada e M3 Pricing em PR (PR #72).
- Produção DTF organizada em Fila → Artes → Filme → Prévia → Lotes; sem tocar no montador e em reservas (PR #73).
- Shell principal, sidebar, topbar, estados, botões, cards KPI e relatórios com tokens visuais unificados.
- Seis KPIs principais da Visão Geral mantidos com **os campos reais** e o mesmo significado anterior; cores e faixas de contraste são decorativas.
- Os sete painéis de agentes recebem navegação funcional por âncoras: Visão Geral, Indicadores, Prioridades, Ferramentas e seções específicas existentes.
- Campanhas, Ads Dashboard, Automação/Optimization e Conexões passam a utilizar a mesma camada visual. Avisos de modo Observador e leitura apenas são explícitos.
- Finance, Returns, Auditor e Hermes preservam análises, gráficos e ações *já existentes*; a camada visual não cria gráficos com séries falsas.

## Limites — obrigatório

1. **Nunca** converter valores desconhecidos em zero, inventar vendas, lucro por SKU, estoque, ROAS, permissões Shopee ou histórico de auditoria.
2. **Não** ativar preço, estoque, anúncios, Ads/PROMO ou M6 por mudança de CSS/HTML. Todos continuam LOCKED.
3. **Não** mudar Finance/Auth, DB D1, OAuth, cron, exportação DTF, APIs ou identificadores existentes.
4. Fábrica de Anúncios V3.6 está em PRs #63/#65/#68, com flag OFF por padrão; esta integração visual baseada na `main` **não** publica a funcionalidade.
5. A navegação do mockup ilustrativo pode mencionar Relatórios, Notificações ou outros painéis não disponíveis como rotas completas. **Não criar páginas fictícias** para corresponder à imagem.
6. O mockup não é evidência de números de vendas, status ou permissões; todas as prévias em CI são sintéticas.
7. Nenhum deploy sem aprovação explícita do proprietário, estratégia de merge única, rollback do App e testes de QA autenticada.

## Arquitetura do rework

- `approved-design-system.mjs`: somente CSS, sem JavaScript cliente, fetch, eventos ou estado.
- `admin-view.mjs`: injeta tokens aprovados por último sobre o CSS legível existente.
- `ads-workspace-view.mjs`: aplica os mesmos tokens nas rotas Ads e exibe cabeçalhos seguros, sem alterar cálculos.
- `mission-control.mjs`: a navegação lateral interna é feita por âncoras para conteúdos já existentes, sem novos endpoints.
- Blocos já validados de `dtf-view.mjs` e `saved-catalog-view.mjs` são preservados em código de UI.
- Testes Node existentes não são removidos; CI limita a concorrência de arquivos para evitar timeouts Chrome, mantendo todos os globs Node, 67 testes Python e três builds.

## Critérios para considerar o pacote visual pronto

- [ ] CI verde no SHA exato da branch de integração, incluindo Node, Python, Chrome e App/Auth/Finance.
- [ ] Hash App exato revisado/adicionado sem afrouxar a allowlist; hashes Auth e Finance preservados.
- [ ] Compilação normal/minificada não duplica IDs nem perde formulários.
- [ ] Capturas sintéticas e inspeção de 15 seções em 1365×900 e 390×844 sem overflow.
- [ ] QA autenticada do proprietário, comparando visualmente com o mockup e testando ações legítimas no navegador.
- [ ] Reconciliar com a V3.6 #68, primeiro com flag OFF e sem ações externas.
- [ ] Planejar rollback/versionamento Cloudflare e obter aprovação explícita antes de qualquer merge e deploy.

A documentação desta branch **não substitui** o gate financeiro M2 (issue #50), a homologação #67 nem o planejamento de UI #70.
