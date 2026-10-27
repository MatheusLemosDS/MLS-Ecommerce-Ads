# Continuidade — MLS Commerce OS

Este arquivo é um handoff curto. O roadmap canônico é
[ROADMAP_MLS_COMMERCE_OS.md](ROADMAP_MLS_COMMERCE_OS.md).

## Decisões permanentes

- Nome oficial: **MLS Commerce OS**.
- MLS = iniciais do proprietário/projeto.
- **MLS Hermes** é o supervisor.
- Arquitetura: agentes especializados compartilhando a mesma base.
- Modos: Observer, Assisted e Autonomous limitado.
- Referência de UX: produto premium com especialistas em um só lugar, Central de Comando limpa e ações diretas; não copiar interface de terceiros literalmente.
- Ads/PROMO continuam **LOCKED**.
- Identificadores técnicos BrazaCommerce permanecem temporariamente por compatibilidade.

## Agentes definidos

MLS Finance, MLS Ads, MLS Pricing, MLS Products, MLS Production, MLS Creative,
MLS Inventory, MLS Marketplace, MLS Returns, MLS Auditor e MLS Hermes.

## Estado técnico atual

A conversão M0 foi **publicada** pela PR #11, merge
`3dab8f0be54d331bcded1fba4c09e9bfdf68256b`.

CI de `main`: run `40438431534`, sucesso. Produção confirmada nos três Workers:
App `688b04a0-22a3-4c1d-a1cd-e588c3fcc070`, Auth `e95cd942-5ea6-4151-a7e0-a46e0b37593c`, Finance `fadb9a57-8a9c-454e-a9c8-70b58528bc2f`.

Mudanças iniciadas:
- login e painel proprietário: MLS Commerce OS;
- navegação móvel: MLS Commerce OS;
- workspace de Ads: MLS Commerce OS;
- títulos públicos/logout: MLS Commerce OS;
- README e documentação: migração para identidade MLS;
- roadmap canônico e checkpoint.

## O que NÃO renomear nesta fase

Workers, D1, domínio, rotas, cookies, headers X-Braza, tabelas/schemas e contratos
persistidos. Primeiro branding; infraestrutura depois, com aliases.

## Estado publicado mais recente

A **M1 — Central de Comando + Agent Registry somente leitura** foi publicada pela PR #12,
merge `91fc0cf169f67a9440a8e58a033c925b9ce98eed`.

A Central de Comando usa snapshots locais validados do resultado diário/mensal e não cria
`fetch`, polling ou chamadas Shopee extras para os agentes. MLS Hermes, Finance, Ads,
Products, Production, Returns e Auditor operam em modo **OBSERVER**. Ads/PROMO permanece LOCKED.

CI: PR `40442142269`, main `40442459393`; **2.008 testes Node + 67 Python**.
Produção: App `48f8a3bf-019d-498a-9f5e-a2b9f356e999`, Auth `d2ee194f-fc43-481e-b09b-209c7b849b87`,
Finance `e6aec23b-5e05-450b-8cb0-64ee7e7cdca5`.

## M2 — incremento publicado

A primeira entrega da M2 foi publicada pela **PR #13**, merge
`e00c7d18fc24b8211a36e850d0523ca835a1996e`.

Ela acrescenta conciliação por pedido em **Liberações da Shopee**, com:
- repasse-base;
- ajuste assinado;
- repasse após ajuste;
- valor/data da liberação quando verificável;
- cruzamento local com devoluções/reembolsos;
- tarefas para MLS Finance/Returns/Auditor;
- bloqueio do Hermes quando fontes de repasse após ajuste divergem.

Contrato privado opt-in: `X-Braza-Release-Contract: release-orders-v1`.
Chamadores antigos permanecem em v1. Não há novo endpoint Shopee, nova tabela D1
ou polling no navegador.

CI: PR `40507327612`, main `40507771674`; **2.018 testes Node + 67 Python**.
Produção: App `877b4184-2b0b-4919-af28-54b764153b4b`, Auth
`bdfa963d-6b08-4529-a484-baa0ecd2d392`, Finance
`a35ab2a0-8374-4677-b5aa-0d8921968013`.

Limite permanente desta entrega: `NOT_LOCATED` significa apenas que o pedido
não apareceu no calendário consultado. Não é "não recebido" nem "valor a
receber". `remaining_receivable_cents` e `realized_net_cents` continuam
indisponíveis sem evidência suficiente.

### Segundo incremento da M2 — PR #14

Publicado pela **PR #14**, merge `1380d44f01e6ee3a0e42c828829d91fed878bb2a`.

O MLS Finance agora acompanha uma coorte paga em calendários de liberações
posteriores sem repetir a coleta Shopee só para esse cruzamento:

- contrato privado `X-Braza-Release-Contract: release-coverage-v1`;
- Finance lê apenas coorte e ledgers de `get_escrow_list` já salvos;
- uma coorte anterior por execução do tracker;
- 15 minutos enquanto incompleta e 6 horas após identidade completa no corte;
- UI “Cobertura temporal das liberações” para meses passados;
- meses/cortes ausentes, parciais e duplicidades permanecem explícitos;
- `identity_complete_at_cutoff` nunca vira automaticamente “valor a receber”.

CI: PR `40518940876`, main `40519257309`; **2.025 testes Node + 67 Python**.
Produção: App `5614b669-da58-4582-ad21-5dd74417e048`, Auth
`b76e3d02-7869-4750-8211-2eac1dfe498c`, Finance
`0a6d8018-cf02-45b9-afc1-c25c0b582079`.

Permanecem obrigatórios `RELEASE_CYCLE_SEMANTICS_UNVERIFIED` e
`BANK_RECEIPT_NOT_VERIFIED`. O horizonte limitado do tracker não prova que
uma liberação não possa ocorrer depois.

### Terceiro incremento da M2 — PR #16

Publicado pela **PR #16**, merge `6e7dedc7ab7d29412c787967a04a743cf70f8f92`.

O MLS Finance agora possui um indicador separado de **Pendente atual na Shopee**,
alimentado pelo Payment `get_income_overview`:

- loja local: estados `Released` e `Pending`;
- `pending_amount` fica separado do resultado mensal;
- o navegador lê apenas o cache local;
- o cron financeiro roda `RELEASES -> RETURNS -> INCOME`, mantendo no máximo uma
  leitura privada Finance por oportunidade;
- missing não vira zero e valores com mais de duas casas não são arredondados
  para centavos;
- não é tratado como depósito bancário, lucro ou competência mensal.

CI: PR `40537753112`, main `40538302859`; **2.036 testes Node + 67 Python**.
Produção: App `c966a233-ae77-4778-a41f-e1f5e76ac0bf`, Auth
`824b11f7-c04e-4b3b-bc71-853c7b9badf7`, Finance
`3ffc62c1-6b2d-42ff-9ee9-0791fb1d8c6d`.

Pesquisa: [PESQUISA_INCOME_OVERVIEW_SHOPEE_2026_10_27.md](PESQUISA_INCOME_OVERVIEW_SHOPEE_2026_10_27.md).


### Quarto incremento da M2 — PR #18

Publicado pela **PR #18**, merge `df86f2879b74b9ee930e7cf4d69cf53a06a48a02`.

O MLS Finance agora mostra contas atrasadas, vencimentos de hoje, próximos 7 dias
e próximo vencimento. A agenda usa o payload do ledger no mesmo `LEFT JOIN`
mensal já existente; não adiciona query D1, tabela, polling ou chamada Shopee.

Contrato owner: `business-month-view-v4`. V1–V3 continuam compatíveis.
`NOT_ITEMIZED` permanece desconhecido em vez de zero. Marcar como pago é apenas
controle interno, não execução de pagamento nem comprovante bancário.

CI: PR `40545184881`, main `40545546459`; **2.045 testes Node + 67 Python**.
Produção: App `c47c5e30-054b-4f42-9dfa-2c9a0015827b`, Auth
`1e97ff32-813e-43c8-9b8c-72c885bb2701`, Finance
`135ce2e9-2b2d-484f-93a4-f0423070b4e5`.

## Ponto exato de retomada

**M2 continua em andamento.** O próximo passo é observar o primeiro
`pending_amount` real da conta autenticada e conferir a leitura contra o Seller
Centre. Se a evidência real for consistente, avaliar `get_income_detail` para
explicar o Pending por pedido. A agenda de vencimentos do MLS Finance já foi
publicada pela PR #18.

`remaining_receivable_cents` permanece separado do Pending atual e
`realized_net_cents` continua indisponível sem liquidação bancária comprovada.

Prioridade de agentes visíveis:
1. MLS Finance
2. MLS Ads
3. MLS Products
4. MLS Production
5. MLS Returns
6. MLS Auditor
7. MLS Hermes Supervisor

A Central de Comando deve usar dados já coletados; não criar polling ou chamadas
Shopee extras apenas para “animar” agentes.

## Incremento M2 publicado — Pending Detail

A PR #19, merge `20965a486fa0110261685ea05f700a7e71443f15`, adicionou `get_income_detail` para **Pending atual** em background. O coletor só chama o provedor quando o Income Overview já confirma `pending_cents > 0`, usa `income_status=2`, primeira página de até 100 registros e preserva `has_more` como cobertura parcial. O Finance Worker converte `order_sn` em hash antes de expor o contrato. A Central de Comando mostra **Pending atual por pedido** somente ao abrir o bloco, lendo o D1 local.

CI: **2.057 Node + 67 Python**, main `40551187391`. Produção: App `7001aa3c-81c1-4404-be56-7252c0b88a4c`, Auth `c337d274-265a-4b60-9d0c-78a1b0abea9d`, Finance `3087ddfb-d735-4492-b71e-90b44d1d1507`.

O próximo gate da M2 é observar a resposta real da loja e comparar Pending Overview + Pending Detail com o Seller Centre. Não implementar paginação completa nem `remaining_receivable_cents` até essa validação.


## Incremento M2 publicado — Auditoria Pending atual

A PR #21, merge `2433cd9c55de271034def246fbca8dc98a1d4dae`, adicionou uma auditoria local do snapshot atual de Pending antes de qualquer paginação completa. Ela compara `pending_amount` do Income Overview com o subtotal visível de `estimated_escrow_amount` somente quando os snapshots são comparáveis.

Estados importantes: `DETAIL_NOT_LOADED`, `WAITING_SAVED_DETAIL`, `DETAIL_OLDER_THAN_OVERVIEW`, `PARTIAL_PAGE`, `AMOUNT_PARTIAL`, `OBSERVED_MATCH`, `OBSERVED_DIFFERENT` e `ARITHMETIC_UNSAFE`.

A seção fechada não faz leitura D1 só para alimentar agentes. Ao abrir, usa o endpoint owner local já existente; não consulta a Shopee. `has_more=true` mantém a cobertura parcial. Coincidência não prova competência/recebimento; diferença não é automaticamente erro contábil.

CI: PR `40555474962`, main `40555756177`; **2.061 Node + 67 Python**. Produção: App `669b1ad9-e5e1-4002-b65b-ae386ff093b4`, Auth `dd7c7cd4-0470-4ec4-b7a3-52d486a2c782`, Finance `c231b7e6-72d4-4c7e-9e89-ecb22c252fc9`.

### Ponto exato de retomada após PR #21

Abrir **Central de Comando → Pending atual por pedido**, observar o estado real da auditoria e comparar os números/horários com o Seller Centre. Só implementar paginação cursor se a conta real apresentar `PARTIAL_PAGE` e a semântica do cursor for validada. `remaining_receivable_cents` e `realized_net_cents` continuam indisponíveis.
