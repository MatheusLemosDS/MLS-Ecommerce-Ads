# Identificação dos tamanhos e composição pelo catálogo

O vínculo manual existia porque o resumo dos pedidos contém IDs e quantidades,
sem os atributos que distinguem a camiseta masculina da feminina. Uma composição
com tamanhos diferentes também muda o custo do kit.

Em **Produtos e variações**, escolha a composição uma vez por produto:
**Camiseta avulsa** ou **Kit com uma masculina e uma feminina**. A ação consulta
as variações e salva em lote os tamanhos identificáveis. A escolha passa a ser
retomada dos vínculos salvos; outros tipos de kit continuam pendentes de regra.

A leitura usa `GET /api/v2/product/get_model_list` na API Global, com a conexão
financeira da loja fixa. Para kits, exige os dois eixos explicitamente chamados
masculino e feminino. Para avulsas, identifica um único eixo de tamanho, sozinho
ou acompanhado por um eixo de cor. As opções P, M, G, GG, G1, G2 e G3 são
normalizadas para maiúsculas; todos os índices precisam corresponder às opções,
inclusive o índice da cor. A ordem dos eixos pode variar. Não deduz a composição
física do produto pelos nomes, IDs, preços ou SKU.

Os vínculos automáticos de kits registram `CATALOG_VARIATION_AXES`; os de avulsas,
`CATALOG_SIZE_AXIS`. Ambos registram uma impressão
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

O diagnóstico posterior do produto `22199878767` mostrou `Cor: Verde` e
`Tamanho: p/m/g/gg`, com quatro modelos. O operador confirmou que cada unidade
é uma camiseta avulsa. Esse produto passa a abrir com **Camiseta avulsa**
selecionada; essa confirmação não se estende automaticamente a outros produtos.
A evidência está em `CATALOGO_COMPOSICAO_OBSERVADA_22199878767.json`. O diagnóstico
não contém os IDs e índices dos quatro modelos; os testes usam esses eixos com
modelos sintéticos, e a leitura real resolve os IDs retornados pela Shopee.

Avulsas usam o custo de **uma** peça: R$ 15,90 para P–GG e R$ 18,90 para G1–G3
no perfil completo atual. No perfil separado, somam uma base e cada componente
por peça uma vez; componentes marcados por kit aplicam-se somente aos kits.
As margens R$ 16,75/19,10/20,70 continuam exclusivas dos kits. A margem de uma
avulsa permanece desconhecida até existir uma regra própria; ela não é metade
da margem do kit. A referência de custo pode estar completa enquanto a de
margem continua pendente.

Uma mudança da composição não sobrescreve vínculos manuais de outro tipo. O
painel pede a revisão desses vínculos. Registros antigos mantêm os formatos,
referências e hashes anteriores; a nova união aceita avulsas sem campos falsos
de tamanho masculino ou feminino.

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

A extensão para camisetas avulsas passou em 415 testes Node, 22 verificações dos
três Workers no workerd/D1 e 19 no Chromium, incluindo o padrão Cor/Tamanho
informado pelo operador. A versão preserva custos de kits, referências históricas,
rascunhos, consultas sem alterações e a separação das margens. Layouts em
320/360/390/768/850/1365 pixels e os três dry-runs passaram. São verificações com
respostas sintéticas; a identificação real das quatro variações deve ser
executada pelo operador após a publicação dos três Workers.
