# MLS Listing Factory V1 — preparador local de anúncios (28/10/2026)

STATUS: PROTÓTIPO FUNCIONAL DE REVISÃO LOCAL EM PR #51. Não publicado no MLS Commerce OS, não consulta Shopee, não faz upload nem cria anúncios.

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
