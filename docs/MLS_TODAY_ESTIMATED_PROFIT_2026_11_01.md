# Resultado estimado de hoje — despesas mensais ainda não declaradas

## Estado desta entrega

Documento de preparação do incremento somente no App, de 01/11/2026. A causa foi comprovada por leitura salva da conta; publicação, testes completos e conferência final deste incremento permanecem pendentes.

| Evidência da entrega | Estado |
| --- | --- |
| PR | PENDING |
| Commit do código | PENDING |
| CI e contagem de testes | PENDING |
| Versão publicada do App | PENDING |
| SHA-256 do App gerado | PENDING |
| SHA-256 dos bytes publicados | PENDING |
| Conferência pós-publicação | PENDING |

## Causa comprovada

A leitura agregada de 01/11/2026 às 17:30:07 UTC mostrou uma publicação de novembro com o dia01/11, nove pedidos pagos, valores de repasse disponíveis, produção identificada e anúncios disponíveis. A sincronização estava COMPLETE, sem erro, e a pendência restante era `EXTERNAL_EXPENSES_REQUIRED`.

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

## Correção preparada

O helper de apresentação recebe uma linha diária já validada e distingue a estimativa completa de um subtotal com custos mensais ainda ausentes. Para o recorte comprovado, a apresentação pode mostrar R$ 99,47 como saldo parcial antes das despesas, informar que o DAS conhecido já foi considerado e indicar a declaração das despesas de novembro como próxima ação. O campo financeiro `estimate_cents` continua nulo.

A interface deve mostrar o motivo concreto, a data e a base do valor, com um destino funcional para a seção de despesas do mês correto. Nenhuma linha de despesa é criada automaticamente e nenhum valor ausente é convertido em zero. Uma declaração explícita de zero só passa a ser uma referência conhecida depois de registrada pelo operador no fluxo existente.

O cartão de hoje e sua atualização por GET devem manter o mesmo escopo de data e mês em Brasília. A virada diária não pode deixar o cartão exibindo o dia anterior, misturar a seleção histórica com os valores de hoje ou aceitar uma resposta atrasada de outro escopo. Enquanto a leitura diária necessária estiver ausente, a apresentação continua indisponível com motivo explícito; não exibe um zero presumido.

O escopo é somente o App: helper de apresentação, seus usos na interface e a atualização/leitura das fontes já salvas. Finance, Auth, credenciais, bindings e contratos financeiros existentes devem ser preservados. O GET do painel permanece uma observação do cache; não inicia uma coleta de pedidos ou uma ação comercial.

## Validação a concluir

- Reproduzir o recorte comprovado: subtotal de 9947 centavos, despesas desconhecidas e estimativa completa nula.
- Separar ausência de declaração, declaração explícita de zero e despesa positiva, sem descontar novamente taxas já contidas no repasse.
- Manter indisponibilidade quando faltarem repasse, anúncios, custos de produção ou dados necessários para uma base válida; rejeitar inconsistência aritmética e campos inválidos.
- Conferir motivo, rótulo, próxima ação e escopo mensal na interface; testar a virada em Brasília e respostas GET atrasadas de outro dia ou mês.
- Validar o Worker gerado normal/minificado e a interface autenticada com dados sintéticos em desktop/mobile; executar a suíte exigida antes da publicação.
- Conferir bytes, versão e configuração da Live depois da publicação, preservando Auth/Finance, cron e flags.

## Limites financeiros e de homologação

M2 continua aberta. Seller Centre e banco permanecem NÃO COMPARADOS; um subtotal operacional ou uma estimativa provisória não comprova recebimento bancário nem lucro realizado.

O acesso HTTP público pelo executor permanece limitado pelo WAF Cloudflare 403. Testes sintéticos autenticados e conferências das fontes salvas não substituem uma sessão real do proprietário ou aceite visual da Live. Nenhum bypass faz parte deste incremento.
