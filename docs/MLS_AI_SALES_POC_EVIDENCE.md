# MLS AI Sales — evidência R0 e decisão de render local

Data: 30/10/2026. Preparação isolada em `/tmp`; nenhum arquivo do repositório, dependência npm, Worker, banco, conta ou implantação foi alterado. Nenhuma API de voz paga, marketplace ou publicação foi executada.

## Decisão

**MoneyPrinterTurbo: REFERENCE_ONLY. Node + FFmpeg: ADAPT / candidato preferido ao render mínimo. eSpeak NG: ADOPT como adaptador opcional local PT-BR, sujeito a QA auditiva.** Não importar aplicações, fontes, músicas ou bibliotecas inteiras para o App Cloudflare. O render permanece um processo local separado. A narração formante funciona tecnicamente; não equivale a voz neural profissional nem a aprovação do proprietário.

## Fontes e versões congeladas

- [MoneyPrinterTurbo](https://github.com/harry0703/MoneyPrinterTurbo/tree/27843a994bfa29c43c02150861d51490a6ca4bd2), commit `27843a994bfa29c43c02150861d51490a6ca4bd2`, 30/10/2026 03:00:49 UTC. Licença MIT, arquivo `LICENSE` SHA-256 `87dd19b6a0779e14a91c1b06423ef251df37e89666160c031130a26bae68c229`.
- Arquivos baixados somente para inspeção: `app/models/schema.py` SHA `0bbcdb1062a8b3538a345eab898d702b3dfea14b630b3b67daf126c53a8dd6da`; `app/services/video.py` SHA `7f7ebac91126c3f854534e453c8e215b6cdde9b192857bdfc890d308b654e8fa`; `app/services/voice.py` SHA `16c82fbc681f5f545b67fc3f6e177dd07d1691aa468914457d5dfff86fb5bb96`.
- eSpeak NG upstream inspecionado: [commit ba90c8e9f440ad544f674a790bb5f53878b6ffc5](https://github.com/espeak-ng/espeak-ng/tree/ba90c8e9f440ad544f674a790bb5f53878b6ffc5). A execução abaixo usa **pacote Debian versão 1.52.0+dfsg-5**, não uma compilação desse HEAD.
- FFmpeg/ffprobe instalados: `7.1.5-0+deb13u1`; FFmpeg contém libx264, AAC, libass, drawtext, xfade e foi compilado com `--enable-gpl`. Node `24.19.0`, npm `11.9.0`; nenhum binário é redistribuído pelo projeto.

## Inspeção e probe do MoneyPrinterTurbo

Os defaults reais em `schema.py` são `video_fit_mode=cover`, `image_motion=zoom`, `video_concat_mode=random`. Em `video.py`, `_fit_clip_to_canvas` (linhas 912–972) redimensiona e recorta centralmente em modo cover. `render_image_zoom_video` (1894+) aumenta a imagem progressivamente.

Foi executada **apenas a função geométrica extraída por AST do código congelado**, com doubles dos objetos de vídeo. Não houve instalação/execução da aplicação completa nem render de vídeo MoneyPrinterTurbo. O probe confirmou:

- Imagem quadrada 1080×1080 para vídeo 1080×1920 em default cover: amplia para 1920×1920 e recorta 420 px de cada lado; somente 607,5 px da largura original ficam visíveis.
- Modo explícito contain mantém o quadro completo 1080×1080 sobre canvas 1080×1920.
- Evidência estruturada: `mpt-geometry-evidence.json`.

O upstream suporta arquivos locais, ausência de voz e áudio enviado, mas exige configuração não padrão para impedir recortes/zoom. Sua instalação padrão inclui MoviePy 2.2.1, Streamlit 1.66.1, Faster Whisper 1.1.0, Edge TTS 7.3.1, Azure Speech, OpenAI e outras integrações. Não se encontrou adaptador eSpeak/Piper embutido. Kokoro usa endpoint configurado; Edge/Azure não constituem prova de síntese offline. O volume e a superfície de integração não se justificam para três templates MLS. Reaproveitar conceitos de arquivos atômicos, validação e composição proporcional, sem copiar código.

## Síntese PT-BR real, offline e sem instalação privilegiada

Pacotes baixados de `https://deb.debian.org/debian/` e extraídos com `dpkg-deb --extract` para `/tmp/mls-ai-sales-r0/espeak-root`. Não foi usado apt install, sudo ou alteração de bibliotecas do sistema.

A cadeia foi conferida: assinatura de `InRelease` com `/usr/share/keyrings/debian-archive-keyring.gpg` (gpg exit 0, assinaturas Debian Bookworm/Trixie e Stable Release válidas); hash de `Packages.xz` igual ao registrado no InRelease; hash e tamanho de cada `.deb` iguais ao Packages. A mensagem de confiança pessoal não certificada do gpg não foi ocultada; as chaves são as do keyring Debian pré-instalado.

- `InRelease` SHA-256 `0584fba32e13e0ab8285fb16c27adea1ec03a73669c18702821094fd6ca86675`.
- `Packages.xz` SHA-256 `7778d3e3f303b7ddb8ce0fe7c8d57473a076c6bf2e8f241f75421d2396352498`.
- Fingerprint Stable Release Trixie: `4158 7F7D B8C7 74BC CF13 1416 762F 67A0 B2C3 9DE4`.

| Pacote | Versão | SHA-256 |
|---|---|---|
| espeak-ng | `1.52.0+dfsg-5` | `b64da7b5e21b3540a5cfe5a2fd5c650f6f366ffccb9b810eb337ea4677435d31` |
| espeak-ng-data | `1.52.0+dfsg-5` | `7c239b30e419897313b5b8c98123cf3ec871cfedbf43bbb956b985a492e37f19` |
| libespeak-ng1 | `1.52.0+dfsg-5` | `845886095f5be3ba7680c8e15de068f76d67600275cbd7b6f6c7d00e53c05b34` |
| libpcaudio0 | `1.3-1` | `db95c30434707a60774ed9ad0193ba680e061ae7d99f354a1a93f147317a4ea5` |
| libsonic0 | `0.2.0-13+b1` | `07a1d67546465f07638be05f0931d79e0d6bb1a7831e1f67ac6611d1ba297009` |

A voz embutida `pt-br`, `Portuguese_(Brazil)`, `roa/pt-BR`, foi confirmada por `--voices=pt`. Não usar variantes MBROLA sem suas dependências/licenças próprias.

Reprodução, executável e argumentos separados (em Node, usar spawn sem shell):

```text
executable: /tmp/mls-ai-sales-r0/espeak-root/usr/bin/espeak-ng
env patch: LD_LIBRARY_PATH=/tmp/mls-ai-sales-r0/espeak-root/usr/lib/x86_64-linux-gnu
argv:
  --path=/tmp/mls-ai-sales-r0/espeak-root/usr/lib/x86_64-linux-gnu
  -v pt-br -s 155 -a 100
  -w /tmp/mls-ai-sales-r0/narracao-pt-br.wav
  -f /tmp/mls-ai-sales-r0/narracao-pt-br.txt
```

Texto original de teste: “Confira esta camiseta e os detalhes da estampa original. Escolha o tamanho e consulte as informações do produto antes de comprar.” Nenhuma alegação de material, desconto ou estoque foi inventada.

Resultado: síntese exit 0, 13 ms medidos nesta máquina; WAV 9,470431 s, PCM s16le, 22.050 Hz, mono, 417.690 bytes. `ffprobe` e decodificação integral por FFmpeg aprovados. Segunda execução gerou bytes idênticos. SHA-256 WAV `11f223eafe9e2f6e8c3d491c0259f213ce99a00a35df83599d797bda449bca31`. Evidência estruturada: `tts-evidence.json`.

O código eSpeak NG tem GPL-3.0-or-later com exceções de arquivos indicadas no copyright Debian. Usar executável externo não modificado, explicitamente configurado, sem copiar/vincular código ou redistribuir binários pelo projeto; eventual distribuição exige revisão das respectivas obrigações. Voz sintética deve ser identificada. Custo cobrado por fornecedor neste teste = R$ 0,00; custo de CPU/energia não mensurado, portanto **null**, não “geração totalmente grátis”.

## Comparação de alternativas

| Alternativa | Observação | Decisão R0 |
|---|---|---|
| Node + FFmpeg | Binários existentes, spawn argv, composição contain, nenhum pacote adicional | Preferido para implementar e testar pipeline MLS |
| MoneyPrinterTurbo | MIT; defaults recortam/zoom; aplicação/dependências extensas; probe geométrico limitado | Referência; não adotado integralmente |
| eSpeak NG PT-BR | Execução offline comprovada e repetível; voz formante robótica | Adaptador opcional explícito; QA auditiva pendente |
| Áudio original licenciado | Pode ser importado e validado localmente; bytes/direitos devem ser comprovados | Fallback funcional sem TTS remoto |
| Piper/Kokoro local | Potencial voz mais natural, modelos/dependências/licenças por voz não avaliados neste spike | Não instalado nem certificado |
| Edge/Azure/serviço IA | TTS remoto, termos e possível custo separados | Não usado; autorização/configuração futura |
| Remotion | Licença comercial condicional e stack adicional | Opcional futuro, não necessário ao MVP mínimo |

## Desenho seguro para a próxima implementação

1. Entradas locais em manifesto fechado, limite de tamanho, vínculo exato loja/produto/variante/arte e direito de uso. Rejeitar URL remota, traversal, arquivos especiais, symlinks e hashes diferentes. Copiar bytes verificados por descritor para staging privado, evitando reabrir nomes de origem após validação.
2. Diretório de saída explicitamente escolhido; staging criado pelo processo; nomes internos fixos. Nenhum texto do produto vira filename ou código de filtro. Arquivo de texto UTF-8 para drawtext com `expansion=none`; conteúdo nunca interpolado no DSL de filtros.
3. `spawn(executable, argv, {shell:false,...})`, `-nostdin`, protocolo local permitido, deadline/kill e saída de diagnóstico limitada/sanitizada. Limites de duração, frames, dimensões, saída, espaço livre e concorrência 1. Falha não vira vídeo aprovado.
4. Layout proporcional contain, sem crop, espelhamento, rotação ou filtros de cor sobre a estampa. Textos fora da área protegida do produto. MP4 H.264/AAC é lossy: validar geometria/fidelidade e manter hash da mídia original; não prometer igualdade binária dos pixels recomprimidos.
5. Três templates originais, roteiro local determinístico sem chave de IA. Narração opcional eSpeak/arquivo licenciado, explicitamente configurada. Sintetizar frases separadas e medir duração real para legendar; não fingir alinhamento de ASR.
6. QA de ffprobe, decodificação integral, dimensão 1080×1920, duração 15–30 s, codecs, áudio e hash. Fixtures próprias assimétricas detectam corte/flip e kit exige duas peças explicitamente vinculadas.
7. Idempotência pelo hash dos bytes, contrato e política/template; lock local e publicação atômica somente após QA. Exportar MP4, thumbnail, SRT, descrição e manifesto DRAFT/READY_FOR_OWNER. Aprovação local não habilita upload ou marketplace.
8. Registrar tempo medido, tamanho e cobrança conhecida separadamente de custo computacional desconhecido. Cancelar/retomar sem duplicar ou sobrescrever arquivos incompatíveis.

## Limites da fase R0

No encerramento do ensaio R0, os três vídeos MLS ainda não tinham sido gerados; o resultado dessa implementação está registrado abaixo. Não houve validação humana de voz/estampa em produtos reais, mockups aprovados disponíveis, grant TikTok/Shopee, API integrada ou publicação. As decisões de R0 não encerraram o MVP nem o gate financeiro M2.

## Atualização R1 — três vídeos locais gerados e verificados

O pipeline mínimo Node + FFmpeg está implementado em `tools/mls-ai-sales/`, com CLI em `tools/mls_ai_sales_cli.mjs` e [guia de execução](MLS_AI_SALES_LOCAL_RENDER.md). A suíte final teve **15 testes aprovados, zero falhas e zero skips**, em 40,16 s nesta máquina. Os três templates produziram MP4s reais com voz PT-BR offline, H.264/AAC, 1080×1920, 30 fps e duração de 15 s. Todos passaram por ffprobe e decodificação integral, com originais sintéticos preservados e aprovação humana pendente.

| Template | Tamanho | SHA-256 do MP4 |
|---|---:|---|
| `NOSTALGIA_80_90_2000` | 276.497 bytes | `f20d3d813288ddf9ced40bd1734e561ffabbbaddc00adcf845e56fae1f8abdc6` |
| `PRODUCT_DETAILS` | 276.189 bytes | `16a229c4508d362a0e7a05275db8d7ac0dc5141b8d9ff37e623c2ad4996a19f4` |
| `COUPLE_KIT` | 312.639 bytes | `697f1729a26571d68b475a3e34e5a8ac0be68e0588e12f68154a90b612cb0357` |

A [evidência estruturada](qa/mls-ai-sales-2026-10-30/media-evidence.json) contém versões, hashes dos módulos e arquivos, QA, duração e cobertura por componente, sem caminhos privados ou MP4s no repositório. Os vídeos foram repetidos com bytes idênticos nesta instalação; isso não promete hashes idênticos entre versões distintas do FFmpeg/eSpeak.

As camisetas de teste foram desenhadas pelo próprio fixture, com faixa verde e seta vermelha assimétricas. Patches extraídos do vídeo verificaram lado, posição e bordas da composição contain; a miniatura do kit também foi inspecionada visualmente. Duas fotos da mesma peça não satisfazem a cobertura da outra peça. Não foram utilizados produtos, artes, clientes ou métricas reais da loja.

Os testes também comprovaram bloqueios de direitos desconhecidos, ausência de narração, orçamento de tempo esgotado, imagem corrompida, hash alterado, caminhos/symlinks, scripts adulterados, cache com aprovação forjada e cancelamento com limpeza de staging/lease. O manifesto mantém `approval: PENDING`, `commercial_writes: false`, custo do fornecedor offline zero e custo computacional desconhecido `null`. Aprovação visual/auditiva de mídia comercial, grants e reconciliação financeira M2 continuam externos; nenhuma publicação ou chamada paga foi realizada.
