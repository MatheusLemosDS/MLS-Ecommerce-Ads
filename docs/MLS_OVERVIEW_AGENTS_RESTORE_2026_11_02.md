# Agentes de volta à página inicial — 02/11/2026

**Estado: `PREPARED_NOT_PUBLISHED`.** Versão proposta
**2026-11-02.4 — Agentes de volta à página inicial**.
Branch `fix/restore-overview-agents-20261102`, base oficial
`41b95f6e93236fdfad42ff9b3deb9a85905d67ef` (merge da PR104).
Este registro descreve o candidato; publicação, CI e integração da correção
ainda precisam de seus recibos próprios.

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

## Acessos e compatibilidade

| Local | Caminho | Comportamento preparado |
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

Somente o App é candidato à publicação nesta correção. Auth e Finance devem
preservar versões, bytes e configuração. A publicação do App exige CI do
head exato e conferência dos três Workers antes/depois, incluindo domínios,
flags, bindings e cron. O identificador humano `.4` não comprova publicação.

Na observação da PR104, três descritores de fotos capturados naturalmente
passaram pelo leitor/projetor canônico com metadados atuais. O proxy do
executor bloqueou a consulta ao CDN, portanto a imagem real não foi exibida
nessa verificação. Foto atual do catálogo e PNG de estampa verificado neste
dispositivo continuam distintos. Fabricação histórica continua desconhecida
sem lançamentos reais; ausência de registros não significa gasto zero.

## Validação e próximos passos

- **Pendente:** testes focados, Chromium normal/minificado em 320/1365,
  conferência visual dos seis cartões e regressão de navegação/histórico.
- **Pendente:** suíte completa, CI exata e recibo App-only com vetor completo.
- **Pendente:** conferência do proprietário na Visão geral da Live.

Após a publicação, registrar versão App, hashes, fonte/head/CI e horários a
partir do recibo efetivo; só declarar integração Git após verificar a PR.
Preservar a referência aprovada: reorganizar menus não autoriza retirar os
seis cartões da Visão geral. [Manifesto visual](visual-references/mls-2026-10-29/manifest.json).
O [registro da PR104](MLS_SIMPLIFIED_OPERATIONS_2026_11_02.md) preserva os
detalhes da fila de devoluções e da fabricação por datas.
