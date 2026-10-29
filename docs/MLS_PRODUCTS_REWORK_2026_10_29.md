# MLS Commerce OS — rework do painel Produtos (29/10/2026)

**Status:** [PR #72](https://github.com/MatheusLemosDS/MLS-Ecommerce-Ads/pull/72), **DRAFT**, branch `design/mission-control-products-rework-20261029`, derivada da `main`. **Sem merge nem deploy.** Issue principal: #70.

## Objetivo de produto

Organizar a área Produtos em uma sequência compreensível para o operador: catálogo salvo e seus estados, custos e vínculos avançados, preparação local de anúncios (ainda não publicada) e inteligência de preços M3 (Observer ainda em revisão). Não reinventar recursos publicados nem afirmar que módulos em PR estão disponíveis na loja.

## O que foi implementado

- O `savedCatalogBody()` acrescenta um hub executivo antes do catálogo, com CTA para catálogo atual e custos de produção.
- Quatro cartões distinguem: **01 Cadastro salvo** (disponível), **02 Custos e vínculos** (disponível), **03 Fábrica de Anúncios V3.6** (homologação em PR #68) e **04 MLS Pricing** (Observer em PR #47).
- Avisos de semântica: produto cadastrado **não** é estoque vendável; unidades vendidas não são pedidos únicos; custo de produção não comprova lucro; rascunho de anúncio não equivale a publicação.
- Layout responsivo e estilos claro/escuro escopados `.mls-products-hub`; `savedCatalog`, `legacyProductEditor`, formulário, botões, campos, handlers e cobertura existentes são preservados.
- Nenhuma nova fonte de dados ou script; o `SAVED_CATALOG_CLIENT` foi preservado.

## Segurança e integração

- Sem novas chamadas à Shopee, sem upload, preço ou Ads/PROMO write; não modifica Auth, Finance, D1, OAuth, cron, custos financeiros, headers nem reservas DTF.
- A versão principal não inclui a Fábrica de Anúncios. Essa função está codificada em branches separadas (#63 → #65 → #68), e o controle de ativação ainda não foi implantado.
- Esta PR altera o HTML/CSS de `web/cloudflare/src/saved-catalog-view.mjs`; esse módulo também evoluiu na integração V3.6. Ao conciliar, preservar **ambas** as correções e reexecutar a QA no HEAD integrado, sem sobrescrever o código de catálogo da V3.6.
- O CI testa markup compilado normal/minificado, IDs únicos, links funcionais, Chrome 1365×900 e 390×844 e ausência de overflow. O navegador de QA usa conta fictícia, sem provider.
- `main` não recebe esta PR até aprovação e estratégia única de merge, com rollback preparado.

## Gates de conclusão

- [ ] CI Node + 67 Python + Chrome + builds App/Auth/Finance verde no SHA exato.
- [ ] Registrar o hash App revisado sem remover nenhuma entrada anterior; confirmar Auth e Finance idênticos.
- [ ] Inspecionar capturas do painel e homologar visualmente com a sessão do proprietário.
- [ ] Planejar a integração com PR #68 (V3.6), #69 (Roadmap) e #71 (Agentes) sem merges simultâneos, conflitos ou deploy automatizado.
- [ ] Aprovação explícita para merge/deploy; Ads/PROMO permanece LOCKED.

Próximo painel da sequência: **Produção**, seguindo [issue #70](https://github.com/MatheusLemosDS/MLS-Ecommerce-Ads/issues/70).
