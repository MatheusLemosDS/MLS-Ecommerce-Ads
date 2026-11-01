# MLS Commerce OS — App, Auth e Financeiro

Repositório do **MLS Commerce OS** para os três Workers Cloudflare já ativos:
App, Auth e Financeiro. Cada Worker tem build e publicação próprios. A conexão
financeira e as leituras reais foram verificadas; isso não comprova liquidação
bancária nem encerra a conciliação M2.

**Última release verificada — PR #100, 01/11/2026:** App
`2b1d820a-fc1a-409a-9393-86e660458c42`, com associação confirmada pelo operador
entre peças recebidas e fabricação registrada. A compatibilidade de identidade,
data e limites cumulativos é conferida; a origem permanece declarada e as
quantidades originais continuam desconhecidas.
Inspeções de condição seguem permitidas e correções de origem exigem desvincular.
Auth `37bead27` e Finance `e0b258a2` foram preservados. O SHA-256 do App gerado é
`926e750890a31a00d1c25acd7bca1451f9faaa10fc882e0b667745fcba656106`;
bytes publicados, versões e configuração foram conferidos separadamente no
[registro da release](docs/MLS_M22_RETURN_MANUFACTURING_LINKS_2026_11_01.md). Passaram 3.143 testes Node e
67 Python, com D1 local Miniflare/workerd e Chromium normal/minificado 320/1365.

Os vínculos não comprovam peças serializadas, lucro ou valor de estoque. Os
controles internos PR98/99/100 continuam separados da integração financeira,
valoração e revenda. As proteções D1 persistem se o Worker for revertido;
desvincular exige código compatível, sem apagar histórico ou proteções.

As despesas de novembro ainda precisam ser declaradas. O saldo e a margem
parciais não substituem o resultado líquido completo. Seller Centre e banco
continuam sem comparação; **M2 permanece aberta**.

```bash
npm ci
npm test
npm run build
```

As versões Node e Wrangler estão fixadas. Os arquivos `dist/*-worker.mjs` são
gerados a partir das fontes e não devem ser editados manualmente.

CI aprovada e merge em `main` não comprovam publicação. Os checks externos
Cloudflare Workers Builds estão em falha, com causa ainda não confirmada;
o acesso disponível aos logs retorna 403/12004. A publicação controlada via
Wrangler foi validada por bytes, versões e configuração dos três Workers.
Conferir a release e os gates atuais antes de publicar qualquer atualização.

Guia de publicação e histórico da configuração inicial:
[Publicação dos Workers](docs/PUBLICACAO_PELO_GIT.md). A configuração financeira
inicial em [Financeiro](web/finance/DEPLOY.md) é referência histórica; não recriar
D1, segredos ou autorização para uma atualização normal.

Segredos continuam no Cloudflare. Arquivos de credenciais, bancos, logs e
entregas antigas ficam fora do Git. O fluxo de Ads permanece LOCKED.


## Identidade e continuidade

A marca oficial do produto é **MLS Commerce OS**. Os nomes técnicos `brazacommerce-*`, domínio, bindings, rotas e contratos antigos permanecem temporariamente como aliases de compatibilidade e não devem ser renomeados sem uma migração específica.

Roadmap canônico: [MLS Commerce OS](docs/ROADMAP_MLS_COMMERCE_OS.md).  
Checkpoint para retomada: [MLS_COMMERCE_OS_CHECKPOINT.json](docs/MLS_COMMERCE_OS_CHECKPOINT.json).

Continuidade entre ChatGPT e Codex: [AGENTS.md](AGENTS.md) · [Handoff técnico](docs/MLS_CODEX_HANDOFF_2026_10_28.md) · [Pesquisa Shopee](docs/SHOPEE_RESEARCH_TO_MLS_2026_10_28.md) · [Listing Factory local](docs/MLS_LISTING_FACTORY_V1.md).

A PR #86 reconciliou a cadeia preparada de visual, V3.6, Products/Pricing
observador, Listing Factory e AI Sales na versão oficial. As PRs originais de
preparação que continuam abertas não devem ser mescladas novamente em
duplicidade. Integração local, prévia sintética e publicação não substituem
aceite real do proprietário, grants de APIs, estoque verificado ou direitos
da mídia; escritas comerciais continuam bloqueadas.

