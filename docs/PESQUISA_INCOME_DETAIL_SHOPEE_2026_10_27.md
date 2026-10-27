# Pesquisa Shopee — Income Detail para Pending — 27/10/2026

## Decisão

Usar `v2.payment.get_income_detail` como **evidência atual por pedido** do estado
Pending para a loja local brasileira, em background e com leitura limitada.
Não usar esse endpoint como competência mensal, extrato bancário ou prova de
lucro realizado.

## Evidência documental encontrada

O contrato gerado a partir da documentação da Open Platform descreve
`get_income_detail` como a visão granular equivalente a **Income Details** do
Seller Centre. O endpoint é:

```
POST /api/v2/payment/get_income_detail
```

Para **Local Shop**:

- `income_status = 1`: Released;
- `income_status = 2`: Pending.

O contrato informa que `date_from` e `date_to` são usados para Released. Para
os demais estados, inclusive Pending, são exibidos os registros **atualmente
naquele estado**. Mesmo assim os campos de data são marcados como obrigatórios,
então o coletor envia uma janela curta e válida sem tratá-la como escopo
contábil do Pending.

Campos documentados de detalhe incluem:

- `order_sn`;
- `status`;
- `currency`;
- `estimated_escrow_amount`;
- `estimated_payout_time`;
- `creation_date`;
- `released_amount`;
- `actual_payout_time`;
- `payment_method`;
- `description`.

A resposta observada no fixture do SDK usa
`income_detail_list.list` e `income_detail_list.next_page.cursor`.

## Referências públicas verificadas

- Open Platform URL indicada pelo contrato:
  `https://open.shopee.com/documents/v2/v2.payment.get_income_detail?module=97&type=1`
- SDK gerado e mantido publicamente:
  `Naputt1/shopee-v2-go/payment.gen.go`
- Tipos gerados:
  `Naputt1/shopee-v2-go/payment.type.gen.go`
- Fixture:
  `Naputt1/shopee-v2-go/fixtures/v2.payment.get_income_detail_resp.json`

A página oficial completa pode exigir sessão/permissão e não foi usada com
credenciais da conta nesta pesquisa. O SDK/fixture confirmam o formato
documental, não a resposta real desta loja.

## Política de implementação

Primeiro incremento:

1. somente `income_status=2`;
2. `page_size=100`;
3. primeira página apenas;
4. `has_more=true` mantém a cobertura explicitamente parcial;
5. `order_sn` é convertido para SHA-256 no Finance Worker e nunca é exposto;
6. moeda precisa ser BRL para entrar no contrato da loja local;
7. valor decimal com mais de duas casas é preservado como raw e não vira
   centavos inventados;
8. o provider só é chamado se o snapshot de Income Overview já tiver
   `pending_cents > 0`;
9. o round-robin mantém no máximo uma leitura privada por oportunidade;
10. abrir o detalhe no painel lê somente D1 local.

## O que não é inferido

- `estimated_escrow_amount` não é automaticamente `remaining_receivable`;
- `estimated_payout_time` é previsão do provedor, não promessa de crédito;
- Pending atual não pertence automaticamente ao mês selecionado no painel;
- uma linha Pending não comprova que o valor ainda não tenha sido movimentado
  em outro ledger;
- ausência da linha na primeira página não significa que o pedido não esteja
  Pending;
- o endpoint não comprova depósito bancário.

## Próximo gate

Após produção, observar a primeira resposta real da loja e comparar:

- `pending_amount` do Income Overview;
- quantidade/valores conhecidos da primeira página de Pending Detail;
- Seller Centre.

Só depois decidir paginação completa e qualquer tentativa de reconciliar
Pending com a coorte mensal. `remaining_receivable_cents` e
`realized_net_cents` permanecem indisponíveis.
