# Catálogo compacto e próximos passos

O operador confirmou em 20/10/2026 que a reformulação melhorou o painel e pediu
uma forma mais fácil de visualizar muitos produtos. A nova lista organiza os
produtos carregados em linhas compactas, com busca, filtros, ordenação e páginas
de 20, 50 ou 100 produtos. As variações e correções ficam nos detalhes.

A busca e os primeiros produtos têm prioridade na tela. No celular, filtros
avançados e informações do recorte ficam recolhidos; as ações dos detalhes
compartilham uma linha para reduzir a rolagem.

## Como a lista funciona

- Busca por identificação do produto, identificação da variação, tamanho ou
  composição reconhecida.
- Filtros de situação e composição para revisar pendências ou localizar kits e
  camisetas avulsas.
- Ordenação por unidades no recorte, faixa de custo cadastrado, identificação
  do produto ou pendências.
- Contadores distinguem o total carregado do resultado dos filtros e da página
  exibida. Uma busca sem resultados pode ser limpa sem apagar os dados.

Busca e filtros consultam todos os dados carregados, não apenas os produtos da
página atual. Paginação não restringe a identificação automática. Rascunhos
permanecem salvos na memória ao mudar de página ou filtro, e o botão de salvar
considera as alterações de todas as páginas. As variações são montadas na tela
quando os detalhes do produto são abertos.

A identificação mostrada corresponde aos IDs recebidos da integração. Não há
nomes, fotos ou estoque inventados. A quantidade usa o recorte de pedidos
retornado pela API, incluindo seus status; não é um ranking de vendas pagas ou
lucro. Variações já associadas podem aparecer sem unidades no recorte atual.
Os custos são os padrões cadastrados na versão salva.

## O que falta para seguir o plano

O painel, os temas, a conexão financeira, a consulta do repasse, os custos e a
identificação automática das estruturas reconhecidas formam a base disponível.
Isso ainda não fecha o resultado liquidado nem um ranking de lucro por produto.

As próximas dependências são:

1. **Conciliar a rentabilidade:** compatibilizar o consumo de anúncios com o
   período, confirmar devoluções, ajustes e liquidação e conferir totais contra
   a Shopee. Recarga de saldo não é consumo publicitário.
2. **Consolidar a visão por produto:** relacionar receita e deduções às linhas
   corretas de produto/variação, identificar rateios como estimativas e integrar
   estoque e disponibilidade. Quantidade, GMV e ROAS isolados não comprovam lucro.
3. **Identificar campeões com base suficiente:** comparar contribuição depois
   de anúncios, devoluções, estoque e qualidade dos dados em períodos compatíveis.
4. **Preparar propostas comerciais:** anúncios e ofertas dependem das APIs e
   permissões correspondentes, limites e revisão do escopo antes da execução.
5. **Liberar automação controlada:** somente com orçamento, perda máxima,
   margem e estoque mínimos, auditoria, pausa e avaliação de resultados.

O plano exibido no painel passa a indicar essas pendências. A melhoria da lista
não habilita campanhas ou promoções e não transforma quantidades do recorte em
lucro confirmado.

## Validação da entrega

Passaram 499 testes Node e 13 verificações de navegador com uma base simulada
de 123 produtos e 414 variações. Foram conferidos busca global, filtros,
ordenação, páginas de 20/50/100 produtos, identificação fora da página visível,
abertura sob demanda, rascunhos entre páginas, salvamento dos itens ocultos e
atualização imediata dos custos salvos. Layouts claro e escuro de 320 a 1365
pixels, configurações de publicação e dry-run do App passaram. Os Workers de
Auth e Financeiro preservam os mesmos artefatos da versão anterior. Os testes
não consultam a loja em produção.
