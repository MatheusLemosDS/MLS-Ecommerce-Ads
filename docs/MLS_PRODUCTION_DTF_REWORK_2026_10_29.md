# MLS Commerce OS — Rework do painel Produção DTF (29/10/2026)

**Estado:** PR DRAFT em branch `design/mission-control-production-rework-20261029`, derivada da `main`. **Não implementada em produção e não autorizada para merge/deploy.**

## Escopo visual

A área Produção já tem o fluxo operacional DTF. Este incremento **não reimplementa** a fila, o montador de folhas, armazenamento local, o controle de reservas, a verificação de cancelamentos ou as exportações. Apenas apresenta o fluxo de forma mais clara e com navegação segura por âncoras.

Cinco etapas, preservando os controles originais:

1. **Fila:** pedidos e linhas da fila persistida, seleção, paginação, atualização e estados `PENDING/RESERVED/PRODUCED/BLOCKED`.
2. **Artes:** PNGs por SKU salvos **neste dispositivo/navegador**, com validação e associação já existentes. Não prometer sincronização de imagens entre PCs.
3. **Filme:** largura útil declarada originalmente de 57 cm, comprimento máximo, margens, intervalo, DPI e rotação — mesmos campos e persistência.
4. **Prévia:** montagem de folhas conforme motor aprovado, sem distorcer proporções. `dtfPreviewButton` e `dtfPrepare` preservados.
5. **Lotes:** lotes persistidos na conta, download, revalidação da reserva/pedido e marcação posterior de produção.

Foram acrescentados cabeçalho executivo, cinco cards navegáveis, nota de diferença **conta vs. dispositivo**, títulos por etapa, tipografia e CSS responsivos. Não foram adicionadas APIs, formulários, coletores, timers ou eventos de escrita. Os estados da fila continuam dinâmicos e dados ausentes não recebem números fictícios.

## Segurança e limites

- A biblioteca de PNG da produção fica no navegador/dispositivo, não na conta online. A fila e os lotes estão na conta.
- Cancelamentos e reservas preexistentes continuam impedindo duplicação de peças. A exportação revalida a informação do pedido antes de disponibilizar arquivos.
- Baixar PNG do lote **não** publica anúncio, altera preço/estoque ou dispara campanha.
- O montador DTF, incluindo o código de `DTF_CLIENT` e `DTF_ENGINE_CLIENT`, continua inalterado. **Não alterar este motor durante o rework.**
- Preserve Auth, Financeiro, D1, OAuth, cron, Worker IDs, bindings, status da Shopee e as proteções Ads/PROMO LOCKED.
- Mesmo com CI verde, NÃO classificar a interface como homologada pelo proprietário ou publicada.

## Engenharia e integração

- Arquivo visual: `web/cloudflare/src/dtf-view.mjs`, apenas HTML/CSS.
- A UI DTF permanece na rota autenticada `/admin?tab=production` e mantém todos os IDs/formulários originais.
- Branch visual baseada na `main`, paralela ao roadmap #69, agentes #71, produtos #72 e release V3.6 #63/#65/#68.
- QA sintética: Chrome 1365×900 e 390×844, tema escuro, capturas do cabeçalho, etapas, fila e biblioteca. Stubs `/api/` retornam 503 e não acessam a conta real.
- Build gerado dos três Workers e comparação de hash; novo App só entra na allowlist por SHA exato após revisão, Auth/Finance devem manter hashes.
- **Antes de integrar** esta mudança com outras PRs visuais e o release V3.6, revalidar os mesmos fontes contra `main` atualizado e executar CI completo da união. Não mesclar PRs paralelas simultaneamente.

## Gates de release

- [ ] CI Node + Python + Chrome + build dos três Workers verde no HEAD exato.
- [ ] Inspecionar as capturas sintéticas e conferir ausência de overflow em 390 px e 1365 px.
- [ ] QA autenticada com filas reais autorizadas e arquivos locais, sem compartilhar pedidos, buyer data ou artes privadas.
- [ ] Registrar versão atual e rollback do App antes de qualquer merge/deploy Cloudflare.
- [ ] Aprovação explícita do proprietário. Não alterar Shopee/Ads/PROMO.

Próxima trilha de rework: **Ads e Automação**, conforme [issue #70](https://github.com/MatheusLemosDS/MLS-Ecommerce-Ads/issues/70). M2 Finance continua aberta na issue #50.
