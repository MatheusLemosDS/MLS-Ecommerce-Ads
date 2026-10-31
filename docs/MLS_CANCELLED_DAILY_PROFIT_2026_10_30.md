# Cancelamentos e resultado diário — 30/10/2026

O proprietário pediu que os próximos incrementos sejam entregues na versão
oficial e que cancelamentos saiam da métrica diária. A prévia da PR #84 permanece
disponível com dados sintéticos. Este incremento parte da main
`a96bb1c56aaea54a63bede5c177a0de8ab2ea890` e não integra as branches visuais/AI.

## Evidência e comportamento

A regra financeira existente considera valores e unidades apenas de pedidos
concluídos ou em andamento pagos. `CANCELLED` e `IN_CANCEL` ficam fora das vendas,
repasse e produção prevista; `IN_CANCEL` também sinaliza revisão. A remoção afeta
o dia original da venda no calendário de Brasília. Ads efetivamente gastos, DAS
e despesas fixas não são eliminados pelo cancelamento.

A leitura privada em produção encontrou uma publicação completa de outubro com
331 pagos e 74 cancelados, separados na cobertura. São contagens de um corte,
não comprovação de liquidação bancária. Nenhum identificador privado foi copiado.

Os três scripts publicados foram reproduzidos byte a byte a partir da main
verificada com as opções reais do Wrangler (`keepNames`, bundle e sourcemap).
Não houve divergência semântica nem flexibilização da allowlist de hashes.

## Correção

O Finance reutilizava por 15 minutos uma janela que terminasse antes de hoje,
mesmo dentro do mês atual. Agora todas as janelas do mês aberto usam o prazo de
60 segundos. A cadência do cron, paginação, leases, limites e backoff permanecem
ativos; 60 segundos é validade do cache, não promessa de atualização da tela.
A substituição do painel ocorre quando a nova coleta completa é publicada.

A manutenção do mês imediatamente anterior é limitada a períodos com situações
abertas ou cobertura que ainda não alcance o último dia. Usa uma oportunidade
ociosa do coletor, uma operação Finance por vez e agenda própria, sem reler Ads.
O mês atual mantém prioridade e seu resumo não é substituído pelo histórico.
Durante coleta parcial ou falha permanece a publicação completa anterior.
Meses anteriores a esse horizonte ainda dependem de atualização explícita;
uma coleta atual continuamente ocupada também pode adiar essa manutenção.
Se o fechamento ampliar as datas e os Ads salvos não cobrirem o último dia,
o valor continua pendente até a leitura de Ads correspondente ser atualizada.

## Validação e entrega

Regressões com dados sintéticos cobrem pago→cancelado e pago→em cancelamento,
incluindo a virada UTC/Brasília, remoção exata de valores e unidades, nenhuma
consulta de escrow cancelado e preservação de Ads/DAS/despesas. A atualização
ocorre após 301 segundos no teste, incluindo a primeira janela do mês, antes
retida em cache por quinze minutos. Há testes de validade do cache no mês atual
e na virada para o mês seguinte.

PR [#85](https://github.com/MatheusLemosDS/MLS-Ecommerce-Ads/pull/85), branch
`fix/cancelled-daily-profit-20261030`, código `dbcfae79716fbbe8785cbb615c435e0c62be1b6a`.
Revisão do agendamento concluída; 73 testes direcionados aprovados. A
[CI 41155020856](https://github.com/MatheusLemosDS/MLS-Ecommerce-Ads/actions/runs/41155020856)
passou com **2.129 Node, zero falhas e 67 Python**, incluindo Chromium e os três
builds. O cron do App gerado foi testado com e sem minificação. O navegador
local não criou seu perfil isolado; a validação integral foi feita pela CI.

Builds exatos revisados:

- App: `5609b8412ff643f8c4864bac68e2d55461ad97878fdff9f602f3bff642246a6a`.
- Auth, inalterado: `1fef431c8573e05563c7938d95be0976a160bc603340084aa747ee0b73e7ec64`.
- Finance: `bfc27e1022e0c5b3d335498389fd64b6978b8f7f04501d3bc6eff38202bf5feb`.

## Publicação oficial verificada

Publicação pelos comandos reais `deploy:finance` e `deploy:app`, após CI verde,
em 30/10/2026 Brasília (31/10 01:24 UTC). Versões:

- App: `db3fb95f-6a8c-4f44-93d7-2b41f5e00d35`.
- Finance: `a01e40a0-d760-4958-834e-f090c62b1ca8`.
- Auth não recebeu alteração por este incremento.

A conferência pela API Cloudflare baixou os três scripts e confirmou bytes
exatos dos bundles Wrangler esperados: App
`670bc7b79494ca44986856c5c21375812a09bab07ef66024e9e152f289b2c900`, Finance
`1ac5eee03d0c98e7b82ccc958ae3f31d3bf453bf233db911be5adb2b799f775e`
e Auth preservado
`a643fefcea48df87499f5878aac424a6cb2fa22d298d82e598c2ee72aaed5b2e`.
Configurações, valores dos bindings, domínios, privacidade e cron idênticos ao
backup privado. SELECTs confirmaram a nova tabela histórica e o coletor ativo
com zero falhas e sem erro de fonte. A sessão autenticada do proprietário não
foi testada; as sondagens anônimas deste ambiente receberam HTTP 403 externo.

M2 permanece aberta para devoluções, ajustes, Seller Centre e recebimento
bancário. O resultado diário continua uma estimativa com seus bloqueios reais.
