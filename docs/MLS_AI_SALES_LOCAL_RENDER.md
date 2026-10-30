# MLS AI Sales — render local de vídeos

O módulo gera arquivos locais para revisão. Ele não possui cliente HTTP, publicador, upload, convite ou alteração de marketplace. `READY_FOR_OWNER` significa somente que as verificações técnicas passaram; a aprovação visual e auditiva continua necessária.

## Preparação

Use Node 24+, FFmpeg/ffprobe com libx264, AAC, drawtext e fonte DejaVu Sans. Para a narração offline, instale separadamente eSpeak NG com a voz `pt-br`. Nenhum binário, modelo ou fonte é redistribuído por este repositório. As licenças e o ensaio das alternativas estão em [MLS_AI_SALES_POC_EVIDENCE.md](MLS_AI_SALES_POC_EVIDENCE.md).

Exporte um manifesto local no Studio e reúna os PNG/JPEG originais em uma pasta. Os nomes precisam ser exatamente os `file_name` do manifesto; hashes, dimensões, decodificação, autorização declarada e cobertura de cada componente são conferidos novamente. Fotos de dois ângulos da mesma peça não completam um kit com duas peças diferentes. Arquivos remotos, links simbólicos, traversal, imagens animadas e arquivos que mudam durante a leitura são rejeitados.

## Conferir e gerar

O comando padrão é uma conferência: valida o manifesto, as ferramentas e a decodificação das imagens, sem criar MP4 ou a pasta de saída.

```sh
node tools/mls_ai_sales_cli.mjs \
  --manifest ./campanha.json --assets ./originais \
  --espeak espeak-ng --report ./conferencia.json
```

A geração exige `--render-local` e uma pasta de saída separada da pasta dos originais:

```sh
node tools/mls_ai_sales_cli.mjs \
  --manifest ./campanha.json --assets ./originais \
  --espeak espeak-ng --render-local --out ./videos \
  --report ./resultado.json
```

Os arquivos de relatório usam criação exclusiva e não sobrescrevem um arquivo anterior. É possível informar executáveis com `--ffmpeg`, `--ffprobe` e `--espeak`; `--espeak-data`, `--espeak-lib` e `--font` atendem instalações locais explícitas. Nenhum argumento é executado por shell. Interromper o processo com SIGINT/SIGTERM cancela o subprocesso e limpa o staging.

Templates disponíveis: `NOSTALGIA_80_90_2000`, `PRODUCT_DETAILS` e `COUPLE_KIT`. Um manifesto simples contém uma campanha; o formato `mls_ai_sales_batch_input_v1` aceita até três campanhas e dez variantes, totalizando no máximo trinta trabalhos. Produtos e variantes usam identidade por loja/provedor/ID, nunca associação por título ou SKU.

## Narração e segurança da mídia

O modo `ESPEAK_NG` gera voz sintética local em português brasileiro e mede cada frase para produzir as legendas. A voz é formante; não há promessa de qualidade neural. Alternativamente, `LOCAL_WAV` usa áudio original autorizado, com hash e segmentos declarados que correspondam ao roteiro. A ausência de narração bloqueia o render. O roteiro é um template local identificado como `LOCAL_TEMPLATE`, sem alegar uso de LLM ou inventar preço, material, estoque e desconto.

A composição mantém a proporção e o quadro completo das imagens, sem crop, espelhamento, rotação ou recoloração da arte. Textos ficam fora da área reservada ao produto. A codificação H.264/AAC é lossy; hash identifica a imagem original, não igualdade binária de pixels recomprimidos.

## Saída e retomada

Cada trabalho aprovado tecnicamente entrega somente:

- `video.mp4`: H.264/AAC, 1080 × 1920, 30 fps, 15–30 segundos;
- `thumbnail.jpg`, `captions.srt` e `script.txt`;
- `manifest.json`: vínculos de campanha/produto/variante, hashes dos originais e de seus metadados, componentes, ferramentas, duração, tamanho, QA e aprovação pendente.

O pipeline exige ffprobe e decodificação integral do MP4 antes da publicação atômica no diretório local. O limite de tempo do manifesto, limites de tamanho, espaço em disco, concorrência única e processos com prazo são aplicados. Uma falha deixa um diagnóstico sanitizado e não transforma um arquivo parcial em vídeo aprovado.

A mesma entrada reutiliza o resultado somente depois de reanexar e verificar os bytes originais, o vídeo completo e os vínculos e hashes do manifesto. Alterar arte, autorização, composição, roteiro, template ou narração muda a chave. Um cache alterado é recusado. Essa retomada local não comprova direitos legais nem autorização de API.

O custo conhecido do fornecedor no modo offline é zero. CPU/energia não mensuradas permanecem `local_compute_cost_cents: null`. As saídas não comprovam lucro financeiro, estoque disponível ou permissão para publicar.

## Verificação reproduzível

```sh
node --test tools/tests/mls-ai-sales-media.test.mjs
```

O teste usa somente camisetas e artes assimétricas sintéticas criadas pelo próprio teste. Ele gera os três templates com voz PT-BR, decodifica todos os vídeos, verifica a posição da arte, os hashes, o cache e os bloqueios. `MLS_AI_SALES_ARTIFACTS_DIR` preserva os artefatos fora do repositório. Para uma instalação eSpeak portátil, os testes aceitam `MLS_AI_SALES_ESPEAK_BIN`, `MLS_AI_SALES_ESPEAK_DATA` e `MLS_AI_SALES_ESPEAK_LIB`.
