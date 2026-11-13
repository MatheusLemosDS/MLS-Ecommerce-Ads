# Layout da referência — incremento de 13/11/2026

**Estado: implementação e validação em andamento.** A versão prevista é `2026-11-13.1`, “V4.1 · Layout da referência”. Este documento ainda não declara paridade aprovada, CI verde, publicação ou conferência da nova versão na Live.

A base é a main `0016c4b78d45c47066b259bbaf42578662e11e35`, que integrou a PR119. A V4.1 anterior, `2026-11-12.1`, já foi publicada com a fonte `7ec3ffa0ed27366eca0792d5d277979bb991f679`; seus [recibos](v4/live-publication.json) e [limites de verificação](v4/public-live-verification.json) permanecem históricos e não comprovam este novo layout. O trabalho atual está na branch `feature/layout-reference-parity-20261113`.

## Referência exata e critério visual

A referência é o HTML fornecido pelo proprietário, preservado em [MLS_COMMERCE_OS_LAYOUT.html](v4/input/MLS_COMMERCE_OS_LAYOUT.html), com SHA-256 **`135002e7193409451e78263ee5d45fdcfb53e1061804a3a39af84fdc5edcc5f3`**. Seus números, identidades e capacidades simuladas são demonstrações de design; os painéis do aplicativo continuam usando as fontes, permissões e estados reais existentes.

A auditoria local abriu o HTML original sem modificar a fonte e sem dependências externas. O conjunto `reference-full.json` contém 48 capturas de Visão geral, Finance, Ads, Products, Production, Returns, Auditor, Hermes, semanal, login, conta e empresa, em1440/390px e claro/escuro. `reference-overview-wide-narrow.json` acrescenta a inicial em1920/320px. A barra de ferramentas exclusiva do protótipo ocupa 53px no desktop e101px no mobile; ela deve ser descontada ao comparar posições.

Os parâmetros medidos incluem sidebar228px, topbar64px/60px mobile, workspace máximo1600px, padding27×28px/20×18px mobile, título30px e raio12px. A referência usa as superfícies `#030d1c`, `#071523` e `#0c2035`, texto `#edf6ff`, secundário `#9cb1ca` e linha `#1b3a55`, com tons próprios dos agentes e a órbita wireframe extraída do HTML. Esses números orientam a comparação; não substituem a conferência dos componentes reais e da responsividade.

## Mudanças deste incremento

| Área | Alteração em implementação | O que a validação precisa demonstrar |
| --- | --- | --- |
| Shell e inicial | Sidebar, topbar, superfícies, espaçamento, tipografia, hero, loja, órbita e faixa de dia/mês conforme o HTML. | Mesma hierarquia visual, seis agentes preservados na ordem existente, campos de período utilizáveis e ausência de sobreposição/overflow. |
| Painéis dos agentes | Estilos compartilhados de hero, abas, indicadores, gráficos e seções, mantendo os componentes efetivos. | Finance em quatro colunas e demais especialistas conforme a referência quando houver largura, com redução coerente no mobile. |
| Finance | Entrada pelo grupo de resultado, com período compacto e acesso mantido à importação e conciliação. | Resultado e gráficos precedem a área de importação; todos os IDs, filtros e ações continuam acessíveis. Composição assinada e valores desconhecidos permanecem corretos. |
| Produção | Introdução e organização da fabricação real, com diário, semana e ações existentes. | Hero e informações principais aparecem antes de blocos auxiliares; registro/conferência/DTF e seus rascunhos continuam operacionais. |
| Acesso e conta pessoal | Composição visual e mensagem estática de apresentação alinhadas à referência. | Login, recuperação, conta e empresa preservam os formulários, segurança e estados reais; nenhuma identidade de demonstração é usada como pessoa autenticada. |
| Navegação contextual | Ajustes necessários ao novo shell, hero e seletores. | Links, foco, teclado, retorno do navegador, mês/dia/corte e menus mantêm os contratos anteriores. |

O incremento é de apresentação e organização dos componentes. Não inclui mudança de schema, banco, fórmulas financeiras, coletores, provedores ou integração da loja. O App e a UI de conta no Auth podem gerar novos bytes; a fonte Finance permanece fora do diff pretendido e seu vetor deve ser conferido no build final. Não há nova migração ou fabricação/receita criada por esta tarefa.

## Comparação conectada e evidência atual

Capturas antigas que retornavam503 em todas as APIs foram produzidas para testar recuperação. Elas não representam o estado conectado habitual e não serão usadas para aprovar a composição normal.

A baseline conectada usa o Worker efetivo compilado e a inicialização real com D1 SQLite local. O teste fresh-D1 existente passou1/1, sem mensagem de falha de startup e com o controle de repetição oculto. A variante `baseline-connected-daily-complete` combina HTML real do owner, respostas GET de D1 local e a fixture existente de coleta/dia/fabricação, passando pelos mesmos projetores usados no aplicativo. O SHA compilado dessa baseline é `82fe3d3ecf19b0f72254dc5778e8a8335505bfc4db4071cc01afce4cfb7cea48`.

Todas essas capturas são **QA LOCAL SINTÉTICA**, sem cookies, sessões ou dados reais da loja. O navegador bloqueia pedidos não GET e URLs não locais. O catálogo vazio pode tentar descoberta automaticamente: a baseline registrou duas tentativas POST bloqueadas antes de chegar ao servidor e **zero mutações aplicadas**. Isso não deve ser descrito como zero requisições tentadas.

O primeiro candidato `c8524924e5f729f31dbdc44057151e1f2c9c93aa4a8476acf45006238e402314` teve 24 capturas conectadas sem falha de startup, exceção JavaScript ou overflow horizontal. **Ele não foi aprovado visualmente:** controles mensais empilhavam o cabeçalho, o bloco de período precedia o hero e Finance abria pela importação antes dos indicadores. Esses achados motivam a correção estrutural atual. Uma captura desse SHA não valida o build posterior.

Artefatos locais de trabalho: `/workspace/mls-layout-reference-qa/READONLY-VISUAL-AUDIT.md`, `reference-full.json`, `reference-overview-wide-narrow.json` e os diretórios de baseline/candidato com seus `results.json`. O relatório final deverá anexar o conjunto do build congelado, seus hashes e os resultados efetivamente observados; esses artefatos ainda não estão registrados como aprovação final.

## Validação e cobertura do escopo

Este incremento não reabre a auditoria comercial completa nem reclassifica os233 requisitos da V4.1. A cobertura visual se relaciona aos requisitos abaixo; as evidências anteriores continuam vinculadas às versões em que foram executadas.

| Requisitos da matriz V4.1 | Conferência neste incremento |
| --- | --- |
| UX-01…UX-10, A11Y-01/A11Y-02 | Comparação com o HTML exato, temas, fontes, espaçamento, formulários, estados, foco, teclado e320/390/1440/1920px. |
| NAV-01…NAV-04, AUTH-01…AUTH-04 | Rotas, menus, histórico, seleção contextual e inicialização/saída preservadas no novo shell. |
| OVR-01…OVR-06 | Indicadores, seis agentes antes dos gráficos, períodos, fontes e recuperação com os dados conectados locais. |
| FIN-01…FIN-04, BNK-01…BNK-07 | Reorganização da entrada Finance, grupo de resultado e acesso à importação/conciliador sem perda de controles. |
| PROD-01/02/03/07/09/11/12, DTF-01…DTF-11 | Hierarquia de fabricação real e preservação de datas, registros, cobertura, fechamento e acesso ao DTF. |
| GRA-01…GRA-14, WKR-01…WKR-09 | Gráficos e tabelas existentes com suas unidades/períodos, sem copiar números ou disponibilidade fictícia do protótipo. |
| ACCT-01, ACCT-05…ACCT-11, TEN-05 | Apresentação de acesso, conta e empresa mantendo identidade, contexto e isolamento já implementados. |
| REL-01/02, TEC-01…TEC-04, WAS-01 | Release visível, build normal/minificado, assets, diagnóstico e recuperação. |

Antes de declarar conclusão: congelar o build; recapturar as áreas afetadas em1440/390 claro/escuro e a inicial em1920/320; comparar as posições descontando a barra do protótipo; validar contagens/foco/ações e os controles avançados; executar os gates relevantes e a CI; conferir o vetor App/Auth/Finance. Capturas e contagens de testes não aprovam por si só a paridade.

## Publicação e limites

CI, commit candidato, PR, deploy e conferência desta release ainda não foram anexados. O destino continua o aplicativo existente; um eventual rollout usa o processo já adotado e exige a conferência dos bytes efetivamente servidos. A disponibilidade do release anterior não comprova a publicação do candidato atual.

A conferência Live autenticada depende de sessão autorizada disponível. Ausência de sessão limita o que poderá ser observado; não se cria sessão fictícia ou fatos reais para QA. Dependências de e-mail/cobrança/conectores e M2/M2.2 continuam como registradas anteriormente; este trabalho visual não concede novas capacidades nem confirma fechamento financeiro.
