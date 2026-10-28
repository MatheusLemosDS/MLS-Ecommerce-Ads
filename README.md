# MLS Commerce OS — App, Auth e Financeiro

Repositório do **MLS Commerce OS** para os três Workers Cloudflare. Cada Worker tem build e deploy
próprios; o Cloudflare acompanha a branch `main` após a configuração inicial.

O App e o Auth existentes serão ligados ao Git. O Financeiro é um projeto novo.
O código inclui o painel v11 e a conexão financeira preparada. Não há publicação
automática configurada por este commit nem conexão financeira real confirmada.

```bash
npm ci
npm test
npm run build
```

As versões Node e Wrangler estão fixadas. Os arquivos `dist/*-worker.mjs` são
gerados a partir das fontes e não devem ser editados manualmente.

Antes de publicar, importar a configuração real dos Workers existentes e
configurar o D1 exclusivo do Financeiro. `npm run validate:deploy` informa o que
falta e recusa o deploy enquanto esses arquivos não existirem.

O primeiro vínculo dos Workers existentes pode usar `capture:app`/`capture:auth`
para ler e devolver sua configuração sem publicar. Isso permite preparar os
arquivos do Git a partir do próprio Build Cloudflare, sem instalar ferramentas
no computador nem enviar tokens no chat.

Guia completo: [Publicação pelo Git](docs/PUBLICACAO_PELO_GIT.md).
Configuração financeira: [Financeiro](web/finance/DEPLOY.md).

Segredos continuam no Cloudflare. Arquivos de credenciais, bancos, logs e
entregas antigas ficam fora do Git. O fluxo de Ads permanece LOCKED.


## Identidade e continuidade

A marca oficial do produto é **MLS Commerce OS**. Os nomes técnicos `brazacommerce-*`, domínio, bindings, rotas e contratos antigos permanecem temporariamente como aliases de compatibilidade e não devem ser renomeados sem uma migração específica.

Roadmap canônico: [MLS Commerce OS](docs/ROADMAP_MLS_COMMERCE_OS.md).  
Checkpoint para retomada: [MLS_COMMERCE_OS_CHECKPOINT.json](docs/MLS_COMMERCE_OS_CHECKPOINT.json).

Continuidade entre ChatGPT e Codex: [AGENTS.md](AGENTS.md) · [Handoff técnico](docs/MLS_CODEX_HANDOFF_2026_10_28.md) · [Pesquisa Shopee](docs/SHOPEE_RESEARCH_TO_MLS_2026_10_28.md) · [Listing Factory local](docs/MLS_LISTING_FACTORY_V1.md). A PR #51 introduz módulos **sem rede nem publicação na Shopee**; M2 permanece aberta e PRs #47/#48 seguem isoladas.

