# MLS Listing Factory — mockups em lote (28/10/2026)

## Por que este módulo existe

Após importar o JSON preparado pelo Codex, o operador pode selecionar uma só vez as fotos originais de várias artes. A associação usa o **nome exato do JPG ou PNG**, inclusive uma mesma foto de tamanho compartilhada por muitos anúncios. Não envia os arquivos para a Shopee.

## Operação

1. Entrar como proprietário em Produtos → Fábrica de anúncios.
2. Importar um manifesto de anúncios JSON, com SKU, tamanhos e preços declarados.
3. Em **Reanexar mockups em lote**, selecionar até 200 arquivos ou escolher uma pasta (Chrome/Edge); o total por seleção não deve ultrapassar 64 MiB.
4. A decodificação real valida JPEG/PNG, assinatura, dimensões e hash SHA-256, usando até três arquivos simultaneamente. Imagens muito grandes, formatos trocados e arquivos incorretos bloqueiam o lote inteiro.
5. Fotos com o mesmo nome são associadas a todos os anúncios que as referenciem. A ordem das imagens, preço, SKU, estoque desconhecido e texto original dos rascunhos são preservados.
6. Conferir a prévia de cada anúncio e exportar o relatório JSON de revisão. Nome idêntico não prova que a imagem original foi reencontrada: só a conferência visual permite confirmar o conteúdo.

## Limites e comportamento conservador

- Cada seleção aceita de 1 a 200 arquivos e no máximo 64 MiB; cada imagem tem limite de 2 MiB. Podem ser feitas outras seleções em seguida.
- Nome de imagem repetido, inclusive em subpastas distintas, bloqueia o lote inteiro. Renomeie as fotos com um identificador inequívoco antes de importá-las.
- Se uma foto já associada tiver o mesmo nome mas SHA-256 diferente, o lote inteiro é recusado. Revise ou altere individualmente no editor.
- Arquivos fora do manifesto são ignorados com contagem explícita; arquivos pertencentes ao manifesto e inválidos bloqueiam o lote.
- Uma associação parcial não recebe confirmação de revisão completa; as fotos faltantes continuam pendentes até serem incluídas.
- O reconhecimento por filename não compara com hashes de sessão antiga (o manifesto JSON contém somente os nomes). Revisão visual do operador continua obrigatória.
- A solução só usa memória local desta aba. Não acessa cookie, token, D1, API, Shopee, Ads nem Promo. Não carrega os bytes das imagens dentro dos JSON exportados.

## Desenvolvimento e evidência

PR #60 (draft): https://github.com/MatheusLemosDS/MLS-Ecommerce-Ads/pull/60
PR de CI temporária #61 (não mesclar): https://github.com/MatheusLemosDS/MLS-Ecommerce-Ads/pull/61
Contrato puro: web/cloudflare/src/mls-listing-factory-planner.mjs (planMlsDraftBatchMedia).
Editor local: web/cloudflare/src/mls-listing-factory-view.mjs.
Testes: web/cloudflare/tests/mls-listing-factory-batch-media.test.mjs e mlS-listing-factory-chrome.test.mjs (nome correto no código: mls-listing-factory-chrome.test.mjs).
CI inicial 40790379512: 2.132 Node, 2.128 PASS e quatro falhas de integridade por App SHA novo; nenhum teste de funcionalidade falhou. App SHA revisado: 63da28d212c45d1e7e93444dbe4ac2ac49ad113af273dddf65370f668156180d. Precisa CI verde da revisão final.

## Gates

CI inteira Node/Python/Chrome e App SHA; QA autenticada desktop e celular com mockups de verdade; integração PR #51 → #56 → #60; conferir PR #48; preservar M2 issue #50 e Ads/PROMO LOCKED. Nenhum merge/deploy nesta PR sem aprovações.
