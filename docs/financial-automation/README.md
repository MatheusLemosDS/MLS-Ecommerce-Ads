# Complemento financeiro — implementação e limites

A implementação publicada adiciona ao MLS Finance resultado por competência, recebíveis/carteira, saques, banco, despesas, devoluções, conciliação e fechamentos versionados, preservando a V4.1 e a estimativa de vendas existente. Fontes não comprovadas permanecem parciais.

**Publicação técnica verificada:** release 2026-11-13.3 em 13/11/2026 às 21:22:15 Brasília, fonte `f68525ea1d136350ece9942433352accdf97d992`, [CI 43531882471](https://github.com/MatheusLemosDS/MLS-Ecommerce-Ads/actions/runs/43531882471), 4432 Node/67 Python. O [recibo dos Workers/configuração e da conferência pública](publication-live-20261113.json) registra os três serviços no domínio. App/Auth foram atualizados; Finance foi retido. **Isso não certifica valores da conta real, integração Git/merge ou encerramento de M2/M2.2.**

**Continuidade da coleta:** a .2 preservou os 100 primeiros eventos, mas interrompeu a etapa Ads por validar observações contra o horário anterior à leitura. A .3 reconfere o horário ao concluir a leitura e mantém a rejeição de futuros reais. Na execução natural de 14/11 às 00:32:51 UTC, novembro avançou à fonte v2: 100 eventos de pedidos preservados e 13 eventos diários de Ads, sem novo SOURCE_INVALID ou reinício do cursor. A coleta continua parcial. O recibo conserva integralmente a .2 e sua falha em `previous_release_evidence`.

## Onde usar

Abra **MLS Finance** em `/admin?tab=agent-finance`, escolha o mês no seletor existente e procure **Resultado, carteira e caixa** (`#financialAutomation`). A área contém oito seções: Resultado; Recebíveis e carteira; Saques; Banco; Despesas; Devoluções; Conciliação; Fechamentos. Os seis agentes da Visão geral continuam preservados.

- **Atualizar leitura** relê os registros salvos; não inicia uma consulta de carteira ou banco. O gráfico diário, os detalhes e **Exportar linhas** usam a mesma série canônica. Datas futuras ou sem fonte não recebem zero fictício. Clique num dia ou use as setas do teclado para consultar suas referências de eventos e revisões.
- **Política de reconhecimento e automação** mostra os parâmetros antes de aprovar: conclusão comprovada do pedido, repasse líquido, custo histórico, tributo disponível, vigência, semana financeira civil, reserva de giro e opção de fechamento automático. Aprovar a política não confirma fontes ausentes.
- Em **Devoluções → Custos históricos e peças reaproveitáveis**, use **Ler lotes e origens disponíveis**. Registre um lote já fabricado, selecione o item original para vincular suas peças ou valore um recebimento já inspecionado. Campos de fonte vêm do servidor; o operador confere a composição e a quantidade.
- **Conciliação** permite selecionar evidências já importadas, conferir a prévia de alocação, confirmar explicitamente e reverter mantendo histórico. As quantias disponíveis são calculadas no servidor; coincidência de data e valor não autoriza conciliação automática.
- **Fechamentos** prepara, conclui uma versão pronta ou cria retificação. Resultado por competência e caixa bancário têm gates diferentes. A fabricação conserva o fechamento separado de sexta às 13h, Brasília; a semana financeira é civil, conforme a política aprovada.
- Abaixo das áreas, **Saúde das fontes** mostra cobertura, corte e pendências. Acesso revogado limpa a leitura; indisponibilidade temporária conserva a última leitura identificada como antiga e suspende ações que dependem de uma leitura válida.

As ações aparecem somente com as permissões aplicáveis. A API pública é `/api/admin/finance/automation?month=AAAA-MM`, com mutações separadas `/policy`, `/sync` e `/close`; todas dependem de autorização no servidor, e mutações exigem CSRF e identidade idempotente. Rotas privadas entre App/Auth/Finance não são URLs para abrir no navegador.

## Código publicado e alcance funcional

O razão guarda centavos inteiros, origem, datas, evidência, versões e deltas equilibrados. IDs nativos permitem repetir uma observação sem duplicar receita; identidade insuficiente fica em revisão. Grupos de conciliação podem reunir ou dividir movimentos, conservando cada centavo e a capacidade também usada pelo matcher legado 1:1.

Fechamentos guardam um snapshot imutável com eventos/revisões, políticas, totais, fontes e hashes. Alteração posterior não reescreve a versão encerrada; exige retificação explícita. A revisão do razão e as revisões de configuração/fonte são verificadas atomicamente, incluindo a retirada de aprovação de auto-fechamento durante um job.

Os adaptadores atuais leem **pedidos e despesas salvos, Ads por calendário, movimentação já importada e estoque com alocação confirmada**, mantendo a qualidade de cada fonte. Ads com fuso desconhecido e movimentos bancários sem conta/identidade fortes continuam `REVIEW`, sem contabilização definitiva. A política tributária depende da configuração e aprovação explícitas. A captura V2 de componentes/datas aproveita novas respostas do fluxo `escrow/detail` existente. **Pedidos históricos sem captura permanecem `NOT_CAPTURED`/parciais**; a presença do pedido no cache não reconstrói seus componentes ou datas ausentes.

Os lotes de pedidos legados são consultados por **data de criação**. Mesmo quando contêm a data real de conclusão de alguns pedidos, não comprovam todos os pedidos criados antes e concluídos na competência selecionada. Esse conjunto incompleto mantém pendência para uma política de receita por conclusão; não pode receber cobertura completa apenas porque a leitura do lote terminou.

## O que ainda impede a automação completa

| Trilha | Estado e consequência |
| --- | --- |
| Carteira e saques Shopee | Nenhuma API Wallet/Payout foi consultada com sucesso, nem grant real confirmado. A documentação oficial falhou no túnel/proxy deste ambiente com `CONNECT`/403 antes de chegar à origem; isso mantém `UNKNOWN`, sem comprovar `NO_PERMISSION`. O registro de capacidades e o coletor genérico existem, mas falta o adaptador efetivo e sua comprovação por loja/região. |
| Banco | CSV/OFX Nubank existente permanece disponível. Há interface de conector consentido, mas nenhum adaptador bancário/Nubank/Open Finance real está configurado. Não há saldos inicial/final e cobertura reais confirmados nesta entrega. |
| CMV e estoque | Ponte persistente `INVENTORY` registra lotes reais e seu custo histórico, aloca peças ao item original e venda reconhecida e emite CMV. O operador confirma a composição; ausência de item/fonte bloqueia a escolha. Cobertura integral/abertura continuam parciais, sem produção ou estoque inferidos. |
| Devoluções | Valoração persistente de revenda/dano exige alocação original, inspeção real e vínculo ativo do lote; revisão da inspeção retira a confirmação financeira anterior. Fila durável revisita casos salvos antigos, com limite200 explícito. Descoberta de todos os casos ainda não observados depende de fonte autorizada. |
| Ads | Fonte salva gera evento por dia nominal em revisão. Fuso/saldo/recarga nativos não estão comprovados; não há rateio horário inventado. Os cálculos Ads legados continuam separados. |
| Despesas e caixa livre | Despesas operacionais já declaradas pelo operador alimentam competência mensal; registry Finance conserva snapshot minimizado dessas obrigações do App para associação. O banco não cria despesas automaticamente. Isso não comprova pagamento. Banco e compromissos externos completos continuam pendentes. |
| Conferência real | Sem sessão autenticada do proprietário e fontes equivalentes de uma semana/mês encerrados, nenhum valor real foi certificado. Testes sintéticos não substituem o confronto Shopee–banco–produção. |

O snapshot de estoque possui limites explícitos de até 150 lotes, 500 alocações e 190 KB, prevalecendo o primeiro atingido. Ao atingir a capacidade, a ação é recusada com `CAPACITY_REACHED`/409, preservando o histórico. Arquivamento e particionamento para uso ilimitado permanecem evolução interna.

Essas lacunas de programação e de integração constam separadas dos acessos externos na matriz. Publicar o código não as transforma em funções operacionais completas.

## Evidências e controle

- [Validação e contratos](VALIDATION.md): execuções atuais, alcance dos testes, DDL, fórmulas e dependências.
- [Matriz de execução](MATRIZ_EXECUCAO.json): os 28 requisitos e 24 cenários originais, com implementação, evidência, lacunas internas e dependências externas por item.
- [Estoque e custos históricos](validation/inventory-focused-20261113.json): nove testes SQLite adicionais cobrem lotes100/vendas80, devolução parcial inspecionada, reversão, corrida de revisão e permissões.
- [Registro da execução focalizada](validation/local-focused-20261113.json): 169 testes aprovados em 20 arquivos; sem falhas ou testes pulados. É uma execução própria, sem somar runs anteriores com testes repetidos.
- [Base inicial](BASELINE.md) e [inventário](BASELINE_INVENTORY.json): preservam a comparação da auditoria com a HEAD inicial; a extensão atual fica identificada separadamente.
- [Sugestões de automação](SUGESTOES_AUTOMACAO.md): formas de reduzir arquivos/digitação conforme as fontes disponíveis.
- [Inputs e hashes originais](input/MANIFEST.json): prompt, auditoria e matriz anexados, sem alteração.
