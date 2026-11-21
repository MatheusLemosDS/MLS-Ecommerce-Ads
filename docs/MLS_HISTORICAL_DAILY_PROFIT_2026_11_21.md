# Custos de kits numerados e resultado diário histórico — 21/11/2026

Quando um produto possui duas variações de tamanho numeradas, a classificação do catálogo pode não reconhecer sua composição e deixar de aplicar os preços já cadastrados. O relatório legado mantém corretamente o custo completo desconhecido, mas o subtotal dos custos conhecidos podia ocupar o indicador e a linha de resultado da Visão geral. A referência legada também recalcula vendas antigas com preços atuais.

## Correção

- Reconhecimento financeiro de duas camisetas adultas pelos eixos Tamanho 1/Tamanho 2 e descrição compatível; quantidades conflitantes, peça avulsa, tamanhos ou atributos ambíguos continuam pendentes.
- Precedência das decisões manuais, conflitos, política de custo completo ou componentes preservada. Não cria gênero, vínculo DTF, fabricação ou aprovação histórica.
- Contrato explícito business-month-view-v6 acrescenta resultado diário com custos auditados e identificação datada aprovada. Os contratos v1–v5 continuam como referências de custos atuais.
- O cartão e o gráfico da Visão geral exigem a fonte histórica. Fonte ausente, incompatível ou custo pendente deixa o lucro em apuração; o subtotal conhecido fica separado nos detalhes.
- Revisões, fontes e aritmética são verificadas. Alterar o preço atual não reavalia o preço auditado de um dia antigo. Novas informações de pedidos, repasses, anúncios e devoluções ainda podem alterar estimativas legitimamente.

## Verificação e privacidade

O replay de 11/11 foi repetido em leitura sobre a captura existente. A correção reconhece a composição financeira antes omitida na referência de preços atuais. O replay histórico continua parcial e não aprova lucro realizado nem recupera automaticamente um valor antigo exibido. Valores e quantidades da conta permanecem no workspace privado; os recibos públicos registram integridade, estados e ausência de escrita.

O executor original voltou às 02:01 UTC de 21/11. Todas as alterações recuperadas e os artefatos conferidos foram preservados antes de editar. Não houve reset, limpeza ou reconstrução. A execução anterior terminou sem resumo final e não foi contada como aprovação completa. Consulte o único checkpoint e o recibo de validação para os resultados da nova suíte completa, QA normal/minificada móvel/desktop, ponte Python e dependências.

## Uso e próximo passo

Depois de uma publicação especificamente validada, escolha a data na Visão geral e abra Ver cálculo e pendências do dia. Confira revisões históricas e fontes. Identidades antigas pendentes precisam de evidência datada e revisão; o catálogo atual não comprova a composição de vendas antigas. Produtos → Custos e regras continua editável para as referências atuais.

A entrega Git é separada da publicação e do aceite real. Esta branch não autoriza Live, coleta/escrita financeira na conta ou movimentação de dinheiro. PR130/131 permanecem integradas e PR132 continua independente. M2/M2.2 e aceite financeiro real permanecem abertos.

- Estado: MLS_COMMERCE_OS_CHECKPOINT.json
- Validação: financial-automation/validation/historical-daily-profit-20261121.json
- Replay sanitizado: financial-automation/validation/historical-profit-nov11-readonly-20261121.json
- Composição: financial-automation/validation/numbered-kit-real-replay-20261121.json
