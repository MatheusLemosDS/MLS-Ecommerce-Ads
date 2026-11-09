# Conferência da fabricação por período — 06/11/2026

**Conferência da fabricação por período — `PUBLISHED_VERIFIED`:** versão `2026-11-06.2`. Em Produção, confira os oito intervalos da semana de sexta 13h a sexta 13h, em Brasília. Cada intervalo encerrado exige declarar que todos os lotes reais foram registrados ou confirmar explicitamente que não houve fabricação. Ausência de registro continua desconhecida; custo pendente e sexta sem distribuição confirmada impedem o total conferido. Alterar lotes/cortes do intervalo torna a declaração anterior desatualizada; a retirada explícita mantém auditoria. A conferência não cria lotes, não usa vendas/DTF como fabricação e não altera os relatórios semanais originais, lucro ou estoque. App publicado e vetor dos três Workers conferido em 2026-11-09T18:53:03-03:00. Fonte `7f7f8498472806e6a311aa5c44f28104466040d6`, head `bb8b0f57cd681ca2a6b11b2ea8087572216eb597`, CI [42333118493](https://github.com/MatheusLemosDS/MLS-Ecommerce-Ads/actions/runs/42333118493) aprovada: 3586 Node e 67 Python. O recibo registra a publicação; o estado atual da integração deve ser consultado na [PR #112](https://github.com/MatheusLemosDS/MLS-Ecommerce-Ads/pull/112). PR111 integrada em `673dc8f4d3c6c36eaa41fcf33ae264130fa9ba18`, com vetor Live da versão 2026-11-06.1 conferido separadamente. Primeiro corte natural de sexta observado em 06/11 às 13:00:51 Brasília, fonte NO_RECORDS naquele corte; isso não comprova gasto zero. M2/M2.2 e Seller Centre/banco permanecem abertos. [Uso, evidências e limites](#como-usar).

## Como usar

1. Abra **Produção → Fabricação e custos → Conferir fabricação do período** (`/admin?tab=agent-production#productionCoverageDetails`). Escolha a sexta-feira que encerra a semana desejada. A seção consulta somente dados salvos.
2. Escolha um dos oito intervalos: sexta anterior a partir das 13h, os seis dias completos seguintes ou sexta atual antes das 13h. O início está incluído e o fim excluído, no horário de Brasília. Horários ainda futuros ficam abertos e não podem ser confirmados.
3. Confira os lotes e seus custos históricos. Primeiro registre as peças realmente fabricadas em **Produção realizada**; nas sextas, confira também a distribuição antes/a partir das 13h no fechamento semanal. Quantidade vendida, impressão DTF ou status de pedido não comprova fabricação.
4. Se todos os lotes do intervalo já estiverem lançados, escolha essa declaração, informe o motivo/fonte e confirme explicitamente. Se não houve fabricação, escolha a declaração específica; ela só é aceita quando não há peças ativas registradas no intervalo. Ausência de lançamentos não seleciona essa opção automaticamente. Use **Salvar conferência**.
5. Repita a conferência dos intervalos encerrados. O total declarado conferido da semana exige os oito intervalos atuais, todos os custos conhecidos e os cortes de sexta resolvidos. Um total zero só fica confirmado se as declarações explícitas e as demais condições forem satisfeitas.
6. Se precisar corrigir uma declaração, use **Retirar conferência** com motivo. Depois de corrigir os lotes/cortes, faça nova conferência. Em um envio sem resposta, **Retomar a mesma confirmação** reutiliza a tentativa existente, sem criar outra por conta própria.

## Significado dos valores e estados

O painel separa valores dos lotes registrados e o total declarado conferido. Um subtotal conhecido não comprova que toda a produção da loja foi lançada. A confirmação é uma declaração sua sobre a completude dos registros; não é inspeção física automática, nota fiscal, pagamento bancário ou conciliação de lucro. Dados ausentes e custos desconhecidos continuam pendentes.

Cada linha pode estar aberta, aguardando distribuição de sexta, sem conferência, confirmada, desatualizada ou retirada. Uma semana aberta ou com qualquer intervalo/custo/corte pendente mantém o total conferido indisponível. Lotes novos, alterações, anulações ou mudanças relevantes na distribuição de sexta invalidam a confirmação correspondente. Alterações em outras datas não invalidam a conferência daquele intervalo. Nas sextas-feiras, a validação é conservadora: os lotes do dia inteiro e as quantidades das duas metades compõem a referência compartilhada. Uma mudança na outra metade da mesma sexta, inclusive um novo lote desse dia, pode desatualizar as duas metades e exigir nova conferência. A auditoria preserva as declarações anteriores.

A conferência usa os custos históricos dos lotes, não o preço de catálogo nem a referência atual dos pedidos. Não cria peças, não apaga fabricação por causa de cancelamento de venda e não aplica uma segunda dedução no financeiro. Ela é separada dos relatórios semanais originais e de suas revisões; não reescreve o que era conhecido no instante do corte.

## Contrato e armazenamento

GET owner `/api/admin/production/coverage?week_end=AAAA-MM-DD` aceita exatamente uma sexta de encerramento. A leitura fria usa somente SELECT e retorna o DTO adicional `production_coverage_workspace_v1`; não cria tabelas nem consulta a Shopee. O POST owner na mesma rota, sem query, exige origem, CSRF, motivo e confirmação explícita. Valida revisão e hashes da fonte, permite confirmação ou retirada e mantém repetição idempotente. As quatro tabelas internas da conferência são preparadas somente para um comando explícito válido; abrir a tela não as cria.

Os contratos existentes de fabricação, financeiro e fechamento semanal permanecem preservados. O novo GET é lazy: não consulta a conferência ao abrir a Visão geral. Mudança de semana, sessão ou resposta atrasada não pode salvar uma declaração em outro contexto; rascunhos e tentativas pendentes são preservados segundo os controles da tela. Nenhum provedor, cron ou escrita comercial foi adicionado.

## Base verificada e fechamento natural

A PR111 foi integrada em `673dc8f4d3c6c36eaa41fcf33ae264130fa9ba18`; a versão 2026-11-06.1 e os três Workers foram conferidos novamente pelo canal oficial da Cloudflare na preparação deste incremento. O primeiro corte natural de sexta já havia sido observado em 06/11 às 13:00:51 Brasília, para 30/10 13h até 06/11 13h, com fonte NO_RECORDS e custo real ainda desconhecido naquele momento. A evidência original foi preservada; nenhuma nova consulta D1 ou execução manual de cron foi feita para esta entrega. A observação do agendamento não confirma completude ou valores da fabricação.

## Estado da entrega e evidências

App publicado e conferido em 2026-11-09T18:53:03-03:00. Auth/Finance, fontes dos três Workers, configuração, domínios, subdomínios, flags e cron preservados. Fonte `7f7f8498472806e6a311aa5c44f28104466040d6`; head aprovado `bb8b0f57cd681ca2a6b11b2ea8087572216eb597`; CI [42333118493](https://github.com/MatheusLemosDS/MLS-Ecommerce-Ads/actions/runs/42333118493), 3586 Node e 67 Python, sem falhas/skips. Chromium sintético normal/minificado em 320/1365 aprovado e vinculado aos hashes. Não foram criadas declarações reais de cobertura nem lotes para QA. A publicação tem recibo próprio; consulte a PR para o estado atual da integração: https://github.com/MatheusLemosDS/MLS-Ecommerce-Ads/pull/112.

```json
{
  "versions": {
    "app": "09621a33-2fd1-48e1-8155-f022bc18f66e",
    "auth": "ec385ca9-a986-49ec-abab-25a29daaf33b",
    "finance": "9ed0bd7d-269a-4e5f-81d0-63be8c6ac2c4"
  },
  "generated_sha256": {
    "app": "26612b7ea0edbea55e06f5fc817a18defd6b4fe65381e6d564b7d360b7b80278",
    "auth": "47c83f87f191fd0e5ff503d9c4bcf4671cd986b0965e66e84f1a6ed952dac925",
    "finance": "08ada5ecec92350f4f8301fdb7baa00f5f8083a0e8390296b2870e0ff3cdc1a5"
  },
  "published_sha256": {
    "app": "e1c9a45e18a8493632c98e42b413662195e377b156472134314430c41e351b0f",
    "auth": "2a2c2433c6fba25d1c399991595c96e6b8a85045edb77879c8270c446cb45ad2",
    "finance": "e5bf80e14ff00e5b365bfbcfb25bf3a4dc1e42bf40bb0e4259909649eea1d5cd"
  }
}
```

## Limite do pacote e próximas extensões

O App gerado desta entrega tem 4.193.300 bytes, sob o limite de 4.194.304 bytes mantido pelos testes. As reduções removem cópias sem consumidores no servidor; o núcleo do AI Sales no navegador foi preservado. Novas extensões precisam rever a distribuição do código antes de crescer o pacote, mantendo os limites e os testes.

## Próximos passos e fases abertas

Conferir dados reais do período com o proprietário, registrar somente fabricação conhecida e declarar cobertura apenas quando todos os lotes foram lançados. Para semanas antigas, pedidos/vendas não fornecem sozinhos as datas e quantidades reais fabricadas ou os custos históricos. Cobertura e custos ainda desconhecidos continuam pendentes.

M2/M2.2, recebimento/reaproveitamento, ponte contábil e comparação no mesmo recorte com Seller Centre/banco continuam abertas. A declaração de fabricação não libera estoque externo, reserva, revenda, preço ou Ads/PROMO. Preservar [sugestões de identidade](MLS_PRODUCTION_CONFIRMATION_PROPOSAL_2026_11_06.md), [fechamento semanal](MLS_PRODUCTION_WEEKLY_CLOSE_2026_11_03.md) e [produção diária/Hermes](MLS_PRODUCTION_DAILY_HERMES_2026_11_03.md).
