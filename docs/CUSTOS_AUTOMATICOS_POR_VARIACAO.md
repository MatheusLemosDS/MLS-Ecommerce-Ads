# Custos por tipo de produto e tamanho

O operador confirmou camiseta infantil com custo completo de **R$ 12,50 por
unidade vendida**, nos tamanhos **4, 6, 8, 10, 12, 14 e 16**. Essa regra inicial
é cadastrada automaticamente, com versão e histórico próprios.

Em **Custos → Custo por tipo de produto e tamanho**, é possível editar essa
regra e usar **Adicionar tipo de produto** para cadastrar calça baggy, short,
moletom ou outro tipo. Não há custos inventados para esses próximos produtos.

Cada regra informa:

- Nome do custo e valor completo por unidade vendida.
- Palavras que identificam o tipo no título do produto; alternativas usam `;`.
  Por exemplo, `calça baggy; calça cargo`. Cada alternativa procura todas as
  suas palavras, sem exigir a mesma ordem.
- Palavras que excluem produtos, como `kit; conjunto`.
- Nome do eixo de tamanho na Shopee, por exemplo `Tamanho; Tamanho infantil`.
- Opções que recebem o custo, por exemplo `4; 6; 8; 10; 12; 14; 16`.

Tamanhos vazios aplicam o custo à unidade inteira em todas as variações daquele
tipo. Um kit deve usar o custo completo do kit, sem duplicá-lo pelo número de
peças. Para valores diferentes por tamanho, cadastre regras com conjuntos de
opções diferentes, sem sobreposição.

## Como a identificação acontece

A leitura financeira de catálogo solicita, de forma privada, o nome do produto
em `get_item_base_info` e as opções exatas de cada modelo em `get_model_list`.
As opções são associadas pelos índices oficiais dos eixos. Códigos de SKU,
preço, posição presumida da variação e somente o número do tamanho não escolhem
o tipo do produto.

A regra infantil exige indicação de camiseta/blusa infantil no título e uma
das sete opções confirmadas no eixo de tamanho. Kits e outros tipos de roupa
são excluídos dessa regra. Um título diferente pode ser contemplado editando as
alternativas de identificação, sem cadastrar cada produto individualmente.

A consulta é limitada a três produtos por requisição. Metadados recentes são
reutilizados; depois de quinze minutos, dados vencidos não liberam novos custos
automáticos até a atualização. A coleta em segundo plano prioriza produtos
novos ou antigos, evitando repetir continuamente as mesmas exceções.

Nenhuma chamada modifica o anúncio ou o catálogo da Shopee. Nome do produto e
opções entram apenas no catálogo privado de custos; dados de compradores, SKUs,
credenciais e outros campos da resposta não são projetados.

## Prioridade e pendências

Quando a identificação automática não reconhecer o produto, em **Produtos →
Tipo e tamanho** é possível selecionar **Camiseta infantil** e aplicar a regra
ao produto inteiro. Essa escolha identifica o tipo, sem depender do título;
o catálogo continua identificando os tamanhos das variações.

Dentro da variação também há **Custo por tipo e tamanho**: escolha o tipo,
selecione **4, 6, 8, 10, 12, 14 ou 16** e use **Salvar custo desta variação**.
Essa correção explícita funciona mesmo sem consulta ao catálogo. O preço vem
da regra salva — inicialmente **R$ 12,50** — e acompanha alterações futuras
dessa regra. Não é criado um vínculo de tamanho adulto.

As classificações por produto e variação ficam em `values.assignments`, na
mesma revisão e auditoria das regras. Variação explícita tem prioridade sobre
tipo do produto e reconhecimento automático. Uma regra removida ou desativada
deixa a associação pendente. Custos personalizados manuais de valor fixo
continuam prioritários. Clientes antigos não podem apagar essas classificações
ao enviar apenas a lista de regras.

A busca automática de custos continua mesmo com rascunhos no formulário de
composição adulta. Esses rascunhos só suspendem a gravação da composição.
Salvar uma classificação explícita remove o rascunho adulto substituído nesse
mesmo escopo e recalcula o resumo; rascunhos de outros produtos são preservados.

1. Custo personalizado manual da variação.
2. Custo personalizado manual do produto inteiro.
3. Classificação explícita por regra da variação, seguida da classificação do produto.
4. Regra automática única compatível com tipo e tamanho.
5. Padrão adulto anterior, quando o produto realmente cabe nessa convenção.

Uma calça ou um produto infantil sem regra aplicável não recebe R$ 15,90 ou
R$ 18,90 automaticamente. Duas regras que coincidam na mesma variação deixam
seu custo pendente. Metadados ausentes, vencidos ou ambíguos também permanecem
pendentes, sem virar custo zero.

As regras e o catálogo são lidos junto com os custos e vínculos em uma mesma
consulta transacional do resumo. Alterar o valor da regra recalcula os modelos
já identificados com o catálogo salvo, preservando seus vínculos manuais e o
histórico. O resumo mensal informa também a versão das regras utilizada.

Os custos entram no total de produção e no líquido previsto. O DAS-MEI mensal
continua separado, descontado uma vez por mês. Os recortes antigos de margem
de kits não são reutilizados para afirmar margem de um produto com custo
automático; o resultado aplicável fica na Visão geral.

## Publicação

O transporte de catálogo inicial envolve **App, Auth e Financeiro**: os três
precisam concluir o deploy correspondente. A correção de seleção manual de
tipo/tamanho e de rascunhos ocorre apenas no **App**, sem nova permissão de
catálogo para informar o tamanho manualmente. A conexão
OAuth, os segredos, a base original dos Workers e os domínios são preservados.
Se faltar permissão para ler os dados de produto na Shopee, o custo automático
fica pendente; os custos manuais continuam disponíveis.
