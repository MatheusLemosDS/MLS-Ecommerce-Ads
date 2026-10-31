# MLS Commerce OS — Integração para homologação do proprietário

**Data:** 29/10/2026  
**Candidato:** [PR #75](https://github.com/MatheusLemosDS/MLS-Ecommerce-Ads/pull/75) · `integration/mls-approved-ui-v36-owner-gated-20261029`  
**Base:** PR #68 (V3.6 owner-only). A PR #74 foi reconciliada nessa branch.  
**Estado:** **DRAFT — NÃO MERGE / NÃO DEPLOY / NÃO ATIVAR SHOPEE WRITE**.

## Conteúdo entregue para QA

- Design aprovado: Plano de Evolução (#69), hub Agentes (#71), Produtos (#72), Produção DTF (#73), Visão Geral, sete especialistas, Ads Dashboard, Campanhas, Automação/Optimization, Conexões, Finance, Returns, Auditor, Hermes, Custos e Histórico.
- Mesma identidade visual: dark azul-marinho, brilho sutil, Finance verde, Ads laranja, Products azul, Production roxo, Returns vermelho e Auditor ciano; mini navegação interna, layout 1365×900 e 390×844.
- Busca V3.6 e Fábrica de Anúncios **local**: filtragem explícita de produtos salvos e fila DTF, mockups e rascunhos; nenhuma publicação Shopee.
- Feature gate `MLS_V36_OWNER_PREVIEW` **OFF por padrão**; somente `ENABLED` exato e sessão de proprietário exibem Listing Factory e escopos avançados. A interface anterior e os módulos de leitura permanecem quando OFF.

## Resolução dos conflitos das duas trilhas

| Arquivo | Conteúdo preservado |
| --- | --- |
| `admin-view.mjs` | Design global/roadmap da PR #74 e DOM/CSS exatos dos escopos da busca V3.6 |
| `dtf-view.mjs` | Fluxo visual de 5 etapas e `searchLines/findLine` na fila local salva |
| `saved-catalog-view.mjs` | Hub visual Produtos e `find()` do catálogo persistido |
| `build.py` | Planner do Listing Factory e injeção única do CSS aprovado no Worker App |
| `admin.mjs`, `admin-client.mjs` | Gate owner da PR #68, sem alterações nesta integração |
| `ads-workspace-view.mjs`, `mission-control.mjs` | Visual aprovado, observação e navegação existentes |

## Testes

- A mesma suíte Node, 67 testes Python e builds dos três Workers continuam obrigatórios.
- Chrome sintético: telas desktop e mobile com contas fictícias; o roteiro do design usa OFF por padrão; testes específicos V3.6 ON permanecem.
- `mls-v36-approved-integration-gates.test.mjs` verifica os métodos de busca de fonte salva, navegação visual, IDs únicos, CSS e modos compilados OFF/ON.
- Hash App alterado pela união deve ser registrado **exatamente**, sem excluir nenhum SHA anterior. Auth/Finance devem permanecer idênticos.
- A CI sintética **não prova** autorização real, contabilização financeira, estoque, dados Ads, upload válido pela Shopee ou publicação.

## Sequência de liberação (apenas após aprovação explícita)

1. CI verde no **HEAD final** da PR #75.
2. Revisão de segurança dos diffs, hashes, testes e capturas; congelar apenas este candidato, sem paralisar branches futuras.
3. Homologação autenticada do proprietário no ambiente seguro, incluindo abas, navegação, 390 px, filtros, kits DTF, reanexação de mockups, exportação JSON local e erros de conexão. Nenhum write comercial.
4. Revisar deploy automático da `main` no Cloudflare. Registrar versão anterior do App, bindings/variáveis, rollback testável, checks Auth e Finance. Primeiro deploy **sem** variável `MLS_V36_OWNER_PREVIEW` (OFF).
5. Com o App antigo verificado após deploy e o controle de flag confirmado, ativar `ENABLED` para proprietário somente depois de nova autorização, confirmar a versão implantada e manter Shopee/Ads/PROMO bloqueados.
6. Em caso de regressão, desligar a flag e confirmar versão efetiva; se atingir a interface antiga, reverter o **App** para a versão anterior. Não modificar Auth ou Finance para tratar um problema visual.

### Não fazer

- Não mesclar as PRs #63/#65/#68 e #69/#71/#72/#73/#74 em paralelo se a PR #75 for a trilha escolhida.
- Não usar números do mockup como dados da loja.
- Não publicar anúncios nem alterar preço, estoque, orçamento, promoção ou permissões durante QA.
- Não afirmar que M2 Finance (#50) está conciliado.
- Não criar telas de Notificações/Relatórios ou agentes de execução sem backend/contratos reais.

### Rastreabilidade
- [Gate da V3.6 — issue #67](https://github.com/MatheusLemosDS/MLS-Ecommerce-Ads/issues/67)
- [Rework dos painéis — issue #70](https://github.com/MatheusLemosDS/MLS-Ecommerce-Ads/issues/70)
- [Design aprovado — PR #74](https://github.com/MatheusLemosDS/MLS-Ecommerce-Ads/pull/74)
- [Controle de ativação — PR #68](https://github.com/MatheusLemosDS/MLS-Ecommerce-Ads/pull/68)
