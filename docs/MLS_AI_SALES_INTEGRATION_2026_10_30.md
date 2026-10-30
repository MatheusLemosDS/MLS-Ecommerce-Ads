# Integração MLS Commerce OS + AI Sales — homologação local

30/10/2026. Branch `integration/mls-commerce-os-ai-sales-20261030`, baseada no congelamento visual da PR #79. Desenvolvimento autorizado pela missão mestre; nenhuma mesclagem em main, implantação, chamada paga, publicação, convite ou alteração comercial foi executada.

## Entregas executáveis

| Área | Implementação e limite |
|---|---|
| Visual aprovado | Seis referências originais versionadas com hashes; PR #79 congelada, CI 41131654577 verde no HEAD e7ce5009. 15 painéis, claro/escuro, desktop/celular. Aprovação visual humana pendente. |
| Listing Factory | SKUs importados e identidades das variações preservados, edição por linha, prefixo em ação explícita e atômica, quantidades null/zero/múltiplas preservadas. Exportação e reanexação continuam locais. |
| Products/Pricing | ABC por unidades vendidas, contribuição de pedidos exclusivos antes de Ads/DAS e simulador com premissas explícitas. Sem preço recomendado por SKU nem publicação. Integração revisada da PR #47, sem merge automático de PR antiga. |
| Catálogo AI Sales | Adaptador dos endpoints autenticados de catálogo já salvo; vínculo por provedor/loja/produto/variação, horário original preservado. O DTO atual não contém SKU/preço/estoque: esses campos permanecem desconhecidos. Importação manual rebaixa evidências. |
| Campanhas | Até 10 variantes e três templates, hashes, direitos e componentes de cada imagem. Duas fotos da mesma peça não cobrem duas peças de um kit. Planos e jobs determinísticos, sem escrita comercial. |
| Estúdio | Render local Node/FFmpeg, MP4 real H.264/AAC, 1080×1920/30fps, 15–30s; voz offline PT-BR ou WAV autorizado, legendas medidas, transições, lote, preview e revisão local. Valida bytes/decodificação/deadline/leases/retomada e publica somente diretório local atômico. |
| Afiliados | CRUD de criadores reais/consentidos, CSV/JSON, propostas e aprovação local vinculada à evidência e ao produto atual. Falta de dados econômicos ou conciliação bloqueia aprovação. Nenhum convite/mensagem/alteração de comissão. |
| Desempenho | Ledger manual com revisões, idempotência, cancelamentos e devoluções, escopo exato e períodos compatíveis. Razões declaradas são identificadas como tal; lucro bancário e vencedores não comprovados permanecem desconhecidos. |
| Integrações | Catálogo, Affiliate Seller, autorização Creator, Content Posting e âncora de produto tratados separadamente. Nenhum grant é deduzido de loja ativa ou de arquivo importado. |
| Roteiros por modelo | Adaptador puro opcional prepara pedido limitado e importa seleção de claims ancorados em evidência para revisão. Não executa um LLM. Sem credenciais/acesso/custo autorizado, o render usa roteiro determinístico e declara `LOCAL_TEMPLATE`. |

## Código e decisões

Os módulos `web/cloudflare/src/mls-ai-sales-*.mjs` contêm contratos, catálogo, planejamento, gate econômico, CRM, desempenho e UI. O builder insere cada módulo em um namespace privado, preservando regexes/templates na minificação; não embute processos do sistema no Worker.

O renderer está em `tools/mls-ai-sales/`, com entrada `tools/mls_ai_sales_cli.mjs`. Não há dependência npm nova nem novas tabelas D1, OAuth ou APIs financeiras. [Guia de render](MLS_AI_SALES_LOCAL_RENDER.md), [contrato](MLS_AI_SALES_IMPLEMENTATION_CONTRACT.md), [prova dos três MP4s](qa/mls-ai-sales-2026-10-30/media-evidence.json), [decisão de bibliotecas/licenças](MLS_AI_SALES_POC_EVIDENCE.md).

MoneyPrinterTurbo foi inspecionado em SHA fixo e sua geometria testada isoladamente; seus defaults recortam/zoom. O render mínimo original usa contain e mantém textos fora da área da estampa. FFmpeg é lossy: hashes atestam os arquivos e insumos, não igualdade binária de pixels recomprimidos. eSpeak NG é executável externo, sem redistribuição de binários; a voz formante exige avaliação auditiva. Remotion/OpenShorts/SDKs não foram importados indiscriminadamente.

## Homologação e rollback

1. Conferir a CI do HEAD e os três hashes em `dist/build-manifest.json`; Auth/Finance devem continuar iguais à base documentada.
2. Rodar `npm ci`, `npm run build` e as suites Node/Python. Para testes de mídia instalar localmente FFmpeg, ffprobe, eSpeak NG PT-BR e fontes DejaVu; ver o guia de render. A CI prepara esses executáveis explicitamente.
3. Executar os testes Chromium com fixtures sintéticas e revisar as capturas e o relatório de comparação. Isso não substitui sessão/dados da loja.
4. Em ambiente local/de homologação já autorizado, configurar **somente** `MLS_AI_SALES_OWNER_PREVIEW=ENABLED` para o novo módulo. Ausente, booleano, minúsculo ou valor com espaços mantém OFF. O acesso continua exclusivo do owner. `MLS_V36_OWNER_PREVIEW` é independente. A produção não foi alterada.
5. Selecionar uma variação salva, anexar mídia original autorizada e conferir a cobertura de cada componente. Planejar e exportar a entrada do CLI. Gerar localmente, importar o manifesto e reanexar o MP4 para preview/hash e nova revisão humana.
6. A prévia local limita cada arquivo de importação e download a 1 MiB; arquivos maiores recebem erro explícito, sem truncamento. Exportar JSON para retomar o trabalho; JSON não contém os bytes de mídia. Ao importar, evidências são declaradas, aprovações revogadas e jobs exigem replanejamento. Reanexar arquivos originais.
7. Qualquer merge/publicação depende de aprovação posterior do proprietário. Integrar primeiro a base visual ou revisar a integração empilhada; não mesclar todas as PRs históricas em duplicidade. Não fornecer comando automático de deploy nesta missão.
8. Para rollback da homologação, remover a flag de AI Sales. O módulo deixa de ser entregue, sem migração D1; restaurar a versão App previamente aprovada conforme o procedimento existente, somente com autorização.

## Pendências externas explícitas

- Financeiro M2/issue #50: cotejar Seller Centre, Pending, liberações/devoluções e banco em sessão autorizada. Os testes não comprovam o lucro líquido real da loja. DAS-MEI registrado e custos atuais não eliminam essa dependência.
- Aprovação visual humana das seis telas e QA autenticada na loja; avaliação auditiva e da estampa em mídia real autorizada.
- Credenciais/consentimento/orçamento de provedor LLM ou voz neural, se desejados. Não há roteiro gerado por LLM nem voz neural certificados nesta entrega.
- Grants reais por loja/região para Shopee/TikTok Affiliate, Creator, publicação e âncora. Sem eles, somente exportação e fluxo manual/assistido.

Hermes permanece OBSERVER; Ads/PROMO e todas as escritas comerciais permanecem LOCKED. A conclusão é do MVP local testável; autonomia comercial e precisão bancária integral não foram declaradas.
