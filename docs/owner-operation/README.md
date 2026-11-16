# Operação própria primeiro — MLS Commerce OS

A trilha ativa é **owner_operation**. Cadastro de outros clientes, e-mail comercial, planos, assinatura, checkout, marketing e documentos de onboarding para venda ficam **ADIADO_VENDA**. Autenticação, RBAC, isolamento, CSRF, backups, auditoria, integridade, retenção aplicável e permissões dos fornecedores continuam obrigatórios. Nenhum requisito adiado é contado como concluído.

[Checkpoint canônico](../MLS_COMMERCE_OS_CHECKPOINT.json) · [36 tarefas e dependências técnicas](EXECUCAO.json) · [21 contratos visuais e famílias preservadas](CATALOGO_GRAFICOS.json) · [inspeção atual](validation/reconciliation.json) · [validação do incremento](validation/owner-dtf-batches.json).

## Incremento atual OP-013 — backup das artes DTF

Implementado e validado localmente, com as expectativas antigas de texto/versão corrigidas e revalidadas; CI do head exato e publicação **pendentes**. A Live continua2026-11-15.4 até o recibo deste incremento confirmar novos Workers. [Evidência atual](validation/owner-dtf-artwork-backup.json). O histórico abaixo registra OP011; a próxima tarefa independente atual é OP012.

1. Abra **Produção → Artes salvas neste dispositivo → Baixar backup das artes**. Salve o ZIP em uma pasta privada fora do navegador. Ele contém os PNGs originais e `manifest.json`, com nomes de arte, dimensões, SHA-256 e caminhos dos pixels.
2. No navegador de destino, entre na mesma origem, conta e loja. Use **Conferir backup para restaurar**, selecione o ZIP e revise quantas artes são novas ou já idênticas.
3. Marque a confirmação e escolha **Restaurar artes conferidas**. O sistema verifica os pixels e reabre a biblioteca após a transação. Um conflito de nome/hash ou falha de armazenamento impede a restauração; nenhuma imagem diferente é substituída. Cancelar a prévia não grava nada.
4. Faça a prévia e confira a impressão antes de produzir. Só apague originais depois de verificar seu próprio backup. Gerar um download não prova que o operador guardou o arquivo em outro dispositivo.

O ZIP é privado e local, sem upload ou compra de storage. Limites explícitos:5.000 artes,32MiB por PNG,512MiB somados; exceder interrompe o backup inteiro, sem truncar a biblioteca. Arquivos devem ser do exportador MLS v1 (ZIP sem compressão); um ZIP genérico não substitui o manifesto. SHA-256 preserva identidade de bytes, sem comprovar autoria/licença. O vínculo é a chave normalizada da arte usada pelo SKU. Lotes, reservas, auditoria e configurações continuam no D1; o ZIP não é backup desse banco. Exportar lote continua conferindo o hash original reservado e a fonte do pedido.

O código de recuperação usa a mesma base IndexedDB e uma única transação de adição, sem migração ou sobrescrita. PNGs corrompidos, ZIP alterado/comprimido/criptografado ou de outra origem/conta/loja são recusados. Os testes usam perfis Chromium separados e PNG sintético real, incluindo decodificação, igualdade de pixels, erro de gravação e exportação do lote previamente reservado. Não certificam as artes reais do proprietário nem fabricação financeira.

## Incremento OP-011 — encontrar todos os lotes DTF

Candidato `2026-11-15.4`, código `e168e9a`, branch `feature/owner-operation-first-20261116`, sobre main `346f30f200e5cbd3d9efd26663a483c625d9c6e7`/PR121 integrada. **Publicado e verificado tecnicamente:** versão `2026-11-15.4`, CI[43795161304](https://github.com/MatheusLemosDS/MLS-Ecommerce-Ads/actions/runs/43795161304) aprovada no head `0650874` com4441 Node/67 Python. Auth/App novos e Finance retido, todos ativos/latest100%, fontes/configuração e8 assets exatos. [Recibo de publicação](validation/publication-live-20261116.json). [PR123](https://github.com/MatheusLemosDS/MLS-Ecommerce-Ads/pull/123) rascunho, sem merge/auto-merge. Aceite autenticado real, físico e financeiro não realizado.

A execução local inicial e suas revalidações continuam integralmente no recibo; a CI posterior aprovou o candidato exato sem remover assertivas ou cancelar checks. O caminho controlado existente foi usado após CI verde; os três Builds automáticos falharam e seus detalhes continuam sem acesso, sem alteração de sua configuração. A publicação verificada não dependeu de billing, Resend ou cadastro de outro cliente.

O limite anterior era concreto no código: o servidor retornava até100 lotes e a interface mostrava apenas30. Não havia navegação de lotes. A inspeção atual encontrou zero lotes DTF registrados na base; isso não comprova fabricação física zero nem uma pane autenticada atual por esse limite. A correção prepara o uso contínuo, sem inventar lotes na conta real.

Entre pelo **acesso atual da loja** e abra **Produção → DTF → Lotes de produção**:

1. Use **Consultar lotes**. O filtro inicial é **Em andamento**; escolha **Todos**, Reservados, Exportados, Produzidos ou Reservas desfeitas conforme o trabalho.
2. Navegue com **Próximos lotes** e **Lotes anteriores**. Cada página tem até20 itens. O total do filtro, o total histórico e os lotes em andamento vêm do servidor, com a mesma leitura; a amostra inicial não é apresentada como histórico completo.
3. Para localizar um lote antigo diretamente, informe seu ID completo ou os quatro primeiros caracteres em **Buscar ID do lote** e consulte. As ações respeitam o estado e recuperam o manifesto pelo ID quando ele está fora da amostra inicial.
4. **Exportar PNGs** conserva a verificação dos pedidos na Shopee, os hashes das artes e a reserva existente. A navegação e os filtros consultam apenas os dados salvos; não sincronizam pedidos nem criam reservas.
5. Se alguém criar, exportar, produzir ou desfizer um lote durante a navegação, o cursor antigo é recusado. Use **Consultar lotes** para reiniciar a leitura. A fila e sua seleção não são descartadas só por paginar lotes.

Foram preservados os contratos de mutação existentes, os limites físicos do filme, proporção, DPI, PNG transparente, reservas e idempotência. Este incremento não implementa cancelamento de EXPORTED, produção parcial ou livro de pagamentos; esses trabalhos continuam em OP-012/OP-014/OP-016. Não marque uma impressão ou fabricação fictícia para liberar uma reserva.

## Como as funções existentes se conectam

| Fluxo | Entrada e backend | Persistência e efeito |
|---|---|---|
| Acesso próprio | `/login` e sessão legada; `commercial-admin-runtime.mjs` preserva o principal autorizado | Sessão/CSRF e capacidades existentes; sem novo cadastro ou assinatura |
| Pedidos | `/admin?tab=order-operations`; `order-operations.mjs` | Fonte DTF salva e histórico de etapas; não altera pedido da Shopee ou confirma fabricação |
| Montagem DTF | `/admin?tab=production`; `production-dtf-store.mjs` e `dtf-view.mjs` | Artes no IndexedDB; lotes, reservas e auditoria no D1; exportação revalida a fonte |
| Histórico de lotes | GET `production/batches` e GET `production/batch?id=UUID` | Paginação por chave e leitura por ID, com `dtf.read`; POST continua exigindo `dtf.write`/CSRF |
| Fabricação e custo real | Produção; `incurred-production.mjs`, `production-weekly-close.mjs` | Registros históricos e sexta13h→sexta13h Brasília; ausência de registro não é zero |
| Referência dos custos | Custos e regras; `cost-rules.mjs` e referências por período | Custo atual não reescreve fabricação ou fechamento antigo |
| Devolução física | Returns; `physical-returns.mjs` e `return-manufacturing-links.mjs` | Recebimento, inspeção e associação explícita; não infere chegada por status remoto |
| Resultado, banco e fechamento | MLS Finance; componentes da PR121 em `financial-automation-*` | Razão, eventos, conciliação por alocação e versões persistentes; cobertura e confirmação exigem provas |

[Financeiro publicado da PR121: uso e limites](../financial-automation/README.md), [contratos e testes](../financial-automation/VALIDATION.md) e [28 FINAUTO com evidências existentes](../financial-automation/MATRIZ_EXECUCAO.json) continuam válidos em seu escopo. Não foram reiniciados. O catálogo de gráficos mantém fontes, estados desconhecidos, tabelas, exportações, sinais e interação sem escrita. Os seis agentes e a V4.1 foram preservados.

## Estado, segurança e publicação

Os testes novos preparam125 lotes reais do backend com fixtures, navegam por sete páginas, localizam o31º e os posteriores ao100º e conferem exportação/reservas. Chromium passa por App compilado autenticado, normal/minificado, em320/1365px, sem fatos de teste na Live. Os testes de capacidade, sessão e CSRF continuam ativos. A evidência local não certifica pedidos, peças ou valores reais.

Não há DDL novo, migração, remoção de dados, mudança de binding, grant ou workflow. O servidor retorna resumos limitados para a lista e carrega o manifesto completo pelo ID. A auditoria invalida cursores antigos; não se promete uma navegação completa sobre uma lista que mudou silenciosamente. Reverter o código restaura o leitor anterior, com seus limites, sem apagar lotes ou reservas novos. Backup/restauração integral e migrações aplicáveis continuam OP-005.

Main foi reconfirmada pelo conector GitHub; sua CI43536468273 está aprovada. Ela comprova a base, não este candidato. Versões/configurações App/Auth/Finance e os oito assets da publicação atual foram reconferidos por leitura. A inspeção pública preservou login/saúde e401 sem sessão. O cliente Python padrão recebeu Cloudflare1010; a leitura com identificação normal de navegador respondeu, sem alteração de WAF, autenticação ou permissões.

[Workers Builds/Triggers](validation/build-triggers.json) retornaram403/código10000 nos seis GETs. Branch/filtros/comandos efetivos do mecanismo automático permanecem desconhecidos; não inferir deploy pela URL de check. O novo pedido autoriza incrementos funcionais na Live e o roteiro admite o **caminho controlado existente** quando o automático está indisponível. A condição sem push/deploy da entrega documental anterior tinha aquele escopo; não vira proibição permanente desta entrega operacional. CI do candidato exato, validação de deploy, hashes/configuração, QA e conferência após cada etapa continuam obrigatórios. Não há cancelamento, bypass ou alteração de workflow. Finance é retido quando seus bytes não mudam; App/Auth são publicados somente após os gates aplicáveis.

Uma publicação técnica, quando registrada, continua separada de merge Git, de aceite autenticado real e de lucro/fechamento da conta. Não há movimentação de dinheiro, cobrança, contato com terceiros, publicação em marketplace, reautorização OAuth ou escrita comercial neste incremento. Ads/PROMO seguem LOCKED e Hermes OBSERVER.

## Próximo trabalho e pendências reais

Próximo independente: **OP-013**, backup e restauração dos pixels das artes, hashes e associações em perfil limpo. Não depende de Resend, assinatura ou compra de storage. Depois, seguir dependências concretas de OP-006/007/008/010/012/014/015/016/017 e fontes financeiras; uma API ausente bloqueia somente o que depende dela.

Permanecem abertos os marcos A/B/C: operação real completa, semana/mês financeiros equivalentes e automação. Sessão Live do proprietário, fatos físicos, fontes/extratos/grants ou consentimentos ausentes devem ser identificados por função e período. CSV/OFX oficial pode permitir conferência assistida; não encerra coleta bancária automática. Pagamentos não criam outra despesa, saques/créditos não criam outra receita e fabricação não é deduzida novamente junto do CMV.

As preparações locais anteriores foram preservadas, com commits/branches no checkpoint: P00/PR122 e SAAS-005/006/007 não foram apagadas nem integradas indiscriminadamente à Live. Seus fundamentos aplicáveis podem ser reutilizados por tarefa; a ordem comercial antiga não governa a operação própria. Os anexos originais estão em [input](input/IMPORT_MANIFEST.json), com hashes e aviso explícito de que a auditoria/documentação não constitui implementação nem aceite real.
