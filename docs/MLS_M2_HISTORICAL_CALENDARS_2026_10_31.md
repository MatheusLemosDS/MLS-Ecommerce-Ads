# M2 — coleta automática dos calendários históricos de liberações

Base main PR90 `8cdad2a4179cf96c1c2c586f89e2ad0c37665e3e`. Continuação autorizada na Live, preservando Auth/Finance, configuração, histórico e gates comerciais.

## Problema

O acompanhamento passou a identificar fontes e calendários ausentes, e a recuperação das referências de setembro iniciou naturalmente às 13:25:51 de Brasília na PR90. A oportunidade RELEASES ainda consultava apenas o mês corrente. Assim, o calendário anterior podia continuar ausente sem uma rotina que o preenchesse.

O corte real às 14:55 de Brasília confirmou a publicação de setembro revisão15, recuperação concluída às 14:13, duas fontes disponíveis, 24 pedidos pagos e calendário de setembro ausente. O acompanhamento estava vinculado à publicação correta, com um de dois calendários completos.

## Incremento em validação

Selecionar o mês imediatamente anterior dentro da oportunidade RELEASES existente, com alternância limitada entre atual e histórico. Reutilizar o serviço Finance e a paginação, leases e backoff existentes; manter no máximo uma leitura privada por oportunidade HISTORY.

A primeira auditoria oferece uma oportunidade RELEASES limitada após COVERAGE, preservando o próximo trabalho do cursor legado. O marcador inicial é consumido uma vez. Retentativas locais e falhas antes ou depois da leitura liberam a oportunidade do outro mês, sem exceder o orçamento.

Exigir um sinal CALENDAR_MISSING ou CALENDAR_PARTIAL projetado, recente, coerente com a publicação atual, fontes e through_month. Fontes MISSING são ausência explícita, sem impedir a coleta independente do calendário. Um calendário completo salvo deve impedir uma coleta histórica repetida, mesmo enquanto a cobertura em cache ainda indica ausência.

Manter cursor legado e payload bruto; persistir a alternância em tabela aditiva. Cercar a leitura e a gravação por enabled, leases, relógio/mês e publicação, incluindo respostas tardias. GET e abertura da UI não iniciam backfill.

## Limites

Completar calendário e recuperar identidades por pedido são evidências separadas. O corte não confirma recebimento bancário, encerramento do ciclo de liberações, saldo a receber ou lucro realizado. M2, Returns/Pending/Seller Centre e banco permanecem abertos. Escritas comerciais, Ads/PROMO, OAuth e novas análises pagas mantêm seus controles.

## Validação e publicação

Em andamento: registrar testes, CI exata, hashes, preservação de configuração, backup/rollback e progresso natural após a publicação. Nenhuma rotina deve ser forçada para produzir a prova.
