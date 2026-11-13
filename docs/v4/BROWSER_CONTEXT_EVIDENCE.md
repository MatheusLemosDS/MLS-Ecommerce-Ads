# Contexto comercial no navegador

O cliente em `commercial-workspace-client.mjs` fixa a pessoa/empresa/loja autorizadas de cada aba antes dos controladores operacionais. O servidor continua responsável pela autorização; os headers fixados no navegador são seletores, não credenciais. O JSON inicial é validado, congelado e retirado do nó de bootstrap.

Somente requests da mesma origem para `/api/admin` recebem empresa/loja fixas, CSRF nas gravações, `redirect:error` e `cache:no-store`. Respostas, clones e leitores de stream conferem a geração antes de liberar bytes. Encerrar ou invalidar o contexto cancela requests, timers, animações e leitores, para controladores, limpa os elementos privados e revoga URLs blob. Um transporte que ignora abort não mantém a Promise pendente nem libera o resultado antigo. As etapas de limpeza são independentes: falha em um controlador não impede as seguintes.

O logout comercial envia um único `POST /api/account/logout`, com CSRF, e só anuncia sucesso após `{logged_out:true}`. Falha, resposta inválida ou prazo esgotado bloqueia a interface com estado incerto e link de reautenticação. O canal `mls-auth-lifecycle-v1` invalida as demais abas em login/logout/bloqueio. Trocar empresa não altera outra aba. Links `/admin` com empresa/loja explicitamente diferentes param a aba atual e fazem navegação completa antes do roteador legado; links sem nova identidade conservam o contexto fixado.

O script pode executar antes do HTML principal: coleta os elementos e aplica as permissões no `DOMContentLoaded`, além de conferir os elementos existentes ao parar. Abas sem capacidade financeira mostram “Acesso restrito”; não são exibidos zeros inventados. A apresentação de links não substitui o bloqueio de APIs.

DTF e arte local de devoluções usam `brazacommerce-dtf-artworks-v2:mls-v2:<pessoa>:<empresa>:<loja>`. O nome é o mesmo contrato de `tenantArtworkDatabaseName`. A biblioteca legada `brazacommerce-dtf-artworks-v1` continua intacta; não existe importação automática. A DTF aborta transações pendentes e descarta resultados atrasados; o loader de devoluções se registra no ciclo de vida, fecha banco/leitores e revoga suas URLs.

## Resultado observado

O comando registrado em [browser-context-validation.json](browser-context-validation.json) passou 67 testes, sem falhas ou skips. Ele reúne os testes do cliente, DTF, loader de arte e um teste em Chromium com IndexedDB nativo. O teste de navegador executa fontes normal e minificada, cada uma com duas janelas de mesma origem em realms separados, IDs sintéticos de duas pessoas/empresas/lojas, PNGs válidos e chave de arte igual com bytes/digests diferentes. Confere biblioteca própria, ausência da outra e da legada, headers fixos apesar do chamador forjado, inicialização antes do markup, acesso financeiro restrito, resposta JSON nativa retida durante invalidação, limpeza independente das janelas, logout confirmado via servidor local e biblioteca legada preservada.

Os testes de módulo também cobrem `getReader`, iteração assíncrona e `pipeTo`, resultados/clones tardios, fetch que ignora abort, falhas de limpeza, timeout do logout, navegação entre contextos e CSRF. Todos os dados são sintéticos; o servidor HTTP é loopback e o logout é uma fixture contratual. Essa evidência valida os clientes de origem e sua composição de navegador. Não confirma por si só a montagem final no App gerado, a autorização do serviço real, migração, publicação ou Live. Esses gates permanecem separados na matriz.

## Regras de custo e callbacks pendentes

O editor em `cost-rules-view.mjs` ganhou `stop()` próprio: remove API/callback, estado salvo, rascunhos, learning/mapeamentos e referências de widgets; limpa valores de inputs antes de removê-los. Loads, gravações, reclassificação em lotes e callbacks de recálculo/associação conferem a geração antes de publicar. Um `finally` de uma geração antiga não altera um novo contexto ativo. O fluxo normal de revisão, conflito e preservação de rascunhos mantém seus testes anteriores.

O gate `COST-RULES-TEARDOWN-COMPILED-41` no [registro de integração](integration-evidence.json) passou os 35 testes anteriores do editor, quatro casos de encerramento/concorrência e os dois casos de catálogo compilado normal/minificado. Confere resposta de leitura antiga após nova inicialização, associação e callback atrasados, confirmação de preço ou recálculo pendente, limpeza de campos/widget retidos e cancelamento lógico de batches já enfileirados. O App completo ainda precisa ser reconstruído e passar seus próprios gates.

O painel mensal também limpa seus caches financeiros/Ads/catálogo/checkpoints, M3, rascunhos, listeners e callbacks ao encerrar um contexto comercial. O resultado tardio de leitura/enfileiramento não repõe esses dados; o contexto inativo não reinicia o painel. A suite mensal passou 96/96 e a compilada normal/minificada passou 2/2, preservando o comportamento legado de stop e os rascunhos durante a troca normal de mês. Esses dois comandos constam no mesmo registro, com hash da fonte.

O teste adicional do stream reproduz `tee()` com um byte válido já guardado na outra ramificação: após o encerramento, o leitor adquirido anteriormente rejeita a leitura. Ramificações, `pipeThrough` e leitores continuam ligados à geração; os controllers de stream são invalidados ao parar.
