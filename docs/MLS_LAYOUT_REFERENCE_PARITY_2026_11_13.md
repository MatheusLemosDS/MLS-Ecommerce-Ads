# Layout da referência — 13/11/2026

**Publicado e verificado no escopo técnico/público em 13/11/2026 às 16:17:09 Brasília.** Versão `2026-11-13.1` — “V4.1 · Layout da referência”, em https://app.brazacommerce.com.br/admin?tab=overview.

Fonte publicada: `7c3b5cc2913f03177d8c2a1288325b78194dd5ad`; fonte preparada: `7ae377f07735dd7954e1197263ccfca1b40ac0a4`; base: `0016c4b78d45c47066b259bbaf42578662e11e35`. [PR #120](https://github.com/MatheusLemosDS/MLS-Ecommerce-Ads/pull/120), [CI do candidato](https://github.com/MatheusLemosDS/MLS-Ecommerce-Ads/actions/runs/43486058949). A integração Git deve ser consultada na PR; o recibo de publicação é independente do merge.

## Mudanças e uso

| Área | Mudança e acesso |
| --- | --- |
| Visão geral | Menu, cabeçalho, cores, tipografia, órbita wireframe e proporções seguem o HTML. Indicadores diários e controles de período têm áreas próprias; os seis agentes aparecem antes dos gráficos, na ordem Hermes, Finance, Ads, Products, Production e Returns. Abrir `/admin?tab=overview`. Auditor continua no diretório completo. |
| Financeiro | O resultado mensal abre primeiro; gráficos de evolução e composição usam as fontes existentes. Importação bancária, repasses, despesas e conciliação continuam disponíveis. Dedução e saldo negativo conservam seus sinais; pendência continua identificada. Abrir `/admin?tab=agent-finance`. |
| Produção | Calendário, custos e fabricação registrada aparecem antes das explicações auxiliares. Diário, intervalo, semana, registro, cobertura e DTF mantêm seus controles e rascunhos. Abrir `/admin?tab=agent-production`. |
| Conta | Login e formulários usam a mesma identidade visual; perfil usa duas colunas no computador e uma no celular. Empresa, equipe e permissões existentes foram preservadas. Acesso por `/account/login`, `/account/profile` e `/companies`. O login legado `/login` mantém seu contrato e alternância de tema. |
| Gráficos e toque | Cinco métricas preservam valores e marcas; eixos cabem no SVG e datas não se sobrepõem nos perfis conferidos. Alvos observados têm largura e altura de pelo menos 44px. |

A referência exata é [MLS_COMMERCE_OS_LAYOUT.html](v4/input/MLS_COMMERCE_OS_LAYOUT.html), SHA-256 `135002e7193409451e78263ee5d45fdcfb53e1061804a3a39af84fdc5edcc5f3`. Seus valores simulados não viram dados da loja. A barra exclusiva do protótipo (53px desktop/101px mobile) foi descontada da comparação. Sidebar de 228px, topbar de 64px no desktop, hero de 98px, indicadores de 193px e agentes de 251px foram medidos nos cenários de referência; conteúdo real pode ampliar cartões para preservar a leitura.

## Validação

| Verificação | Resultado e alcance |
| --- | --- |
| Node local e CI exata | 4.115 testes aprovados em cada execução, sem falhas, ignorados ou cancelados. HEAD e os três hashes compilados iguais no início/fim do teste local; CI no mesmo candidato publicado. |
| Python local e CI | 67 aprovados em cada execução. |
| Aplicativo conectado | 48 páginas e 24 detalhes, nas larguras 320/390/1440/1920px e nos dois temas: 72 capturas vinculadas ao App corrigido. Bootstrap real do Worker com fixtures existentes de coleta/dia/fabricação, sem erro JavaScript ou overflow horizontal. |
| Séries e toque | 40 perfis das cinco métricas com eixos dentro do SVG e datas sem sobreposição; zero leituras adicionais na interação dos detalhes. 1.208 alvos observados com largura/altura mínimas de 44px; checkboxes usam seu rótulo realmente associado. |
| Conta pessoal | 24 capturas locais de login/perfil/empresa/equipe, em 320/390/1440px e ambos os temas, sem erro ou overflow. O probe próprio dessas capturas verifica alturas selecionadas com limiar de 43px, sem provar sozinho 44×44 em toda a conta. |
| Login legado corrigido | Oito perfis nativos do Worker compilado (normal/minificado × 320/1365px × claro/escuro) confirmam alvo de 44px, alternância de tema, campos e ação do formulário preservados. O TAP da execução isolada foi observado no terminal, mas não retido em arquivo; a prova de fonte inclui os hashes dos testes/capturas e as suítes completas. |
| Público no domínio | 15 rotas/API por GET, sete assets (seis atuais/um retido) com hash/tamanho/tipo corretos e 24 perfis públicos, sem overflow ou erro. Login devolveu `2026-11-13.1`; as rotas protegidas mantiveram seus guardas anônimos. |

Os testes autenticados e os fatos de banco são **sintéticos locais**. Não havia sessão Live autorizada do proprietário; o aceite público não confirma valores reais, recebimento bancário ou conciliação operacional. No cenário conectado, quatro POSTs de descoberta foram bloqueados antes do servidor e nenhuma mutação foi aplicada. O QA público não enviou mutações remotas.

A primeira tentativa da CI `43486058949` registrou 4.114 de 4.115 testes aprovados: o clique nativo no link histórico de versão, em 320px/minificado, falhou na conferência do alvo. Essa falha permanece no histórico, com seu hash de log. Três diagnósticos focados (original, CPU×4 e amostragem por frames) passaram nos mesmos bytes, sem reproduzir a obstrução; a causa exata não foi recuperada, e uma corrida de rolagem/âncora permanece hipótese. A suíte local completa passou no mesmo HEAD; a CI foi repetida integralmente e só seu resultado completo aprovado aceitou o candidato. Nenhum teste foi removido, desativado ou dispensado; execuções focadas não substituem esse gate completo.

O transporte público foi `VERIFIED_TLS_NODE_GET_CDP_RENDERING`, sem desativar verificação TLS. O navegador renderizou os bytes recebidos por GET TLS verificado; essa ponte não equivale a uma conexão HTTPS nativa do Chromium. O [registro de validação](v4/evidence/layout-reference-final-validation.json) vincula fonte, hashes, capturas e limites.

A reorganização do gráfico Finance também corrigiu um ciclo de redesenho: o observador recebia alterações do próprio gráfico e de SVGs desconectados. O filtro conserva alterações conectadas de fonte e lotes mistos; regressões e execução nativa conferem esse comportamento. Os valores e fórmulas permanecem os existentes.

## Publicação e histórico

A ativação inicial de Auth e App, fonte `68e18f015d6193eae4e96e87d8aaf97286a6251b`, foi conferida nos três Workers. A primeira conferência pública encontrou o botão de tema do login legado com 41,5px; foi registrada como **falha**, após 15 rotas, sete assets e apenas um perfil de navegador. Seu SHA-256 é `082a157780d10cef8503f2963cf94efe370d6ad07d6809d7d7d8a08529a08106`. Esse resultado não foi convertido em aprovação retroativa.

A correção mínima acrescentou o tamanho de toque ao seletor de tema e uma regressão nativa do login compilado. O candidato completo passou novamente nos testes locais e na CI. Somente App foi reenviado e ativado; Auth e Finance permaneceram nas versões já conferidas. A conferência pública final começou após a ativação corretiva e terminou em **13/11/2026 às 16:17:09 Brasília**.

Após o upload inativo, a conferência de embalagem interrompeu o registro por três bytes adicionais em um comentário gerado da linha 6: o caminho relativo passou de `../` para `../../` devido à posição do arquivo de configuração. A comparação independente confirmou todos os demais bytes iguais; um novo dry-run no contexto real reproduziu exatamente o arquivo enviado. A emenda imutável `ca0d1bea59d5912b4a6869d49a942c45e01a37be2c9614c589f398010fee609a` preservou o plano original e autorizou somente ativar o mesmo UUID existente, sem novo upload. Os bytes raw efetivamente servidos, abaixo, pertencem a essa cadeia de evidências; o App compilado permanece no hash `6d7d9dc2d713050e7b724bd31c64abb8901490dc8acae542221db080d7225296`.

| Worker | Ativo/latest a 100% | SHA-256 raw conferido |
| --- | --- | --- |
| App | `e8a2bb41-61e8-45e0-9614-3c6670e5f293` | `3b33472a7c508f58adfb1062dd3be6b55422be332ebac75667eba0257f9ad091` |
| Auth preservado após a correção | `9f0c57c9-5712-4b0a-b7af-f8571feebc33` | `c3db52c0d0621bfed5c619ad6384aa1541a92070ab58e8ac8880a18e82655919` |
| Finance preservado durante toda a entrega | `d3bf1196-e75b-491b-bc40-f523029db483` | `c81f2f28bf4ba16c3a65478e7ca4ab153fff54e00f5ed9c9d73a2698366a6913` |

Os [recibos da publicação](v4/layout-reference-live-publication.json) distinguem os dois estágios e confirmam versões/bytes/configurações/bindings/flags/cron/domínio. A atualização documental do inventário de assets usa os arquivos realmente conferidos; não exige novo deploy sem diferença de bytes.

Não há nova migração, schema, segredo, fórmula financeira, coletor/provedor, contrato legado de acesso ou fato comercial nesta entrega. Produção física, referência de vendas, lucro estimado e caixa permanecem separados. M2/M2.2 e as dependências comerciais previamente registradas continuam abertas; esta entrega não reabre a auditoria dos 233 requisitos por inferência. A recuperação preserva dados/chaves e usa versões/configurações/assets anteriores; execução real de recuperação exige recibo próprio.
