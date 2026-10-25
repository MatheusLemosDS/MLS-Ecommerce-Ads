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

A identificação por nome usa a indicação de camiseta/blusa infantil no título
e uma das sete opções confirmadas no eixo de tamanho. Títulos genéricos também
podem ser reconhecidos quando há evidência suficiente de tipo e tamanho,
conforme as regras de reconhecimento descritas abaixo. Kits e outros tipos de
roupa não recebem o custo infantil por terem o mesmo número de tamanho.

A consulta é limitada a três produtos por requisição. Metadados recentes são
reutilizados; depois de quinze minutos, dados vencidos não liberam novos custos
automáticos até a atualização. A coleta em segundo plano prioriza produtos
novos ou antigos, evitando repetir continuamente as mesmas exceções.

Nenhuma chamada modifica o anúncio ou o catálogo da Shopee. Nome do produto e
opções entram apenas no catálogo privado de custos; dados de compradores, SKUs,
credenciais e outros campos da resposta não são projetados.

## Aprendizado a partir de correções

Salvar o tipo e o tamanho de uma variação passa a consultar o catálogo desse
produto. Se o catálogo recente confirmar o tamanho escolhido e as correções
do produto indicarem a mesma regra, essa identificação é reaproveitada nas
demais variações compatíveis. Novas variações também seguem a regra após a
atualização do catálogo. Por exemplo: confirmar uma camiseta infantil tamanho
4 permite identificar os tamanhos 6 a 16 do mesmo produto, mesmo com um título
antigo que não diga “infantil”.

A memória é a correção guardada em `values.assignments`, com sua revisão e
auditoria, junto com as evidências do catálogo. As correções já salvas também
são reaproveitadas, sem precisar confirmá-las de novo. Não há cópia de vínculos
para cada tamanho, alteração automática dos preços ou treinamento externo de
um modelo. O custo sempre vem da regra atual cadastrada.

Uma regra específica da variação e um tipo explicitamente escolhido para o
produto inteiro continuam prioritários. Correções divergentes, eixo ambíguo,
tamanho contraditório ou ausência de qualquer referência corrigida no catálogo impedem
propagar a identificação. Fonte vencida interrompe novos custos inferidos;
a correção individual e os custos manuais são preservados. Um tamanho fora
da regra, como 18 quando ela cobre somente 4 a 16, continua pendente.

A lista mostra **Aprendido com sua correção** quando a evidência sustenta esse
reaproveitamento. Também mostra quantidade de variações com custo e pendências.
O resumo financeiro usa a mesma identificação e a mesma revisão das regras.

## Reconhecimento de novos produtos infantis

Além do aprendizado do mesmo produto, a regra infantil já confirmada pode
reconhecer um novo título genérico de camiseta, camisa ou blusa quando:

- Todas as variações tenham um único eixo de tamanho reconhecido.
- Todos os tamanhos observados pertençam às opções infantis confirmadas, de
  4 a 16. Formatos como `4 anos` são normalizados.
- O único eixo adicional, quando existir, seja cor ou estampa.
- O título não indique kit, casal, conjunto, calça, short, moletom, produto
  adulto, roupa para boneca, pet ou outro tipo incompatível.

Essa identificação aparece como **Reconhecido pelo tipo e pelos tamanhos
infantis**. Ela é uma regra de negócio confirmada, não aprendizado de palavras
arbitrárias de um título. O sistema não propaga o custo de uma camiseta a uma
calça nem inventa custo para produtos futuros. Mistura de tamanhos adultos e
infantis, eixos desconhecidos ou duas regras compatíveis mantêm a exceção em
revisão. Classes e custos futuros continuam sendo cadastrados em Custos.

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
4. Tipo aprendido a partir de correção coerente e catálogo recente do mesmo produto.
5. Regra automática única compatível com tipo e tamanho.
6. Padrão adulto anterior, quando o produto realmente cabe nessa convenção.

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
tipo/tamanho, o aprendizado por correção e o reconhecimento ampliado ocorrem
apenas no **App**. Informar o tamanho manualmente não exige nova consulta;
propagar a identificação exige leitura validada do catálogo. A conexão
OAuth, os segredos, a base original dos Workers e os domínios são preservados.
Se faltar permissão para ler os dados de produto na Shopee, o custo automático
fica pendente; os custos manuais continuam disponíveis.
