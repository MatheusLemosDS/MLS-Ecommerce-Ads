# Gráficos e aproximação visual — 31/10/2026

Incremento autorizado pelo pedido de continuar o roadmap e aproximar o layout
da prévia com gráficos e efeitos. Base oficial: PR86,
`8d66525bc3b96914412a9538d3ec84048ac78dbb`. Destino: App Live, preservando
Auth, Finance, rotas, bindings, cron, flags owner e os dados financeiros.

## Comportamento

- Cabeçalho mobile com controles de 44px e sem busca sobrepondo a marca,
  nos temas claro e escuro.
- Gráficos SVG com escala de valores, luz discreta, inspeção visível por
  ponteiro, toque e teclado e datas/valores em português. A navegação usa
  somente observações existentes; lacunas não viram zeros ou curvas inferidas.
- Estados parcial, subtotal com custos conhecidos e prejuízo continuam
  explícitos. Os controles não criam consultas nem polling.
- Diagnóstico de custo usa a composição histórica já aprovada para distinguir
  uma regra fora do escopo de um modelo ainda desconhecido. Evita sugerir
  recolher catálogo quando a configuração de tamanho é a causa; não relaxa
  nenhum guard de preço, evidência ou composição.
- Globo vetorial com atmosfera e horizonte iluminados, sem imagem de fundo,
  bibliotecas externas ou animação contínua. Movimento reduzido é respeitado.

## Correção da configuração de custo

A única unidade pendente observada tinha evidência histórica infantil tamanho16
aprovada, mas a regra salva omitia16. O proprietário já havia confirmado
R$12,50 para2a16. A função normal `saveCostRules` acrescentou somente16,
com CAS6→7 e uma entrada de auditoria, preservando preço, condições, outras
regras e associações. A transação ordenada e seu rollback foram comprovados
em uma tabela técnica isolada, removida após o teste; a gravação não foi
feita por consultas independentes nem sobrescreveu uma revisão concorrente.
SELECTs posteriores confirmaram356/356, zero custo pendente e produção
R$10.486,10 sobre a mesma publicação financeira já salva. O handler de tela
recompõe essa publicação com a regra atual7, sem recolher toda a Shopee. O
checkpoint histórico permanecia6 na última leitura; ele não controla o custo
exibido. Não foi alegada atualização desse checkpoint nem login owner real. Devoluções e estados em revisão continuam
pendências legítimas.

## Validação e publicação

PR [#87](https://github.com/MatheusLemosDS/MLS-Ecommerce-Ads/pull/87), código
`7fcf975bd65a4c315ce9256ae95c11f42b2a26b5`,
[CI41159508485](https://github.com/MatheusLemosDS/MLS-Ecommerce-Ads/actions/runs/41159508485)
verde: **2.393 Node, zero falhas/skip e67Python**. Mesmos resultados localmente.
Chromium normal/minificado,1365×900 e390×844, claro/escuro:120 capturas de
painéis e8 de gráficos populados. Testes cobrem data/valor/base, teclado,
ponteiro real, toque, lacunas, zero, prejuízo, subtotal, descarte da seleção e
zero novas consultas. Cabeçalho passou também no probe320px. Arte vetorial
independente de assets externos/IDs, com movimento reduzido respeitado.

A primeira suíte encontrou duas expectativas de teste incompatíveis com a
nova inspeção/formatação. O teste de controle passou a mover o ponteiro para
fora do gráfico antes de verificar a limpeza; manter o mouse sobre o SVG novo
legitimamente inicia outra seleção. Percentuais agora usam vírgula. As
asserções foram preservadas e as suítes integrais repetidas sem falhas.

App oficial publicado31/10/2026 às02:24UTC (30/10,23:24Brasília), versão
`17bb4a0c-fc38-43e0-8452-b0adeb06b24e`,100% ativa. Download via API confirmou
o bundle Wrangler byte a byte. Configuração integral, flagsENABLED, bindings,
domínios, compatibilidade e cron foram preservados. Auth/Finance permanecem
nas mesmas versões. Pós-deploy: coletaRUNNING, zero falhas, last_errornull,
FinanceCONNECTED. Backup privado da versão anterior foi preservado.

| Worker | SHA-256 gerado |
| --- | --- |
| App | `22b4ad40c6e7e331965dad976715d89ac8ef5f2e5c3e9e098282209296590796` |
| Auth | `1fef431c8573e05563c7938d95be0976a160bc603340084aa747ee0b73e7ec64` |
| Finance | `bfc27e1022e0c5b3d335498389fd64b6978b8f7f04501d3bc6eff38202bf5feb` |

Bundle App publicado:
`c7e9429d77da50d475976f1f009dfc464bd86db9fadb979a9ece75cbdf8de829`.
Manifesto de pré-release limitado a24 paths literais da basePR86; não permite
alterações de Auth/Finance/config nem gastos/escritas comerciais.

Evidências técnicas ficam nas pastas privadas ignoradas
`attachments/live-visual-charts-qa-20261031`,
`attachments/live-audit-visual-baseline-20261030` e
`attachments/live-audit-cost-readonly-20261030`. Nenhum dado de comprador foi
incluído no repositório. Capturas são sintéticas identificadas, não sessão
privada real nem aprovação visual humana. Sondagem pública deste cliente tem
bloqueioCloudflare1010 já conhecido; não foi tentado bypass. A confirmação
remota usou API/D1. M2 permanece aberta.

Rollback anterior: App `2ffcefb4-3103-4cd0-880c-569a61a4df69`.
M2 continua aberta para devoluções, estados de pedidos e conciliação real;
publicar interface não encerra os gates bancários nem habilita escritas
comerciais. Ads/PROMO e publicações externas permanecem LOCKED.
