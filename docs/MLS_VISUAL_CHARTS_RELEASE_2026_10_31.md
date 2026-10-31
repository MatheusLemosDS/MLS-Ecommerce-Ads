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
A projeção sombra indicava356/356, produçãoR$10.486,10; confirmação remota
posterior será registrada abaixo. Devoluções e estados em revisão continuam
pendências legítimas.

## Validação e publicação

Em preparação. Registrar neste documento o resultado efetivo dos testes,
commit/CI, hashes dos três Workers, versão oficial, backup e pós-verificação.
Capturas técnicas usam dados sintéticos identificados; não são sessão privada
nem aprovação visual humana do proprietário.

Rollback anterior: App `2ffcefb4-3103-4cd0-880c-569a61a4df69`.
M2 continua aberta para devoluções, estados de pedidos e conciliação real;
publicar interface não encerra os gates bancários nem habilita escritas
comerciais. Ads/PROMO e publicações externas permanecem LOCKED.
