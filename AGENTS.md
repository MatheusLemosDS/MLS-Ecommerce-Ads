PR134 — continuação vigente
Entrega pública na worktree /workspace/work/mls-order-materials-final-20261121, branch local fix/material-commercial-policy-20261121, branch remota feature/order-materials-dtf-chain-20261121. O candidato59b e sua primeira suíte estão preservados na worktree anterior. Consultar PR134 no HEAD atual e o único checkpoint; as correções são incrementais, sem reset, descarte, Live ou dados financeiros reais. PR133/132 já integradas na mainDE0; não repetir esses merges.

RETOMADA MAIS RECENTE — 21/11/2026
PR133 integrada em426b1de ePR132 emde0bb72, com CI2 de5.061Node/67Python e4/4checks. Esta branch implementa necessidades, fornecedores/compras declaradas, reservas/recebimentos atômicos, DTF e leitura semanal compartilhada. Ler docs/MLS_ORDER_MATERIALS_DTF_2026_11_21.md e o único checkpoint. A integração desta nova função ainda depende da CI final no SHA exato. Live17.3 preservada; nenhuma compra/pagamento/fato físico ou financeiro real autorizado nesta tarefa. Registros antigos abaixo têm escopo histórico, não são próximos passos vigentes.

MATERIAIS — execução atual em 21/11/2026
A PR133 foi integrada na main426b1de. A PR132 está reconciliada no candidato1e857ea com CI completa em andamento; esta branch separada prepara a ligação operacional e não altera aquele candidato. Conferir/atualizar a base real após a integração132 antes da CI final. O proprietário autorizou integrações Git e implementação operacional, mas vedou Live e ações financeiras/externas reais. Não presumir estoque, composição, prazo, fornecedor ou custo. Preservar V4.1, seis agentes, histórico v6, DTF e fechamentos; compras/pagamentos internos declarados não executam transações. Ler o único checkpoint canônico para o estado corrente. Os registros abaixo mantêm seu escopo/data.

INTEGRAÇÃO VIGENTE — 21/11/2026
PR133 integrada na main em 426b1de037b075afa066ace4742e3cf398294bbf, HEAD validado 1a2e1e76, 4/4 checks, 4.963 Node e 67 Python. A PR132 está sendo reconciliada preservando pagamentos semanais, estoque físico e a correção histórica. A união precisa de nova CI no SHA exato antes da integração. Os registros de validação anteriores abaixo mantêm seu escopo original; não comprovam esta combinação. Live 17.3 preservada; não publicar nem criar fatos físicos/financeiros reais. Checkpoint único: docs/MLS_COMMERCE_OS_CHECKPOINT.json. Próximo incremento após integração validada: pedidos → necessidade por tamanho/cor → reservas → faltas/compras → fila DTF → fabricação → fechamento, sem dupla dedução.

# MLS Commerce OS — entrada de desenvolvimento

## Retomada vigente — 21/11/2026

A correção do resultado diário parte da main `dc784188e72c1a35dc014155e23c474b95b17cfe`, com PR130/131 integradas. PR121 é histórica; PR132 permanece um incremento independente. Ler o único checkpoint `docs/MLS_COMMERCE_OS_CHECKPOINT.json` e `docs/MLS_HISTORICAL_DAILY_PROFIT_2026_11_21.md` antes dos registros anteriores. A Visão geral deve usar custos históricos comprovados; subtotal parcial não é lucro completo. Preservar as referências legadas explícitas a custos atuais e os dados. O proprietário autorizou recuperar/preservar o workspace, executar testes, enviar esta branch e abrir uma PR separada. Não publicar Live nem alterar dados financeiros reais neste incremento. A Live conferida é 17.3; versão de código não comprova publicação.

<!-- FINANCIAL_AUTOMATION_CURRENT -->
**Complemento financeiro — `PUBLISHED_VERIFIED` somente no escopo técnico/público:** versão `2026-11-13.3`, conferida em **13/11/2026 às 21:22:15 Brasília**, fonte `f68525ea1d136350ece9942433352accdf97d992`, [CI 43531882471](https://github.com/MatheusLemosDS/MLS-Ecommerce-Ads/actions/runs/43531882471) aprovada: **4.432 Node/67 Python**. App/Auth atualizados e Finance retido; três vetores/configuração, 17 verificações HTTP, oito assets e 24 perfis públicos conferidos. A correção valida pelo horário após a leitura assíncrona, preservando a rejeição de datas futuras. Na execução natural de 14/11 às 00:32:51 UTC, novembro avançou à fonte v2: 100 eventos de pedidos preservados e 13 eventos diários de Ads, sem novo SOURCE_INVALID ou reinício do cursor. A coleta continua parcial. MLS Finance reúne oito áreas, gráficos/CSV canônicos, custos históricos, conciliação e fechamentos versionados. Carteira/saques e banco automático ainda precisam de contrato, adaptadores e acessos comprovados; as demais lacunas da matriz e M2/M2.2 continuam abertas. QA autenticada é sintética/local; **aceite financeiro da conta real não realizado**. O recibo conserva integralmente a publicação .2 e sua falha posterior; publicação não comprova merge Git. [Uso, recibo e limites](docs/financial-automation/README.md).
<!-- END_FINANCIAL_AUTOMATION_CURRENT -->

## Missão e retomada atual

Continuar a operação própria existente, preservando o design V4.1. A main
reconciliada é `dc784188e72c1a35dc014155e23c474b95b17cfe`, que integra PR130 e
PR131; conferir sempre o remoto antes de uma nova sessão. PR121 é histórica.
Este incremento implementa pagamentos parciais de produção por semana/prestador
e estoque físico de camisetas por tamanho/cor; compras, fila DTF e fechamento
integrados vêm depois, conforme os serviços comprovados.

Em 21/11/2026 o proprietário autorizou o envio desta branch ao GitHub, abertura
de PR, CI e prévias isoladas Cloudflare. A Live e movimentações de dinheiro
continuam sem autorização neste incremento.
Implementação local, testes, integração Git, publicação e aceite real têm estados
separados. Não tratar merge como deploy, nem testes sintéticos como aceite da conta.

Leia nesta ordem:
1. `docs/ROADMAP_MLS_COMMERCE_OS.md`: estratégia e ordem.
2. `docs/MLS_COMMERCE_OS_CHECKPOINT.json`: único checkpoint canônico atual.
3. `docs/MLS_CODEX_HANDOFF_2026_10_28.md`: apontadores de retomada.
4. O registro do incremento/domínio indicado no checkpoint.

O histórico integral anterior está preservado em
`docs/history/AGENTS_before_operating_increment_20261120.md`. Seus recibos e
restrições por PR continuam evidências no escopo/data descritos; instruções
históricas de checkout/merge não substituem o Git atual e o pedido vigente.
O checkpoint de missão antigo é referência histórica, não outra autoridade atual.

## Invariantes

- Preservar App/Auth/Finance (`brazacommerce-*`), bindings, D1, URLs, headers,
  cookies, isolamento por empresa/loja, autenticação, revisão e auditoria.
- Não apagar alterações locais, históricos ou branches do usuário; nada de reset
  destrutivo, limpeza indiscriminada ou force push. Não repetir merges históricos.
- Produto MLS Commerce OS; Hermes OBSERVER, Ads/PROMO LOCKED. Não conceder acessos,
  contornar consentimentos/grants ou transformar sugestões em escrita externa.
- Não movimentar dinheiro, efetuar PIX/saques/reembolsos/cobranças, comprar serviços,
  publicar em marketplaces, mudar preços/budgets/estoques externos, enviar mensagens
  ou reconectar OAuth sem a autorização específica aplicável.
- Nunca colocar tokens, callbacks, cookies, senhas, order_sn privados, dados de
  compradores ou arquivos pessoais em Git/logs/respostas. Usar fixtures sintéticas.
- Ausência de fonte é UNKNOWN/NOT_CAPTURED/PARTIAL/BLOCKED, nunca zero/COMPLETE.
  Não inventar lucros, estoque, taxas, preços, vendas, fatos físicos ou permissões.
- Separar vendas, fabricação, obrigação, pagamento declarado, liquidação bancária,
  recebíveis, carteira, trânsito, caixa e CMV. Não duplicar receita ou deduções.
- Custos históricos ficam preservados; custos atuais não comprovam preços antigos.
  Custo completo OU componentes conforme política vigente, sem somar os dois.
- Fabricação conserva sexta13h inclusiva → sexta13h exclusiva em America/Sao_Paulo.
  Vendas/financeiro mantêm os respectivos calendários civis e bases explícitas.
- Fechamentos originais e revisões são imutáveis; correções têm delta e auditoria.
  Retry não duplica fatos; CAS impede perda de alteração concorrente.
- Exportar DTF não comprova imprimir, fabricar ou consumir material. Kit/unidade
  comercial, peça física e estampa são quantidades diferentes. Arte ausente é
  pendência. Backup restaura pixels e vínculos, não apenas hashes.
- Estoque inicial exige contagem explícita; compra aberta/pagamento não prova
  recebimento. Reserva física não equivale à reserva de linhas DTF. Devolução exige
  recebimento/inspeção antes de disponibilidade. Não presumir estoque pelas vendas.
- Preservar Visão geral como entrada normal e destinos de links diretos válidos.
  Manter indicadores, gráficos, avatares, cores, temas e componentes V4.1; seis
  cartões entre indicadores e gráficos: Hermes, Finance, Ads, Products, Production,
  Returns. Auditor permanece no diretório. Não aplicar prévias exploratórias.
- Preservar datas, filtros, paginação, seleção, rascunhos e retorno ao navegar;
  restaurar contexto não repete gravação, pagamento, reserva ou exportação.
- M2/M2.2 e aceite financeiro real continuam abertos até confronto da conta com
  Seller Centre/banco e fatos físicos equivalentes. Bloqueios de venda ficam
  ADIADO_VENDA sem travar operação própria. Registrar dependência específica e
  continuar trabalho independente.
- Não reduzir/desativar testes, segurança, lista exata de hashes reconhecidos ou
  contratos válidos para obter CI verde. Toda exceção tem delta explícito e prova.
- Não copiar bibliotecas Shopee/ERP inteiras; revisar licença, contrato oficial,
  compatibilidade Workers, método, payload, escopo, região, paginação e limites.
  SDK/relato de fórum não comprova permissão; escrow batch tem divergências GET/POST.
- Hash de imagem identifica bytes; não comprova decodificação, direito autoral ou
  política do marketplace. Nenhum script publica na Shopee por padrão.

## Implementação e verificação

Usar Node24 e dependências fixadas. Acesso a novas tabelas exige estratégia de
isolamento e recuperação; worktree não isola bancos/storage/credenciais reais.
Novas leituras são SELECT-only e novos efeitos têm ação explícita, CAS e replay.
Migração destrutiva/incompatível exige restauração demonstrada antes da operação.

Gates do projeto:
```
npm ci
npm test
python3 -m unittest web/bridge/test_hermes_bridge.py tools/test_install_hermes_web_bridge.py tools/test_build_hermes_web_bridge_install.py tools/test_activate_hermes_web_bridge.py tools/test_build_hermes_web_bridge_activation.py -q
npm run build
```

Funções interpoladas em strings de cliente precisam entrar em
`web/cloudflare/build.py` (`freeze_client_helpers`) e ser verificadas no Worker
gerado. Preservar artefatos reconhecidos e adicionar novos hashes só após build
válido. UI alterada exige Chromium normal/minificado e móvel/desktop pertinente.
Reutilizar evidência válida; não repetir suítes amplas sem mudança ou preocupação.
Integração exige CI verde no SHA exato e compatibilidade dos três Workers.

Cada mudança visível atualiza APP_RELEASE e notas coerentes; o identificador não
prova deploy. Publicação só com autorização específica vigente, bytes/assets,
configuração/bindings/flags/cron, backup/rollback e QA exigidos; conferir a versão
real após cada etapa. Ferramentas de prévia não concedem autorização de produção.

Ao entregar: informar resultado concreto, acesso/uso, arquivos/commit/PR, testes e
alcance, estados IMPLEMENTADO/TESTADO/INTEGRADO/PUBLICADO/VALIDADO_REAL separados,
limitações e próximo comando. Atualizar o único checkpoint canônico e apontadores
no roadmap/handoff; preservar históricos. Ao interromper, salvar o ponto exato de
continuação. Não encerrar só em análise quando houver implementação autorizada.
