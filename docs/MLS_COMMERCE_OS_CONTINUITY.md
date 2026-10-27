# Continuidade — MLS Commerce OS

Este arquivo é um handoff curto. O roadmap canônico é
[ROADMAP_MLS_COMMERCE_OS.md](ROADMAP_MLS_COMMERCE_OS.md).

## Decisões permanentes

- Nome oficial: **MLS Commerce OS**.
- MLS = iniciais do proprietário/projeto.
- **MLS Hermes** é o supervisor.
- Arquitetura: agentes especializados compartilhando a mesma base.
- Modos: Observer, Assisted e Autonomous limitado.
- Referência de UX: produto premium com especialistas em um só lugar, Central de Comando limpa e ações diretas; não copiar interface de terceiros literalmente.
- Ads/PROMO continuam **LOCKED**.
- Identificadores técnicos BrazaCommerce permanecem temporariamente por compatibilidade.

## Agentes definidos

MLS Finance, MLS Ads, MLS Pricing, MLS Products, MLS Production, MLS Creative,
MLS Inventory, MLS Marketplace, MLS Returns, MLS Auditor e MLS Hermes.

## Estado técnico atual

A conversão M0 foi **publicada** pela PR #11, merge
`3dab8f0be54d331bcded1fba4c09e9bfdf68256b`.

CI de `main`: run `40438431534`, sucesso. Produção confirmada nos três Workers:
App `688b04a0-22a3-4c1d-a1cd-e588c3fcc070`, Auth `e95cd942-5ea6-4151-a7e0-a46e0b37593c`, Finance `fadb9a57-8a9c-454e-a9c8-70b58528bc2f`.

Mudanças iniciadas:
- login e painel proprietário: MLS Commerce OS;
- navegação móvel: MLS Commerce OS;
- workspace de Ads: MLS Commerce OS;
- títulos públicos/logout: MLS Commerce OS;
- README e documentação: migração para identidade MLS;
- roadmap canônico e checkpoint.

## O que NÃO renomear nesta fase

Workers, D1, domínio, rotas, cookies, headers X-Braza, tabelas/schemas e contratos
persistidos. Primeiro branding; infraestrutura depois, com aliases.

## Ponto exato de retomada

**M1 — Central de Comando + Agent Registry somente leitura.**

Prioridade de agentes visíveis:
1. MLS Finance
2. MLS Ads
3. MLS Products
4. MLS Production
5. MLS Returns
6. MLS Auditor
7. MLS Hermes Supervisor

A Central de Comando deve usar dados já coletados; não criar polling ou chamadas
Shopee extras apenas para “animar” agentes.
