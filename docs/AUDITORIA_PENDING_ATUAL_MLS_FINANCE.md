# MLS Finance — auditoria do Pending atual

Atualizado em **27/10/2026**.

Este incremento da M2 compara, de forma **descritiva**, dois snapshots atuais já
coletados:

- `pending_amount` do Income Overview;
- os `estimated_escrow_amount` visíveis do Pending Detail.

A comparação não altera o resultado mensal, não cria `remaining_receivable` e
não comprova depósito bancário.

## Por que a comparação é descritiva

A documentação/SDK público confirma a existência dos endpoints
`get_income_overview` e `get_income_detail`, o estado Pending para loja local,
o campo `pending_amount` no overview e `estimated_escrow_amount` no detalhe.
A pesquisa pública feita em 27/10/2026 não encontrou um contrato que obrigue a
soma de `estimated_escrow_amount` a ser exatamente igual a `pending_amount`
em snapshots obtidos em horários diferentes.

Por isso:

- coincidência é registrada como **OBSERVED_MATCH**, não como prova contábil;
- diferença é registrada como **OBSERVED_DIFFERENT**, não como erro contábil;
- `has_more=true` bloqueia comparação total;
- detalhe anterior ao overview suspende a comparação;
- valores com mais precisão que centavos não são arredondados.

## Estados da auditoria

| Estado | Interpretação |
| --- | --- |
| `NO_OVERVIEW` | Ainda não existe snapshot atual do overview. |
| `OVERVIEW_AMOUNT_UNVERIFIED` | O overview existe, mas o valor Pending não pôde ser convertido com segurança. |
| `NO_PENDING` | O overview informa Pending igual a zero; nenhum detalhe é necessário. |
| `DETAIL_NOT_LOADED` | O usuário ainda não abriu o detalhe local. Nenhuma prioridade é criada. |
| `WAITING_SAVED_DETAIL` | A leitura local foi pedida, mas o cron ainda não salvou um detalhe válido. |
| `DETAIL_OLDER_THAN_OVERVIEW` | O detalhe é anterior ao overview; comparação monetária suspensa. |
| `PARTIAL_PAGE` | `has_more=true`; a primeira página é explicitamente parcial. |
| `AMOUNT_PARTIAL` | Uma ou mais linhas não têm valor convertível em centavos sem arredondamento. |
| `OBSERVED_MATCH` | Soma visível e overview coincidem no recorte comparável. |
| `OBSERVED_DIFFERENT` | Soma visível e overview diferem; validar no Seller Centre antes de atribuir significado. |
| `ARITHMETIC_UNSAFE` | A soma excede o limite seguro e bloqueia a auditoria. |

## D1 e Shopee

A auditoria é calculada no navegador a partir de snapshots já validados.

- abrir a seção Pending faz somente a leitura owner já existente do D1 local;
- não há nova chamada Shopee por causa da auditoria;
- não há novo polling;
- não há tabela nova;
- o Agent Registry não transforma a ausência do detalhe em prioridade enquanto a
  seção opcional não tiver sido aberta.

## Gate para paginação

A paginação completa de Pending Detail continua bloqueada até observar a resposta
real da loja e comparar com o Seller Centre.

Antes de habilitar cursor/paginação, precisamos registrar:

1. se `has_more` aparece na conta real;
2. quantidade da primeira página;
3. quantidade de valores convertíveis em centavos;
4. subtotal visível;
5. horário do overview e do detalhe;
6. se a diferença observada é explicável pela semântica/timing do provedor.

Mesmo depois da paginação, Pending atual não será automaticamente atribuído a uma
competência mensal.

## Limites permanentes

- `pending_amount` não entra no saldo mensal;
- `estimated_escrow_amount` não é `remaining_receivable`;
- `estimated_payout_time` é previsão;
- `realized_net_cents` continua indisponível sem liquidação bancária;
- Ads/PROMO permanece **LOCKED**.


## Preparação para validação da conta real — diagnóstico copiável (PR #22 integrada; deploy a confirmar)

A Central de Comando passa a oferecer **Copiar diagnóstico (sem pedidos)** dentro
de **Pending atual por pedido**. O botão usa somente o resultado local de
`buildPendingIncomeAudit` e a área de transferência do navegador. Não introduz
endpoint, coleta, escrita na Shopee, tabela D1 ou polling.

O JSON `mls_pending_audit_evidence_v1` contém apenas: estado da auditoria,
horários do overview/detalhe em epoch segundos, Pending Overview em centavos,
contagem de registros e pedidos únicos, `has_more`, contagem de valores
conhecidos/desconhecidos, subtotal visível em centavos, diferença descritiva
quando comparável, flag de comparabilidade e nota de limitação.

Não inclui `order_sn`, `order_hash`, `shop_id`, cookies, credenciais ou
linhas/payloads brutos do provedor. Copiar só ocorre por clique expresso do
operador. Se o navegador bloquear clipboard, a interface informa o erro.

**Roteiro de verificação:** abrir Central de Comando → Pending atual por pedido,
esperar o carregamento local e clicar **Copiar diagnóstico (sem pedidos)**.
Anotar separadamente os valores/horários vistos no Seller Centre. Enviar o
diagnóstico junto da conferência para decidir se existe `PARTIAL_PAGE` ou
`OBSERVED_DIFFERENT`. Nunca inferir liquidação bancária, competência ou
`remaining_receivable` a partir deste JSON.
