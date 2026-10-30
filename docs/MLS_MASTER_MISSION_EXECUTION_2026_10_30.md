# Execução da missão MLS Commerce OS + AI Sales — 30/10/2026

A autorização atual permite desenvolvimento, testes, commits e PRs DRAFT. Proíbe merge em main, deploy, escrita comercial, gastos e alteração de OAuth. Substitui permissões de publicação de etapas anteriores.

## Base e recuperação

- Checkout original preservado em `/workspace/MLS-Ecommerce-Ads`, HEAD `94dff2d`.
- Implementação visual recuperada em worktree isolado, branch da PR #79, base `8d860b2c4f26531c53c4cdba0e06a14f51a7eef4`; PR #76 é ancestral. Nenhuma PR antiga foi mesclada.
- Documentos canônicos e PRs #76/#79/#81, issues #50/#80/#82 consultados. PR #78 rejeitada não é base.
- `npm ci --cache=/tmp/mls-commerce-npm-cache --no-audit --no-fund` aprovado. A primeira tentativa encontrou cache padrão fora do diretório gravável; nenhuma dependência foi alterada.

## Inventário observado

Finance/Returns, liberações, Pending e coleta em segundo plano estão implementados; seu aceite financeiro M2 continua bloqueado pela comparação real no Seller Centre. Catálogo/custos e DTF têm persistência e testes. Listing Factory suporta planejamento, importação/exportação JSON e reanexação local de imagens; não publica. Busca V3.6 permanece owner-only e OFF. Pricing Observer da PR #47 requer reconciliação consciente, sem liberar preços comerciais. TikTok/afiliados não têm grants comprovados.

Na auditoria inicial, o motor SVG ainda não estava integrado e o pacote aprovado ainda não havia sido recebido. Esse bloqueio histórico foi removido após o envio dos seis originais, conforme o registro abaixo. Não se inventaram mockups ou valores comerciais.

## Checkpoints

O estado estruturado está em `MLS_MASTER_MISSION_CHECKPOINT.json`. Cada etapa registra testes efetivamente executados e bloqueios; fixture sintética nunca prova Seller Centre, conta OAuth ou aprovação visual.

## Referências recebidas durante a execução

O proprietário forneceu o ZIP original. Os seis PNGs foram extraídos somente de nomes esperados, com limites, assinatura PNG, dimensões e SHA-256 registrados em `visual-references/mls-2026-10-29/manifest.json`. Arquivo ZIP SHA-256: `0624a0ad1b7469dba36d3e2306c28a4e64bca545ea998fc7c30e0debe6ab99b0`. O bloqueio por ausência das referências foi removido. Os números ilustrativos não serão usados como dados comerciais. Os arquivos Markdown/HTML do pacote não foram executados nem tratados como autorização adicional.

A composição é implementada com HTML/SVG/CSS editáveis, usando o PNG apenas para comparação. Legendas externas aos frames dos mockups Production/Products/Returns não fazem parte da aplicação. Capturas nativas desktop/mobile e avaliação humana continuam necessárias; a suíte não autoaprova paridade criando seu próprio baseline.

## Fase 1 — congelamento técnico

- Componentes reais das seis telas: seis KPIs e seis agentes na Visão Geral, três painéis inferiores; cinco especialistas com menu próprio, quatro KPIs, abas e dois painéis de gráficos. SVGs editáveis, globos/avatares sem arquivos remotos, tokens por agente e temas claro/escuro. Nenhum screenshot usado como fundo.
- Motor de gráficos integrado ao Worker/browser, com fonte, período de 7/14 dias, tabela acessível e lacunas nulas. Perdas vermelhas, zero preservado, estado/base coerentes. Nove regiões especialistas: fontes ausentes explicitadas; DTF usa somente estados exclusivos das linhas salvas, nunca ordens ou horas inventadas.
- Hermes usa a mesma publicação/coorte principal da interface durante coleta parcial e custos atuais, sem renovar idade da fonte. O cálculo ajustado do detalhe de conciliação permanece distinto do contrato baseline v1 do Hermes.
- Corrigidos CSS conflitantes, overflow do globo no celular, flex-basis vertical do período, breadcrumbs, contraste, glifos decorativos e independência do bootstrap de SVG/DOMParser. Recursos de publicação continuam bloqueados.
- Chromium usa perfil temporário/CDP em todos os testes; a falha local de `--dump-dom` foi reproduzida também em about:blank. Todos os asserts funcionais de navegação/autorização e tratamento de falhas foram preservados.
- **Validação local final: 2.214 Node aprovados, 0 falhas/skip; 67 Python aprovados; três Workers compilados.** Auth e Finance mantêm os hashes anteriores. Fonte/helper renderizam em build normal e minificado. 60 cenários de erro, 24 com bootstrap/D1 sintético válido e oito cenários adicionais da composição, desktop 1365×900/celular 390×844, claro/escuro, sem overflow/erro JS.
- Evidências versionadas em `docs/qa/mls-visual-2026-10-30/`. A fixture normal mantém vendas, Ads e líquido desconhecidos. A comparação HTML da CI registra aprovação humana pendente; não cria baseline autoaprovado. O aceite financeiro M2 segue externo.
- Próxima etapa: branch de integração a partir deste HEAD técnico, preservando PR #79 e sem merge/deploy.


## Fases 2–6 — integração local testada

- Branch separada `integration/mls-commerce-os-ai-sales-20261030`, a partir do congelamento visual `fa5c96c`; correções de teardown Chromium da PR79 espelhadas sem misturar runtime adicional na PR visual. PR79 final `e7ce5009`, CI41131654577 verde, continua DRAFT.
- Listing Factory preserva SKUs e variações importadas, kits/quantidades; prefixos somente por ação explícita atômica. Products/Pricing puro da PR47 revisado e integrado ao resumo, sem merge automático nem preço comercial.
- AI Sales: contratos fechados, vínculo exato de variantes salvas, componentes de kits com cobertura MAX por componente, direitos/hashes, campanhas/jobs; CRM local assistido e ledger observado sem duplicação/cancelados fictícios. Roteiros do render continuam `LOCAL_TEMPLATE`; adaptador opcional de revisão por modelo não executa LLM nem custo externo.
- Renderer Node/FFmpeg isolado gerou os três templates reais com eSpeak NG PT-BR e QA integral. Guards de arquivos, symlinks, bytes, codecs, leases, atomicidade, cache, idempotência, orçamento e deadline testados. UI nativa com cinco abas e flag owner independente OFF padrão, sem processar vídeo dentro do Worker.
- Revisão independente encontrou e corrigiu aprovações importadas, produto alterado sem replanejamento completo, IDs de criador repetidos em lojas diferentes, revogação de campanha entre produtos e estabilidade da ordem ao reanexar a mesma mídia. Regressores mantidos; nenhuma validação removida.
- Regressão local final: **2308 Node, 67 Python, zero falha/skip**, três builds. App `a5ba3298faf4b8c2eaa32e98674f1d7408f4c4616236d8f04a2fba72bbfb91c8`; Auth/Finance idênticos à fase1. Chromium normal/minificado com 40 capturas, fontes sintéticas, sem erro JS/overflow. A primeira execução identificou26 falhas de fixture na detecção opcional do módulo OFF; corrigida a detecção para usar o módulo realmente registrado e reexecutada a suite completa com sucesso.
- Código puro/render registrado no commit `f513dca`; integração final e PR DRAFT seguem no histórico desta branch. [Evidências](qa/mls-ai-sales-2026-10-30/README.md) e [guia de homologação, arquivos e limites](MLS_AI_SALES_INTEGRATION_2026_10_30.md).
- M2/Seller Centre/banco, aceite visual/auditivo humano, grants oficiais e acesso LLM permanecem externos. Sem main merge, deploy, gasto, OAuth, envio de mensagem, publicação ou alteração de preços/estoque/comissões. Não declarar autonomia comercial total nem precisão bancária comprovada.
