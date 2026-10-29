# MLS Commerce OS · V3.6 — liberação controlada do proprietário

Estado: **candidato em PR DRAFT**, não implantado; não autoriza merge, deploy ou alterações comerciais.

## Dependências e escopo

Ordem de integração proposta:

1. PR #63 — busca V3.6, catálogo/DTF e Listing Factory local;
2. PR #65 — QA sintética integrada (Chrome desktop/mobile);
3. PR de release flag (filha de #65) — ativação segura e regressão OFF/ON.

Esta trilha substitui merges repetidos de #48 / #51 / #56 / #60. Escolher **uma única** trilha, não ambas. M2 financeiro (#50) e PR #47 (M3 Observer) continuam independentes.

## Controle de ativação: OFF por padrão

- A variável **`MLS_V36_OWNER_PREVIEW`** habilita a novidade somente se seu valor for **exatamente** `ENABLED`, e somente quando a sessão administrativa é `role=owner`.
- Valor ausente, inválido, alterado em caixa, com espaço ou `DISABLED` => OFF.
- Em OFF, `/admin` **não entrega** HTML/CSS/JS da Fábrica de Anúncios e não apresenta os escopos extras de Produtos e DTF no Ctrl+K. A busca tradicional por painéis continua. Módulos antigos (catálogo, DTF, Finance, Ads Observer, login) permanecem no painel.
- Em ON, oferece busca em catálogo persistido (8 por página no Ctrl+K), fila DTF salva e Fábrica de Anúncios local, com mockups, validação de arquivos, variações e manifesto JSON. **Não** habilita publicação na Shopee, alteração de preço/estoque, Ads/PROMO nem integração de marketplace write.
- O backend não define autorização por este marcador de HTML: a sessão administrativa existente continua obrigatória. A variável de release é uma barreira de visibilidade do módulo, não autorização comercial.

## Segurança / prevenção de regressões

- Não persistir estado da flag em D1, localStorage, cookie ou navegador. O servidor lê a configuração a cada GET autenticado do painel.
- Não gravar tokens em arquivos Git; esta variável é **não secreta** e pertence à configuração do Worker App. Não criar cópias de Workers, alterar bindings D1, secrets de autenticação, cron ou rotas.
- **Sem deploy de branches de teste**; os Workers Cloudflare existentes são conectados à `main`. Inspecionar watch paths antes de qualquer merge: um merge na main pode disparar deploy automático.
- Todas as operações do Listing Factory são locais. A importação/exportação JSON não carrega bytes das imagens e não comprova estoque, tarifa ou margem.
- Para uma futura ativação real, confirmar antes como as variáveis do Worker são persistidas sob `keep_vars=true` e se uma alteração de configuração gera nova versão/deployment no Cloudflare. A alteração da flag não deve ser descrita como rollback instantâneo garantido.

## Gates antes do merge e deploy do App

- [ ] CI verde no HEAD exato da PR de release: Node, Python, Chrome ON/OFF, build dos três Workers.
- [ ] Revisão dos diffs e hashes App/Auth/Finance (Auth e Finance devem permanecer idênticos às referências).
- [ ] Testar Chrome em 1365×900 e 390×844, com viewport sem corte, Ctrl+K tradicional em OFF e busca de registros em ON.
- [ ] QA autenticada do proprietário em ambiente seguro (mockups 5–9, lote, reanexação de pastas, JSON, DTF e catálogo), sem upload Shopee.
- [ ] Verificar que os dados do Financeiro e o acesso Auth já existentes permanecem normais e que Ads/PROMO continuam LOCKED.
- [ ] Registrar a versão do App atualmente publicada, bindings e comandos de rollback **sem copiar segredos**.
- [ ] Aprovação explícita do proprietário para **merge/deploy**; manter a variável ausente (OFF) durante a primeira publicação do código.

## Procedimento em duas fases — somente após aprovação

1. Integrar a trilha #63 + #65 + PR de release **uma única vez**, usando a política de CI da `main` e o fluxo de publicação existente, revisando o gatilho de deploy automático do Cloudflare. Antes do merge, deixar `MLS_V36_OWNER_PREVIEW` **ausente** no Worker App.
2. Após deploy, entrar no painel e verificar login, acesso ao catálogo anterior, módulos financeiros, ações de navegação, os indicadores dos agentes e ausência da Fábrica. A novidade permanece OFF.
3. Somente após essa validação, autorizar mudança controlada da configuração para **`ENABLED`** no Worker App e confirmar a versão/deployment resultante. Executar QA real com dados próprios e **sem** ações externas de publicação.
4. Se houver erro no módulo novo: voltar a variável a OFF/removê-la e confirmar a versão efetiva do Worker. Se houver regressão na página antiga ou falha de autenticação: **rollback da versão do App** pelo processo existente, usando a versão anterior registrada. Não modificar Finance/Auth para reverter a UI.
5. Registrar evidências de versão/ambiente, hashes, horários, checks e aprovação na Issue #67. Se algo estiver incerto, não ativar.

## Comandos locais de verificação (não publicam)

```bash
npm ci
npm test
python3 -m unittest web/bridge/test_hermes_bridge.py tools/test_install_hermes_web_bridge.py tools/test_build_hermes_web_bridge_install.py tools/test_activate_hermes_web_bridge.py tools/test_build_hermes_web_bridge_activation.py -q
npm run build
```

O workflow de QA de #65 usa dados fictícios e D1 local: **CI verde não equivale a homologação do proprietário nem aprovação para produção**.
