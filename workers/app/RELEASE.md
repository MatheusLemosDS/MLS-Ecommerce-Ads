# Primeira publicação do App pelo Git

Estado de 18/10/2026, horário de Brasília: App preparado e validado; o operador
confirmou que os comandos reais do Build estão salvos. O primeiro deploy pelo
Git ainda depende da confirmação de sucesso no Cloudflare. A conexão financeira já foi informada como
`CONNECTED`, revisão 1, após o release `9bc332e` de Auth e Finance.

## Comandos no Cloudflare

No Worker existente `brazacommerce-app`, usar branch `main`, raiz `/`:

| Campo | Valor |
| --- | --- |
| Build command | `npm run build:app` |
| Deploy command | `npm run deploy:app` |

`capture:app` serviu para importar a configuração e não publica código. Após
salvar os comandos reais, o commit deste registro pode disparar o Build,
inclusive quando o filtro de caminhos inclui `workers/app/**`. Se não iniciar,
usar **Retry build** na execução mais recente de `main`.

## Conteúdo e recursos preservados

O snapshot importado reconheceu o App v10 com SHA256
`b1792536a065a76b06886096838340e6c0c2daecbdb51d047bf0e63318e4437a`.
O App v11 preparado tem 250.057 bytes e SHA256
`cd56ad20a6e443c004437a902088faece0a863fd7c120fa16334b6e2e9738ba4`.
Esse artefato não mudou durante as correções financeiras.

O deploy usa a configuração revisada em `wrangler.json`: domínio
`app.brazacommerce.com.br`, `ADMIN_DB` existente
`fb3a5b06-5877-4d7e-ae08-1be4701f6437` e preservação das variáveis existentes.
Não há cron configurado. A conexão financeira usa seu próprio D1 e não precisa
ser refeita para publicar o App.

A diferença funcional v11 são referências de custos de produção, com tabelas
adicionais e histórico de revisões. Os custos completos confirmados são
R$15,90 para P–GG e R$18,90 para G1–G3 por peça. Margens legadas continuam
separadas. O painel não importa valores Payment nem calcula lucro financeiro;
Ads e promoções permanecem bloqueados para execução.

## Validação e confirmação

O conjunto atual passou em 295 testes Node. A validação de deploy e o dry-run
Wrangler do App passaram. O App compilado e o Auth atual também passaram em
15 cenários com workerd/D1 locais e gateway simulado, incluindo custos,
histórico, guards, observações anteriores e ausência de tarefas automáticas.
São testes locais, sem dados de produção ou solicitações à Shopee.

Depois do deploy, conferir o commit ativo no Cloudflare e abrir a área
administrativa para verificar **Custos de produção**, login e dados existentes.
O histórico de versões anterior do Worker fica como referência de recuperação.
O status público `/health` mantém uma versão legada e não identifica sozinho
o release v11; usar o commit do deploy para essa confirmação.
