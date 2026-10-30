# Mídia da prévia local do proprietário

30/10/2026. Estes arquivos demonstram o software com **camisetas sintéticas próprias**, sem produtos, artes, clientes ou métricas reais da loja. São arquivos locais para homologação; não existe publicação ou chamada paga.

## Preparar exemplos sem renderizar

Com Node 24, execute na raiz do repositório:

```sh
node tools/mls_owner_preview_assets.mjs --directory /tmp/mls-owner-preview-media
```

O comando cria quatro PNGs originais, três fichas de produtos, três campanhas e entradas válidas para os templates Nostalgia 80/90/2000, Detalhes e Kit casal. O índice `demo-index.json` registra somente os arquivos conhecidos, com nome relativo, tipo, tamanho e SHA-256. Sem `--render-local`, o índice não apresenta vídeos como gerados.

`/tmp` é temporário e pode desaparecer ao reiniciar o ambiente. Para conservar os exemplos, escolha uma pasta local própria com `--directory`. Não são necessários tokens de marketplace ou acesso à produção.

## Gerar os três vídeos reais

Instale FFmpeg, ffprobe, fontes DejaVu e eSpeak NG com a voz `pt-br`, conforme a política do seu ambiente. O script não instala programas nem usa TTS remoto. Com os executáveis no PATH:

```sh
node tools/mls_owner_preview_assets.mjs --directory /tmp/mls-owner-preview-media --render-local
```

Uma instalação portátil do eSpeak NG pode ser indicada explicitamente:

```sh
node tools/mls_owner_preview_assets.mjs --directory /tmp/mls-owner-preview-media --render-local --espeak /tmp/mls-owner-preview-tts/root/usr/bin/espeak-ng --espeak-data /tmp/mls-owner-preview-tts/root/usr/lib/x86_64-linux-gnu --espeak-lib /tmp/mls-owner-preview-tts/root/usr/lib/x86_64-linux-gnu
```

O caminho portátil acima existe apenas quando preparado localmente. A reprodução desta sessão baixou os cinco pacotes Debian e conferiu cada SHA-256 contra o [ensaio R0 já auditado](MLS_AI_SALES_POC_EVIDENCE.md), extraindo-os em `/tmp` sem instalação privilegiada. Nenhum binário foi incluído no repositório. As licenças dos executáveis continuam independentes da licença do código MLS.

O comando usa o renderer real `tools/mls-ai-sales/render.mjs`: valida direitos declarados para as fixtures, variantes e componentes dos kits, hashes dos originais, MP4 H.264/AAC, 1080×1920/30 fps, ffprobe e decodificação integral. Voz sintética PT-BR é offline; o roteiro usa `LOCAL_TEMPLATE`, não um LLM. A aprovação visual e auditiva continua `PENDING`.

## Resultado verificado nesta sessão

Três vídeos reais de 15 segundos foram gerados e depois retomados pelo cache validado. Todos os 23 arquivos do índice tiveram tamanho e hash conferidos novamente.

| Template | Bytes do MP4 | SHA-256 |
|---|---:|---|
| Nostalgia | 276.497 | `f20d3d813288ddf9ced40bd1734e561ffabbbaddc00adcf845e56fae1f8abdc6` |
| Detalhes | 276.189 | `16a229c4508d362a0e7a05275db8d7ac0dc5141b8d9ff37e623c2ad4996a19f4` |
| Kit casal | 312.639 | `697f1729a26571d68b475a3e34e5a8ac0be68e0588e12f68154a90b612cb0357` |

Versões desta reprodução: Node 24.19.0, FFmpeg/ffprobe `7.1.5-0+deb13u1`, eSpeak NG `1.52.0+dfsg-5`. Essas versões repetiram os bytes dos MP4s do ensaio R1; outras versões podem gerar hashes diferentes. A pasta de saída inclui vídeo, miniatura, SRT, roteiro e manifesto para cada template. Tempo medido é registrado pelo renderer, custo do fornecedor offline é zero e custo computacional não medido permanece `null`.

O servidor da prévia deve receber `mediaDirectory` e ler esse índice; não deve transformar uma URL fornecida no navegador em caminho de arquivo. A sessão e os controles de acesso continuam sob responsabilidade do servidor local. Preparar os exemplos sem renderizar novamente recria um índice estático; para manter a galeria de vídeos, inicie o servidor lendo o índice existente ou repita a preparação com `--render-local`.

## Verificação do preparador

```sh
node --test tools/tests/mls-owner-preview-assets.test.mjs
```

Seis testes comprovam inventário exato, dados desconhecidos preservados, retomada sem renovar a origem, recusa a originais alterados/symlinks, retomada após cancelamento e argumentos fechados. Não foram alterados App/Auth/Finance, D1 da loja, OAuth, permissões comerciais ou produção.
