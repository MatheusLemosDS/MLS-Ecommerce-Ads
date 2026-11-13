# Validação V4.1

A evidência é registrada por requisito em [functional-coverage.json](functional-coverage.json). Inventário, implementação, testes locais, integração autorizada, publicação e conferência Live são dimensões independentes. Uma suíte aprovada não comprova automaticamente cada aceite, nem a operação real da loja.

## Baseline preservada

O inventário inicial usou o build local compilado de `a5bd38a0902b38ecc3e90a747601eba330e7813e`, SHA-256 `378d3e24a853d441ebd06249282f77d060f8d01f0cc27e01209487d0f68737a1`, com 3.688.221 bytes. O runtime existente bloqueou toda saída de rede. Oito perfis sintéticos cobriram owner/review e as quatro combinações independentes das flags Listing Factory/AI Sales; um perfil público adicional cobriu a entrada sem sessão e credenciais inválidas. As 272 respostas de rota, redirecionamentos e composições estão em [baseline-active-inventory.json](baseline-active-inventory.json). Não houve tentativa de rede, IDs duplicados nas composições nem leitura de sessão real. JavaScript do cliente ainda não foi exercitado por esse inventário.

## Gates do projeto

Usar Node 24 e npm 11.9.0. A suíte Node inclui o build pelo `pretest`; os comandos de deploy/captura não fazem parte desses gates locais.

```sh
npm ci
npm test
python3 -m unittest web/bridge/test_hermes_bridge.py tools/test_install_hermes_web_bridge.py tools/test_build_hermes_web_bridge_install.py tools/test_activate_hermes_web_bridge.py tools/test_build_hermes_web_bridge_activation.py -q
npm run build
```

Cada execução deve registrar comando, diretório, base/candidato, horário, resultado e arquivo de saída. Ausência de ferramenta ou falha de infraestrutura aparece separada de regressão do código. Após corrigir um erro, repetir o gate afetado; não repetir suítes aprovadas sem alteração relevante. Nenhum teste existente é desativado para obter aprovação.

## Cobertura funcional e de contrato

| Risco | Verificação e fontes existentes |
| --- | --- |
| Navegação, sessão e inicialização | `workspace-navigation*.test.mjs`, `unified-auth.test.mjs`, `unified-app.test.mjs`, `admin-startup*.test.mjs`, `admin-bootstrap*.test.mjs`: rotas/aliases, owner/review, histórico, âncoras, busca e falhas de módulos sem derrubar login. |
| Financeiro e recortes | `business-daily*.test.mjs`, `business-month-*.test.mjs`, `monthly-profit-presentation*.test.mjs`, `business-reconciliation*.test.mjs`: centavos, bases e revisões; lacunas/zero, perdas, viradas de Brasília, subtotal versus total e nenhuma dupla dedução. |
| Pedidos | `order-operations*.test.mjs`: até 31 datas, 50 por página, totais do período, revisão de itens, CAS e repetição da mesma tentativa após resposta incerta. |
| Banco | `bank-reconciliation-ui.test.mjs`, `external-cash*.test.mjs`, `cash-statement-import.test.mjs`: formatos permitidos, prévia completa/hash, importação idempotente, vínculos/desvínculos e auditoria, recortes bancários independentes. |
| Despesas, DAS e custos | `expense-ledger*.test.mjs`, `business-tax-policy*.test.mjs`, `production-costs.test.mjs`, `cost-rules*.test.mjs`: confirmação explícita, parcelas, revisões, rascunhos, precedências e preservação de receitas/customizações. |
| Produtos | `product-registry.test.mjs`, `catalog-classification*.test.mjs`, `variant-*.test.mjs`, `mls-product-workbench*.test.mjs`, `mls-product-contribution*.test.mjs`: identidade estável, kits e contribuição exclusiva sem rateio fictício. |
| Fabricação | `incurred-production*.test.mjs`, `production-confirmation-proposal*.test.mjs`, `production-coverage*.test.mjs`, `production-weekly*.test.mjs`: fabricação física separada de venda, custo histórico, anulação/sucessor, oito intervalos e sexta às 13h. |
| DTF | `dtf-layout.test.mjs`, `dtf-ui.test.mjs`, `production-dtf*.test.mjs`: bytes locais, layout determinístico, reserva atômica, estado do lote, revalidação antes de cada download e nenhuma fabricação inferida. |
| Devoluções e vínculos | `physical-returns*.test.mjs`, `returns-receipt*.test.mjs`, `returns-original-items*.test.mjs`, `return-manufacturing-links*.test.mjs`: quantidade física explícita, inspeção, capacidade global, proteção por triggers, desvínculo e trilha preservada. |
| Ads, Hermes e memória | `ads-*.test.mjs`, `hermes-*.test.mjs`, `mls-agent-learning*.test.mjs`, `automation-workspace.test.mjs`: fontes e períodos próprios, ROAS por razão dos totais, observador, orçamento separado da assinatura e leituras sem execução paga. |
| Ferramentas condicionais | `mls-listing-factory*.test.mjs`, `mls-ai-sales*.test.mjs`: flags independentes, JSON sem mídia/aprovação fictícia, conflito e nenhum envio/publicação comercial automático. |
| Build e assets | `browser-assets.test.mjs`, `bundled-client.test.mjs` e testes `*-compiled.test.mjs`: seis assets (cinco históricos mais workspace), SHA/SRI, ordem dos clientes, funções congeladas, normal/minificado e teto existente. |

Os nomes nesta tabela são pontos de partida da base. Cada linha da matriz final deve apontar aos testes concretos e ao resultado da execução relevante; a tabela não substitui essa evidência.

## Extensões e gráficos

As 22 famílias constam no catálogo da matriz. Acrescentar testes focados ao percurso completo de Pedidos/COUNT, ao calendário do dashboard Ads, à seleção por identidade no ranking, ao ABC por receita condicionado, à composição assinada e às barras de etapas do período completo. Verificar modelo, adaptador, renderer, eixo, tooltip, tabela, agregado e seleção. Preservar os três hosts de tendência independentes e as unidades BRL_CENTS/RATIO_MICROS.

Testar completa, parcial, null, zero conhecido, valor negativo quando permitido, zero/uma/duas observações e comparação inválida. Não criar um produto cartesiano de todos os estados em cada viewport: a validação de contrato cobre a aritmética; o navegador cobre a interação e apresentação nas combinações relevantes.

Os sete slots sem fonte (`finance-payouts`, `finance-reconciliation`, `ads-distribution`, `products-margin`, `products-ranking`, `production-hourly`, `returns-reasons`) devem continuar indisponíveis com motivo e caminho útil. O gráfico de solicitações recebidas usa estados comerciais identificados; o anel do Registry mede seis especialistas, incluindo Auditor e excluindo Hermes, e não a integridade da empresa.

O semanal exige oito intervalos físicos, sete dias civis e categorias de caixa por origem. Incluir semana aberta/histórica/cruzando mês, corte 13h, original/revisão, cobertura revogada/desatualizada, mês ausente, um bloco com erro, mais de cem movimentos, vínculos entre semanas e respostas fora de ordem. WKR-08 exige confirmação no navegador do dia e mês transportados, do corte escolhido em Produção e do retorno ao relatório.

## Contas, empresas e migração

Testar APIs diretamente com os cinco papéis, duas empresas, lojas e identidades coincidentes em namespaces distintos. Cadastro/verificação, reset, troca de e-mail, MFA, recovery codes, sessões, convites, revogação de membership e propriedade precisam de relógio e persistência reais na cópia local. Testar TTL/fronteiras, replay, concorrência, fixação de sessão, CSRF, reauth, enumeração e limites compartilhados entre instâncias. A troca de contexto deve invalidar requests, timers, cache, IndexedDB e URLs blob sem destruir a biblioteca legada.

O gate focado dos clientes de contexto e mídia foi executado com 67 aprovações, sem skips:

```sh
node --test --test-reporter=tap web/cloudflare/tests/commercial-workspace-client.test.mjs web/cloudflare/tests/dtf-ui.test.mjs web/cloudflare/tests/returns-local-artwork.test.mjs web/cloudflare/tests/commercial-workspace-idb-chrome.test.mjs
```

O [registro desse gate](browser-context-validation.json) inclui hashes das fontes/testes e [seu alcance](BROWSER_CONTEXT_EVIDENCE.md). Ele usa Chromium/IndexedDB nativos para as fontes normal e minificada com duas identidades/empresas/lojas sintéticas. O backend loopback desse teste confirma apenas os contratos do navegador. O App gerado e a cadeia de autorização dos Workers têm seus próprios gates.

Ensaiar migração aditiva e repetição, interrupção/retomada quando aplicável, restauração e rollback compatível com novas escritas. Comparar contagens, relações, hashes/revisões e saldos; o primeiro cadastro jamais recebe a loja legada. O [inventário de armazenamento](TENANT_STORAGE_INVENTORY.json) é mantido pelo responsável pelo isolamento. Falta de implementação local de autorização ou isolamento é pendência de código, não dependência externa.

## Navegador e Live

Percorrer as áreas montadas e os formulários reais nos builds normal/minificado. Cobrir 320, 390, 1365 e 1440 px, claro/escuro, teclado, zoom, foco, toque e reduced-motion. Capturar acesso, onboarding, conta/equipe, Visão geral, semanal, financeiro/importação, pedidos, produtos/custos, produção/DTF, devoluções, Ads, Hermes e falhas. Registrar perfis e flags realmente executados. Uma captura estática não comprova salvamento, conflito ou persistência.

A V4.1 autoriza commit/push/PR/merge pelo fluxo permitido e publicação após os gates. O responsável pela release deve fornecer commit/PR/CI, versão anterior, backup verificável, ordem App/Auth/Finance/schema/assets, recibo, horários e hashes/versão efetivamente servidos. Verificações Live de leitura usam apenas sessão autorizada; gravações de QA, convites, mensagens, cobranças e ações comerciais reais continuam fora dos testes. Ausência de sessão restringe a evidência ao acesso público observado. Publicação do redesign e prontidão comercial permanecem decisões com evidências distintas.

## Resultado completo do candidato inicial S1/S2

O gate local completo inicial (antes da correção CSS posterior) aprovou **4.106/4.106 testes Node** (sem skips) e **67/67 Python**. O [registro final](final-local-validation.json) fixa os hashes dos três Workers, das fontes de teste e dos logs. A matriz agora relaciona cada requisito aos arquivos de teste efetivamente incluídos nesse gate; aprovação local é limitada ao cenário mapeado, sem presumir uso real, configuração externa ou publicação. O [gate de navegação](evidence/canonical-navigation-final-20.log) aprovou20/20 após corrigir o alias antigo para o painel correto, preservando contexto e rascunhos. A baseline local normalizada (`378d…`) é distinta da fonte raw publicada e exportada para backup (`e812…`); esses hashes não são intercambiáveis.

E-mail transacional, cobrança, conexão por cliente e política comercial/retencional continuam individualizados em [EXTERNAL_DEPENDENCIES.json](EXTERNAL_DEPENDENCIES.json). Sem sessão real autorizada, QA autenticado Live não foi executado. CI, migrações e publicação seguem pendentes deste recibo local.

## Candidato corrigido após a primeira CI

A CI 43453964784 falhou em dois perfis de status mobile (4.104/4.106 Node). O CSS corrigido em `bdbc857ac443f58376613225dcbbfd02a108d41c` tem gate focado **4/4 aprovado**, com tamanhos mobile/tablet e três fontes adicionais; o resultado local completo anterior não é reatribuído a essa fonte nova. A nova CI completa continua pendente. O [registro atual](ci-validation.json) inclui o log da falha, o fechamento focado e o vetor do candidato, sem declarar publicação.
