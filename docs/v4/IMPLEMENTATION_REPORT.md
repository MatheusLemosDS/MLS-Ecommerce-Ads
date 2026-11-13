# V4.1 — implementação e publicação técnica

A versão `2026-11-12.1` está publicada em **https://app.brazacommerce.com.br**, com conferência em13/11/2026 às13:14:50Brasília. O commit servido é `7ec3ffa0ed27366eca0792d5d277979bb991f679`; a [CI43456719793](https://github.com/MatheusLemosDS/MLS-Ecommerce-Ads/actions/runs/43456719793) aprovou4.106Node e67Python. O [recibo da release](live-publication.json) separa versões/hash/configuração realmente observados de aceite operacional.

A primeira CI falhou em dois perfis de status mobile; a correção passou no gate focado e na CI completa atual. O gate local inicial permanece histórico. A conferência Live cobriu somente controle e acesso público, sem sessão real do proprietário; as dependências comerciais continuam listadas abaixo. Uso e recuperação estão em [RELEASE.md](RELEASE.md).

# V4.1 — implementação e validação do candidato

O candidato `2026-11-12.1` reúne o redesign e a base de contas comerciais no aplicativo existente. O gate local do candidato anterior S1/S2 aprovou **4.106 testes Node, sem falhas ou skips, e67 Python**. Esses resultados demonstram os cenários locais registrados; a publicação e a conferência do domínio exigem recibos próprios em [RELEASE.md](RELEASE.md).

## Atualização após a primeira CI

A CI [43453964784](https://github.com/MatheusLemosDS/MLS-Ecommerce-Ads/actions/runs/43453964784) aprovou4.104/4.106 testes Node e falhou em dois perfis de legibilidade do status mobile. O resultado local completo anterior permanece histórico, sem ser reatribuído ao CSS novo. A correção tem prova focada4/4 aprovada; o candidato atual aguarda nova CI completa antes da publicação. Fonte, hashes, causa e logs estão em [ci-validation.json](ci-validation.json).

## O que mudou e onde encontrar

| Tarefa | Área e comportamento |
| --- | --- |
| Acompanhar a loja | Visão geral mantém os seis agentes, na ordem Hermes, Finance, Ads, Products, Production e Returns, logo após os indicadores. Os cartões e gráficos conservam fontes, recortes e estados parciais. |
| Encontrar uma função | Menu, grupos e busca têm destinos funcionais, foco e histórico. Links antigos para fabricação abrem o painel correto; links do semanal transportam mês, data e corte sem apagar rascunhos. |
| Ler o resultado | Financeiro, dia, mês e produtos exibem composição assinada, valores conhecidos e pendências. A diferença vendas–repasse não vira taxa presumida; fabricação real e caixa não são descontados novamente do lucro estimado. |
| Conferir produção | Produção separa diário/mês, fechamento semanal, registro, conferência e referência das vendas. O corte continua sexta13h→sexta13h Brasília, com oito intervalos físicos e versões preservadas. |
| Conferir pedidos | Pedidos mantém filtros, período, paginação, detalhe e etapas internas auditadas, separados do status da plataforma. A distribuição usa os totais do período inteiro. |
| Usar produtos e Ads | Ranking permite seleção por identidade; ABC por receita depende de fonte válida. Ads usa calendário de anúncios, com dinheiro e ROAS em escalas distintas. Simulações e propostas não executam ações comerciais. |
| Usar uma conta pessoal | `/account/login`, cadastro/recuperação e as áreas de perfil, segurança e sessões têm backend persistente, tokens com finalidade/expiração, MFA e revogação. O acesso legado da loja é preservado. |
| Organizar empresa e equipe | `/companies` seleciona/cria empresas; configurações, lojas, equipe, papéis e propriedade são verificados no servidor. Nova empresa não recebe dados, custos ou credenciais da loja atual. |

O [mapa funcional](functional-coverage.json) conserva os233 IDs e aceites fornecidos e as22 famílias de gráficos. Cada linha contém fontes atuais, contrato/handler, política de acesso, persistência e arquivos de teste executados. O [inventário da base](baseline-active-inventory.json) permanece histórico; hashes e observações antigas não substituem os resultados do candidato.

## Isolamento e compatibilidade

App → Auth → Finance propaga um contexto confiável e revalida sessão, membership, empresa, loja e capacidade. Identificadores/cabeçalhos enviados pelo navegador não concedem acesso. Os testes A/B usam identidades externas coincidentes, tentativas de troca de contexto e revogação durante a requisição. D1, jobs, chaves de deduplicação, cache, IndexedDB e mídia recebem escopo próprio; respostas antigas e URLs blob são invalidadas ao encerrar ou trocar o contexto.

O `ACCOUNT_DB` é dedicado e distinto dos bancos legados. As migrações0001/0002 são aditivas/idempotentes; a segunda cria o registro vazio de migração de tenant. Não há cópia automática da loja ou vínculo do primeiro cadastro ao proprietário legado. Reverter código mantém o banco novo e suas escritas; o fluxo de conta comercial deixa de estar disponível na versão antiga, e reaplicar a versão compatível recupera o acesso a esses dados.

Os cinco assets históricos foram mantidos e o cliente principal foi extraído para o sexto asset `workspace`, com ordem de carregamento, SHA/SRI, inventário fechado e recuperação de falha. Isso permite manter as funções dentro do teto existente do Worker. A fonte raw publicada, o bundle compilado e os hashes dos assets são registros diferentes.

## Evidência observada

- [Gate final local](final-local-validation.json):4.106/4.106Node,0falhas/0skips;67/67Python; vetor dos três Workers e hashes dos423 arquivos de teste incluídos no comando.
- [Navegação final](evidence/canonical-navigation-final-20.log):20/20, com oito perfis das novidades, oito contratos organizados e quatro jornadas semanais normal/minificada. A falha anterior de alias foi corrigida no controlador, sem remover as verificações de valores ou de ausência de escritas.
- [Integração](integration-evidence.json): cadeia gerada App/Auth/Finance, principal revalidado, quotas frias, reinício/persistência e histórico dos gates anteriores. As tentativas com falha continuam registradas como falhas históricas.
- [Contas](ACCOUNT_UI_EVIDENCE.md), [contexto do navegador](BROWSER_CONTEXT_EVIDENCE.md), [gráficos](CHART_EVIDENCE.md), [layout](LAYOUT_EVIDENCE.md), [papéis](ROLES.md) e [migração](TENANT_MIGRATION_RUNBOOK.md) detalham o alcance de cada execução.
- [Validador documental](documentation-validation.json): preservação dos bytes das entradas, IDs, aceites, famílias e integridade dos artefatos citados. Esse validador não executa testes de produto nem confirma a Live.

As capturas, dados e pessoas de QA são sintéticos. A revisão de UX foi feita no candidato; não se atribui participação ou aceite a usuários reais.

## Pendências e limites

| Dependência | Impacto real |
| --- | --- |
| E-mail transacional | Verificação, reset, troca de e-mail e convites têm contrato/backend locais; entrega real não está configurada/comprovada. A outbox de teste não é publicada como serviço de envio. |
| Cobrança | Contrato de entitlements e eventos testado; checkout, portal e cobrança real ficam indisponíveis sem provedor/planos autorizados. |
| Conectores por cliente | Cada nova empresa permanece desconectada até credenciais, aplicativo e permissões próprios. A conexão atual da loja não é usada como padrão. TikTok Order API, Mercado Livre e formatos ainda não suportados continuam pendentes. |
| Documentos e retenção | Não se inventam termos, política legal ou apagamento irreversível. Exportação, pedido de encerramento e auditoria têm controles locais. |
| Aceite operacional | Sem sessão real autorizada do proprietário, não houve QA autenticado Live. Publicação técnica não fecha M2/M2.2, conciliação Seller Centre/banco ou lucro realizado. |

Os sete slots de gráfico sem fonte canônica continuam indisponíveis com motivo; os gráficos implementados não usam séries inventadas. Ads/PROMO e operações comerciais externas permanecem bloqueadas; Hermes continua observador. Nenhuma mensagem, convite, cobrança ou fato operacional real foi criado para testar esta entrega.
