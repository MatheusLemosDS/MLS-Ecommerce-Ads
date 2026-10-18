# BrazaCommerce — App, Auth e Financeiro

Um repositório para os três Workers Cloudflare. Cada Worker tem build e deploy
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

Guia completo: [Publicação pelo Git](docs/PUBLICACAO_PELO_GIT.md).
Configuração financeira: [Financeiro](web/finance/DEPLOY.md).

Segredos continuam no Cloudflare. Arquivos de credenciais, bancos, logs e
entregas antigas ficam fora do Git. O fluxo de Ads permanece LOCKED.
