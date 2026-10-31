# Memória dos agentes e indicadores de desempenho — 31/10/2026

Base: main PR88 `8bb9718e4bc104a63a47572dceab7d32ec5e87e7`.
O proprietário pediu evolução contínua com dados da operação, automação de tarefas conhecidas e relatórios, com confirmação de ações novas ou arriscadas. O destino dos incrementos validados continua sendo a Live.

## Entrega em validação

- Memória agregada de publicações financeiras completas, capturada pela coleta já existente, sem consultas extras a provedores ou modelos. Cada corte mensal é um registro; correções substituem o mesmo corte e preservam sua contagem, sem multiplicar amostras por atualizações de tela.
- Registro condicionado à publicação, revisão, intervalo e horários das cópias financeiras exatas. Ausência de identidade, pausa ou revisão concorrente impede gravar uma observação como atual.
- As próximas análises reais do Hermes recebem contexto descritivo das recorrências nas tarefas já determinadas, preservando o protocolo `hermes-finance-v1`, os valores, códigos, prioridades e limites existentes. A ausência ou falha da memória preserva o contexto financeiro original.
- Relatório de recorrências, referências de custo e correções no MLS Hermes. Leitura exclusiva do proprietário, sob demanda, sem inicialização de tabela ou coleta pelo GET. Retenção limitada a 400 cortes; nenhum identificador de pedido, comprador ou credencial é copiado.
- Ações conhecidas e sem efeito comercial podem continuar automáticas dentro das rotinas existentes. Memória não cria permissões, aumenta orçamento ou promove uma sugestão de modelo a regra aprovada. Ações novas, comerciais, pagas ou de política exigem confirmação e contratos próprios.
- ROAS de receita atribuída aos anúncios e gasto do mesmo calendário, separado das vendas da loja. Gráfico diário a partir dos dias reais do Ads, com lacunas explícitas, dia parcial sinalizado e fuso de origem não confirmado.
- Setas de variação entre dias completos comparáveis e sinal do resultado estimado em contextos distintos. Aumento de vendas não significa lucro; melhora de um prejuízo não é saldo positivo.
- Cores, cards, iluminação e gráficos mantêm as referências visuais aprovadas; controles por toque/ponteiro/teclado e modo de movimento reduzido preservados.

## O que esta memória comprova

A memória permite reconhecer recorrências de qualidade e preparar próximas conferências. Ela não altera os pesos do modelo nem comprova que uma recomendação causou aumento de lucro. A avaliação de recomendações exige vincular proposta, execução autorizada, resultado posterior e períodos compatíveis. Essa avaliação continua como etapa seguinte; comparações financeiras independentes permanecem zero nesta entrega.

M2 permanece aberta para liberações posteriores, devoluções/ajustes, Pending, Seller Centre e banco. O novo relatório não transforma estimativa, reembolso ou liberação na Shopee em lucro bancário. Auth, Finance, políticas comerciais e infraestrutura existente serão preservados.

## Validação e publicação

Memória/ROAS: suíte local de 2.527 Node e 67 Python aprovada, incluindo Chromium normal/minificado, desktop/mobile e claro/escuro. A primeira execução detectou 51 operações contra limite de 50; duas leituras de política redundantes foram removidas, mantendo a guarda atômica de pausa, e a suíte completa passou. A integração final do contexto Hermes está em testes adicionais.

Pendente de CI do candidato completo, conferência de bytes/configuração e observação natural da coleta/captura de memória. Não considerar este rascunho como prova de publicação.
