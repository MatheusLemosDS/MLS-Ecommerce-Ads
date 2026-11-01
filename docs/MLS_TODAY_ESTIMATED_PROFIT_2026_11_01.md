# Resultado estimado de hoje — despesas mensais ainda não declaradas

## Estado desta entrega

Correção publicada na versão oficial somente no App, em 01/11/2026. A causa foi comprovada por leitura salva da conta; testes e bytes/configuração dos três Workers foram conferidos. A declaração das despesas de novembro continua uma entrada financeira pendente do proprietário.

| Evidência da entrega | Estado |
| --- | --- |
| PR | [#95](https://github.com/MatheusLemosDS/MLS-Ecommerce-Ads/pull/95) |
| Commit do código | `5e0648d408deedac12f7a6f5d0978a98b4391d3f` |
| CI e contagem de testes | [41332958729](https://github.com/MatheusLemosDS/MLS-Ecommerce-Ads/actions/runs/41332958729); 3005 Node / 67 Python, sem falhas ou skips |
| Versão publicada do App | `47e3de73-13bc-4199-b742-8d4152f842b1` |
| SHA-256 do App gerado | `e58fb92ea20a0f0c1927386afb0349b663eb34b6514cce74a6a663f3089041eb` |
| SHA-256 dos bytes publicados | `167847fa0809d9ffe2572b717d6340f38eece098ce990f610170e202d3f3c25a` |
| Conferência pós-publicação | Três Workers exatos; Auth/Finance, configurações, domínios, flags e cron preservados |

## Causa comprovada

A leitura agregada de 01/11/2026 às 17:30:07 UTC mostrou uma publicação de novembro com o dia 01/11, nove pedidos pagos, valores de repasse disponíveis, produção identificada e anúncios disponíveis. A sincronização estava COMPLETE, sem erro, e a pendência restante era `EXTERNAL_EXPENSES_REQUIRED`.

Novembro ainda não tinha uma linha de despesas declaradas. A ausência dessa linha significa valor desconhecido; não autoriza considerar as despesas como zero nem reutilizar a declaração de outubro. A estimativa diária completa permanecia corretamente nula, mas sua apresentação precisava explicar o bloqueio e mostrar o subtotal conhecido com uma base explícita.

Essa causa não é ausência de vendas ou de repasse. Também não comprova falta de despesas: o sistema aguarda a declaração do mês correspondente.

## Valores do recorte observado

Os números abaixo pertencem somente à leitura salva de 01/11 às 17:30 UTC. Não representam valores atuais nem um fechamento bancário.

| Componente | Centavos | Valor |
| --- | ---: | ---: |
| Repasse previsto dos pedidos do dia | 41818 | R$ 418,18 |
| Produção identificada | 28740 | R$ 287,40 |
| Anúncios do dia | 2845 | R$ 28,45 |
| Saldo operacional antes do DAS e das despesas mensais | 10233 | R$ 102,33 |
| Parcela diária do DAS já conhecido | 286 | R$ 2,86 |
| Subtotal depois do DAS, antes das despesas desconhecidas | 9947 | R$ 99,47 |
| Despesas de novembro | Desconhecido | Não declaradas |
| Estimativa diária completa | `null` | Ainda não confirmável |

Conferência em centavos: `41818 − 28740 − 2845 = 10233`; `10233 − 286 = 9947`. O subtotal de 9947 centavos não pode ser apresentado como lucro líquido completo enquanto a parcela das despesas continuar desconhecida.

## Correção publicada

O helper de apresentação recebe uma linha diária já validada e distingue a estimativa completa de um subtotal com custos mensais ainda ausentes. Para o recorte comprovado, a apresentação mostra R$ 99,47 como saldo parcial antes das despesas, informar que o DAS conhecido já foi considerado e indicar a declaração das despesas de novembro como próxima ação. O campo financeiro `estimate_cents` continua nulo.

A interface mostra o motivo concreto, a data e a base do valor, com um destino funcional para a seção de despesas do mês correto. Nenhuma linha de despesa é criada automaticamente e nenhum valor ausente é convertido em zero. Uma declaração explícita de zero só passa a ser uma referência conhecida depois de registrada pelo operador no fluxo existente.

O cartão de hoje e sua atualização por GET devem manter o mesmo escopo de data e mês em Brasília. A proteção da virada diária impede deixar o cartão exibindo o dia anterior, misturar a seleção histórica com os valores de hoje ou aceitar uma resposta atrasada de outro escopo. Enquanto a leitura diária necessária estiver ausente, a apresentação continua indisponível com motivo explícito; não exibe um zero presumido.

O escopo é somente o App: helper de apresentação, seus usos na interface e a atualização/leitura das fontes já salvas. Finance, Auth, credenciais, bindings e contratos financeiros existentes devem ser preservados. O GET do painel permanece uma observação do cache; não inicia uma coleta de pedidos ou uma ação comercial.

## Validação concluída

- Recorte real reproduzido: subtotal de 9947 centavos, despesas desconhecidas e estimativa completa nula.
- Testes distinguem ausência, zero explícito e despesa positiva, com aritmética segura e sem dupla dedução.
- Repasse, anúncios ou produção insuficientes não fabricam lucro; inconsistências e overflow são rejeitados.
- Seleção Hoje em Brasília, datas históricas, rascunhos na virada e respostas GET atrasadas conferidos.
- Worker normal/minificado e Chromium autenticado em 320/1365 px passaram; CTA abre os dois detalhes e o formulário. Após confirmação explícita, GET salvo atualiza o lucro imediatamente, sem provedor.
- 3005 testes Node e 67 Python passaram localmente e na CI, sem falhas ou skips. Três Workers conferidos por bytes, versões e configuração após publicação.

## Limites financeiros e de homologação

M2 continua aberta. Seller Centre e banco permanecem NÃO COMPARADOS; um subtotal operacional ou uma estimativa provisória não comprova recebimento bancário nem lucro realizado.

O acesso HTTP público pelo executor permanece limitado pelo WAF Cloudflare 403. Testes sintéticos autenticados e conferências das fontes salvas não substituem uma sessão real do proprietário ou aceite visual da Live. Nenhum bypass faz parte deste incremento.

## Evidência de execução

A suíte completa local e a CI do head revisado passaram, incluindo os casos gerados normais/minificados de confirmação explícita, cancelados e não pagos, seleção relativa e rascunho na virada. Chromium conferiu toque/clique em 320 e 1365 px: os dois detalhes abrem e o formulário fica visível. Após o POST explícito, o GET salvo atualiza o resultado sem consultar provedores.

O replay autenticado local usou a leitura real preservada da conta: subtotal de R$ 99,47, lucro/margem nulos, despesas não declaradas e nenhuma escrita remota. Essa conferência é distinta dos exemplos sintéticos e de uma sessão visual do proprietário na Live. Os checks externos Workers Builds seguem com falha e causa não confirmada; o acesso aos logs retorna 403/12004. A publicação controlada por Wrangler foi conferida por bytes, versões e configuração dos três Workers.

No replay da leitura real, 42 GETs locais de outros painéis sem resposta capturada retornaram 503. Essa limitação pertence ao harness local e não indica falha da Live; a evidência cobre o cartão de hoje e a navegação até despesas, não uma homologação completa de todos os painéis. O histórico de acesso aos logs Cloudflare é 403/12004; a causa dos checks externos permanece não confirmada.
