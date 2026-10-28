# MLS Commerce OS — instruções do repositório (ChatGPT, Codex e colaboradores)

Leia, nesta ordem, antes de qualquer alteração:
1. docs/ROADMAP_MLS_COMMERCE_OS.md (fonte canônica da estratégia).
2. docs/MLS_COMMERCE_OS_CHECKPOINT.json (estado técnico e branches).
3. docs/MLS_CODEX_HANDOFF_2026_10_28.md (próximas tarefas testáveis).
4. docs/SHOPEE_RESEARCH_TO_MLS_2026_10_28.md (fontes externas e restrições).

## Regras que não podem ser ignoradas

- Produto: MLS Commerce OS. MLS Hermes é supervisor, modo OBSERVER até autorização específica.
- PR #48: busca V3.6 sobre a main. PR #47: M3 Products/Pricing Observer. PR #51: fundamentos da pesquisa Shopee/Listing Factory. São branches diferentes; NÃO combinar ou fazer merge automático; revalidar conflitos e CI por ordem.
- A main é baseline publicada em b058e832 no momento deste handoff. Antes de trabalhar, releia a main e os PRs porque outros agentes podem ter avançado.
- M2 Finance/Returns NÃO foi encerrada: Seller Centre, Pending, liberações e devoluções devem ser validados na conta. Issue #50.
- Não inventar lucros, estoque, taxas, preços, vendas, eventos ou permissões Shopee. Dados ausentes = UNKNOWN/BLOCKED, jamais zero.
- Ads/PROMO continuam LOCKED. Nunca enviar anúncios, alterar preços/campanhas, criar promoção, confirmar eventos de push, reconectar OAuth ou modificar pedidos sem permissão real e aprovação do operador. M6/M7 definem os gates de escrita.
- Jamais incluir tokens, callbacks, cookies, order_sn privados, buyer data ou arquivos pessoais em commits, logs, testes ou respostas. Fixtures determinísticas e sem dados reais.
- Preservar os três Workers legados brazacommerce-app, brazacommerce-auth, brazacommerce-finance, bindings, D1, URLs, headers, cookies e rotas até migração específica.
- Não copiar bibliotecas Shopee/ERP inteiras para o runtime; revisar a licença de cada dependência, compatibilidade Cloudflare, payload real, permissões por loja/região e a documentação oficial.
- No Shopee SDK externo há divergências históricas GET/POST em escrow batch: validar método contra schema v2 e ambiente oficial antes de construir transporte.
- Arquivos de mockup são inspecionados localmente apenas por cabeçalho. SHA-256 identifica bytes, NÃO garante decodificação, política oficial ou direitos autorais.
- Não reduzir nem desativar suites de teste ou a lista exata de hashes reconhecidos dos Workers. Se adicionar função embutida em script, atualizar também web/cloudflare/build.py (freeze_client_helpers) e testar Worker gerado.

## Desenvolvimento e publicação

1. Criar branch pequena a partir de um commit verificado ou PR base explícita.
2. Manter mudanças puras de planejamento separadas de Finance/Auth/Ads/DTF e da publicação externa.
3. npm ci; npm test (pré-build e testes Node); python3 -m unittest web/bridge/test_hermes_bridge.py tools/test_install_hermes_web_bridge.py tools/test_build_hermes_web_bridge_install.py tools/test_activate_hermes_web_bridge.py tools/test_build_hermes_web_bridge_activation.py -q; npm run build.
4. Exigir CI GitHub verde, verificação exata do App/Auth/Finance e, se houver UI, Chromium e QA autenticado desktop/mobile.
5. Nunca considerar merge em main como confirmação de Cloudflare deploy. Conferir cada Worker e origem/corte dos dados separadamente.
6. Atualizar o roadmap, checkpoint, docs/MLS_CODEX_HANDOFF_2026_10_28.md e NEXT_CHAT_HANDOFF.txt ao completar cada fase; registrar id do PR, commit e gates pendentes.

Para usar o gerador local: docs/MLS_LISTING_FACTORY_V1.md. Usar Node >=24. Nenhum script deste projeto deve publicar na Shopee por padrão.
