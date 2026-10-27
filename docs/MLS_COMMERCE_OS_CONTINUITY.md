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

## Estado técnico de partida

Base publicada anterior: PR #10 / merge
`9c418fd3010f46957d1ce52345baacd76041c788`.

Conversão M0 iniciada na branch:
`chatgpt/mls-commerce-os-branding-roadmap-20261027`.

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

## Próxima implementação após M0

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
