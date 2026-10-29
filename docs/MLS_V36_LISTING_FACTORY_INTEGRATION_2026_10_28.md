# Integração MLS — Mission Control V3.6 + Listing Factory

Checkpoint 28/10/2026, horário de São Paulo. PR candidata #63: https://github.com/MatheusLemosDS/MLS-Ecommerce-Ads/pull/63

## Integração preservada

- PR #48: busca real por escopos Painéis, Produtos salvos e Pedidos da fila DTF; paginador de oito; navegação até o produto/DTF sem escrita externa.
- PRs #51, #56 e #60: Fábrica de Anúncios no painel proprietário, rascunhos JSON, mockups PNG/JPG locais, SHA-256, SKU, variações com preços declarados, até 500 rascunhos, oito por página, reanexação por nome de até 200 fotos/64 MiB.
- Prova via árvore Git: 13/13 blobs de código/testes iguais à PR #60 e 7/7 blobs da PR #48. Só tools/worker_project.mjs precisou combinar a lista de hashes; nenhuma das proteções foi desativada.
- Teste de coexistência: web/cloudflare/tests/mls-v36-listing-factory-integration.test.mjs, valida HTML do proprietário normal/minificado, três escopos, catálogo, fila DTF, factory e ausência de I/O externo no editor.

## GitHub Actions e builds

- https://github.com/MatheusLemosDS/MLS-Ecommerce-Ads/actions/runs/40792253729
- Resultado: SUCCESS, 2.136 testes Node aprovados, zero falhas; 67 testes Python aprovados; Chromium real e builds App/Auth/Finance.
- App SHA256: 8ed059ddb6f0901a48d277d6b9b806a23d52a1e5e105ed0e2e456e2aea6701f5
- Auth SHA256: 1fef431c8573e05563c7938d95be0976a160bc603340084aa747ee0b73e7ec64 (inalterado)
- Finance SHA256: b2483fc6107ecb4782e746becfe1b69ee6e3b9d3f0a6109351390b11b9303ca3 (inalterado)
- Nenhum deploy ou merge de código foi realizado.

## Checklist antes da publicação

1. Operador entra na conta proprietária em desktop e celular e confere a navegação Início, Produtos, Produção, Agentes e Financeiro.
2. Ctrl/Cmd+K: buscar produto realmente salvo, paginar e confirmar que a seleção desloca até o Catálogo salvo, sem confundir com a Fábrica de Anúncios.
3. Buscar pedido/SKU presente na fila DTF carregada; selecionar e confirmar navegação à Produção; ausência na fila não prova ausência na Shopee.
4. Importar manifesto JSON, reanexar mockups em lote, revisar miniaturas de 19 artes, conferir SKU e preços declarados, exportar a revisão. Validar no celular o paginador oito por página.
5. Conferir que nenhuma mídia ou preço é enviado, Ads/PROMO continuam LOCKED e nenhum dado financeiro foi alterado.
6. Financeiro M2 (issue #50) ainda precisa comparação autenticada Pending/repasses/devoluções com Seller Centre. M3 Observer PR #47 fica separada.

## Estratégia de release

- PR #63 é uma alternativa de integração unificada, após QA e aprovação humana. Não mesclar agora.
- Alternativa: mergir PR #48, depois #51, #56 e #60 em ordem, com CI a cada etapa. Escolher somente uma estratégia e registrar rollback.
- Código em draft não confirma deploy, faturamento, estoque, taxas Shopee ou permissões de escrita. Nunca publicar anúncios/campanhas automaticamente a partir deste checkpoint.
