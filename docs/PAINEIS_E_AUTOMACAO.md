# Painéis e identificação automática

A visualização de muitos produtos foi ampliada com uma lista compacta,
busca, filtros e paginação. O [guia do catálogo e próximos passos](CATALOGO_COMPACTO_E_PROXIMOS_PASSOS.md)
descreve o alcance dos dados e as dependências atuais do plano.

Atualização de 20/10/2026, solicitada pelo operador para automatizar a leitura e
reorganizar os painéis. A página inicial da administração passa a mostrar o
resultado financeiro do período. Custos, produtos, Hermes, histórico e evolução
têm áreas próprias; diagnósticos e configurações avançadas ficam recolhidos.

## Atualização dos valores

Ao abrir a administração autenticada, o painel consulta automaticamente o
período padrão dos últimos sete dias e avança a coleta limitada. Reaberturas
com o mesmo intervalo reutilizam a apuração por até quinze minutos, sem criar
importações paralelas para a mesma seleção. O corte e o horário de consulta
ficam visíveis. O botão de atualização permite escolher outro intervalo de até
quinze dias. A coleta pode ser pausada e retomada; não fica repetindo consultas
financeiras no polling do Hermes.

A apuração usa um cache privado de até sessenta consultas, com retenção máxima
de trinta dias. Ao atingir a capacidade, entradas antigas sem coleta ativa podem
expirar para permitir novas consultas. Isso não altera pedidos ou pagamentos da
Shopee nem os recortes históricos salvos pelo administrador.

Repasse vem da Shopee. Produção usa as quantidades e o perfil de custo atual
cadastrado. Saldo após produção e resultado previsto são calculados e rotulados
como tal. Valores incompletos permanecem pendentes; não são substituídos por
zero. A escala de Payment em reais foi confirmada pelo operador. O protocolo
de transporte raw permanece compatível com as versões anteriores.

Consumo de anúncios e despesas externas ainda precisam de fonte compatível com
o período ou declaração explícita. O painel não inventa esses gastos nem trata
recarga como consumo. O [contrato do resultado](RESULTADO_DA_LOJA.md) mantém as
regras de devoluções, taxas já descontadas, custos padrões e liquidação.

## Produtos sem confirmação um a um

O painel consulta automaticamente os produtos sem associação e usa estas regras
de catálogo habilitadas pelo operador nesta atualização:

- Dois eixos distintos de tamanho masculino e feminino: uma camiseta de cada
  gênero por unidade, com os respectivos tamanhos.
- Um eixo genérico de tamanho, sozinho ou acompanhado apenas por cor: uma
  camiseta avulsa por unidade.

Títulos, preços e SKU não decidem a composição. Um eixo extra, tamanho inválido,
índice inconsistente ou estrutura ambígua impede aplicar um custo presumido.
As regras já salvas têm prioridade. Uma correção manual é preservada; não é
substituída pela identificação automática.

Produtos novos são consultados em lotes de até três e cada ciclo avança por até
vinte lotes. Produtos que continuarem ambíguos aparecem juntos para revisão,
sem repetir indefinidamente a mesma consulta. A lista principal mostra um
cartão por produto com composição, cobertura e faixa de custo. As variações e
a edição manual ficam disponíveis nos detalhes, sem 49 cartões abertos de um
mesmo kit.

Essa identificação não altera o catálogo da Shopee. Composições diferentes das
duas regras reconhecidas exigem uma regra de custo própria antes de apurar o
total. O custo de produção continua sendo o padrão cadastrado, não um valor
histórico de fabricação importado da Shopee.

## Visual e temas

Administração, painéis de anúncios e login compartilham a identidade visual
BrazaCommerce, com cores violeta e ardósia. O controle de tema alterna entre
**Automático**, **Claro** e **Escuro**. Automático acompanha o sistema; a
preferência fica no navegador e vale ao mudar de painel.

Os painéis de anúncios continuam separados da apuração financeira: GMV e
conversões atribuídas não são lucro total da loja. Os valores da integração
permanecem preservados. Não são alterados orçamento, campanhas, promoções ou
as proteções comerciais existentes.

## Publicação

Os três Workers usam o Git já configurado, sem novas variáveis, chaves, bindings
ou bancos. Testes locais usam respostas simuladas; a publicação no Git não
comprova que os três builds do Cloudflare já ficaram ativos.

Validação local: 493 testes Node, 17 verificações dos três Workers com D1 e 16
verificações de navegador passaram com respostas simuladas. Foram conferidos
descoberta automática, valores exatos, cache concorrente, ausência de dados,
rascunhos, pausa/retomada, todos os painéis de anúncios e da administração,
temas persistentes e larguras de 320 a 1365 pixels. Configurações e dry-runs dos
três Workers também passaram.
