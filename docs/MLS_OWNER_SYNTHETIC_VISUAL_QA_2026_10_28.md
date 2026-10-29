# MLS Commerce OS — QA visual sintética desktop/mobile e reparo do Listing Factory

Data de registro: 28/10/2026, fuso America/Sao_Paulo. NÃO É homologação na conta real da Shopee.

## Defeito encontrado e corrigido

- O primeiro teste Chrome CDP com viewport físico de 390 px observou **layout viewport de 469 px**. Inputs do formulário Listing Factory saíam pela borda direita; a pesquisa global também ficava cortada. Há capturas e log de reprovação no run [40794110328](https://github.com/MatheusLemosDS/MLS-Ecommerce-Ads/actions/runs/40794110328).
- A correção está no runtime da PR #63: `.mls-lf-form` usa coluna `minmax(0,1fr)` e largura/min-width explícitos; `.mls-lf-grid` usa min-width 0; `.mls-lf-field` tem colunas `minmax(0,1fr)` e inputs/textarea com `max-width:100%`.
- O teste exige layout de 390 px (não ampliado), verifica todos os inputs dentro da tela, grid de uma coluna, picker local e busca global encaixada, foco/modal, escopos e navegação para pedido DTF sintético. Também testa desktop 1365x900 (duas colunas).

## Testes e screenshots

- PR de integração: [#63](https://github.com/MatheusLemosDS/MLS-Ecommerce-Ads/pull/63) (DRAFT).
- PR de QA visual: [#65](https://github.com/MatheusLemosDS/MLS-Ecommerce-Ads/pull/65) (DRAFT, empilhada sobre #63), agora com apenas dois arquivos: teste Chrome CDP e adição de upload-artifact no CI.
- CI da PR #65: [40794727173](https://github.com/MatheusLemosDS/MLS-Ecommerce-Ads/actions/runs/40794727173), **SUCCESS: 2.137 Node, 67 Python, Chromium e build dos três Workers**.
- CI da PR #63 com a correção: [40794715203](https://github.com/MatheusLemosDS/MLS-Ecommerce-Ads/actions/runs/40794715203), **segunda tentativa SUCCESS: 2.136 Node, 67 Python, Chromium e os três Workers**. A primeira falhou por timeout intermitente do Chrome antigo, sem falhas funcionais da integração.
- Capturas PNG de desktop e celular: [artefato sintético do CI #65](https://github.com/MatheusLemosDS/MLS-Ecommerce-Ads/actions/runs/40794727173/artifacts/12862897797), retido por sete dias. Inclui 4 imagens e `results.json`, `README.txt` com aviso de dados sintéticos.
- O Chrome abriu uma sessão **fictícia**, autenticada por credenciais determinísticas de teste e um D1/SQLite local vazio. Não acessou Seller Centre, sua conta, pedidos reais, cookies privados, API Shopee, arquivos DTF reais ou mockups seus.

## Hashes exatos após correção

- App SHA256: `805caf375c1d060c3b3fcc88b6764c03153931a5ce97b017f5245752027e35c7`.
- Auth SHA256: `1fef431c8573e05563c7938d95be0976a160bc603340084aa747ee0b73e7ec64` (preservado).
- Finance SHA256: `b2483fc6107ecb4782e746becfe1b69ee6e3b9d3f0a6109351390b11b9303ca3` (preservado).
- O hash App novo foi adicionado à allowlist exata; o bloqueio WORKER_SOURCE_UNRECOGNIZED não foi desativado.

## Gates humanos ainda pendentes

1. Abrir como proprietário o ambiente de homologação em desktop/celular, com login real, validar o layout e o diálogo global, sem expor token ou dados de compradores.
2. Buscar um produto real no catálogo e pedido real já salvo na fila DTF, observando paginação, origem/corte e estados parciais. Nenhum resultado inventado no painel.
3. Preparar manifesto com 5–9 mockups reais por arte, reanexar foto compartilhada por nome, verificar visualmente as imagens, nome, SKU, tamanhos e preço manual.
4. Validar mensal/financeiro M2 na issue #50 contra Seller Centre e repasses efetivamente liberados. Não desbloquear Ads/PROMO ou publicidade externa.
5. Decidir **uma** estratégia de integração: PR #63 + QA #65, OU merges sequenciais #48 → #51 → #56 → #60. Evitar as duas estratégias. Registrar rollback, deploy verificado e aprovação do operador, com nova CI para mudanças futuras.

Não houve merge do código de #63/#65, publicação de Worker, reconexão OAuth, MediaSpace, Ads, Promo ou anúncios Shopee nesta etapa.
