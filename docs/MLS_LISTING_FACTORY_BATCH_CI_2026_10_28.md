# CI GREEN — MLS Listing Factory: reanexação de fotos em lote

Data: 28/10/2026. Evidência de teste de código; não é QA autenticada com loja nem deploy.

- PR canônica #60: https://github.com/MatheusLemosDS/MLS-Ecommerce-Ads/pull/60
- PR temporária #61: https://github.com/MatheusLemosDS/MLS-Ecommerce-Ads/pull/61 (CLOSED, NO MERGE).
- GitHub Actions: https://github.com/MatheusLemosDS/MLS-Ecommerce-Ads/actions/runs/40790629421
- Resultado SUCCESS: **2.132 Node / 0 falhas**, **67 Python**, Chromium real (19 rascunhos) e os três Workers gerados.
- 14/14 blobs de arquivos de código/testes idênticos entre #60 e #61.
- App SHA256: 63da28d212c45d1e7e93444dbe4ac2ac49ad113af273dddf65370f668156180d
- Auth SHA256: 1fef431c8573e05563c7938d95be0976a160bc603340084aa747ee0b73e7ec64
- Finance SHA256: b2483fc6107ecb4782e746becfe1b69ee6e3b9d3f0a6109351390b11b9303ca3

Segurança: todos os componentes de reanexação funcionam na memória do navegador, sem Shopee API, D1, tokens, upload ou Ads/PROMO. Associação por filename exige conferência visual; SHA obtido no navegador não confirma arquivo original de sessão anterior.

Pendências: QA visual autenticada desktop/celular do proprietário; merge controlado #51 → #56 → #60 preservando #48; verificação real da M2 (#50), permissões Shopee, custos e estoque. Nenhuma PR de código foi integrada ou publicada.
