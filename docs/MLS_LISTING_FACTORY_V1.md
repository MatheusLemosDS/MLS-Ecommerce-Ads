# MLS Listing Factory V1 — preparador local de anúncios (28/10/2026)

STATUS: PR #51 contém o CLI local; PR #56 (draft, empilhada) contém o editor visual de rascunhos no painel autenticado Produtos. Nenhuma PR foi integrada ou publicada no MLS Commerce OS. Não consulta Shopee, não faz upload nem cria anúncios.

## Requisitos

Node >= 24. Coloque os arquivos PNG/JPG/JPEG de um ou mais anúncios numa pasta local. Os arquivos não são modificados. O CLI lê no máximo 2 MiB por arquivo, checa assinatura/cabeçalho/dimensões e calcula SHA-256 dos bytes. A checagem é do cabeçalho, não é decodificação integral da imagem; revise visualmente os mockups antes de usar.

## Exemplo para uma estampa

Crie um arquivo manifest.json com o texto a seguir (substitua os arquivos por seus mockups originais).

~~~json
{
  "schema": "mls_listing_factory_input_v1",
  "marketplace": "SHOPEE_BR",
  "items": [
    {
      "client_ref": "camiseta-retro-001",
      "title": "Camiseta retrô estampada estilo anos 2000 unissex",
      "description": "Camiseta estampada sob encomenda. Confira cuidadosamente as medidas, composição e orientações antes de escolher.",
      "images": ["foto1.jpg", "foto2.jpg", "foto3.jpg", "foto4.jpg", "foto5.png"],
      "variants": [
        {"sku": "RETRO001-P", "size": "P", "price_cents": 4990, "stock_quantity": null},
        {"sku": "RETRO001-M", "size": "M", "price_cents": 4990, "stock_quantity": null},
        {"sku": "RETRO001-G", "size": "G", "price_cents": 4990, "stock_quantity": null}
      ]
    }
  ]
}
~~~

Valores do exemplo são apenas dados fictícios de teste de formulário, não preços recomendados. stock_quantity=null significa que estoque NÃO foi comprovado. Cost/promo/budget não são calculados por este CLI.

## Executar

~~~bash
node tools/mls_listing_factory_cli.mjs manifest.json ./minhas-imagens ./saida/revisao.json
~~~

O arquivo revisao.json conterá total por lote, pendências e cada anúncio proposto com metadados das imagens. Não contém bytes das fotos, portanto NÃO é um pacote de upload. O formato não é CSV oficial da Shopee. Pode usar de 1 a 500 anúncios por chamada local; eles são agrupados em lotes internos de até 100 para facilitar revisão, SEM afirmar que o endpoint oficial aceitará 100 na nossa conta.

## Regras internas iniciais

- 5 a 9 imagens por anúncio por padronização operacional do usuário, não regra oficial comprovada.
- JPG ou PNG de no máximo 2 MiB, dimensões >=500px e proporção 1:1 na triagem inicial; abaixo de 1024px recebe alerta de qualidade.
- Título entre 5 e 120 caracteres; descrição 15 a 5000 caracteres; uma a 32 variações com preço em centavos inteiro e SKU distinto.
- Quantidade por variação pode ser null para marcar estoque desconhecido. Não preencher a partir das vendas.
- Imagem falsa, ausente, fora da pasta raiz, atalho/symlink para fora, nome inválido ou mal dimensionado gera pendência.
- Um manifesto READY_FOR_OPERATOR_REVIEW ainda necessita confirmação de preço, custo, estoque, permissões, imagens, direitos e aprovação formal antes de qualquer publicação oficial.

## Limites de segurança

O script não acessa a internet nem roda operações Shopee. Nunca carregue credenciais/cookies/IDs de compradores no JSON. A assinatura de imagem e o hash não garantem que um arquivo será aceito no marketplace; uma futura etapa fará decodificação real, validação por categoria e MediaSpace. O schema pode evoluir sem alterar a base M2.

## Editor visual no painel Produtos — PR #56

Na versão de teste da PR #56, abra **Produtos → Fábrica de anúncios** como administrador. Informe código da arte, prefixo SKU, título e descrição. Tamanhos P/M/G/GG estão pré-selecionados; G1/G2/G3 e outros tamanhos (ex.: 2, 4, 6, 8, Único) são opcionais. O preço base (R$) é aplicado automaticamente aos tamanhos ainda não editados; preços individualizados permanecem. O botão **Aplicar a todos os tamanhos** substitui os preços individuais quando usado explicitamente. Estoque vazio é UNKNOWN, não zero.

Selecione de **5 a 9 arquivos JPG/PNG** da sua pasta de mockups. O navegador confere assinatura do formato, dimensões de cabeçalho antes da decodificação (limite de 16 milhões de pixels), decodifica realmente cada imagem, cria uma prévia pequena e calcula SHA-256 dos bytes. O processamento é local com até três arquivos por vez. Uma imagem malformada permanece como pendência; nunca é contada como aprovada. **O editor guarda apenas metadados, hashes e prévias leves em memória desta aba; não faz upload nem conserva os arquivos brutos**. Não feche a aba antes de exportar.

Clique **Adicionar à fila de revisão** por arte. A fila permite **Editar**, **Remover** e **Limpar fila**. Exporte **anúncios JSON** (mesmo schema do CLI, com nomes das fotos) e **revisão JSON** (metadados das imagens, erros e avisos). O CLI continua disponível independentemente. `READY_FOR_OPERATOR_REVIEW` não significa estoque validado, preço rentável, permissão na Shopee ou anúncio publicado.

**Teste automatizado**: `web/cloudflare/tests/mls-listing-factory-owner-ui.test.mjs` verifica HTML compilado normal/minificado; `web/cloudflare/tests/mls-listing-factory-chrome.test.mjs` abre o Chrome real e valida PNGs, extensão falsa, imagens excessivas, preços por tamanho, edição, conteúdo escapado e JSON exportado. A PR permanece draft até validação visual autenticada no desktop/celular e checagem dos gates.

## Continuar um lote pelo JSON — incremento PR #56

O editor exige preço informado pelo operador: **não há preço padrão**. O preço base atualiza somente tamanhos ainda não personalizados; o botão Aplicar a todos substitui os preços individuais por solicitação expressa.

Depois de criar seus anúncios, clique em **Exportar anúncios JSON**. Use **Retomar anúncios de um arquivo JSON anterior** para importar um manifesto do mesmo formato (até 1 MiB e até 500 anúncios). A importação substitui a fila somente após confirmação. O relatório de revisão não é aceito como entrada. O leitor rejeita nomes de imagens inválidos, variações malformadas e campos inesperados. Para continuar no Codex, use o mesmo arquivo JSON, sem incluir tokens.

As fotos não fazem parte do JSON: o editor conserva seus nomes, mas exige **reanexar os mockups locais** antes de considerar um anúncio pronto para revisão. Pode editar o título sem perder as referências às fotos, porém sem os arquivos originais o estado continua NEEDS_CORRECTION. A fila mostra **8 anúncios por página** para não sobrecarregar o celular quando houver centenas de artes.

Os testes Chrome incluem retorno do manifesto, conteúdo HTML escapado, arquivo JPEG falso, dimensões excessivas e paginação de 19 anúncios. A CI final da integração passou no run #40788713558: **2.126 testes Node e 67 Python**, com Chrome real, 13/13 blobs de código idênticos aos da PR #56 e builds App/Auth/Finance gerados. **Não houve merge ou deploy**; QA visual autenticada no desktop/celular segue pendente. Ver MLS_LISTING_FACTORY_CI_2026_10_28.md.

## Reanexar mockups em lote — PR #60

Com anúncio importado por JSON, use **Reanexar mockups em lote**. Selecione até 200 JPG/PNG (máximo 64 MiB somados) ou uma pasta no Chrome/Edge. O navegador associa cada arquivo pelo nome exato a todos os rascunhos que tenham essa referência — ideal quando fotos de tabela de medidas, cuidados ou detalhes são reutilizadas em várias estampas. A verificação usa hash SHA-256, decodificação real e três processos locais simultâneos. Se encontrar dois nomes iguais na seleção, arquivo inválido ou mudança de hash em foto já vinculada, o lote é recusado sem alterações parciais. Arquivos sem correspondência são ignorados com contagem. Consulte [o guia de imagens em lote](MLS_LISTING_FACTORY_BATCH_RELINK_2026_10_28.md).

**Atenção:** o JSON não guarda a imagem original nem seu hash anterior; nome igual exige conferência visual e não autoriza publicar. Esta PR está isolada sem merge/deploy.
