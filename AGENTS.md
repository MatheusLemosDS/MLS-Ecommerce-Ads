# MLS Commerce OS — instruções do repositório

Comece pela [retomada curta](docs/RETOMADA.md) e pelas regras de domínio abaixo.
O [histórico integral das instruções](AGENTS_HISTORICO.md) e o
[handoff integral anterior](NEXT_CHAT_HANDOFF_HISTORICO.txt) preservam os cortes,
recibos e links da base `346f30f200e5cbd3d9efd26663a483c625d9c6e7`.
Estados de branches, pendências e autorizações datados devem ser confrontados
com a tarefa autorizada e a base atual. As regras de domínio continuam ativas.

## Regras de domínio ativas

- Fabricação: semana de sexta às 13h inclusiva até a sexta seguinte às 13h exclusiva, em Brasília (`America/Sao_Paulo`), incluindo fim de semana. Na sexta, exigir distribuição confirmada antes/a partir de 13h; sem ela, ambas as semanas ficam pendentes. Conferência de completude exige declaração explícita; preservar originais e revisões. [Produção e corte semanal](docs/MLS_PRODUCTION_WORKSPACE_2026_11_09.md).
- Não inferir fabricação, quantidade física, datas ou custos históricos de vendas, DTF, catálogo ou custo atual. Ausência de lotes, fonte ou cobertura é desconhecida, não zero. Reaproveitamento exige origem/alocação, quantidade e inspeção física confirmadas; revisão da inspeção retira a confirmação financeira anterior. [Fontes e limites](docs/financial-automation/README.md).
- Não duplicar custos ou receitas: fabricação não é deduzida outra vez da estimativa; venda, liberação, saque, transferência e crédito bancário não são novas receitas da mesma venda. Pagamento não repete a despesa; ajustes já incluídos no repasse não são reaplicados. Competência, caixa e fabricação têm datas, bases e gates distintos. [Contratos e fórmulas](docs/financial-automation/VALIDATION.md#contratos-e-fórmulas) e [relatório semanal](docs/MLS_WEEKLY_OPERATING_REPORT_2026_11_11.md).
- Conciliação exige prévia, revisão, confirmação explícita, capacidade disponível e reversão auditada; coincidência de valor/data não confirma vínculo. Preservar idempotência, revisão, conflitos, permissões e auditoria. Políticas/tributos exigem aprovação aplicável; aprovação não comprova fontes. Fechamentos congelam snapshots e exigem retificação explícita, sem reescrever versões anteriores. [Regras de uso e fechamento](docs/financial-automation/README.md).
- Fontes históricas sem captura ficam NOT_CAPTURED/parciais; coorte por criação não comprova todas as conclusões. Fuso Ads desconhecido não permite rateio horário; ajuste/recarga sem classificação fica REVIEW. Carteira/saques e banco automático dependem de contrato/adaptador e acessos/consentimento comprovados; falha CONNECT/403 do proxy não comprova NO_PERMISSION. [Matriz de lacunas](docs/financial-automation/MATRIZ_EXECUCAO.json).
- QA sintética e publicação técnica não certificam valores reais, cobertura completa, aceite operacional ou encerramento de M2/M2.2. Não criar fatos reais para QA; preservar estimativas, integrações e gates comerciais. [Recibo técnico e histórico .2/.3](docs/financial-automation/publication-live-20261113.json).

Leia as referências canônicas nesta ordem antes de alterações que dependam delas:
1. docs/ROADMAP_MLS_COMMERCE_OS.md (fonte canônica da estratégia).
2. docs/MLS_COMMERCE_OS_CHECKPOINT.json (estado técnico e branches).
3. docs/MLS_CODEX_HANDOFF_2026_10_28.md (próximas tarefas testáveis).
4. docs/SHOPEE_RESEARCH_TO_MLS_2026_10_28.md (fontes externas e restrições).

## Regras que não podem ser ignoradas

- Produto: MLS Commerce OS. MLS Hermes é supervisor, modo OBSERVER até autorização específica.
- Referência visual obrigatória, confirmada pelo proprietário em 02/11/2026: manter seis cartões de agentes na Visão geral, imediatamente após os indicadores e antes dos gráficos, na ordem Hermes, Finance, Ads, Products, Production e Returns. Preservar avatares, cores, estados e acesso aos painéis. Reorganizar a navegação não autoriza retirar esses cartões ou substituí-los por um link para Equipe; mudar essa composição exige pedido explícito do proprietário. Auditor permanece no diretório completo dos sete agentes.
- PRs #47/#48/#51/#56 preservam as branches originais de Products/Pricing, busca e Listing Factory. Seus fundamentos foram reconciliados na Live pela PR #86. Não repetir os merges históricos; comparar a main atual e revalidar qualquer diferença real antes de uma nova integração.
- A base desta auditoria é a main `78efb0c9ebfa866c28d7be79414cb5324dd2c669` (PR #96). A referência PR #55/a137b9d é histórica. Antes de trabalhar, busque e confira a main remota e os PRs atuais; não trate um SHA antigo deste documento como HEAD permanente.
- M2 Finance/Returns NÃO foi encerrada: Seller Centre, Pending, liberações e devoluções devem ser validados na conta. Issue #50.
- Não inventar lucros, estoque, taxas, preços, vendas, eventos ou permissões Shopee. Dados ausentes = UNKNOWN/BLOCKED, jamais zero.
- Ads/PROMO continuam LOCKED. Nunca enviar anúncios, alterar preços/campanhas, criar promoção, confirmar eventos de push, reconectar OAuth ou modificar pedidos sem permissão real e aprovação do operador. M6/M7 definem os gates de escrita.
- Jamais incluir tokens, callbacks, cookies, order_sn privados, buyer data ou arquivos pessoais em commits, logs, testes ou respostas. Fixtures determinísticas e sem dados reais.
- Preservar os três Workers legados brazacommerce-app, brazacommerce-auth, brazacommerce-finance, bindings, D1, URLs, headers, cookies e rotas até migração específica.
- Não copiar bibliotecas Shopee/ERP inteiras para o runtime; revisar a licença de cada dependência, compatibilidade Cloudflare, payload real, permissões por loja/região e a documentação oficial.
- No Shopee SDK externo há divergências históricas GET/POST em escrow batch: validar método contra schema v2 e ambiente oficial antes de construir transporte.
- Arquivos de mockup são inspecionados localmente apenas por cabeçalho. SHA-256 identifica bytes, NÃO garante decodificação, política oficial ou direitos autorais.
- Não reduzir nem desativar suites de teste ou a lista exata de hashes reconhecidos dos Workers. Se adicionar função embutida em script, atualizar também web/cloudflare/build.py (freeze_client_helpers) e testar Worker gerado.

## Desenvolvimento e publicação

Preferência explícita do proprietário, 01/11/2026: cada relatório de entrega
deve explicar as mudanças concretas, onde encontrá-las e como usá-las. Separar
Git/preparação, publicação e conferência Live; identificar passos manuais,
pendências do operador, testes relevantes e limitações. Contagens de testes
apoiam a validação e não substituem a explicação da melhoria. Não declarar
publicação ou aceite operacional sem evidência própria; manter um resumo atual
curto e apontar o registro detalhado, preservando os históricos anteriores.

Cada futura mudança visível ao proprietário deve atualizar `APP_RELEASE` e as
notas visíveis da versão no mesmo incremento: identificador, data, rótulo e
explicação coerentes com a entrega. A identificação humana não comprova deploy;
conferir o recibo e os bytes. Disponibilidade técnica não confirma dados reais,
aceite operacional nem encerramento de M2 ou outra fase.

Orientação do proprietário em 30/10/2026: entregar os próximos incrementos
validados na versão oficial; criar ambiente separado apenas quando necessário.
Preservar a prévia demonstrativa da PR #84 para consulta. Isso não integra
automaticamente PRs visuais/AI antigas nem autoriza escritas comerciais Shopee/Ads.

Pedido seguinte do proprietário: promover todas as melhorias preparadas para
a Live e manter esse destino nos próximos incrementos do roadmap. A release
`release/live-roadmap-improvements-20261030` reconcilia conscientemente a cadeia
PR84/83/79/76 com a main PR85, em vez de mesclar PRs históricas em duplicidade.
As duas flags owner podem ser ativadas após os testes. Preservar contratos,
rollback, dados reais e gates comerciais; registrar dependências externas.

1. Criar branch pequena a partir de um commit verificado ou PR base explícita.
2. Manter mudanças puras de planejamento separadas de Finance/Auth/Ads/DTF e da publicação externa.
3. npm ci; npm test (pré-build e testes Node); python3 -m unittest web/bridge/test_hermes_bridge.py tools/test_install_hermes_web_bridge.py tools/test_build_hermes_web_bridge_install.py tools/test_activate_hermes_web_bridge.py tools/test_build_hermes_web_bridge_activation.py -q; npm run build.
4. Exigir CI GitHub verde, verificação exata do App/Auth/Finance e, se houver UI, Chromium e QA autenticado desktop/mobile.
5. Nunca considerar merge em main como confirmação de Cloudflare deploy. Conferir cada Worker e origem/corte dos dados separadamente.
6. Atualizar o roadmap, checkpoint, docs/MLS_CODEX_HANDOFF_2026_10_28.md e NEXT_CHAT_HANDOFF.txt ao completar cada fase; registrar id do PR, commit e gates pendentes.

Para usar o gerador local: docs/MLS_LISTING_FACTORY_V1.md. Usar Node >=24. Nenhum script deste projeto deve publicar na Shopee por padrão.
