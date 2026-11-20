# Financeiro — correções operacionais de 20/11/2026

A main foi conferida em `4cfdf465b2fda58dd27ae693126b7fe1625f69d6`. O incremento `2026-11-20.1` foi implementado na [PR #131](https://github.com/MatheusLemosDS/MLS-Ecommerce-Ads/pull/131). Os [checks do head atual](https://github.com/MatheusLemosDS/MLS-Ecommerce-Ads/pull/131/checks) são a fonte de validação completa; a integração exige todos aprovados. **Não foi publicado.** A última conferência nativa manteve a Live `2026-11-17.3`; merge, publicação e aceite financeiro são etapas independentes.

## O que foi corrigido

- A coleta termina as páginas do mesmo conjunto imutável de fontes antes de aceitar uma publicação mais nova. A cobertura exige todas as janelas necessárias e o cutoff de cada janela, respeitando o segundo inclusivo e os calendários de Brasília.
- A retenção protege fontes publicadas, candidatas ainda não confirmadas e fontes em leitura. A reserva durável antecede a gravação App; confirmação com revisão/CAS e a publicação App servem para retomar após interrupção. As fontes já apagadas não são recriadas artificialmente. Um 404 de fonte ausente validado permite adotar uma publicação sucessora real; respostas 404 genéricas não autorizam essa troca. Indisponibilidades cedem a vez às outras famílias e preservam o cursor exato da tentativa adiada.
- O histórico mensal volta a disputar oportunidades limitadas com o mês atual e cede às demais coletas. Uma revisão de extrato inválida conserva sua pendência e permite renovar pedidos, Ads e estoque.
- Contas declaradas exigem os saldos de abertura e fechamento de todas as posições. Devoluções no mesmo instante da venda respeitam sua origem explícita. Repetir uma obrigação conserva o comando original e seu prazo.
- O consentimento bancário é conferido depois dos últimos passos assíncronos e novamente no instante anterior à chamada do provedor. O adaptador continua dependendo de instalação e acesso reais; seu teste não configura um banco. O transporte da conta aplica o prazo ao corpo de entrada, à chamada e à resposta.
- O painel relê uma consulta interrompida ao ser reaberto. Retificações conservam o calendário da versão histórica, mesmo depois de mudar a política semanal.
- A origem das vendas no inventário possui paginação explícita. Avançar lê uma página e conserva os campos de lote, quantidade e motivo; uma venda selecionada exige decisão explícita antes de trocar a origem.
- O histórico de custos ganha evidências datadas independentes do catálogo atual. Aprovar exige conferir os nomes/composições, hash e revisão. Retirada e nova aprovação conservam a auditoria. O consumo de fonte manual e agendado compartilha o mesmo lease, orçamento e pausa.
- Wrangler e a dependência transitiva Undici estão fixados em versões compatíveis corrigidas. A auditoria do lockfile passou de três vulnerabilidades a zero; a CI completa continua sendo uma verificação separada.

## Como usar após uma publicação validada

1. Abra **MLS Finance** e confira mês, fontes, datas e pendências antes de interpretar qualquer valor.
2. Em **Conferir custos históricos das vendas**, escolha o mês e use **Ler referência e evidências**. Se a fonte ainda estiver pendente, aguarde o agendador ou solicite explicitamente uma página quando houver oportunidade. Confira todas as páginas de nomes e só aprove uma identificação correta. A revisão não altera preços atuais, fabricação ou extratos.
3. No inventário, use **Próximos itens** para alcançar outras vendas. Preserve a quantidade original do item comercial; uma venda de kit não comprova suas peças físicas.
4. Em **Fechamentos**, prepare a base desejada. Para corrigir uma versão anterior, retifique a própria versão. Ausências de saldos, custo ou cobertura continuam impedindo o aceite correspondente.
5. Na conciliação, use somente extratos e repasses reais já importados, com revisão explícita. Repetição segura não autoriza inventar ou duplicar um pagamento.

## Conferência e limites atuais

A auditoria de leitura confirmou cinco referências publicadas de setembro/outubro ausentes no Finance e as duas referências atuais de novembro presentes. A reparação previne novas exclusões; recuperar as fontes ausentes requer nova coleta autorizada e publicação normal do resultado completo, preservando as cópias antigas do App até a troca validada.

O replay real anterior encontrou 3 de 186 unidades com custo demonstrável e 183 pendentes. O novo recurso não promove os pendentes automaticamente: exige captura desde a primeira página e revisão humana da identidade. O dia de alteração de custo sem resolução temporal suficiente continua desconhecido.

Banco automático, carteira/saques nativos, regime/competência aprovados, despesas, fuso dos anúncios e correspondência física ainda exigem fontes e conferência reais. Nenhum teste sintético comprova dinheiro recebido, lucro realizado ou fechamento da conta. Não foram movimentados valores nem criados fatos financeiros reais para testar.

A paridade de catálogo, visibilidade dos custos adultos e DTF foi incorporada a este candidato a partir da fonte publicada, com testes de montagem automática, composição, ciclo, backup e lotes. A compatibilidade global das empresas mantém os 114 comandos anteriores e inicializa os metadados novos separadamente. A publicação ainda exige comparar os bytes, as configurações, os assets e o rollback da Live com o candidato aprovado.

## Etapas separadas

O [recibo atual](financial-automation/validation/finance-completion-20261120.json) registra implementação, testes, Git, publicação e aceite operacional separadamente. Os 67 testes Python passaram. O replay local preservou os cálculos inteiros dos cinco dias e os desconhecidos. A primeira rodada completa local/GitHub teve 4.803 aprovações e 65 falhas de integração, sem cancelamentos ou ignorados; seu resultado foi preservado. As correções mantêm expectativas financeiras e reforçam o inventário dos sete assets. O [estado atual dos checks da PR #131](https://github.com/MatheusLemosDS/MLS-Ecommerce-Ads/pull/131/checks) identifica a rodada integral correspondente ao head, independentemente deste registro de preparação. Os gráficos operacionais, os seis cartões e os contratos válidos de custos e fabricação permanecem requisitos de validação.

Fontes técnicas consultadas: [D1 batch e transações](https://developers.cloudflare.com/d1/worker-api/d1-database/), [transmissão autorizada no Open Finance](https://www.bcb.gov.br/meubc/faqs/p/como-os-dados-sao-transmitidos-de-uma-instituicao-para-outra), [correção de redirecionamentos Undici](https://github.com/advisories/GHSA-4w7w-5xrc-9h26) e [validação TLS Undici](https://github.com/advisories/GHSA-2m5v-pch6-74hx). A documentação oficial Shopee retornou403 nesta sessão; isso não comprova ausência de permissão da conta.

## Resultado integral e pacote de publicação

A [CI #682](https://github.com/MatheusLemosDS/MLS-Ecommerce-Ads/actions/runs/44828314821), no head `465bd72c9887eb6fc051541121e1130b8008f3e2`, passou com **4.886 Node, 67 Python e os quatro checks obrigatórios**. A suíte local teve o mesmo resultado sem falhas ou ignorados. O preflight permaneceu MERGE_ONLY; esse resultado não publicou o site nem confirmou os fatos da conta real.

A conferência posterior demonstrou que um segundo bundle do Wrangler mudava o App de 3.859.516 para 4.330.679 bytes. O comando de publicação agora delega todas as verificações do deployer anterior, valida o módulo ESM completo e o manifesto real, e exige `--no-bundle`. O deployer anterior, os perfis, as rotas e as permissões permanecem congelados. Os 74 testes de guardas e os 6 testes do módulo/dry-runs reais passaram; os três pacotes conservaram exatamente seus bytes/hash, sem envio ao site.

Os scripts `npm run deploy:app`, `deploy:auth` e `deploy:finance` passam pelo novo verificador. A preparação `-- --dry-run` mantém o modo sem publicação. Essa proteção não concede autorização de produção: a [CI do head atual](https://github.com/MatheusLemosDS/MLS-Ecommerce-Ads/pull/131/checks), a validação específica da Live, os assets/rollback e o aceite financeiro real continuam separados. Os Workers de runtime permaneceram byte-idênticos aos já testados pela CI #682.
