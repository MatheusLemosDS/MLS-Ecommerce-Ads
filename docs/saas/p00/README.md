# P00 — base e promessa verificável

O estado de execução está em [MLS_SAAS_EXECUTION.json](../../MLS_SAAS_EXECUTION.json), apontado pelo [checkpoint único](../../MLS_COMMERCE_OS_CHECKPOINT.json). Os inputs em [input](input/MANIFEST.json) são requisitos históricos imutáveis, não um segundo estado operacional. P01–P11 continuam no objetivo geral e não são executadas nesta entrega.

- [Reconciliação GitHub](github-reconciliation.json): main, PR121 e CI atual versus falha histórica.
- [Leitura Live](live-reconciliation.json): versões e módulos dos três Workers, comparação dos bytes recuperados com o recibo e login público. Não comprova conta financeira real.
- [Catálogo das 22 funções](capabilities.json) e [93 regras de rota/capacidade](route-policy.json): implementação, dados, papéis, grant, conexão, cobertura, escrita e próxima ação separados.
- [Linhagem financeira](financial-lineage.json): 25 tipos históricos e extensão atual, fontes, handlers, armazenamento e consumidores, preservando os DTOs anteriores.
- [Operação e direitos](OPERATIONS.md), [SBOM](sbom.cdx.json), [notices](THIRD_PARTY_NOTICES.txt) e [inventário de direitos](rights-inventory.json).
- [Validação e limites](validation.json): comandos, ambiente, saídas, hashes, falhas e evidências reutilizadas com escopo explícito.

## Reconciliação e correções desta fase

A base auditada `6578e210…` precede o complemento financeiro da PR121. A main atual é `346f30f…`; o trabalho documental local `0a5a228…` foi preservado como ancestral, sem repetir merges. A branch P00 nasce desse commit documental. Fontes, testes e workflow funcionais permanecem byte a byte iguais à main enquanto não houver correção justificada por falha reproduzida.

O run histórico 43493228854 falhou em navegação Chromium na base auditada e pulou Python/build final. O run 43536468273 passou na main atual, incluindo Node, Python e build; pré-release de PR não executou no evento push. Não usar a falha antiga para inventar uma correção nem o sucesso da main como CI do commit documental novo. Os erros de transporte CDP devem ser separados de assertivas de produto; qualquer correção precisa manter assertivas/cobertura e passar o candidato exato.

A Live continua `2026-11-13.3`; fonte publicada `f68525ea…`, distinta do merge main e dos commits documentais. A comparação dos módulos recuperados usa os hashes raw do recibo; os hashes dos Workers compilados são outra camada, comparada com o build local. Boundary multipart ou sourcemap não substitui comparação do módulo. Sem deploy novo, migração, escrita comercial, dados reais de teste ou autorização ampliada.

## Ajuste do gate local

O manifesto de preflight foi repinado na main atual, conservando os três hashes e as flags esperadas. A lista de arquivos permanece finita e literal; foram adicionados os artefatos P00, sem wildcard ou novo caminho protegido de aplicação. O registro explícito da autorização P00 foi acrescentado ao verificador e à lista exata do teste. Permanecem as negativas de base/hash/escopo, escrita comercial bloqueada, verificações remotas obrigatórias e `productionApproved:false`. O manifesto anterior está preservado em [release-candidate-before-p00.json](release-candidate-before-p00.json). Isso prepara uma revisão futura, sem autorizar push/deploy enquanto Builds não for comprovado.

## Uso para próxima entrega

Ler o checkpoint e a tarefa atual na matriz, depois somente o catálogo/artefato relevante. O catálogo não altera planos nem ativa funções no produto. Conta e empresa continuam com entitlements do servidor e billing NOT_CONFIGURED; não incluir funções parciais como promessa de automação pronta. Validar direitos/operação e obter evidência dos Builds antes de promover Git. M2/M2.2 e banco automático continuam abertos.

## Retomada dos bloqueios

A [reconferência somente leitura](blocker-review-20261114.json) manteve os bloqueios. O [pedido de evidências mínimas](EXTERNAL_EVIDENCE_REQUEST.md) especifica os metadados que faltam, sem solicitar segredos ou alterações de configuração. Nenhuma suíte funcional foi repetida por esta continuação documental.

## Evidência posterior dos três Workers

As capturas identificadas de App/Auth/Finance e a inspeção do Wrangler4.151.1 completam a decisão delimitada de enviar esta branch e abrir uma PR rascunho, sem produção. Produção mostra main com builds desativados; preview está ativo e pode executar/falhar. O comando de preview é distinto de deploy de produção; a ausência de configuração adequada falha no CI. A leitura API de Builds continua403, preservada como histórico. Ver [análise e proveniência](blocker-review-20261114.json). Nenhum check será cancelado, contornado ou reconfigurado. A CI do candidato e os demais bloqueios P00 continuam exigidos.
