# Evidência CI — MLS Listing Factory + Shopee Research — 28/10/2026

Esta é uma evidência de compilação e teste de código, **não confirmação de deploy ou QA autenticada na conta real**.

## Código validado

- PR canônica #51: módulos offline de plano de anúncios, capacidades e replay sem ACK.
- PR canônica #56: UI owner de mockups com decodificação local, SHA256, variações, import/export JSON, preços declarados e paginação em 8.
- PR #58: candidata temporária baseada na main documental, **fechada sem merge**.
- Comparação exata: **13/13 blobs de código/teste idênticos** entre PR #56 e a branch de validação PR #58, incluindo build.py e tools/worker_project.mjs.

## GitHub Actions

- Link: https://github.com/MatheusLemosDS/MLS-Ecommerce-Ads/actions/runs/40788713558
- Status: **SUCCESS**.
- Node: **2126 testes, 2126 aprovados, 0 falhas**; contempla browser Chromium com imagens, nome inválido, dimensões, JSON import/export e 19 rascunhos paginados.
- Python: **67 testes aprovados**.
- Build: três Workers App/Auth/Finance gerados com sucesso.
- App SHA256: bbbe1b9efdf0a6c11e507c34c92730ddbb8502fb367c5cfe33c031ba3850d3cd
- Auth SHA256: 1fef431c8573e05563c7938d95be0976a160bc603340084aa747ee0b73e7ec64
- Finance SHA256: b2483fc6107ecb4782e746becfe1b69ee6e3b9d3f0a6109351390b11b9303ca3
- A lista de SHA de código App foi atualizada para o digest exato, sem desativar os testes de integridade.

## Portas ainda fechadas

- PR #51 e PR #56 seguem DRAFT/open sem merge e sem deploy.
- Operador ainda deve conferir a interface no Chrome e no celular com login real e artes reais.
- Resolver integração de catálogo com PR #48, preservar busca e fila DTF.
- M2 Finance issue #50 não conciliada com Seller Centre.
- Sem preços/estoque/Ads/tributos oficiais e grants Shopee, publicação externa permanece não autorizada.
- Ads/PROMO continuam LOCKED; Hermes OBSERVER.

## Retomada para Codex

Leia AGENTS.md, docs/ROADMAP_MLS_COMMERCE_OS.md, docs/MLS_COMMERCE_OS_CHECKPOINT.json e este registro. Não reexecutar a construção do editor; próximo incremento é QA proprietário autenticado e integração PR #51 → #56 na ordem, sem reescrever Finanças/Ads/DTF. Se mexer no código após esta evidência, atualizar SHA e repetir CI.
