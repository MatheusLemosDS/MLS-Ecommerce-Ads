# Relatório semanal da operação — 11/11/2026

Estado: **PUBLISHED_VERIFIED**. Versão `2026-11-11.2`, conferida em 11/11/2026 às 18:49:55 Brasília. Disponibilidade técnica publicada; o fechamento operacional da loja e M2/M2.2 continuam abertos.

## Problema e comportamento

As referências da semana estavam espalhadas entre Produção, Financeiro e Banco. **Relatórios**, no menu principal, reúne três leituras independentes da sexta escolhida. Cada bloco mostra seu período, origem e pendências. A abertura lê fontes salvas; não inicia uma coleta, importação, fabricação ou fechamento financeiro.

- **Fabricação:** sexta anterior às 13h inclusiva até sexta escolhida às 13h exclusiva, Brasília. Custos históricos dos lotes reais, fechamento original/revisões e conferência dos oito intervalos preservados. Sem registro não significa gasto zero; o total conferido depende de cobertura explícita.
- **Resultado estimado das vendas:** sete dias civis, de sexta anterior até quinta, com as datas visíveis. Reaproveita a fórmula diária de repasse, custo dos itens vendidos, Ads e alocações de DAS/despesas. Faltas de fonte, custos, anúncios ou despesas permanecem pendentes. Não rateia Ads de sexta por hora, não cria lucro exato para o corte 13h e não desconta novamente a fabricação real.
- **Movimentação importada:** os mesmos sete dias civis, pelos créditos/débitos Nubank e transferências Shopee de arquivos já importados. Totais independem da página e os vínculos ativos permanecem separados por data/origem. Uma transferência e seu crédito bancário não são duas receitas. Cobertura é somente dos arquivos importados, sem afirmar extrato completo, saldo bancário ou lucro realizado.

## Uso

1. Abra **Relatórios** e selecione a sexta de encerramento.
2. Confira as datas em cada bloco e o gráfico correspondente.
3. Abra os detalhes das pendências e use os acessos à fabricação, financeiro ou banco para conferir a fonte.
4. Após atualizar uma fonte ou confirmar registros, releia o relatório. Original e revisões de produção continuam no fechamento existente.

A semana aberta e os períodos históricos continuam distintos. Valores desconhecidos não se tornam zero. Os seis agentes da Visão geral, Pedidos, DTF, custos cadastrados e demais painéis permanecem preservados.

## Contratos e limites

Novo relatório owner de leitura `GET /api/admin/reports/weekly?week_end=AAAA-MM-DD`; sexta estrita e limite temporal próprio. Novo resumo privado de caixa por período, independente do protocolo existente de importação/preview/vínculo. Sem novas tabelas, alteração de configuração/bindings, cron ou consulta a marketplace/banco.

O cálculo mensal é compartilhado sem alterar sua fórmula. O leitor semanal usa as cópias publicadas imutáveis e não chama o leitor mensal que pode fazer bootstrap de publicação. Ao cruzar mês, as duas identidades e revisões de custos/despesas permanecem explícitas.

TikTok Shop: aplicativo existente confirmado pelo proprietário; Order API ainda sem acesso. Nenhum OAuth ou pedido real TikTok é anunciado por esta entrega. Mercado Livre e XLSX Shopee continuam pendentes; M2/M2.2 permanecem abertas.

## Distribuição da interface

O cliente do novo relatório usa um arquivo público com SHA/SRI. O protótipo completo excedeu o teto de 4 MiB do bundle App; a mesma tag antiga de produção passa a um arquivo público separado, com os 163.799 bytes e a ordem originais preservados. Banco, mês e pedidos mantêm seus hashes. Nenhuma minificação adicional dos clientes é usada para contornar o teto. O inventário e a geração publicada anterior continuam fechados; as cinco cópias publicadas foram conferidas pelos bytes, hashes e SRIs.

## Validação e publicação

Fonte `4a9fce1dbaf8df80142fedf627a3d06325b3579e`, preparada `325f8cd687afa958d8adb1cabacaa71a04a9b012`. CI [43104305899](https://github.com/MatheusLemosDS/MLS-Ecommerce-Ads/actions/runs/43104305899) aprovada com **3.905 testes Node e 67 Python**; provenance e logs completos vinculados ao mesmo código. QA Chromium sintética aprovada em oito perfis normal/minificado ×320/1365 ×claro/escuro, 42 capturas, falhas503 de weekly/production, navegação, teclado,44px e ausência de overflow. Leitura fria sem DDL, originais/revisões e snapshots mensais preservados; 112 arquivos e cinco trechos literais legados conferidos. Equivalência entre fonte QA e fonte CI registrada, com os três Workers e cinco assets idênticos.

Finance → Auth → App publicados e conferidos em 11/11/2026 às 18:49:55 Brasília. Versões: Finance `4c59460c-c6d7-4ad2-86ee-64c12a7d68a9`, Auth `6bf0605e-18a0-4ddc-a84a-a4472adbaf6c`, App `021af5ca-fa95-49f7-ab69-bcee9dabd2ba`. Configuração, bindings, domínios, subdomínios, flags e cron preservados. Login público confirma `2026-11-11.2` e a API semanal rejeita acesso anônimo. Recibo SHA `c7db854bc480c8b142ba6535e2d7131515b4db076484817eb8195773adaebd33`; smoke SHA `a53045cf7b8d1eff694e6b8e322b2177ed685157070030bb7c61c1cdba0230ab`; QA SHA `2f699a9d6fe37056212c56a5621b18f743fe3c6de321f727dbc9df435d7ed665`.

Nenhuma sessão real do proprietário, importação real, consulta a provedor ou fato físico/financeiro foi criado para validar esta entrega. Os cenários de QA usam coletores, publicações, lançamentos e vínculos exclusivamente sintéticos em SQLite efêmero. O fechamento original sintético é retrospectivo e não comprova execução natural do cron na loja. Disponibilidade técnica não comprova conferência de fabricação, extrato completo, lucro realizado ou fechamento de M2/M2.2.

Consultar a [PR #118](https://github.com/MatheusLemosDS/MLS-Ecommerce-Ads/pull/118) para a integração Git. Publicação não comprova merge; CI documental e integração normal continuam etapas separadas, sem novo deploy de runtime por esta atualização documental.
