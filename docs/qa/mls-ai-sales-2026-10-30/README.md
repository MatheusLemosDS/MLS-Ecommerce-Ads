# AI Sales — evidências locais para homologação

App SHA-256 `a5ba3298faf4b8c2eaa32e98674f1d7408f4c4616236d8f04a2fba72bbfb91c8`.

40 capturas do Worker normal/minificado: cinco abas × dois temas × 1365×900/390×844. Fixtures próprias, owner sintético e nenhum serviço externo; **não são dados ou autenticação da loja real**. Aprovação visual humana pendente. Os testes clicam nas abas e no controle nativo de tema, conferem o painel visível, console sem erros e ausência de overflow; a captura rola até o conteúdo da aba.

| Aba | Desktop escuro | Desktop claro | Celular escuro | Celular claro |
|---|---|---|---|---|
| Campanhas | [1365×900](normal-dark-1365-campaigns.png) | [1365×900](normal-light-1365-campaigns.png) | [390×844](normal-dark-390-campaigns.png) | [390×844](normal-light-390-campaigns.png) |
| Estúdio | [1365×900](normal-dark-1365-studio.png) | [1365×900](normal-light-1365-studio.png) | [390×844](normal-dark-390-studio.png) | [390×844](normal-light-390-studio.png) |
| Afiliados | [1365×900](normal-dark-1365-affiliates.png) | [1365×900](normal-light-1365-affiliates.png) | [390×844](normal-dark-390-affiliates.png) | [390×844](normal-light-390-affiliates.png) |
| Desempenho | [1365×900](normal-dark-1365-performance.png) | [1365×900](normal-light-1365-performance.png) | [390×844](normal-dark-390-performance.png) | [390×844](normal-light-390-performance.png) |
| Integrações | [1365×900](normal-dark-1365-integrations.png) | [1365×900](normal-light-1365-integrations.png) | [390×844](normal-dark-390-integrations.png) | [390×844](normal-light-390-integrations.png) |

Versões minificadas têm prefixo `minified-`. Hash de cada PNG, viewport, aba/tema e origem estão em [normal-results.json](normal-results.json) e [minified-results.json](minified-results.json).

[Regressão final](regression.json): 2.308 Node e 67 Python aprovados, sem falhas/skip; builds App/Auth/Finance. [Três MP4s reais e QA](media-evidence.json): fixtures assimétricas próprias, 1080×1920/30fps/15s, voz PT-BR, ffprobe e decodificação integral. Binários MP4 ficam locais e podem ser regenerados pela suite; não há mídia privada da loja no repositório. As capturas não certificam a voz, estampas reais, Seller Centre, grants ou lucro bancário.

[Guia de homologação](../../MLS_AI_SALES_INTEGRATION_2026_10_30.md). Sem merge/deploy/publicação.
