# Identificação dos tamanhos pelo catálogo

O vínculo manual existia porque o resumo dos pedidos contém IDs e quantidades,
sem os atributos que distinguem a camiseta masculina da feminina. Uma composição
com tamanhos diferentes também muda o custo do kit.

Em **Produtos e variações**, a ação por produto estabelece uma única regra:
uma unidade desse produto contém uma camiseta masculina e uma feminina. A ação
consulta as variações do produto e salva em lote as combinações identificáveis.
Produtos avulsos e outros tipos de kit continuam com regras separadas.

A leitura usa `GET /api/v2/product/get_model_list` na API Global, com a conexão
financeira da loja fixa. Só associa tamanhos quando existem exatamente dois eixos
explicitamente identificados como masculino e feminino, com opções P, M, G, GG,
G1, G2 ou G3 e índices válidos para cada modelo. A ordem dos eixos pode variar.
Não deduz tamanhos de IDs, preços, títulos, SKU ou de uma dupla sem gênero.

Os vínculos automáticos registram a origem `CATALOG_VARIATION_AXES` e uma impressão
SHA-256 da estrutura consultada. Não são marcados como confirmação manual. Uma
edição manual tem prioridade. Nova consulta substitui as interpretações automáticas
do produto: modelos ausentes ou ambíguos deixam de usar uma interpretação antiga.
Os recortes históricos preservam a interpretação usada quando foram registrados.

Cada ação exige sessão administrativa, origem e CSRF válidos. App e Auth usam
rotas privadas fixas; a chave e os tokens ficam no Financeiro. A operação não
altera o catálogo da Shopee. Não roda ao abrir a página ou no polling do painel.
Há limites de três produtos por requisição, mil modelos/vínculos por resposta,
JSON de 64 KiB por chamada à Shopee e dez segundos por chamada, sem retries.

A estrutura pública de `get_model_list` é tratada como contrato de entrada e
validada integralmente antes de salvar. Ainda é necessário observar uma execução
real nesse app para confirmar o acesso à API e se os nomes usados no catálogo da
loja seguem os dois eixos reconhecidos. Uma resposta incompatível fica pendente;
ela não é evidência de tamanho ou custo zero.

Se a identificação ficar pendente, **Dados do catálogo** mostra os nomes dos
campos recebidos, até sete opções de cada campo e o motivo da pendência. O botão
**Copiar diagnóstico das variações** copia somente esse resumo limitado para
permitir conferir o formato real da loja. Ele não copia a resposta inteira da API,
dados de pedidos, preços ou credenciais. Os textos são exibidos literalmente.
Esses nomes e opções não são gravados no banco de vínculos. Repetir uma consulta
sem alterar os vínculos preserva a revisão, a data e a auditoria existentes.

A imagem recebida após a primeira publicação confirmou uma consulta sem tamanhos
identificados, mas não mostrou os nomes dos campos ou opções. Por isso esta etapa
adiciona o diagnóstico e mantém as regras de identificação: o formato da loja
ainda precisa ser observado antes de aceitar uma nova interpretação.

Esta associação fornece referências de produção e margem. A conciliação dos
pagamentos e a confirmação da unidade monetária da amostra financeira continuam
etapas independentes.

Validação local desta entrega: 381 testes Node passaram; 15 verificações dos
três Workers no workerd/D1 e 11 verificações no Chromium passaram, incluindo
larguras de 320 a 1365 pixels. As configurações e os três dry-runs do Wrangler
passaram. Essas verificações usam respostas sintéticas e não comprovam a
disponibilidade da API no app real.

A amostra financeira fornecida pelo operador em `checked_at=1792436574` permanece
`VALIDATED`, com revisão de token 4 e dois itens. O registro está em
`FINANCE_PAYMENT_SAMPLE_OBSERVADO_1792436574.json`. Essa amostra confirma tipos e
identidade; não inclui nomes de tamanhos nem confirma unidade monetária ou lucro.

A atualização do diagnóstico passou em 390 testes Node, 17 verificações no
workerd/D1 e 14 no Chromium. Foram conferidos a cópia limitada, o texto literal,
as opções longas com detalhes abertos em 320–1365 pixels, a compatibilidade com
respostas antigas e a preservação de revisão e auditoria nas consultas sem
alterações. Os três dry-runs e as configurações de publicação passaram.
