# MLS Commerce OS — Execução M2 até M3 (28/10/2026)

Base auditada: main b058e832f8450ce787370c4087cf78db9cca9fca. Este documento complementa o roadmap e checkpoint canônicos.

## Estado

M0 e M1 publicados. PR #46 de busca integrada ao catálogo foi incorporada com CI verde. PR #45 permanece draft, sem CI aprovado, com quatro testes WORKER_SOURCE_UNRECOGNIZED. A M2 financeira não está concluída: a conta autenticada precisa de comparação real com o Seller Centre. Esta PR #47 entrega uma primeira parte da M3 em modo OBSERVER, não uma precificação comercial segura.

## Gates M2 que não podem ser simulados

| Tema | Evidência necessária | Bloqueio se pendente |
| --- | --- | --- |
| Finance | Fonte mensal COMPLETE, janelas, páginas, horários/corte e autorização válidos | Não converter ausência em zero |
| Coleta automática | Cron e avanço após erro de autorização conferidos na conta autenticada | Diagnóstico e reconexão só pelo operador |
| Pending atual | Overview, Detail, diferença, datas, contagem e has_more | PARTIAL_PAGE requer validação do cursor antes de paginar |
| Liberações | Valores, ajustes e pedidos correspondentes; ambiguidade resolvida | Não confundir repasse com depósito |
| Devoluções | Reembolso, status, referência e efeito no pedido | Não presumir crédito bancário |
| Competência | Coorte de criação separada de calendário de liberação e caixa | Lucro realizado desconhecido |
| Seller Centre | Montantes e contagens agregadas no mesmo corte temporal | M2 não recebe aceite |

Não compartilhar tokens, cookies, URLs de callback nem identificadores sensíveis. CI não comprova conexão Shopee, saldo bancário ou estado da conta. Critério de saída M2: diferenças materiais justificadas e registradas, sem identidade ambígua, valores não conferidos ou fonte incompatível.

## M3.0 — Fundação Observer (PR #47)

- [x] Leitura exclusiva do resumo de produtos mensal já validado, sem novas APIs nem consultas D1.
- [x] Curva ABC por **unidades vendidas**, jamais por estoque presumido.
- [x] Curva ABC por vendas de pedidos exclusivos só com cobertura financeira completa e sem pedidos mistos; nunca ratear arbitrariamente.
- [x] Contribuição apenas de pedidos exclusivos plenamente conferidos, como saldo parcial e não lucro líquido por SKU.
- [x] Simulação de preço por variação com custo conhecido e taxas/Ads/margem/custo adicional explicitamente informados; centavos exatos, arredondamento para cima.
- [x] Proibir publicação ou atualização de Ads/PROMO a partir de cenário.
- [x] Adicionar painel M3 ao mês e testes de contratos.
- [ ] Gate CI, hash exato, Chromium, QA autenticado desktop e mobile.

Preço ilustrativo = arredondamento para cima de (custo unitário + custo extra informado) / (1 − taxas estimadas − Ads estimado − margem desejada). Este cálculo não valida imposto, frete, campanhas, estoque, devoluções ou comissão oficial e NÃO é preço mínimo seguro para publicar.

## M3.1 — Contribuição, custos e evidências

- [ ] Encerrar M2 mediante evidência da conta e aprovação do operador.
- [ ] Contrato oficial versionado de taxas por Shopee/loja/categoria/cupom/campanha e período, evitando descontar taxas já embutidas no repasse.
- [ ] Custos e composição por variação, com tratamento histórico para itens removidos.
- [ ] Atribuição verificável de pedidos mistos antes de alocar custos ou receita.
- [ ] Consolidação ABC por contribuição e receita só para populações comparáveis.
- [ ] Falta de custo, fonte antiga, retorno incerto, overflow, identidade órfã: bloquear recomendação.

## M3.2 — Pricing Intelligence

- [ ] Políticas auditadas e fontes para taxa, imposto, preço real, desconto, frete e despesa.
- [ ] Cálculos de preço mínimo, alvo e promoção segura com margem observada e custos completos.
- [ ] Ponto de equilíbrio e ROAS mínimo apenas com receita atribuída ao mesmo contrato/período. TACOS de loja não substitui ROAS individual.
- [ ] Contrato de estoque vendável e reservas; sem estoque, não há sinal de escala.
- [ ] Recomendação por SKU com explicação, confiança, fonte, idade e auditoria, sem escrita em M3.

## M3.3 — Aceite e segurança

- [ ] Node/Python/Chromium, layout responsivo, acessibilidade, compatibilidade e integridade de todos os Workers.
- [ ] CI verde e hash de build App reconhecido (não aprovar hash sem inspecionar artefato).
- [ ] QA da conta autenticada e validação com Seller Centre.
- [ ] Rollback e trilha de mudanças sem renomear aliases técnicos.
- [ ] MLS Hermes segue OBSERVER; Ads/PROMO segue LOCKED até fase assistida posterior.

## Estratégia de publicação

Manter PRs isoladas, evitar deploy sem gates e comparar os valores reais antes de declarar M2 ou M3 concluídas. Não declarar lucro líquido por SKU, caixa realizado ou estoque a partir de estimativas. Preservar fontes e funcionalidades já publicadas.
