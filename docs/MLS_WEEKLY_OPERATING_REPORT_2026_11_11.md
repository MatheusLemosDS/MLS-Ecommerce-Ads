# Relatório semanal da operação — 11/11/2026

Estado: **VALIDATION_PENDING**. Versão preparada `2026-11-11.2`. Nenhuma publicação ou aceite da operação real é comprovado por este documento nesta fase.

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

O cliente do novo relatório usa um arquivo público com SHA/SRI. O protótipo completo excedeu o teto de 4 MiB do bundle App; a mesma tag antiga de produção passa a um arquivo público separado, com os 163.799 bytes e a ordem originais preservados. Banco, mês e pedidos mantêm seus hashes. Nenhuma minificação adicional dos clientes é usada para contornar o teto. O inventário e a geração publicada anterior continuam fechados; novas cópias serão registradas somente após publicação conferida.

## Validação e publicação

Commit, CI, QA Chromium e conferência App/Auth/Finance/assets serão registrados após sua execução. Nenhum fato real será criado para testes e disponibilidade técnica não comprova fechamento operacional da loja.
