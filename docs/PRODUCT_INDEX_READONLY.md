# Índice completo de produtos: leitura oficial

O índice usa somente `GET /api/v2/product/get_item_list` no host Global já usado pela aplicação financeira. A loja e o parceiro são os valores fixos de `FINANCE_PROFILE`; o chamador escolhe somente deslocamento, tamanho da página e um estado da lista permitida. Cada chamada lê uma página de até 50 produtos, sem alterações na Shopee.

Fontes públicas conferidas em 2026-10-25:

- [Guia oficial de produtos](https://open.shopee.com/developer-guide/221): o resultado indexado informa que `get_item_list` lista produtos da loja e permite filtrar por estado e atualização.
- [Referência oficial do endpoint](https://open.shopee.com/documents/v2/v2.product.get_item_list?module=89&type=1): a página completa permaneceu bloqueada pelo proxy deste ambiente.
- [Schemas públicos do SDK Shopee](https://raw.githubusercontent.com/congminh1254/shopee-sdk/main/src/schemas/product.ts): corroboram `offset`, `page_size` com máximo oficial de 100, `item_status`, `response.item`, `total_count`, `has_next_page`, `next_offset` e `item.update_time`.

Estados preservados: `NORMAL`, `BANNED`, `UNLIST`, `REVIEWING`, `SELLER_DELETE` e `SHOPEE_DELETE`. Não existe um estado inventado `DELETED` neste contrato. Registros excluídos permanecem históricos e não indicam disponibilidade para venda. O índice não inclui estoque disponível, preço, compradores ou pedidos.

O contrato interno `product_index_v1` conserva o estado consultado, o deslocamento, os metadados de paginação fornecidos pela Shopee e os IDs com seus horários de atualização. Ausência de horário produz `null`. O término segue `has_next_page`, sem supor que `total_count` seja uma contagem imutável por filtro: produtos podem mudar durante uma varredura.

As três fronteiras App → Auth → Finance validam novamente a página. Entradas extras, IDs duplicados, escopo incorreto, página acima do limite e deslocamento sem progresso são recusados. Os testes usam somente chaves e respostas fictícias; não houve consulta autenticada real nem publicação durante a implementação.
