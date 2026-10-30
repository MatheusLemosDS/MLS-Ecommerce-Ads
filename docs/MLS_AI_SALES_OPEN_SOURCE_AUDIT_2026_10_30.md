# Pesquisa auditada de repositórios — MLS AI Sales / vídeos + afiliados
**Data da avaliação:** 30/10/2026 · **Destino:** Codex / issue #82 / PR documental #81 · **Status:** avaliação estática, sem instalação, sem execução de terceiros e sem grant de API.

Este documento complementa docs/MLS_AI_SALES_MVP_CODEX_2026_10_30.md e docs/MLS_AI_SALES_CODEX_EXECUTION_2026_10_30.md. O desenvolvimento de interface segue **PR #79 / issue #80** como prioridade: não tocar nessa branch ou no Worker real, não fazer merge ou deploy. Shopee/TikTok Shop ativas segundo o proprietário NÃO provam permissões de Affiliate API nem Content Posting API.

## 1. Resultado objetivo

**NÃO foi identificado um único repositório auditado que entregue simultaneamente, pronto e comprovado em produção BR, o ciclo:** produto Shopee/TikTok Shop real -> vídeo fiel à estampa -> postagem TikTok com âncora comprável -> comissão/convite de afiliado real -> atribuição e margem financeira observada. As partes existem separadamente; montar adaptadores pequenos sobre o MLS Commerce OS atual.

**Recomendação para MVP:**
1. Provar pipeline local com **MoneyPrinterTurbo** como candidato de gerador; se não preservar estampa/fidelidade ou gerar integração complexa, usar seu desenho como referência e criar render mínimo Node/FFmpeg isolado. Não importar monolito para Cloudflare.
2. Usar **hsib19/tiktok-shop-sdk** e **isaackogan/TikTok-Shop-Api-SDKs** para pesquisa/testes de contratos TikTok Shop *sem requests reais*, com checagem contra documentação oficial e permissões da loja.
3. Usar **congminh1254/shopee-sdk** só para comparar lacunas do conector Shopee existente e testes de assinatura; NÃO substituir OAuth, rotas ou pipeline Finance que já funcionam.
4. Prototipar **Remotion + template-tiktok** somente se quiser motion design/legendas mais ricos e após checar licença. FFmpeg continua opção-base de render.
5. Deixar **OpenShorts** e n8n como alternativas condicionais, não dependências do MVP.

## 2. Matriz de repositórios verificados (GitHub e código; 30/10/2026)

| Prioridade | Repositório | Evidência de implementação (observada no código) | Licença/limites | Uso proposto |
| --- | --- | --- | --- | --- |
| **P0 — POC** | [harry0703/MoneyPrinterTurbo](https://github.com/harry0703/MoneyPrinterTurbo) | Python; API/WebUI/CLI; \`cli.py\` com source \`local\`, batch até 100 itens em CLI; \`app/services/material_upload.py\` aceita JPG/PNG e vídeos; \`app/services/video.py\`, \`voice.py\`, \`subtitle.py\`; Windows suportado; \`README-en.md\` documenta vídeo 9:16 e publicação opcional | **MIT** para código próprio; provedores IA/TTS, estoque de vídeo, assets e publicador externo têm custo/termos separados. Não garantir vídeo pronto perfeito nem carrinho do TikTok Shop | primeiro render de produto com mockups locais, roteiro, voz PT-BR testada, legenda MP4; zero auto-publicação |
| **P0 — contratos** | [hsib19/tiktok-shop-sdk](https://github.com/hsib19/tiktok-shop-sdk) | TypeScript, \`packages/sdk/src/modules/AffiliateSellerModule.ts\` com \`searchSellerAffiliateOrders\`, \`sellerSearchCreatorOnMarketplace\`, \`getMarketplaceCreatorPerformance\`, \`createOpenCollaboration\`, \`createTargetCollaboration\`, \`generateAffiliateProductPromotionLink\`; testes em \`.../__tests__/affiliatesellerModule.test.ts\` | **MIT**, não oficial; cobertura descrita pelo autor NÃO certifica grant, BR ou chamadas reais | mapear API Affiliate Seller read-only e contrato de comissão/convite como DRAFT; write LOCKED |
| **P0 — comparação** | [congminh1254/shopee-sdk](https://github.com/congminh1254/shopee-sdk) | TypeScript com gerenciadores de API Shopee v2, HMAC, token storage e testes em \`src/__tests__\`; atividade recente (2026-10-27) | **MIT**, comunitário; endpoints e métodos precisam comparar com schema oficial/região BR; “100% cobertura” é autodeclaração | resolver lacunas pontuais sem duplicar coleta/Finance/OAuth existente |
| **P1 — especificação** | [isaackogan/TikTok-Shop-Api-SDKs](https://github.com/isaackogan/TikTok-Shop-Api-SDKs) | OpenAPI 3.1 + SDK TypeScript em \`typescript/\`, campos e scopes, affiliate seller/creator/partner; código e documentação em atividade (2026-10-30) | **MIT**, não oficial; README reconhece assinatura HTTP **não validada contra API real**; projeto muito recente (criado 2026-10-15) | gerar fixtures e comparar endpoint/scope; usar implementação apenas após teste de assinatura no ambiente autorizado |
| **P1 — animação** | [remotion-dev/remotion](https://github.com/remotion-dev/remotion) + [remotion-dev/template-tiktok](https://github.com/remotion-dev/template-tiktok) | render paramétrico React e projeto de legenda estilo TikTok/Whisper; template aceita trocar mídia local; template de legenda informa ajuste do modelo para idiomas não ingleses | **Remotion License, não OSI/open-source**. Individual/empresa até 3 pessoas pode usar comercialmente sem licença paga sob termos; empresa maior precisa Company License, inclusive automação. Template usa essa base | prototipar transições e legendas para vídeos de produto somente após revisão de enquadramento/licença |
| **P2 — referência** | [mutonby/openshorts](https://github.com/mutonby/openshorts) | motor Python de corte 9:16, legenda, AI Shorts/UGC, MCP/API, Docker e testes; atividade recente, mas complexidade alta e foco original em vídeo longo/atores | **MIT no núcleo; diretório \`cloud/\` tem licença comercial específica e restrições de redistribuição/SaaS**; uso de APIs de avatar/video potencialmente pago; revisar armazenamento público e disclosure IA | apenas POC isolada de apresentador sintético, sem importar backend ou \`cloud/\` |
| **P2 — exemplo** | [gyoridavid/short-video-maker](https://github.com/gyoridavid/short-video-maker) | TypeScript, REST/MCP, Remotion, Kokoro TTS, Whisper, Pexels, Docker | **MIT no projeto**, mas Remotion é licença separada; próprio README: voz somente inglês, sem imagens/vídeos locais como input e **Windows não suportado** | estudar orquestração/legendas; NÃO escolher gerador principal de camisetas PT-BR |
| **P2 — opcional** | [Media-Studios/n8n-nodes-media-toolkit](https://github.com/Media-Studios/n8n-nodes-media-toolkit) | nó de workflow para render FFmpeg, spec de MP4 e caption TikTok; poucos usuários, projeto jovem | **MIT** para nó; n8n precisa licença apropriada | referência de steps, não dependência obrigatória |
| **P3 — estudar, não importar** | [Pathapongoo11/tiktok-affiliate-platform](https://github.com/Pathapongoo11/tiktok-affiliate-platform) | backend Go/React, FFmpeg \`api/modules/videos/ffmpeg.go\`, API posting \`api/modules/tiktok/posting.go\`, testes em módulos de vídeo; **\`client.go\` ativa mockMode quando falta chave** | README diz MIT, verificar licença de todos os arquivos (não havia LICENSE na raiz); simulação NÃO prova postagem real ou âncora de produto | inspiração para pipeline, sem integração direta Go/DB ou writes |
| **NÃO ADOTAR** | [Vanszs/tiktok-viral-factory](https://github.com/Vanszs/tiktok-viral-factory) | README promete 7 agentes/100 vídeos, mas diretórios \`workflows/\`, \`agents/\` e \`tools/\` continham somente \`__init__.py\` no HEAD observado | licença MIT anunciada apenas em README, sem arquivo LICENSE na raiz observado | não tratar promessa como implementação |
| **NÃO ADOTAR** | [shawn137080/n8n-ai-video-pipeline](https://github.com/shawn137080/n8n-ai-video-pipeline) | workflow demonstrativo de Sheets -> IA -> publicação; endpoints de plataformas e tokens descritos como substituíveis/placeholders | não foi encontrada licença definida na metadata GitHub; operações não foram validadas | referência conceitual, não copiar como solução pronta de postagem |

**Notas de maturidade:** estrelas e atualizações NÃO provam segurança. MoneyPrinterTurbo e Remotion são grandes/ativos, mas volume de código aumenta custo de auditoria. SDK TikTok Shop são projetos de terceiros. Nenhuma biblioteca aqui foi instalada ou executada no MLS neste trabalho. Não copiar código sem confirmar cadeia de dependências, licenças transitivas e testes; preservar copyright/atribuição.

## 3. Limiar entre TikTok Shop Affiliate e TikTok Content Posting

**Fonte oficial obrigatória:** https://partner.tiktokshop.com/docv2/page/affiliate-integration

- A Affiliate API está **inativa por padrão** e exige aprovação de acesso por TikTok Shop Partner/Account Manager. Lojas ativas não habilitam a API automaticamente.
- **READ Seller Affiliate:** \`Search Seller Affiliate Orders\`, \`Seller Search Affiliate Open Collaboration Product\` pedem scope \`Read Seller Affiliate Collaborations\` (se disponível no grant da loja).
- **MANAGE Seller Affiliate:** \`Create Open Collaboration\`, \`Create Target Collaboration\`, \`Edit Open Collaboration Settings\`, \`Generate Affiliate Product Promotion Link\` pedem scope distinto \`Manage Seller Affiliate Collaboration\`. Nunca ligar no MVP sem aprovação específica e política de comissão.
- Creator authorization é **separada** do token da loja; não autoriza inventar criadores, usar conta falsa ou enviar convites em nome de terceiros sem consentimento.
- Seller pode promover produtos próprios diretamente. Não configurar autoafiliação ou pagamentos de comissão sobre suas próprias compras.
- Para postar vídeo no perfil TikTok, usar a **Content Posting API** distinta: https://developers.tiktok.com/docs/en/content-posting-api-get-started; requer \`video.publish\` aprovado + usuário autorizando, e cliente sem auditoria tem postagens limitadas a privado. Postar vídeo **não prova inclusão de produto comprável/âncora TikTok Shop**. Não pressupor que bibliotecas de “TikTok auto-post” façam isso.
- Shopee Video/afiliados BR: nenhum write API disponibilizado/verificado para a loja neste trabalho; export manual até prova oficial.
- Serviços de upload de terceiros (Upload-Post, Buffer, etc.) NÃO implicam acesso garantido a carrinho/Shop ou licença de afiliado.

## 4. Cuidado extra com licenças

1. **MoneyPrinterTurbo:** MIT próprio, mas AI/voz/stock/publicação e ativos precisam direitos independentes. Evitar importar tokens, provider URLs, telemetria e processamento de mídia para Cloudflare App.
2. **Remotion:** https://github.com/remotion-dev/remotion/blob/main/LICENSE.md e https://www.remotion.dev/docs/license. É *source-available*, não licença open source OSI. Free License para pessoa física/organização com até 3 pessoas, sob regras específicas; empresa maior exige Company License. Não marcar automaticamente “gratuito para qualquer negócio”.
3. **OpenShorts:** o original \`mutonby/openshorts\` tem LICENSE MIT com exceção em \`cloud/LICENSE\` (restrições comerciais/distribuição). Não copiar \`cloud/\` para produto de terceiros sem permissão.
4. **n8n:** https://support.n8n.io/article/can-i-use-your-license-for-my-use-case. Sustainable Use License permite automações internas em cenários descritos, mas produto que oferece editor/automação a terceiros pode exigir licença comercial. Não embutir n8n como serviço público/SaaS sem revisão.
5. **Licença desconhecida:** ausência de LICENSE válido não significa permissão para copiar. Evitar repositórios demo sem testes, com URLs mockadas ou reivindicações de conversão e views sem prova.

## 5. Localizações de código úteis para o Codex (inspecionadas)

- \`MoneyPrinterTurbo/cli.py\` — \`_CLI_VIDEO_SOURCES\` inclui \`local\`, \`_BATCH_TASK_MAX_COUNT=100\`, criação parametrizada de jobs.
- \`MoneyPrinterTurbo/app/services/material_upload.py\` — formatos JPG/PNG/MP4 etc. + bounds server-side; **não usar tolerâncias de upload como regra Shopee**.
- \`MoneyPrinterTurbo/app/services/video.py\`, \`voice.py\`, \`subtitle.py\` — pipeline de render/narração/legenda.
- \`hsib19/tiktok-shop-sdk/packages/sdk/src/modules/AffiliateSellerModule.ts\` e \`.../__tests__/affiliatesellerModule.test.ts\` — contratos affiliate seller e mocks unitários.
- \`isaackogan/TikTok-Shop-Api-SDKs/typescript/\` e \`.openapi/tiktok-shop.openapi.yaml\` — shapes e escopos não oficiais sujeitos a confirmação.
- \`congminh1254/shopee-sdk/src/\`, \`src/managers/\` e \`src/__tests__/\` — revisão de assinatura/gerenciadores Shopee.
- \`remotion-dev/template-tiktok/whisper-config.mjs\`, \`sub.mjs\` — legendas e configuração de idioma.
- \`mutonby/openshorts/LICENSE\` + \`cloud/LICENSE\` — divisão de licença; não ignorar.
- \`Pathapongoo11/tiktok-affiliate-platform/api/modules/tiktok/client.go\` — mockMode por falta de credencial; \`.../videos/ffmpeg.go\` imagens do produto 9:16, candidato de referência.

## 6. Spike de integração recomendado antes de S2 do roadmap

**Spike R0 (documentar e executar pelo Codex apenas quando a trilha PR #79 estiver estabilizada):**
1. Congelar SHA/tag de cada upstream candidato, fixar versões e gerar inventário de licenças + dependências. NÃO copiar módulos do upstream para \`web/cloudflare/src/\`.
2. Executar MoneyPrinterTurbo LOCALMENTE em ambiente de teste isolado Windows/WSL/Docker ou Python 3.11, sem chaves de loja, com imagem sintética própria/permitida e export local; conferir preflight de bibliotecas FFmpeg.
3. Alimentar contrato \`mls_ai_sales_product_snapshot_v1\` fictício e manifest de mídia explícito. Uma camiseta preta e uma branca, uma estampa não simétrica (detecta inversão) e um kit de duas unidades; dimensões, escala e cores devem ficar **idênticas** ao mockup fonte nos trechos de produto.
4. Pedir 3 vídeos (nostalgia, detalhe e kit) em 1080x1920 MP4 H.264/AAC, 15–30s; texto/PT-BR e voz testados. Se voz suportada pelo provider mas não pela configuração atual, reportar bloqueio sem mascarar com inglês.
5. Validar via \`ffprobe\` e decodificação integral: extensão real, resolução/fps, tempo, ausência de tela preta/quebrada, trilha, crop de estampa, flags de IA e tamanho final. Registrar SHA-256, inputs, dependências, tempo/custo medidos (não estimar como reais).
6. Repetir com asset ausente, JPG inválido, kit sem segunda arte, marketplace/variação sem vínculo, autorização de vídeo ausente e orçamento zero. Esperado = DRAFT/BLOCKED, nunca publicação.
7. Comparar com CLI Node + FFmpeg mínima e/ou Remotion (licença verificada): escolher via critérios medidos (fidelidade DTF, custo, simplicidade, qualidade, tempo e segurança), não popularidade.
8. Só depois de PoC de vídeo, testar SDKs em testes unitários HTTP interceptados com fixtures sintéticas; conferir os caminhos de affiliate e métodos conforme docs e grants BR, sem rede externa e sem token.
9. Entregar \`docs/MLS_AI_SALES_POC_EVIDENCE.md\` com decisão \`ADOPT\` / \`ADAPT\` / \`REFERENCE_ONLY\` / \`REJECT\` por repo e justificativa.

**Regra de execução:** S0 e S1 originais seguem primeiro. R0 é um spike adicional para acelerar S2, não autorização para rodar integrações comerciais. Pull requests de implementação continuam separadas desta PR de pesquisa, e a interface aprovada da PR #79 não deve ser tocada em paralelo.

## 7. Checklist de integração final / definição de pronto do upstream

- [ ] Licença de cada projeto/dependência e respectiva versão revisadas; sem licença desconhecida copiada.
- [ ] Contrato de media local seguro (paths/symlink/size/SSRF), nenhum processamento remoto não autorizado de mockups.
- [ ] Narração/legendas PT-BR, estampa fiel e provada por QA visual em produtos reais autorizados.
- [ ] Limites de custo/CPU/disco/latência/paralelismo; abort seguro e output idempotente.
- [ ] Sem publicação em Shopee/TikTok nem criação/edição de colaboração sem grants e aprovação por ação.
- [ ] Capabilities TikTok Affiliate seller e Content Posting separadas; \`video.publish\` não implica âncora vendável; creator authorization separado.
- [ ] Reutilização de dados do catálogo/Finance/DTF existentes sem novo crawler, sem novas tabelas D1 arbitrárias.
- [ ] Pipeline Node/FFmpeg ou Python auxiliar fora do Worker App; não alterar Worker Auth/Finance.
- [ ] Contratos, fixtures e testes de regressão no HEAD do PR, CI original e QA owner.
- [ ] Documentação de que a pesquisa **não é integração concluída**; status dos repos pode mudar depois deste corte.

**Próximo comando do Codex após o design:** ler este documento, verificar HEADs reais dos upstreams, e executar o spike R0 de forma isolada, *sem* modificar a PR #79 e *sem* chamar APIs reais de lojas.
