# Pesquisa Shopee — Income Overview / Pending — 27/10/2026

## Objetivo

Encontrar uma fonte mais segura para responder **quanto está pendente de liberação na Shopee**
sem inferir esse valor pela ausência de um pedido no calendário `get_escrow_list`.

## Evidência encontrada

A documentação atual do módulo Payment da Shopee descreve dois endpoints relevantes:

- `GET /api/v2/payment/get_income_overview`
- `POST /api/v2/payment/get_income_detail`

Referência oficial indicada pelos schemas:

- https://open.shopee.com/documents/v2/v2.payment.get_income_overview?module=97&type=1
- https://open.shopee.com/documents/v2/v2.payment.get_income_detail?module=97&type=1

A página oficial completa não ficou disponível diretamente no ambiente de pesquisa.
Os campos abaixo foram conferidos em um SDK público gerado a partir da documentação
Open Platform atual:

- https://github.com/congminh1254/shopee-sdk/blob/master/src/schemas/payment.ts
- https://congminh1254.github.io/shopee-sdk/interfaces/schemas_payment.GetIncomeOverviewRequest.html
- https://congminh1254.github.io/shopee-sdk/interfaces/schemas_payment.GetIncomeDetailRequest.html

## Semântica útil para loja local

O contrato de `get_income_overview` define os estados de Seller Income para **Local Shop**:

- `1 = Released`
- `2 = Pending`

O estado `To Release` é documentado para Cross Border, não para loja local.

O objeto `total_income` descreve:

- `pending_amount`: **total amount pending release**; para loja local, pedidos antes de
  `ESCROW_PAID`;
- `released_amount`: total já liberado ao vendedor;
- `to_release_amount`: fila do próximo ciclo de payout, **Cross Border only / não aplicável
  a Local**.

O próprio overview é descrito como um **snapshot atual** equivalente ao "Income Overview"
do Seller Centre. A documentação informa que resultados históricos não são recuperáveis
por esse endpoint.

## Income Detail

`get_income_detail` trabalha no nível de pedido.

Para loja local, os mesmos estados são `Released` e `Pending`.

O contrato descreve, conforme o estado:

- `estimated_escrow_amount`: valor estimado ainda pendente de liberação;
- `estimated_payout_time`: horário estimado de payout para Pending / To Release;
- `released_amount`: valor liberado;
- `actual_payout_time`: horário efetivo do payout na Shopee.

Para `Released`, `date_from/date_to` usam a data de payout liberado e o intervalo não
pode exceder 14 dias. Para os outros estados, as datas não limitam o resultado: são
retornados os registros **atualmente** naquele estado.

## Decisão do MLS Commerce OS

A partir desta evidência, é seguro criar um conceito novo e separado:

**Pendente atual na Shopee**

Esse número:

- vem diretamente do `pending_amount` atual da Shopee;
- não é derivado de pedidos sem correspondência no calendário;
- não é o resultado líquido do mês;
- não é um valor histórico de uma competência;
- não comprova depósito bancário futuro;
- não entra novamente na fórmula de lucro;
- não substitui a conciliação por pedido já existente.

O primeiro incremento consulta **somente o overview atual**, por ser uma leitura compacta
e suficiente para validar a semântica na conta real antes de coletar listas de Pending por
pedido.

## Unidade monetária

O schema do overview não traz um campo de moeda junto de `total_income`. O MLS usa o
perfil financeiro fixo desta conexão, que é exclusivamente a loja Brasil configurada no
Finance Worker. O contrato interno registra explicitamente
`currency_basis = FIXED_BRAZIL_SHOP_PROFILE`.

Se a resposta tiver mais de duas casas decimais, o valor bruto é preservado, mas
`*_cents` permanece `null`; o sistema não arredonda nem adivinha centavos.

## Coleta e consumo

A consulta entra no mesmo round-robin financeiro já existente:

`RELEASES -> RETURNS -> INCOME -> RELEASES`

Cada oportunidade HISTORY continua autorizando no máximo **uma** leitura privada do
Finance. Não existe polling novo da Shopee no navegador.

O App guarda somente o último snapshot validado e a tentativa em D1. Sucesso tem janela
de 15 minutos; falha usa retry de 5 minutos e preserva o último snapshot bom.

## O que continua bloqueado

Mesmo com `pending_amount` disponível:

- `realized_net_cents` continua indisponível sem prova de liquidação;
- "recebido no banco" continua indisponível;
- o Pending atual não é atribuído automaticamente ao mês selecionado;
- não será subtraído ou somado ao saldo mensal;
- não será usado para escolher ou corrigir valores conflitantes de devolução/liberação.

A próxima validação é observar o valor real da conta e comparar o comportamento desse
snapshot com a tela financeira da Shopee antes de usar `get_income_detail` para
detalhamento de Pending por pedido.
