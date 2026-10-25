# Roadmap BrazaCommerce

Atualizado em **25/10/2026 UTC**. Base anterior: `a8636c4`, com
[resumo financeiro total](RESUMO_FINANCEIRO_TOTAL.md) e
[integração financeira do Hermes](HERMES_FINANCEIRO.md). O incremento atual traz
[catálogo salvo e custos por semana/mês](CATALOGO_SALVO_E_CUSTOS_POR_PERIODO.md).
A entrega atual separa [resumo publicado e coleta em andamento](RESUMO_PUBLICADO_E_COLETA.md),
com previsão líquida em conferência quando os valores necessários são conhecidos.
A continuidade a partir de `94dff2d` vincula as conferências à publicação exata
mostrada na Visão geral e preserva pausa/retomada durante o encerramento da coleta.
Essas correções são validadas no código; sua ativação em produção deve ser
conferida pelo commit publicado.
A atualização da ponte Hermes no Droplet permanece uma etapa separada; ela não
é necessária para usar o catálogo e os cálculos de custo desta entrega.

O objetivo é o Hermes acompanhar a loja, identificar produtos rentáveis e
administrar anúncios e ofertas dentro dos limites definidos pelo proprietário.
A decisão deve priorizar contribuição depois de anúncios, disponibilidade e
qualidade dos dados. ROAS, volume de vendas e saldo de repasse isolados não
comprovam rentabilidade.

## Base disponível e incremento atual

“Versionado” identifica o código do repositório. Não comprova que um build está
ativo no Cloudflare nem que uma coleta real passou pelas mesmas condições dos
testes locais.

| Capacidade | Estado desta entrega | Alcance e evidência que ainda falta |
| --- | --- | --- |
| Catálogo salvo e custos por semana/mês | Implementado neste incremento | Cadastro completo por páginas, variações por cor/tamanho, recálculo local, prévia de avulsas e kits e cobertura dos custos. Primeira importação da conta é observada separadamente. [Detalhes](CATALOGO_SALVO_E_CUSTOS_POR_PERIODO.md). |
| Acesso unificado, painéis, produtos, custos e histórico | Já versionados em `main` | A interface reúne gestão e Ads. Custos são os padrões cadastrados; catálogo e quantidades não equivalem a estoque disponível. |
| Financeiro por pedido e resumo mensal | Já versionados em `main` | Consulta repasse esperado, pedidos pagos, produção, cancelamentos e cobertura de devoluções. Recebimentos liquidados e valores efetivos de reembolso ainda exigem conciliação. |
| Conferência e histórico do cálculo | Versionados em `main` (`1ffd3b2`) | Preserva automaticamente mudanças financeiras, pendências e revisões usadas, com as 128 versões mais recentes por mês. Corrige o frescor de coletas demoradas. Continua sendo previsão; contratos de liquidação e reembolso monetário ainda não foram confirmados. |
| Fila persistente de identificação e subtotal conhecido | Já publicados (`192235cb`) | Adultos, kits, infantis e regras personalizadas usam a mesma fila; erros isolados não interrompem os demais. Classificações não expiram apenas pela idade do catálogo. Subtotal dos pedidos exclusivos conhecidos permanece separado do saldo final e das pendências do mês. |
| Reconhecimento infantil e aprendizado de custos | Versionados em `main` (`9ebee7b`, `c07d1fe`) | Tamanhos 2 a 16 e referência de R$ 12,50; correções inequívocas podem ser reaproveitadas em variações compatíveis. Composições ambíguas permanecem pendentes. |
| Detalhamento mensal por produto/variação | Já versionado em `main` | Mantém pedidos exclusivos separados dos mistos, sem inventar rateio de repasse ou de Ads. Não entrega lucro líquido por SKU. |
| Consumo de anúncios no período | Já versionado em `main` | Usa gasto consumido do calendário; distingue recarga e consumo. Não há atribuição validada desse gasto por produto e campanha. |
| MEI e DAS de 2026 | Já versionados em `main` | Declaração do operador de **R$ 86,05 por mês**, substituindo os 2% anteriores. Vale para 2026; outro ano precisa de declaração própria. Não consulta PGMEI nem confirma pagamento. |
| Atualização com o painel aberto | Implementada nesta entrega | O navegador lê o resumo salvo e o progresso. Atualizar vendas prioriza o servidor; abrir várias abas não inicia coletores financeiros concorrentes. Meses históricos e política pausada exigem ação manual explícita. |
| Coleta em segundo plano | Cron observado no diagnóstico fornecido; continuação corrigida nesta entrega | Cron do App a cada minuto retoma coletores de leitura sem depender da aba; o financeiro em andamento tem prioridade e os demais trabalhos são intercalados. Inclui exclusão de execuções concorrentes, pausa/retomada, espera crescente após falhas e auditoria. Os registros fornecidos mostram execuções reais; pausas normais de página agora retomam no próximo minuto, sem a espera indevida de cinco minutos. |
| Abertura rápida da Visão geral | Implementada nesta entrega | O último período completo tem cópias próprias das fontes e permanece visível durante uma nova coleta ou falha. Custos são recalculados localmente; datas de Financeiro e Ads são preservadas. |
| Conferências vinculadas ao resumo exibido | Implementadas nesta continuidade | A interface confere revisão da publicação e identidade/revisão de todas as fontes, descarta respostas de outra atualização e suspende conferências durante consultas manuais sem publicação. O contrato anterior permanece disponível para abas antigas. |
| Pausa e retomada durante o encerramento | Corrigidas nesta continuidade | O estado final e a auditoria respeitam a política confirmada durante a gravação. A retomada mantém sua agenda; uma lease substituída não é liberada pela execução anterior. |
| Diagnóstico da conta | Versionado em `main` (`6f9ce23`); ativação a conferir | Calcula TACOS, saldo disponível antes de Ads, cobertura dos custos e próximas tarefas a partir do mês validado. Dados ausentes bloqueiam os indicadores correspondentes. Não autoriza investimento. |
| Hermes com financeiro da loja | Publicado (`11f45ce`); atualização da ponte pendente | Cada análise preserva o mês financeiro, custos, DAS, anúncios, pendências e até três próximas ações. A ponte antiga não recebe tarefas novas. Exige atualização no Droplet e observação de uma execução real com a nova referência. |
| Alterar anúncios, campanhas e promoções | Ainda não implementado para execução comercial | As proteções de somente leitura e Ads/PROMO `LOCKED` continuam vigentes. A coleta autônoma não cria permissão de escrita na Shopee. |

O cron configurado é uma oportunidade de execução, não garantia de dados novos
a cada minuto: paginação, limites das fontes, falhas e espera entre
tentativas podem atrasar a conclusão. A publicação deve preservar a configuração
capturada do Worker, seus domínios, variáveis e bancos. O Financeiro continua
privado, sem cron próprio.

Detalhes da base: [MEI e resultado automático](MEI_E_RESULTADO_AUTOMATICO.md),
[produtos do resumo mensal](PRODUTOS_DO_RESUMO_MENSAL.md),
[repasse por produto e Ads](REPASSE_POR_PRODUTO_E_ADS.md) e
[devoluções e cobertura](DEVOLUCOES_E_COBERTURA.md). A descrição anterior de
ausência de cron no guia MEI refere-se à entrega já versionada; o incremento
atual acrescenta a coleta em segundo plano.

## O resultado que podemos usar hoje

A conta mensal permanece uma **estimativa operacional**:

```text
repasse esperado dos pedidos pagos criados no mês
− produção das unidades com custo cadastrado
− DAS mensal declarado
+ recarga de Ads retida no repasse, somente quando identificada como recarga
− gasto consumido de Ads nas mesmas datas de calendário
− despesas externas declaradas
= resultado líquido previsto
```

Taxas já incorporadas no repasse não são descontadas novamente. Recarga de
saldo não é consumo de anúncios. Uma despesa desconhecida não recebe zero.
O DAS é mensal, inclusive sem vendas, e não deve ser multiplicado por pedido
nem distribuído arbitrariamente entre produtos.

O diagnóstico calcula **TACOS = gasto consumido de Ads / vendas pagas da loja**
na seleção compatível. Não soma atribuições diretas e amplas nem usa GMV
atribuído como se fosse receita de toda a loja. Saldo antes de Ads é uma
referência do mês condicionada à cobertura financeira; não é limite aprovado
de investimento. A cobertura de custos mede quantas unidades vendidas têm
custo identificado, sem afirmar que esse padrão é o custo histórico realizado.

Pedidos usam mês de criação; Ads usa calendário. Essa combinação não prova o
gasto que gerou cada pedido. Repasse esperado não comprova dinheiro liquidado.
Devolução identificada não comprova o valor final reembolsado. O sistema mantém
o lucro realizado desconhecido e não promete precisão de 100%.

A [conferência automática de devoluções e ajustes](CONFERENCIA_DE_DEVOLUCOES_E_AJUSTES.md)
agora preserva as referências privadas, lê os detalhes em segundo plano e
compara os valores de ajuste. Isso fornece evidências; não confirma recebimento
nem libera o lucro estrito por si só.

O [cruzamento de liberações com pedidos](LIBERACOES_E_PEDIDOS.md) acrescenta
um calendário independente, cópia durável da coorte e parcelas monetárias
conferidas por pedido. Repetições, unidades incompatíveis e fontes ausentes
continuam pendentes; liberação da Shopee não comprova depósito bancário.

## Dependências que bloqueiam decisões comerciais

| Dependência | O que falta obter ou validar | Como comprovar a conclusão |
| --- | --- | --- |
| Recebimentos e reembolsos | Detalhes de devoluções e três valores de ajuste agora têm captura e auditoria automáticas. O cruzamento de liberações agora registra cobertura, vínculos e compatibilidade monetária. Ainda faltam comprovar os recebimentos e resolver valores sem correspondência ou identidade única | Reconciliação com uma referência financeira da Shopee do mesmo escopo, explicando cada diferença e sem contar o mesmo ajuste duas vezes. |
| Custos e despesas | Cobertura das unidades, vigência dos custos e despesas externas completas | Revisões identificáveis e resultado bloqueado quando faltar custo, despesa ou classificação de recarga. |
| Estoque | Quantidade vendável por produto/variação, reservas, disponibilidade e atualização | Contrato oficial validado com exemplos reais; informação vencida ou ausente impede propor aumento de exposição. |
| Campanhas e atribuição | IDs de campanha/produto/variação, gasto, conversões, janela e fuso da atribuição | Totais reconciliados com a conta, distinção entre atribuição direta/ampla e estimativas explicitadas onde não houver vínculo comprovável. |
| Escrita oficial | Endpoints, permissões e elegibilidade para cada ação pretendida | Contratos e respostas reais verificados para criar/editar campanhas e ofertas. A existência de leitura ou extensão de navegador não demonstra esse acesso. |
| Limites de Ads | Teto de gasto, perda máxima, margem, estoque e frequência de alteração | Regras persistidas e aplicadas pelo backend, com comportamento testado em concorrência, falha e resposta incerta. |

O orçamento de análises do assistente controla uso do modelo. Ele **não é**
orçamento de mídia e não limita gasto na Shopee. A autonomia comercial precisa
de limites próprios de Ads, independentes das instruções ao modelo.

## Referência de produto: Seller IA Club

Fonte pública: [selleriaclub.com.br](https://selleriaclub.com.br/), consultada
em **24/10/2026**. O site anuncia as capacidades abaixo; não houve teste
independente da ferramenta, de suas métricas ou de seus resultados. A página
descreve fluxos com extensão, envio de relatórios e recoleta manual. Isso não
comprova escrita autônoma em campanhas ou uso de uma API oficial para executá-la.

| Capacidade anunciada no site | Correspondência no BrazaCommerce | Próxima entrega útil |
| --- | --- | --- |
| Diagnóstico de conta com 18 métricas em cinco dimensões | Diagnóstico atual cobre TACOS, saldo antes de Ads, cobertura e pendências; não reivindica as mesmas 18 métricas | Ampliar indicadores somente com definições, períodos e fontes verificáveis; cada problema deve gerar uma tarefa concreta. |
| Análise de SKU por ROAS × margem, curva ABC e ações de pausar/escalar/otimizar | Quantidades, custos e contribuição parcial já existem; ranking por rentabilidade ainda depende de atribuição e estoque | Classificar campeões por contribuição depois de Ads e qualidade da evidência; avaliar recomendações antes de executar. |
| Precificação e ROAS mínimo | Custos e DAS declarados formam parte da base | Simular preço mínimo e ponto de equilíbrio com taxas, descontos e mix corretos. ROAS mínimo só faz sentido com margem e base de receita compatíveis. |
| Geração de fotos, títulos e vídeos | Ainda planejada | Gerar rascunhos a partir dos dados reais do produto, com revisão e avaliação de desempenho; publicação depende do contrato da ação. |
| Cursos e conteúdo de orientação | Próximas tarefas do diagnóstico já orientam correções | Oferecer ajuda contextual e explicação das recomendações; cursos não são dependência da apuração financeira. |

A comparação orienta funcionalidades. A prioridade do BrazaCommerce é reduzir
trabalho de coleta e produzir decisões rastreáveis com os dados da própria loja,
sem copiar promessas de resultado ou tratar recomendações como lucro comprovado.

## Fases e critérios de avanço

| Fase | Entrega e estado | Critério concreto para avançar |
| --- | --- | --- |
| 0 — Coleta confiável e diagnóstico | Cron e resumo publicado implantados (`bee63b0`), verificações públicas e registros de execução observados | Publicar a versão correspondente, observar cron com o navegador fechado, conferir último sucesso/erro e horários de cada fonte; demonstrar pausa/retomada, ausência de sobreposição, espera após falha e sinalização de dado vencido. |
| 1 — Financeiro confiável | Apuração prevista disponível; conciliação ainda incompleta | Conferir um período completo contra a Shopee, incluindo recebimentos, reembolsos, ajustes, produção, DAS e Ads. Registrar diferenças, cobertura e bases de tempo; manter desconhecido o que não foi conciliado. |
| 2 — Contratos de estoque e campanha | Planejado | Validar fontes oficiais, permissões, IDs, unidades, fuso, paginação e atualização. Fechar o contrato de cada escrita pretendida; mostrar que estoque, gasto e campanha se referem ao mesmo escopo da decisão. |
| 3 — Ranking de campeões com atribuição | Planejado após as fases 1 e 2 | Ordenar contribuição depois de Ads em períodos compatíveis, com cobertura de repasse/gasto e estoque. Separar pedidos mistos e atribuição estimada; reconciliar totais e reproduzir o ranking a partir das revisões guardadas. |
| 4 — Recomendações em observação | Planejado | Registrar proposta, evidências, hipótese, limites e resultado posterior sem enviar escrita. Testar identificador único por ação, deduplicação, reserva de orçamento, perda máxima e tratamento de resposta incerta; impedir nova execução sem conciliar o estado anterior. |
| 5 — Piloto aprovado | Planejado após evidência das fases anteriores | Habilitar um grupo pequeno de produtos e ações com teto de gasto, perda, preço, margem e estoque; conferir limites no backend antes da chamada, auditoria, pausa e alertas. Acompanhar uma janela suficiente para devoluções e comparar com a estratégia anterior. |
| 6 — Autonomia ampliada | Objetivo futuro | Ampliar produtos e ações somente com benefício observado e estabilidade no piloto. Cada novo escopo herda limites, observabilidade e critérios de pausa, com autorização explícita do escopo e registro dos resultados. |

Na fase de observação, as recomendações são avaliadas como se fossem decisões,
mas não executadas. Uma nova tentativa não pode duplicar orçamento ou ação.
Se a API aceitar uma escrita e a resposta se perder, primeiro se verifica o
estado remoto. Repetir a chamada às cegas não é uma estratégia de recuperação.

O aprendizado previsto relaciona **observação → recomendação → execução →
resultado → versão da estratégia**. Métricas são calculadas em código; o modelo
explica, propõe e consulta a memória. Mudanças de estratégia precisam de
comparação com resultados maduros, considerando estoque, preço, sazonalidade e
devoluções. Aumento isolado de ROAS não justifica promover uma regra. Esse ciclo
não depende de alterar os pesos do modelo a cada conversa.

## Próxima sequência de trabalho

O DTF entra como melhoria operacional antes do escalonamento comercial. A fila
identifica pedido e linha, usa SKU para localizar a arte e reserva os lotes para
evitar repetição. A montagem não depende de atribuição de campanhas: a
conciliação financeira segue em paralelo. Ainda faltam armazenamento
centralizado das artes, regras para composições especiais, consumo real de
material e calibração da saída física; não há impressão autônoma na máquina.

1. Concluir a publicação e a verificação do incremento atual. Conferir cache
   inicial, cron sem aba aberta, pausa, concorrência, falhas e horários reais;
   registrar o que foi observado em produção separadamente dos testes locais.
2. Usar as próximas tarefas do diagnóstico para fechar pendências de custo,
   despesas, pagamento, devolução e atualização. Conciliar recebimentos e valores
   efetivos de reembolso antes de chamar o resultado de realizado.
3. Documentar e validar os contratos oficiais de estoque e campanhas, incluindo
   permissões de escrita por ação e limites próprios de investimento em Ads.
4. Construir o ranking com atribuição comprovável e testar recomendações em
   observação. Só então iniciar o piloto comercial delimitado.

A autorização para automatizar a coleta já orienta o incremento atual. As fases
comerciais descrevem trabalho ainda necessário para tornar a autonomia
executável e verificável; não indicam que campanhas já estão sendo alteradas.
Pausar impede novas ações, mas não desfaz anúncios já consumidos ou vendas
concluídas. Nenhum aprendizado aumenta permissões ou limites por conta própria.
