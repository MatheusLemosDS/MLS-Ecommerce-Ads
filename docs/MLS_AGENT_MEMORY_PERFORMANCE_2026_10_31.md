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

PR [#89](https://github.com/MatheusLemosDS/MLS-Ecommerce-Ads/pull/89), código `8fb15b27692d54cb3a7994ea1ee8d3477e604265`. [CI41206928254](https://github.com/MatheusLemosDS/MLS-Ecommerce-Ads/actions/runs/41206928254) verde: **2.536 Node, zero falhas/skip, e 67 Python**, com o mesmo resultado local final. A primeira suíte encontrou 51 operações contra limite de 50; duas leituras de política redundantes foram removidas, mantendo a proteção atômica de pausa. O teste de orçamento e a suíte completa passaram, sem reduzir limites nem remover verificações.

Chromium normal/minificado, 1365×900 e 390×844, claro/escuro: 24 capturas específicas ROAS/memória identificadas como sintéticas. Verificou seis cards, fonte/atribuição/ROAS ponderado, acessor real do calendário salvo, período parcial, lacunas, gasto zero, valores válidos zero, tooltip/unidade x, filtro, setas com datas e resultado ainda negativo apesar de melhora. A memória cobre carregamento sob demanda, troca de contexto durante resposta, sessão encerrada e ausência de polling. A revisão comparou as capturas com a referência original navy/neon.

A nova integração do Hermes passou no protocolo Python existente e no Worker normal/minificado: publicação salva → memória → preparação do contexto → fila → heartbeat/claim v1 → conclusão com fingerprint preservado. Somente descrições de ações existentes recebem texto fixo, contagem e data. Totais, códigos, prioridades e referências permanecem iguais; texto livre de lições não é enviado como instrução. Memória ausente/corrompida retorna ao contexto financeiro original.

App oficial **66e9c01f-3fe5-4688-8dd7-4fb14f56a609**, 100% ativo, publicado em **31/10/2026 às 10:47:52 de Brasília**. A conferência via API comparou os bytes exatos, configurações, bindings, flags owner ENABLED, domínio, cron e compatibilidade. Auth/Finance seguem nas mesmas versões e códigos.

| Artefato | SHA-256 |
| --- | --- |
| App gerado | `6aa689d9bc36c3dfa89d46de5ee7bf82dce0ff19795d85249a08b3aec75b0819` |
| App publicado pelo Wrangler | `72fb5d90f776f2c2b0ce1ffd9e4a4730093d9677fc02fe302b4e33fe2fc8f77a` |
| Auth gerado | `1fef431c8573e05563c7938d95be0976a160bc603340084aa747ee0b73e7ec64` |
| Finance gerado | `bfc27e1022e0c5b3d335498389fd64b6978b8f7f04501d3bc6eff38202bf5feb` |

Às **10:50:33 de Brasília**, SELECTs observaram a primeira memória gravada naturalmente às 10:50:01: um corte de outubro até31/10, publicação14306, os mesmos horários das cópias financeiras e revisão exata, três intervalos completos e23páginas. Coleta COMPLETE, failure_count0 e last_errornull. Nenhuma coleta, análise paga ou job foi forçado para produzir essa evidência. Um corte salvo não comprova aprendizado de eficácia nem resultado bancário.

Provas e backups privados em `/workspace/mls-owner-preview/attachments/live-agent-learning-baseline-20261031/`; QA em `live-agent-learning-qa-20261031/`. Sessão real owner no navegador e aceite humano do proprietário não foram inferidos das fixtures.

## Retorno e próximas etapas

Rollback do App para `c00861cf-68ad-4719-b213-008d7f902069`, com backup de bytes/configuração e posterior conferência independente. A tabela de memória é aditiva e fica preservada, sem apagar histórico ou migrar os Workers Auth/Finance. Nenhuma nova autorização comercial foi habilitada.

Próximos incrementos: ligar o tracker de liberações posteriores ao agendamento e concluir M2; depois vincular recomendações a execuções autorizadas e resultados posteriores para avaliar eficácia. Autonomia comercial exige política persistida, permissões reais, limites de gasto/margem/estoque e auditoria. A API de Builds Cloudflare continua com acesso403 para diagnóstico; os checks externos de feature branches não foram declarados corrigidos. A publicação oficial Wrangler acima foi validada separadamente.
