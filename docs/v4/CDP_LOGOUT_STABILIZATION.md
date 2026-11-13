# Navegação de logout na QA Chromium

A suíte completa da base a5 terminou com 3.904/3.905 testes Node aprovados. O caso de Pedidos minificado a 320 px falhou com `Inspected target navigated or closed`; os 67 testes Python passaram. [baseline-validation.json](baseline-validation.json) preserva esse resultado, sem atribuí-lo ao redesign.

O teste de logout consultava `location.pathname` por `Runtime.evaluate` enquanto o documento anterior era destruído. Essa consulta pode receber o reset de contexto esperado da navegação; o transporte anterior não incluía o método que falhou. A correção fica na infraestrutura de teste, sem alterar fórmulas, fatos, endpoints, permissões ou tratamento de erro da aplicação.

`returns-receipts-chrome-helpers.mjs` passa a guardar o método no mapa de comandos pendentes e acrescentá-lo ao erro do protocolo, sem registrar a expressão nem parâmetros. A API existente `send/on/evaluate/close` permanece compatível; `on` oferece remoção opcional do listener. Encerramento de socket rejeita comandos pendentes com seu método.

O novo `receiptWaitForLogoutNavigation` registra os observadores antes de executar a ação. Exige frame principal no mesmo origin e URL `/login` exata, loader novo, novo contexto default do frame principal e evento de load. Somente os erros conhecidos de reset de contexto do `Runtime.evaluate` da ação podem acompanhar uma navegação comprovada. Não há retry genérico nem aumento de timeout.

Crash, detach, fechamento do alvo, navegação inesperada, contexto de outro frame/world, contexto/load ausentes, erro JavaScript e outro erro do protocolo continuam falhando. Mesmo uma falha recebida após os três eventos, enquanto a ação ainda está pendente, reprova o caso. Listeners e timer são removidos ao terminar.

Na fase de logout de `mls_order_operations_visual.mjs`, o teste continua exigindo o POST real `/admin/logout` com 204 e libera a mesma resposta atrasada de pedidos. As assertivas sobre limpeza/ausência de erros permanecem. A única espera substituída é o polling de JavaScript através da navegação.

Evidência observada:

- `node --test --test-reporter=tap web/cloudflare/tests/receipt-logout-navigation.test.mjs`: 9/9 aprovados, incluindo os casos negativos, em [receipt-logout-navigation.log](evidence/receipt-logout-navigation.log).
- As mesmas chamadas da suíte de Pedidos, executadas com o helper novo e o App/assets imutáveis da base a5, SHA `378d3e24a853d441ebd06249282f77d060f8d01f0cc27e01209487d0f68737a1`: 7/7 aprovados, sem skips/retries, em [receipt-cdp-baseline.log](evidence/receipt-cdp-baseline.log). Cobriu normal/minificado × 320/1365 nos dois temas e falhas dos assets bank/orders/month. A execução durou 140,8 segundos.

A evidência acima valida o conserto sobre a base em que a falha foi observada. A suíte `web/cloudflare/tests/order-operations-chrome.test.mjs` deve também passar com o build final do candidato; nenhum resultado da base é apresentado como publicação ou conferência Live.

A suíte real do candidato também passou: `node --test --test-reporter=tap web/cloudflare/tests/order-operations-chrome.test.mjs`, 7/7, zero skips/falhas, 119,9 segundos, no App compilado `d9187e2fc48ba450c208c8182b5746874e15fc58db4dc0319bcf393cf7d89b7f`. Resultado em [order-operations-candidate.log](evidence/order-operations-candidate.log). Uma mudança posterior do App exige o gate final correspondente.
