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

Branch: `fix/cancelled-daily-profit-20261030`. Revisão do agendamento concluída;
73 testes direcionados e 67 Python aprovados. O cron do App gerado foi testado
com e sem minificação. Na execução local completa, duas expectativas antigas
de cache foram corrigidas e revalidadas; o Chromium não criou seu perfil no
ambiente isolado. A suíte integral, incluindo o navegador, deve passar na CI
antes do merge. Publicação precisa ser conferida separadamente no Cloudflare.

Builds exatos revisados:

- App: `5609b8412ff643f8c4864bac68e2d55461ad97878fdff9f602f3bff642246a6a`.
- Auth, inalterado: `1fef431c8573e05563c7938d95be0976a160bc603340084aa747ee0b73e7ec64`.
- Finance: `bfc27e1022e0c5b3d335498389fd64b6978b8f7f04501d3bc6eff38202bf5feb`.

M2 permanece aberta para devoluções, ajustes, Seller Centre e recebimento
bancário. O resultado diário continua uma estimativa com seus bloqueios reais.
