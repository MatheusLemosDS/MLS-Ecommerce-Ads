# Agentes de volta à página inicial — 02/11/2026

**Estado: `PUBLISHED_VERIFIED`.** Versão **2026-11-02.4 — Agentes de volta à página inicial**.
App publicado e conferido em **02/11/2026 às 19:50:54 Brasília**; Auth e Finance preservados.
PR [#105](https://github.com/MatheusLemosDS/MLS-Ecommerce-Ads/pull/105), branch `fix/restore-overview-agents-20261102`, base
`41b95f6e93236fdfad42ff9b3deb9a85905d67ef`. Fonte `4d1a968f4482e8dc3deb3b2a97847a91479eacf7`, head aprovado `7a8b548830fd68a0216cb7c1b4b6fb3f554c78de`, CI
[41539423858](https://github.com/MatheusLemosDS/MLS-Ecommerce-Ads/actions/runs/41539423858) aprovada: 3346 Node e 67 Python.
A publicação técnica não comprova integração Git: consultar o estado atual da
PR vinculada. O registro abaixo identifica o corte efetivamente publicado.

## Correção pedida pelo proprietário

O proprietário informou que os agentes desapareceram da página inicial e
confirmou que eles devem permanecer ali, conforme o design original aprovado.
A simplificação da PR104 transferiu os cartões para a página Equipe. Esta
correção restaura a equipe visível na **Visão geral**, sem desfazer os acessos
principais de Produção, Devoluções e Financeiro.

A ordem abaixo dos indicadores e antes dos gráficos é:

1. MLS Hermes — supervisor.
2. MLS Finance — financeiro.
3. MLS Ads — anúncios.
4. MLS Products — produtos.
5. MLS Production — produção.
6. MLS Returns — devoluções.

Os cartões mantêm avatares, cores por agente, estado de acompanhamento,
mensagem e acesso ao painel correspondente. O primeiro HTML já contém os seis
acessos com estado desconhecido, inclusive antes da leitura do JavaScript.
A atualização usa o **Agent Registry existente**, com suas fontes salvas;
nenhum estado saudável, indicador ou lucro é criado para preencher o visual.

O cabeçalho permite quebra de linha quando título e link de modo não cabem
juntos. A regressão cobre fontes ampliadas, largura de 320 px e contenção dos
dois elementos, além dos cartões e da navegação.

## Acessos e compatibilidade

| Local | Caminho | Comportamento publicado |
| --- | --- | --- |
| Agentes da página inicial | `/admin?tab=overview#commandAgents` | Seis cartões no desenho aprovado, abaixo dos indicadores. |
| Equipe completa | `/admin?tab=agents#missionHubDirectory` | Sete agentes, incluindo Auditor, com busca e filtros existentes. |
| Novidades da versão | `/admin?tab=roadmap#appReleaseNotes` | Explicação da restauração e acesso à Visão geral. |

Os IDs do diretório completo são separados dos IDs dos cartões iniciais.
Atualizar a Visão geral não substitui a busca ou os filtros da página Equipe.
Os cartões continuam abrindo painéis reais e devem preservar mês escolhido,
Voltar/Avançar e navegação mobile. Layout responsivo, temas claro/escuro e
movimento reduzido seguem o estilo aprovado.

Esta é uma correção de apresentação. Os valores financeiros, fontes, regras
de custo, recebimentos, fabricação, vínculos, paginação Pending e permissões
comerciais mantêm seus contratos. Hermes permanece Observador; M2/M2.2,
valoração de peças reaproveitáveis e confronto Seller Centre/banco continuam
abertos. Nenhum recebimento ou lançamento de fabricação deve ser criado para QA.

## Base Live comprovada

A PR104 foi integrada em main no commit
`41b95f6e93236fdfad42ff9b3deb9a85905d67ef`, em **02/11/2026 às
19:15:31 Brasília**. CI de código `41532391229` e CI documental
`41534506552` aprovadas; 3346 Node e 67 Python no incremento anterior.
O estado da base foi conferido novamente em **19:26:55 Brasília**:

| Worker | UUID da base Live |
| --- | --- |
| App | `4a556c39-bd1b-4962-84a6-b25bf5504e95` |
| Auth | `d6f4397f-ac4d-45cf-93da-175df8305a6d` |
| Finance | `7001376b-f065-4e37-84ea-ee9ac2ea890c` |

Somente o App foi publicado nesta correção. Auth e Finance preservaram
versões, bytes e configuração. A CI do head exato e o vetor dos três Workers
foram conferidos antes/depois, incluindo domínios, flags, bindings e cron.
O recibo de publicação, além do identificador humano `.4`, comprova este corte.

Na observação da PR104, três descritores de fotos capturados naturalmente
passaram pelo leitor/projetor canônico com metadados atuais. O proxy do
executor bloqueou a consulta ao CDN, portanto a imagem real não foi exibida
nessa verificação. Foto atual do catálogo e PNG de estampa verificado neste
dispositivo continuam distintos. Fabricação histórica continua desconhecida
sem lançamentos reais; ausência de registros não significa gasto zero.

## Validação e próximos passos

- **Aprovado:** 3346 Node e 67 Python; CI exata [41539423858](https://github.com/MatheusLemosDS/MLS-Ecommerce-Ads/actions/runs/41539423858).
- **Aprovado:** Chromium normal/minificado em 320/1365, seis cartões visíveis,
  navegação/histórico e contratos financeiros/controles anteriores preservados;
  QA com fontes sintéticas, sem novas chamadas ao provedor ou fatos reais.
- **Conferido:** App-only, vetor completo dos Workers e configuração preservada.
- **A conferir pelo proprietário:** posição/uso dos cartões na Visão geral da Live.

## Recibo técnico

| Worker | UUID deste corte | SHA-256 gerado | SHA-256 publicado |
| --- | --- | --- | --- |
| App | `16ee9374-f16a-45b3-99a9-92669d296c9b` | `fbcc26be21e9f2806c985c2bf678538bbd962ca8a346c963b4bff99ac73951e1` | `b2ddd3cb05fccdc1b5196f763a5de1cc624064bfa051230c57d00f4a54d1614e` |
| Auth — preservado | `d6f4397f-ac4d-45cf-93da-175df8305a6d` | `851e27c703fda4143b87a8a85a79c06326b9a2f25ce16f5625d8871a589f43ec` | `5e18583606c453bd4e5ecfbc983db13826e4ad7f1c336fde5b7bbe9d628b2bd6` |
| Finance — preservado | `7001376b-f065-4e37-84ea-ee9ac2ea890c` | `d7e64105b88602fa20f8e733f5e16548cfa3ceefbbd7733a87dfb5e5bd8fcd49` | `ea8a5abf0c818539ee02e0e14260b973d0d2ed243f2c0eb26162ae3bbb3fcb59` |

O publisher executou zero consultas D1, zero chamadas a endpoints owner/provedor
e nenhuma gravação de fatos físicos/financeiros. O estado atual da integração
Git é consultado na PR vinculada; recebimento bancário e aceite operacional
continuam separados da publicação técnica.

Preservar a referência aprovada: reorganizar menus não autoriza retirar os seis
cartões da Visão geral. [Manifesto visual](visual-references/mls-2026-10-29/manifest.json).
O [registro da PR104](MLS_SIMPLIFIED_OPERATIONS_2026_11_02.md) preserva os detalhes
da fila de devoluções e da fabricação por datas.
