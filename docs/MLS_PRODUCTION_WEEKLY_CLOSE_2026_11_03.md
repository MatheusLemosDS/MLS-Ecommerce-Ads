# Fechamento semanal da produção — 03/11/2026, Brasília

**Estado: `PREPARED_NOT_PUBLISHED`.** Versão proposta **2026-11-03.3 — Fechamento semanal da produção**.
Branch `feature/production-weekly-close-20261103`, base `d14df57d0b3305ce673a247f925d5dd0d68d191d`.

Este guia descreve o candidato; não registra CI final, publicação, cron natural ou aceite operacional. PR, head, hashes e contagens aguardam recibos reais.

A Live anterior comprovada é **2026-11-03.2**, App `81ca539d-6785-46f0-b854-fdb8861e80f6`,
Auth `ec385ca9-a986-49ec-abab-25a29daaf33b` e Finance `9ed0bd7d-269a-4e5f-81d0-63be8c6ac2c4`.
A PR [#109](https://github.com/MatheusLemosDS/MLS-Ecommerce-Ads/pull/109) foi integrada
em `d14df57d0b3305ce673a247f925d5dd0d68d191d`, com CI final [41672307550](https://github.com/MatheusLemosDS/MLS-Ecommerce-Ads/actions/runs/41672307550)
aprovada, árvore e vetor Live conferidos. O [guia da produção diária/Hermes](MLS_PRODUCTION_DAILY_HERMES_2026_11_03.md)
preserva seu corte anterior e não foi reescrito.

## Onde usar e qual semana é fechada

Abra **Produção → Fabricação e custos → Fechamento semanal**,
`/admin?tab=agent-production#productionWeeklyClosing`.
A semana vai de **sexta anterior às 13h até sexta às 13h**, em
**America/Sao_Paulo**, incluindo sábado e domingo. O início entra no período;
o instante final entra na semana seguinte. A timezone também rege semanas
históricas com horário de verão, sem aplicar UTC−3 fixo a toda data antiga.

O relatório mostra custo confirmado nos registros, peças, subtotal conhecido e
pendências, período nominal, horário real da captura e próximo corte. O cron
existente de minuto pode concluir logo após o corte; a hora de geração fica
explícita. Este fechamento não confirma pagamento ao fornecedor ou ao banco.

O seletor de histórico permite consultar semanas anteriores, inclusive as que
atravessam meses e anos. Relatórios antigos calculados agora aparecem como
**retrospectivos**, nunca como um cron que teria sido executado no passado.
Dados ausentes ficam pendentes/desconhecidos; não se presume gasto zero.

## Registros de sexta-feira e precisão do corte

O ledger legado guarda o dia da fabricação, sem horário. `recorded_at` é o
horário do lançamento e não prova quando as peças foram produzidas. Para um
registro de sexta, o operador confirma quantas peças foram feitas **antes de
13h** e quantas **às 13h ou depois**. As duas quantidades devem somar a quantidade
física do registro, permitindo também lotes que atravessaram o corte.

A confirmação fica em sidecar auditado, vinculada ao fingerprint do registro;
o `incurred_production_v1` e suas fotografias de custo não são reescritos.
Sem essa confirmação, as duas semanas adjacentes ficam pendentes. O subtotal
conhecido não distribui nem duplica o custo dessas peças. Substituições exigem
nova confirmação adequada ao novo registro; anulações preservam o histórico.

## Originais, correções e automação

O fechamento original permanece imutável. Lançamentos tardios, anulações,
substituições ou correções de distribuição geram revisões/ajustes separados.
A revisão mais recente não se apresenta como se fosse o estado conhecido na
sexta original. Repetir o tick ou um comando idempotente não duplica o relatório.

Cada gravação confere atomicamente as revisões do ledger e do sidecar. O cron
faz trabalho limitado, no máximo duas gravações de relatório por invocação elegível, e recupera
períodos vencidos. A manutenção local usa minutos UTC múltiplos de 10, incluindo
toda sexta às 13h de Brasília; fora dessa janela, não consulta o banco semanal.
A invocação elegível é reservada antes do setup financeiro. Ele funciona independentemente da pausa/modo do Hermes e das
coletas financeiras. O trigger Cloudflare `* * * * *` existente é preservado;
esta entrega não acrescenta chamadas à Shopee ou outro provedor.

Observação natural do agendamento ainda pendente ou insuficiente. Publicação e QA sintética não provam que o cron executou; conferir metadados próprios após um tick natural e registrar o próximo corte. Não foi presumido fechamento real de uma sexta futura.

## Histórico real disponível

Conferência somente leitura em 03/11/2026 às 22:43:45 Brasília não encontrou a tabela de registros de fabricação no banco verificado. Quantidades, datas e custos históricos de fabricação permaneciam desconhecidos, não zero. O proprietário informou dispor somente dos pedidos/vendas; essas referências não comprovam datas reais de fabricação. Para obter custos exatos das semanas passadas, é necessário confirmar os lotes/peças reais, suas datas e custos e, nas sextas, a distribuição em relação às 13h. A entrega não cria fabricação a partir das vendas.

Os pedidos/vendas continuam em **Referência das vendas**, com sua própria base.
Quantidade de anúncio, kit, pagamento, cancelamento ou fila DTF não comprova
fabricação. Cancelar uma venda não apaga o custo de uma produção real registrada.
Custos históricos conhecidos permanecem congelados, sem recalcular o passado a
partir da tabela atual. Ausência de custo não é zero; zero precisa ser declarado.

## Compatibilidade, validação e publicação

Somente App é promovido. Auth/Finance, contratos legados, rotas existentes,
bindings, configuração, domínios, flags e cron são preservados. Seis agentes,
meses/rascunhos, custos diários e snapshots/fórmulas do Hermes continuam intactos.
O novo endpoint semanal é separado dos envelopes fechados legados. O painel é
carregado apenas em Fabricação; navegar no histórico usa os relatórios salvos.

O canal da entrega é o relatório dentro da aplicação. Não foram enviados avisos
por email, WhatsApp ou outros canais. Relatórios internos/sidecar não publicam
estoque, alteram pedidos, criam produção, descontam lucro outra vez ou quitam caixa.

**Pendente:** testes focados/integral, QA compilada desktop/celular nos dois temas, CI exato, publicação App, conferência dos três Workers e observação natural do agendamento. Nenhum recibo foi presumido.

## Continuidade

M2/M2.2 e o restante da M3 continuam abertos. Conferir lotes/recebimentos reais,
fontes e o mesmo recorte no Seller Centre/banco antes de fechar a conciliação
financeira. Não copiar a declaração de despesas de novembro para outros meses.
Hermes permanece Observador; Ads/PROMO e escritas de preço/estoque seguem os gates.
